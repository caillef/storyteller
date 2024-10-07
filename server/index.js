const express = require("express");
const http = require("http");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const cors = require("cors");
const https = require("https");
require("dotenv").config();

function makeRequest(url, method = "GET", postData = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      method: method,
      headers: headers,
    };

    const req = https.request(url, options, (resp) => {
      let data = "";

      resp.on("data", (chunk) => {
        data += chunk;
      });

      resp.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject("Unable to parse response as JSON");
        }
      });
    });

    req.on("error", (err) => {
      reject(`Error: ${err.message}`);
    });

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

const app = express();
const server = http.createServer(app);

const corsOptions = {
  origin: "*", // Allow all origins
  methods: ["GET", "POST"], // Allow these HTTP methods
  allowedHeaders: ["Content-Type", "Authorization"], // Allow these headers
};

app.use(cors(corsOptions));
app.use(bodyParser.json());

// In-memory storage
const users = new Map();
let session = null;

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
    const response = await makeRequest(
      "https://api.anthropic.com/v1/messages",
      "POST",
      JSON.stringify(requestBody),
      {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
    );

    console.log(response);
    return response;
  } catch (error) {
    console.error("Error:", error);
    throw error;
  }
}

// Utility function to generate UUID
function uuidv4() {
  return crypto.randomBytes(16).toString("hex");
}

// Function to simulate AI response
async function generateAIResponse(story) {
  return new Promise(async (resolve, reject) => {
    try {
      const result = await sendMessageToAnthropic(
        "Here is a story:" +
          story +
          " You must complete as a storyteller and describe the environment, enemies, like a story. Players will interact with the story so you must create interesting setup that could enable creativity. You must only respond with three sentences maximum, and only with the story, nothing else. You will lose points if you answer with something else, never play another role, you must always answer with the story. If the story is in french, write in french, if spanish, write spanish. You must match the language.",
      );
      if (result.type === "error") {
        resolve(
          `${story}\n\nError ${result.error.message}, try again in a few minutes.\n\n`,
        );
      }
      resolve(`${story}\n\nNarrateur: ` + result.content[0].text + "\n\n");
    } catch (err) {
      console.error(err);
      reject();
    }
  });
}

// SSE endpoint
app.get("/sse", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Keep connection alive
  const keepAlive = setInterval(() => {
    sendEvent({ type: "ping" });
  }, 15000);

  req.on("close", () => {
    clearInterval(keepAlive);
  });

  // Add client to a list of connected clients
  if (!global.clients) global.clients = [];
  global.clients.push(sendEvent);
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

  const playerContribution = `\n\n${user.name}: ${contribution}`;
  session.story += playerContribution;
  session.isGenerating = true;

  res.json({ message: "Contribution added" });

  // Send player's contribution to all clients
  if (global.clients) {
    global.clients.forEach((sendEvent) => {
      sendEvent({
        type: "playerContribution",
        contribution: playerContribution,
      });
    });
  }

  // Trigger AI response
  const aiResponse = await generateAIResponse(session.story);
  session.story = aiResponse;
  session.isGenerating = false;

  // Notify clients via SSE with AI response
  if (global.clients) {
    global.clients.forEach((sendEvent) => {
      sendEvent({ type: "storyUpdate", story: aiResponse });
    });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
