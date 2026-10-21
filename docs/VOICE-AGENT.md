# DAMI voice agent

`/voice` holds a real-time spoken conversation with **DAMI**, an ElevenLabs
Conversational AI agent (`agent_1601kfk5nzndfq79q8d3xncjhfpn`), through the
`@elevenlabs/react` SDK over WebRTC.

## How a session starts

1. The browser asks for microphone access.
2. It calls `GET /api/voice/session` (signed-in users only, rate-limited with
   `RATE_LIMIT_AI_PER_MIN`).
3. The route answers in one of two ways:
   - **`ELEVENLABS_API_KEY` set** — the server requests a single-use
     conversation token from `/v1/convai/conversation/token` and returns
     `{ mode: "token", token }`. The key never reaches the browser.
   - **No key** — it returns `{ mode: "public", agentId }` and the browser
     connects by agent ID. This only works while the agent has authentication
     disabled in ElevenLabs.
4. The component calls `startSession` with whichever it received.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `ELEVENLABS_API_KEY` | empty | Enables token minting. Recommended in production, together with turning on authentication for the agent in ElevenLabs so nobody can use it outside this app. |
| `ELEVENLABS_AGENT_ID` | DAMI's ID | Points the page at a different agent. |

## Privacy

Unlike the pronunciation lab, audio leaves the device: it streams to
ElevenLabs for the length of the session. The page states this before the
learner starts. Lexicon stores neither the audio nor the transcript.
