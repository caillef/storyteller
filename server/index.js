const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const cors = require("cors");
const axios = require("axios");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(bodyParser.json());

// In-memory storage
const users = new Map();
let session = null;

require("dotenv").config();

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
async function sendMessageToAnthropic(
  message,
  model = "claude-3-5-sonnet-20240620",
  maxTokens = 1024,
) {
  const requestBody = {
    model: model,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: message }],
  };

  try {
    const response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      requestBody,
      {
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
      },
    );

    const data = response.data;
    return data;
  } catch (error) {
    console.error("Error:", error);
    throw error;
  }
}

// Utility function to generate UUID
function uuidv4() {
  return crypto.randomBytes(16).toString("hex");
}

// Dummy function to simulate AI response
async function generateAIResponse(story) {
  return new Promise(async (resolve, reject) => {
    try {
      const result = await sendMessageToAnthropic(
        "Here is a story:" +
          story +
          " You must complete as a storyteller and describe the environment, enemies, like a story. Players will interact with the story so you must create interesting setup that could enable creativity. You must only respond with three sentences maximum, and only with the story, nothing else. You will lose points if you answer with something else, never play another role, you must always answer with the story. If the story is in french, write in french, if spanish, wirte spanish. You must match the language.",
      );
      resolve(`${story}\n\nNarrateur: ` + result.content[0].text + "\n\n");
    } catch (err) {
      console.error(err);
      reject();
    }
  });
}

// WebSocket connection handling
wss.on("connection", (ws) => {
  ws.on("message", (message) => {
    // Handle real-time updates here
  });
});

// Endpoints
app.post("/auth", (req, res) => {
  const { discordToken } = req.body;
  // In a real scenario, validate the Discord token
  const sessionToken = uuidv4();
  users.set(sessionToken, { discordId: "dummy", sessionToken });
  res.json({ sessionToken });
});

app.post("/join", (req, res) => {
  const { sessionToken, playerName } = req.body;
  const user = users.get(sessionToken);
  if (!user) return res.status(401).json({ error: "Invalid session" });

  user.name = playerName;

  if (!session) {
    const sessionId = uuidv4();
    session = {
      id: sessionId,
      players: [sessionToken],
      story: "",
      isGenerating: false,
      isReady: false,
    };
  } else {
    if (!session.players.includes(sessionToken)) {
      session.players.push(sessionToken);
    }
  }

  res.json({ message: "Joined successfully", sessionId: session.id });
});

app.post("/ready", (req, res) => {
  const { sessionToken } = req.body;
  const user = users.get(sessionToken);
  if (!user) return res.status(401).json({ error: "Invalid session" });

  if (!session) return res.status(404).json({ error: "Session not found" });

  session.isReady = true;

  res.json({ message: "Ready status updated" });
});

app.get("/story", (req, res) => {
  const { sessionToken } = req.query;
  const user = users.get(sessionToken);
  if (!user) return res.status(401).json({ error: "Invalid session" });

  if (!session) return res.status(404).json({ error: "Session not found" });

  res.json({ story: session.story });
});

app.post("/contribute", async (req, res) => {
  const { sessionToken, contribution } = req.body;
  const user = users.get(sessionToken);
  if (!user) return res.status(401).json({ error: "Invalid session" });

  if (!session) return res.status(404).json({ error: "Session not found" });

  if (session.isGenerating) {
    return res.status(403).json({ error: "AI is generating, please wait" });
  }

  session.story += `\n\n${user.name}: ${contribution}`;
  session.isGenerating = true;

  res.json({ message: "Contribution added" });

  // Trigger AI response
  const aiResponse = await generateAIResponse(session.story);
  session.story = aiResponse;
  session.isGenerating = false;

  // Notify clients via WebSocket
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: "storyUpdate", story: aiResponse }));
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
