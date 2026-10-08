# Interpreter agent

The server-side half of the live interpreter
([design](../../docs/REALTIME-TRANSLATION.md)). It runs as a LiveKit Agents
worker: the web app's `POST /api/interpreter/session` mints a room token that
dispatches this agent into a fresh room alongside the learner.

**Current stage: Phase 1, WebRTC loopback.** The agent:

| Track or message | Direction | Purpose |
|---|---|---|
| `mic` → `echo-mic` | learner → agent → learner | Hear yourself after the round trip; checks AEC by ear. |
| `probe` → `echo-probe` | learner → agent → learner | Tone bursts timed by the browser to measure the audio round trip. |
| `tone` | agent → learner | A test tone played through the speaker for the automated echo test. |
| `ping` / `pong` on `interpreter.control` | data channel | Signalling round trip. |

Later phases replace the echo with ASR → simultaneous MT → TTS on the same
tracks and topic.

## Run it locally

Everything in one go (Postgres, app, LiveKit dev server, agent):

```bash
# in .env
LIVEKIT_URL="ws://localhost:7880"
LIVEKIT_API_KEY="devkey"
LIVEKIT_API_SECRET="secret"

docker compose --profile interpreter up -d
```

Or run the pieces yourself, which is faster when iterating on the agent:

```bash
# 1. LiveKit server in dev mode (https://docs.livekit.io/home/self-hosting/local/)
livekit-server --dev --bind 127.0.0.1

# 2. The agent
cd agents/interpreter
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
LIVEKIT_URL=ws://127.0.0.1:7880 LIVEKIT_API_KEY=devkey LIVEKIT_API_SECRET=secret \
  python main.py dev

# 3. The app, with the same LIVEKIT_* values in .env
npm run dev
```

Then open **Live interpreter** in the app and press **Start loopback**.

In `start` (production) mode the worker stops accepting jobs once host CPU
passes 70 %; `dev` mode doesn't. The LiveKit server applies its own load check
in both modes, though (see Troubleshooting).

## Phase 1 exit criteria

From the design doc, verified with the loopback console:

- **Audio round trip ≤ 150 ms (median)** — "Measure round trip". This covers
  both WebRTC hops, both jitter buffers and the agent, but not the sound card's
  own input/output latency.
- **No re-capture of played audio with speakers on** — "Run echo test" on each
  target browser and device: Chrome, Safari, Firefox, iOS Safari, Android
  Chrome. Headphones pass trivially, so test with speakers.

Measured so far (Chromium with a fake microphone; LiveKit server, agent,
production build of the app and browser all on one 4-CPU container): 140–152 ms
median across paced runs, rising to ~200 ms while the CPU was saturated;
data-channel round trip ~10 ms. Expect to add the network round
trip to your LiveKit region on top. A real-device run of the echo test is still
outstanding: headless Chromium has no acoustic path, so its near-0 dB result
proves the plumbing, not the canceller.

## Tests

```bash
pip install -r requirements-dev.txt
pytest tests
```

The tests cover the pure modules and check that the protocol constants match
`src/lib/interpreter/protocol.ts`. They need neither the SDK nor a server.

## Troubleshooting

- **"The interpreter agent did not join"**: the worker isn't registered (look
  for `registered worker` in its log), its `INTERPRETER_AGENT_NAME` differs from
  the app's, or it is at capacity. On capacity: the LiveKit server only offers a
  job to workers whose self-reported CPU load is below its target load, and that
  check applies in agent `dev` mode too. On a laptop running the app, a browser
  and LiveKit at once, a CPU spike can make it skip the only worker
  (`failed to send job request: no servers available` in the server log).
  LiveKit does not retry the dispatch for that room; **Start again** creates a
  new room and dispatches afresh. In production, size workers so host CPU stays
  below the target.
- **Agent logs `405 Invalid response status` when connecting**: an
  `HTTPS_PROXY`/`HTTP_PROXY` in its environment is intercepting the `ws://`
  connection. Unset it for the agent, or add the LiveKit host to `NO_PROXY`.
