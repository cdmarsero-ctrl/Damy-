# Interpreter agent

The server-side half of the live interpreter
([design](../../docs/REALTIME-TRANSLATION.md)). It runs as a LiveKit Agents
worker: the web app's `POST /api/interpreter/session` mints a room token that
dispatches this agent into a fresh room alongside the learner.

**Current stage: Phase 2, live captions**, with the Phase 1 loopback kept as
connection diagnostics.

| Track or message | Direction | Purpose |
|---|---|---|
| `mic` → captions on `interpreter.captions` | learner → agent → learner | Silero VAD gates the audio, Deepgram streams interim and final captions back. |
| `captions`, `captions.detail` attributes | agent | Caption status (`starting`, `live`, `unavailable`, `error`) and a readable reason. |
| `mic` → `echo-mic` | learner → agent → learner | Hear yourself after the round trip; checks AEC by ear. |
| `probe` → `echo-probe` | learner → agent → learner | Tone bursts timed by the browser to measure the audio round trip. |
| `tone` | agent → learner | A test tone played through the speaker for the automated echo test. |
| `ping` / `pong` on `interpreter.control` | data channel | Signalling round trip. |

The caption language comes from the learner's participant metadata, which the
web app signs into their token; the agent re-validates it against
`CAPTION_LANGUAGES`. Later phases add simultaneous MT and TTS on the same
tracks and topics.

### How captioning works

- **VAD gate** (`gate.py`): audio reaches Deepgram only while Silero hears
  speech, which is what keeps per-second ASR billing proportional to talking
  rather than session length. A 500 ms pre-roll is flushed at speech onset so
  the first syllable isn't clipped, and when speech ends the agent sends
  `Finalize` instead of waiting for Deepgram's own endpointing.
- **Deepgram client** (`asr.py`): a thin WebSocket client rather than the
  LiveKit plugin, so the caption layer gets Deepgram's word timings and segment
  semantics directly. It sends `KeepAlive` while the gate is shut, reconnects
  with backoff, and treats an auth failure as permanent.
- **Captions** (`captions.py`): interim results replace each other within a
  segment, finals freeze it, and `speech_final`/`UtteranceEnd` mark sentence
  boundaries for the translation layer later.
- **Latency**: each caption carries `latencyMs`, from the moment the last
  recognised word's audio *arrived at the agent* to the caption being sent.
  Timing from arrival rather than from when audio was sent means delay added
  by the gate is counted too.

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

# 2. The agent. DEEPGRAM_API_KEY enables captions; without it the session
#    still runs and the page shows captions as unavailable.
cd agents/interpreter
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
LIVEKIT_URL=ws://127.0.0.1:7880 LIVEKIT_API_KEY=devkey LIVEKIT_API_SECRET=secret \
  DEEPGRAM_API_KEY=... python main.py dev

# 3. The app, with the same LIVEKIT_* values in .env
npm run dev
```

Then open **Live interpreter** in the app, pick the language you'll speak and
press **Start**.

**No Deepgram key?** `tests/fake_deepgram.py` stands in for it: it checks the
request like Deepgram would and streams placeholder words (`word1 word2 …`)
paced by the audio it receives, so you can exercise the whole caption path.

```bash
python tests/fake_deepgram.py --port 8765 --delay-ms 200   # simulated recognition time
DEEPGRAM_API_KEY=fake DEEPGRAM_URL=ws://127.0.0.1:8765/v1/listen python main.py dev
```

| Agent variable | Default | |
|---|---|---|
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | — | Required. |
| `DEEPGRAM_API_KEY` | — | Enables captions. |
| `DEEPGRAM_URL` | `wss://api.deepgram.com/v1/listen` | Self-hosted Deepgram, or the fake. |
| `INTERPRETER_AGENT_NAME` | `interpreter` | Must match the app's. |

In `start` (production) mode the worker stops accepting jobs once host CPU
passes 70 %; `dev` mode doesn't. The LiveKit server applies its own load check
in both modes, though (see Troubleshooting).

## Phase 2 exit criterion

- **Captions within 300 ms of speech (median)**: the **Caption latency** stat on
  the page, agent-measured as described above. The trip from the agent to the
  screen is about half the data round trip on top.

Verified so far without a Deepgram key, using the fake server and a spoken
test clip played through Chromium's fake microphone: captions stream, settle
and break into lines at utterance ends; silence between utterances is not sent
to the recogniser; and with `--delay-ms 200` the page reports **203 ms**,
so the measurement is right and the pipeline itself adds about 3 ms.
**Real Deepgram latency and accuracy are not yet measured**: that needs a key.

## Phase 1 exit criteria

From the design doc, verified with the connection checks on the same page:

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

The tests cover the pure modules (protocol, captions, gate, tone), run the
Deepgram client against `tests/fake_deepgram.py`, and check that the protocol
constants and caption languages match `src/lib/interpreter/protocol.ts`. They
need neither LiveKit nor a Deepgram account.

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
- **Captions say "Problem: rejected the agent's API key"**: `DEEPGRAM_API_KEY`
  is wrong or lacks streaming access. The agent doesn't retry auth failures.
- **Captions stay on "Starting" / "retrying"**: the agent can't reach
  Deepgram. It uses `HTTPS_PROXY` if set (unlike the LiveKit connection below),
  so check the proxy or `DEEPGRAM_URL`.
- **Agent logs `405 Invalid response status` when connecting**: an
  `HTTPS_PROXY`/`HTTP_PROXY` in its environment is intercepting the `ws://`
  connection. Unset it for the agent, or add the LiveKit host to `NO_PROXY`.
