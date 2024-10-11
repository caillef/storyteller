import React, { useState, useEffect, useRef } from "react";
import styled from "@emotion/styled";

const Container = styled.div`
  max-width: 1200px;
  margin: auto;
  background: white;
  padding: 20px;
  border-radius: 5px;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
  display: flex;
`;

const LeftColumn = styled.div`
  flex: 1;
  margin-right: 20px;
`;

const RightColumn = styled.div`
  flex: 1;
`;

const Input = styled.input`
  width: 100%;
  padding: 8px;
  margin-bottom: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
`;

const Button = styled.button`
  background-color: #5c6bc0;
  color: white;
  border: none;
  padding: 10px 15px;
  border-radius: 4px;
  cursor: pointer;
  &:hover {
    background-color: #3f51b5;
  }
`;

const StoryArea = styled.div`
  background-color: #fff;
  border: 1px solid #ddd;
  padding: 10px;
  height: 300px;
  overflow-y: auto;
  margin-bottom: 10px;
`;

const TextArea = styled.textarea`
  width: 100%;
  padding: 8px;
  margin-bottom: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
`;

const Image = styled.img`
  max-width: 100%;
  height: auto;
  margin-bottom: 10px;
`;

interface StoryEntry {
  author: string;
  text: string;
  image_url?: string;
}

const IS_LOCAL = false;
const API_URL = IS_LOCAL ? "http://localhost:3000" : "/.proxy/api";

const App: React.FC = () => {
  const [sessionToken, setSessionToken] = useState("");
  const [discordToken, setDiscordToken] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [contribution, setContribution] = useState("");
  const [story, setStory] = useState<StoryEntry[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isJoined, setIsJoined] = useState(false);
  const storyAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isJoined) {
      getStory();
      setupSSE();
    }
  }, [isJoined]);

  useEffect(() => {
    if (storyAreaRef.current) {
      storyAreaRef.current.scrollTop = storyAreaRef.current.scrollHeight;
    }
  }, [story]);

  const authenticate = async () => {
    try {
      const response = await fetch(`${API_URL}/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discordToken }),
      });
      const data = await response.json();
      setSessionToken(data.sessionToken);
      setIsAuthenticated(true);
    } catch (error) {
      console.error("Authentication error:", error);
    }
  };

  const joinSession = async () => {
    try {
      const response = await fetch(`${API_URL}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken, playerName }),
      });
      await response.json();
      setIsJoined(true);
    } catch (error) {
      console.error("Join session error:", error);
    }
  };

  const getStory = async () => {
    try {
      const response = await fetch(
        `${API_URL}/story?sessionToken=${sessionToken}`,
      );
      const data = await response.json();
      setStory(data.story);
    } catch (error) {
      console.error("Get story error:", error);
    }
  };

  const contribute = async () => {
    try {
      const response = await fetch(`${API_URL}/contribute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken, contribution }),
      });
      await response.json();
      setContribution("");
    } catch (error) {
      console.error("Contribute error:", error);
    }
  };

  const setupSSE = () => {
    const eventSource = new EventSource(`${API_URL}/sse`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "storyUpdate") {
        setStory((prevStory) => [...prevStory, ...data.story]);
      } else if (data.type === "playerContribution") {
        setStory((prevStory) => [...prevStory, data.contribution]);
      }
    };

    eventSource.onerror = (error) => {
      console.error("EventSource failed:", error);
      eventSource.close();
      setTimeout(setupSSE, 5000);
    };

    return () => {
      eventSource.close();
    };
  };

  return (
    <Container>
      <LeftColumn>
        <h1>Storyteller</h1>

        {!isAuthenticated && (
          <div>
            <Input
              type="text"
              value={discordToken}
              onChange={(e) => setDiscordToken(e.target.value)}
              placeholder="Enter Discord Token"
            />
            <Button onClick={authenticate}>Authenticate</Button>
          </div>
        )}

        {isAuthenticated && !isJoined && (
          <div>
            <Input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Enter your name"
            />
            <Button onClick={joinSession}>Join Session</Button>
          </div>
        )}

        {isJoined && (
          <div>
            <StoryArea ref={storyAreaRef}>
              {story.map((entry, index) => (
                <div key={index}>
                  <strong>{entry.author}:</strong> {entry.text}
                </div>
              ))}
            </StoryArea>
            <TextArea
              value={contribution}
              onChange={(e) => setContribution(e.target.value)}
              placeholder="Enter your contribution"
            />
            <Button onClick={contribute}>Send Contribution</Button>
          </div>
        )}
      </LeftColumn>
      <RightColumn>
        {isJoined && story.length > 0 && story[story.length - 1].image_url && (
          <Image
            src={story[story.length - 1].image_url}
            alt={`Image for ${story[story.length - 1].author}'s contribution`}
          />
        )}
      </RightColumn>
    </Container>
  );
};

export default App;
