local MAP_SCALE = 10

local CHARACTERS = {
    lumberjack = {
        skills = { gather = true, chop = true, attack = { type = "melee" } },
        avatarName = "caillef",
        tool = "littlecreator.lc_iron_axe"
    },
    ranger = {
        skills = { gather = true, attack = { type = "range" } },
        avatarName = "soliton",
        tool = "xavier.bow",
        toolScale = 0.5
    },
    miner = {
        skills = { gather = true, mine = true, attack = { type = "range" } },
        avatarName = "gdevillele",
        tool = "divergonia.pickaxe"
    },
}

local PROPS = {
    tree = {
        skill = "chop",
        objFullname = "voxels.ash_tree",
        scale = 0.5,
        hp = 3,
    },
    goblin = {
        skill = "attack",
        objFullname = "voxels.goblin_axeman",
        scale = 0.5,
        hp = 5,
    },
    bush = {
        skill = "gather",
        objFullname = "voxels.bush",
        scale = 0.5,
        hp = 1,
    },
    iron = {
        skill = "mine",
        objFullname = "voxels.iron_ore",
        scale = 0.5,
        hp = 10,
    }
}

local SKILLS = {
    chop = {
        callback = function(character, action)
            if action.object.destroyed then
                character:setAction()
            end
            character.model.Animations.SwingRight:Play()
            action.object:damage(1)
        end
    },
    attack = {
        callback = function(character, action)
            if action.object.destroyed then
                character:setAction()
            end
            character.model.Animations.SwingRight:Play()
            action.object:damage(1)
        end
    },
    gather = {
        callback = function(character, action)
            if action.object.destroyed then
                character:setAction()
            end
            character.model.Animations.SwingRight:Play()
            action.object:damage(1)
        end
    },
    mine = {
        callback = function(character, action)
            if action.object.destroyed then
                character:setAction()
            end
            character.model.Animations.SwingRight:Play()
            action.object:damage(1)
        end
    }
}

local props = {}

local function setPropPosition(obj, x, y)
    obj.Position = { (x + 0.5) * MAP_SCALE, 0, (y + 0.5) * MAP_SCALE }
end

local function createCharacter(charaType)
    local charaInfo = CHARACTERS[charaType]

    local character = Object()

    local model = require("avatar"):get(charaInfo.avatarName)
    Object:Load(charaInfo.tool, function(obj)
        equipRightHand(model, obj)
        require("hierarchyactions"):applyToDescendants(obj, { includeRoot = true }, function(o)
            o.Physics = PhysicsMode.Disabled
        end)
        obj.Scale = charaInfo.toolScale or 1
    end)
    model:SetParent(character)
    model.Scale = 0.45
    model.Physics = PhysicsMode.Disabled
    character.model = model

    local action
    local t = 0
    local nextActionTick = 0
    local cooldown = 1.0

    character.setAction = function(_, newAction)
        if action == nil and newAction == nil then return end

        if action.id and action.id == newAction.id and newAction.type ~= "idle" then return true end
        if action and action.cancelAction then
            action:cancelAction()
        end

        if newAction.type ~= "idle" and not charaInfo.skills[newAction.type] then return end

        action = newAction
        nextActionTick = t
        return true
    end

    character.actionTick = function(_, dt)
        t = t + dt

        local needToMove = action and (character.Position - action.Position).SquaredLength > 3 or false

        local squadMotion = character:GetParent().Motion
        local anims = character.model.Animations
        if squadMotion == Number3(0, 0, 0) and not needToMove then
            if anims.Walk.IsPlaying then
                anims.Walk:Stop()
                anims.Idle:Play()
            end
        else
            if anims.Idle.IsPlaying then
                anims.Idle:Stop()
                anims.Walk:Play()
            end
        end

        if not action then
            return
        end

        character.Forward = (action.Position + squadMotion) - character.Position
        character.Rotation.X = 0
        character.Rotation.Z = 0
        if needToMove then
            local dir = action.Position - character.Position
            dir:Normalize()
            character.Position = character.Position + dir * dt * 20
        elseif nextActionTick <= t then
            nextActionTick = t + cooldown
            local skill = SKILLS[action.type]
            if not skill then return end
            skill.callback(character, action)
        end
    end

    return character
end

local function createProp(propType)
    local prop = Object()
    prop.destroyed = false

    local propInfo = PROPS[propType]
    prop.hp = propInfo.hp
    prop.id = math.random(100000000, 1000000000)
    prop.type = propInfo.skill
    Object:Load(propInfo.objFullname, function(obj)
        obj:SetParent(prop)
        obj.Scale = propInfo.scale
        local box = Box()
        box:Fit(obj, true)
        obj.Pivot = Number3(obj.Width / 2, box.Min.Y + obj.Pivot.Y, obj.Depth / 2)
        require("hierarchyactions"):applyToDescendants(obj, { includeRoot = true }, function(o)
            o.Physics = PhysicsMode.Disabled
        end)
    end)

    prop.damage = function(prop, dmg, source)
        if prop.destroyed then return end
        prop.hp = prop.hp - dmg
        if prop.hp <= 0 then
            prop:destroy()
        end
    end

    prop.destroy = function(prop)
        if prop.destroyed then return end
        prop.destroyed = true
        for k, p in ipairs(props) do
            if p == prop then table.remove(props, k) end
        end
        if prop.onDestroy then
            prop:onDestroy()
        end
        prop.IsHidden = true
        Timer(1, function()
            prop:RemoveFromParent()
        end)
    end

    table.insert(props, prop)

    return prop
end

local function createPropSpawner(type, x, y)
    local propSpawner = Object()
    propSpawner:SetParent(World)
    setPropPosition(propSpawner, x, y)

    local spawn
    spawn = function()
        local prop = createProp(type)
        prop:SetParent(propSpawner)
        prop.LocalPosition = { 0, 0, 0 }
        prop.onDestroy = function()
            Timer(5, function()
                spawn()
            end)
        end
    end
    spawn()

    return propSpawner
end

local function createSquad(defaultCharacter)
    local squad = Object()
    squad:SetParent(World)

    local characters = {}
    squad.add = function(_, character)
        character:SetParent(squad)
        table.insert(characters, character)
        character.LocalPosition = { 0, 0, 0 }
    end

    local character = createCharacter(defaultCharacter)
    squad:add(character)

    local polygonBuilder = require("polygonbuilder")
    local handle = polygonBuilder:create({
        nbSides = 32,
        color = Color.White,
        thickness = 0.1,
        size = 40,
    })
    handle:SetParent(squad)
    handle.Rotation.X = math.pi * 0.5
    local movingCircle = handle
    local handle = polygonBuilder:create({
        nbSides = 32,
        color = Color.White,
        thickness = 2,
        size = 40,
    })
    handle:SetParent(squad)
    handle.Rotation.X = math.pi * 0.5
    local actionCircle = handle

    local moving = false
    local function findActions()
        if moving then
            local nbCharacters = #characters - 1
            for k, c in ipairs(characters) do
                local posX = 0
                local posZ = 0
                if k > 7 then
                    local nb = math.min(12, nbCharacters - 6)
                    posX = math.cos(((k - 7) / nb) * math.pi * 2) * 20
                    posZ = math.sin(((k - 7) / nb) * math.pi * 2) * 20
                elseif k > 1 then
                    local nb = math.min(6, nbCharacters)
                    posX = math.cos((k / nb) * math.pi * 2) * 10
                    posZ = math.sin((k / nb) * math.pi * 2) * 10
                end
                c:setAction({ type = "idle", Position = squad.Position + Number3(posX, 0, posZ) })
            end
            return
        end

        local availableTasks = {}
        for _, prop in ipairs(props) do
            local dist = (prop.Position - squad.Position).Length
            if dist <= 40 then
                prop.object = prop
                table.insert(availableTasks, { prop = prop, dist = dist })
            end
        end
        table.sort(availableTasks, function(a, b) return a.dist < b.dist end)
        for _, c in ipairs(characters) do
            if #availableTasks == 0 then
                c:setAction()
            else
                for _, task in ipairs(availableTasks) do
                    if c:setAction(task.prop) then
                        break
                    end
                end
            end
        end
    end

    LocalEvent:Listen(LocalEvent.Name.Tick, function(dt)
        if squad.Motion == Number3(0, 0, 0) then
            if moving then
                moving = false
                actionCircle.IsHidden = false
            end
        else
            if moving == false then
                moving = true
                actionCircle.IsHidden = true
            end
        end

        findActions()
        for _, c in ipairs(characters) do
            c:actionTick(dt)
        end
    end)

    return squad
end

local function createBonus()
    local bonus = Object()
    local box = Box()
    box.Min = { -4, 0, -4 }
    box.Max = { 4, 0, 4 }
    bonus.CollisionBox = box
    bonus.Physics = PhysicsMode.Trigger

    local shape = MutableShape()
    shape:AddBlock(Color.Blue, 0, 0, 0)
    shape.Pivot = { 0.5, 0, 0.5 }
    shape:SetParent(bonus)
    shape.Scale = 5
    shape.Physics = PhysicsMode.Disabled

    local function executeBonus()
        local list = { "lumberjack", "miner", "ranger" }
        local character = createCharacter(list[math.random(#list)])
        squad:add(character)
    end

    bonus.OnCollisionBegin = function(_, other)
        if other == squad then
            bonus.OnCollisionBegin = nil
            bonus:RemoveFromParent()
            executeBonus()
        end
    end

    return bonus
end

Client.OnStart = function()
    local map = MutableShape()
    for z = -50, 50 do
        for x = -50, 50 do
            map:AddBlock((x + z) % 2 == 0 and Color.Green or Color.Black, x, 0, z)
        end
    end
    map:SetParent(World)
    map.Scale = MAP_SCALE
    map.Pivot.Y = 1

    squad = createSquad("lumberjack")
    squad.Physics = PhysicsMode.Dynamic
    squad.CollisionGroups = Player.CollisionGroups
    squad.CollidesWithGroups = Player.CollidesWithGroups
    setPropPosition(squad, 0, 0)

    Camera:SetModeFree()
    Camera:SetParent(squad)
    Camera.LocalPosition = { 0, 100, -65 }
    Camera.Rotation.X = math.pi * 0.3

    for i = -5, 15 do
        local bonus = createBonus()
        bonus:SetParent(World)
        setPropPosition(bonus, (i - 2) * 2, 4)
    end

    createPropSpawner("tree", -5, -5)
    createPropSpawner("tree", -8, -4)

    createPropSpawner("goblin", 4, -4)
    createPropSpawner("bush", 8, -6)
    createPropSpawner("iron", 6, -4)
end

Client.DirectionalPad = function(x, y)
    squad.Motion = (squad.Forward * y + squad.Right * x) * 50
end

equipRightHand = function(avatar, shapeOrItem)
    local shape = nil
    if shapeOrItem ~= nil then
        if type(shapeOrItem) == "Shape" or type(shapeOrItem) == "MutableShape" then
            shape = shapeOrItem
        elseif type(shapeOrItem) == "Item" then
            shape = Shape(shapeOrItem)
            if not shape then
                error("Player:EquipRightHand(equipment) - equipment can't be loaded", 2)
            end
        else
            error("Player:EquipRightHand(equipment) - equipment parameter should be a Shape or Item", 2)
        end
    end

    if avatar.__rightHandItem == shape then
        -- equipment already installed
        return
    end

    if avatar.__rightHandItem ~= nil and avatar.__rightHandItem:GetParent() == avatar.RightHand then
        avatar.__rightHandItem:RemoveFromParent()
        -- restore its physics attributes
        avatar.__rightHandItem.Physics = avatar.__rightHandItem.__savePhysics
        avatar.__rightHandItem.CollisionGroups = avatar.__rightHandItem.__saveCollisionGroups
        avatar.__rightHandItem.CollidesWithGroups = avatar.__rightHandItem.__saveCollidesWithGroups
        -- lose reference on it
        avatar.__rightHandItem = nil
    end
    if shape == nil then
        return
    end
    -- reset shape Pivot to center
    shape.Pivot = Number3(shape.Width * 0.5, shape.Height * 0.5, shape.Depth * 0.5)
    -- disable Physics
    shape.__savePhysics = shape.Physics
    shape.__saveCollisionGroups = shape.CollisionGroups
    shape.__saveCollidesWithGroups = shape.CollidesWithGroups
    shape.Physics = PhysicsMode.Disabled
    shape.CollisionGroups = {}
    shape.CollidesWithGroups = {}
    avatar.__rightHandItem = shape
    -- Notes about lua Point:
    -- `poi.Coords` is a simple getter and returns the value as it was stored
    -- `poi.LocalPosition` performs a block to local transformation w/ associated shape
    -- get POI rotation
    local poiRot = shape:GetPoint("ModelPoint_Hand_v2").Rotation
    local compatRotation = false -- V1 & legacy POIs conversion
    if poiRot == nil then
        poiRot = shape:GetPoint("ModelPoint_Hand").Rotation
        if poiRot == nil then
            poiRot = shape:GetPoint("Hand").Rotation
        end
        if poiRot ~= nil then
            compatRotation = true
        else
            -- default value
            poiRot = Number3(0, 0, 0)
        end
    end
    -- get POI position
    local poiPos = shape:GetPoint("ModelPoint_Hand_v2").LocalPosition
    if poiPos == nil then
        poiPos = shape:GetPoint("ModelPoint_Hand").LocalPosition
        if poiPos == nil then
            -- backward-compatibility: Item Editor saved POI position in local space and item hasn't been edited since
            -- Note: engine cannot update POI in local space when the item is resized
            poiPos = shape:GetPoint("Hand").Coords -- get stored value as is
            if poiPos ~= nil then
                poiPos = -1.0 * poiPos
            else
                poiPos = Number3(0, 0, 0)
            end
        end
    end
    -- Item Editor saves POI position in model space (block coordinates), in order to ignore resize offset ;
    -- convert into hand local space
    local localHandPoint = poiPos:Copy()
    localHandPoint = -localHandPoint -- relative to hand point instead of item pivot
    localHandPoint:Rotate(poiRot)
    if compatRotation then
        localHandPoint:Rotate(Number3(0, 0, math.pi * 0.5))
    end
    localHandPoint = localHandPoint * shape.LocalScale
    poiPos = localHandPoint
    shape:SetParent(avatar.RightHand)
    shape.LocalRotation = poiRot
    shape.LocalPosition = poiPos + avatar.RightHand:GetPoint("palm").LocalPosition
    if compatRotation then
        shape:RotateLocal(Number3(0, 0, 1), math.pi * 0.5)
    end
end
