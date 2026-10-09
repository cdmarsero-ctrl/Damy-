# Interpreter agent

The server-side half of the live interpreter
([design](../../docs/REALTIME-TRANSLATION.md)). It runs as a LiveKit Agents
worker: the web app's `POST /api/interpreter/session` mints a room token that
dispatches this agent into a fresh room alongside the learner.

**Current stage: Phase 5, echo protection**: live captions, simultaneous
translation and a translated voice that is safe with speakers on, with the
Phase 1 loopback kept as connection diagnostics.

| Track or message | Direction | Purpose |
|---|---|---|
| `mic` → captions on `interpreter.captions` | learner → agent → learner | Silero VAD gates the audio, Deepgram streams interim and final captions back. |
| `captions`, `captions.detail` attributes | agent | Caption status (`starting`, `live`, `unavailable`, `error`) and a readable reason. |
| captions → translation on `interpreter.translation` | agent → learner | Committed (never retracted) and tentative translation per sentence. |
| `translation`, `translation.detail` attributes | agent | Translation status, same values as captions. |
| committed translation → `voice` track | agent → learner | The translation spoken (Cartesia), sentence by sentence. |
| `interpreter.voice` | agent → learner | Per spoken sentence: ear-to-voice lag and queued audio. |
| `voice`, `voice.detail` attributes | agent | Speech status, same values as captions. |
| `echo`, `echo.detail` attributes | agent | Echo guard: `off` (nothing spoken), `clean`, or `leaking` (it keeps removing the agent's own voice from the mic). |
| `echo-check` on `interpreter.control` → `interpreter.echo` | learner → agent → learner | Speech check: the agent says a fixed phrase and reports words spoken, heard and let through. |
| `mic` → `echo-mic` | learner → agent → learner | Hear yourself after the round trip; checks AEC by ear. |
| `probe` → `echo-probe` | learner → agent → learner | Tone bursts timed by the browser to measure the audio round trip. |
| `tone` | agent → learner | A test tone played through the speaker for the automated echo test. |
| `ping` / `pong` on `interpreter.control` | data channel | Signalling round trip. |

The caption and translation languages come from the learner's participant
metadata, which the web app signs into their token; the agent re-validates
them against `CAPTION_LANGUAGES` and `LANGUAGE_NAMES`.

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

### How translation works

- **Sentences** (`translation.py`): the caption stream is split at utterance
  ends. One worker translates the oldest unfinished sentence, one request at a
  time; while a request is in flight newer captions just update the source,
  and the next request takes the newest state. Cancelling on every interim
  would starve it, because interims arrive faster than a model answers. The
  one cancellation: when the sentence being translated ends, its stale request
  is dropped so the final flush starts at once.
- **Commit policy** (`policy.py`): the model is asked for "the continuation
  that is safe to say now". Nothing is committed until two consecutive answers
  agree on it (LocalAgreement-2), a lag ceiling forces a commit when the source
  runs too far ahead (4 words, 6 when either language is verb-final, ×3 per
  character for Japanese/Chinese sources), and the final answer for a sentence
  is committed whole. Committed text only ever grows, which is what will let
  Phase 4 speak it.
- **Model** (`mt.py`): Claude Haiku 5.5 by default (`INTERPRETER_MT_MODEL`),
  streamed, with thinking off. The system prompt (language pair plus worked
  examples) is byte-identical for a session and carries the cache breakpoint,
  so each request only processes the short tail fresh. It's long enough to
  clear the 512-token cacheable minimum; check `cache_read` in the agent's
  debug log (`mt … usage=`) to confirm caching in production. Earlier
  sentences go along as context for pronouns, gender and terminology.
- **Cost shape**: during speech the worker makes back-to-back requests, about
  one per model response time (3–4 per second at ~250 ms); silence costs
  nothing.

### How speech works

- **Only committed text is spoken** (`speech.py`). The translation loop hands
  each commit to the speaker as it happens; committed text never changes, so
  nothing spoken ever needs taking back.
- **One TTS context per sentence** (`tts.py`, Cartesia's WebSocket API,
  version 2026-08-14). Pieces are sent with `continue: true` as they commit,
  and the context ends when the sentence is final, so the voice plans the
  sentence's intonation as a whole even though it arrives a few words at a
  time. `max_buffer_delay_ms` (default 300, `INTERPRETER_TTS_BUFFER_MS`)
  lets the server smooth very small pieces.
- **Playout in sentence order** (`PlayoutBuffer`): contexts can generate in
  parallel, but sentence N+1 never plays before N has finished. The voice
  track's 200 ms source queue is the jitter buffer.
- **Steady lag** (§5.4): when more than 1.5 s of audio is waiting, later
  pieces are generated at 1.12× speed until the backlog is under 0.5 s.
- **Voice lag** is measured per sentence on the agent: from the sentence's
  first words reaching it (caption time minus recognition latency) to its
  translated audio starting to play. That's the agent's ear-to-voice; add
  network and playout on each side.

### How echo is kept out

The browser's echo canceller is the first defence: the voice arrives as a
remote WebRTC track, which is its reference (§6.1). Two more layers cover what
it misses:

- **Echo guard** (`echo_guard.py`). The speaker tells the guard, for every
  frame it plays, which sentence and its text. The captioner passes each
  recognition result through the guard before captions or translation see it.
  A word is echo when it matches played text (ignoring case, accents and
  punctuation, allowing a misrecognised letter or two in longer words) and
  arrived within 2 s of that text playing. Two or more such words in the
  played order are removed. A single one only if it is the whole result or
  continues an echo already removed, so a learner's "no" over a Spanish "no"
  survives.
- **Protected mode** (the page). When the browser reports echo cancellation
  off, or the guard removes echo in 3 final results within a minute (`echo`
  turns `leaking`), the page mutes the voice and asks for headphones. It stays
  muted until the learner confirms; captions and text carry on.

The **speech check** on the page measures a device: the agent speaks a fixed
greeting in the target language through the normal voice path. It reports
how many of its words the microphone delivered (`heardWords`, what echo
cancellation let through) and how many of those also got past the guard
(`passedWords`). The learner stays quiet for it.

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

**No keys?** Two fakes stand in, so the whole caption and translation path
runs locally. `tests/fake_deepgram.py` checks requests like Deepgram and streams
placeholder words (`word1 word2 …`) paced by the audio it receives;
`tests/fake_anthropic.py` speaks the Messages API's streaming format and
"translates" them (`palabra1 palabra2 …`), holding back the last word like a
cautious interpreter; `tests/fake_cartesia.py` answers each piece with a soft
tone, 250 ms per word.

```bash
python tests/fake_deepgram.py --port 8765 --delay-ms 200    # simulated recognition time
python tests/fake_anthropic.py --port 8766 --delay-ms 250   # simulated time to first token
python tests/fake_cartesia.py --port 8767 --delay-ms 150    # simulated time to first audio
DEEPGRAM_API_KEY=fake DEEPGRAM_URL=ws://127.0.0.1:8765/v1/listen \
  ANTHROPIC_API_KEY=fake ANTHROPIC_BASE_URL=http://127.0.0.1:8766 \
  CARTESIA_API_KEY=fake CARTESIA_VOICE_ID=fake-voice \
  CARTESIA_URL=ws://127.0.0.1:8767/tts/websocket python main.py dev
```

| Agent variable | Default | |
|---|---|---|
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | — | Required. |
| `DEEPGRAM_API_KEY` | — | Enables captions. |
| `DEEPGRAM_URL` | `wss://api.deepgram.com/v1/listen` | Self-hosted Deepgram, or the fake. |
| `ANTHROPIC_API_KEY` | — | Enables translation (needs captions too). |
| `INTERPRETER_MT_MODEL` | `claude-haiku-5-5` | Translation model. Larger models run at low effort; expect more lag. |
| `ANTHROPIC_BASE_URL` | Anthropic API | Read by the SDK; for the fake. |
| `CARTESIA_API_KEY`, `CARTESIA_VOICE_ID` | — | Enable the spoken translation (needs translation too). |
| `CARTESIA_URL` | `wss://api.cartesia.ai/tts/websocket` | For the fake. |
| `INTERPRETER_TTS_MODEL` | `sonic-3.6` | Cartesia model. |
| `INTERPRETER_TTS_BUFFER_MS` | `300` | Server-side text buffering per sentence (0–5000). |
| `INTERPRETER_AGENT_NAME` | `interpreter` | Must match the app's. |

In `start` (production) mode the worker stops accepting jobs once host CPU
passes 70 %; `dev` mode doesn't. The LiveKit server applies its own load check
in both modes, though (see Troubleshooting).

## Phase 5 exit criteria

- **Zero self-transcribed words across the device matrix with speakers on**:
  the speech check's `passedWords` must be 0 for each browser × OS × output
  (laptop speakers, phone speakerphone, Bluetooth) with real recognition.
  **Not run yet**: it needs real devices and a Deepgram key. Record each run's
  "heard" and "let through" counts. "Heard" > 0 with "let through" 0 means the
  guard caught what AEC missed.

Verified so far:
- **The guard** (`tests/test_echo.py`):
  - unit tests;
  - a captioner-level test showing echo removed before captions and `leaking`
    reported;
  - a simulated speakers-on run. The speaker plays a translation through fake
    TTS, and the echo comes back 300–900 ms late, misheard and split into 2–6
    word results among the learner's own words. Across 50 randomised runs in
    the suite (and 500 offline), no echoed word got through and no learner
    word was lost.
- **In headless Chromium with the fakes**:
  - the speech check ran end to end: 8 words spoken, voice playing, 0 heard,
    since a fake microphone has no acoustic path;
  - with the browser reporting echo cancellation off, protected mode muted the
    voice, and confirming headphones restored it.

Limit: the guard can only match echo that the source recogniser writes in the
target language's script. Spanish heard by an English or multilingual
recogniser matches. Japanese heard by an English recogniser (or the reverse)
usually won't, so for those pairs echo cancellation and headphones are the
defence.

## Phase 4 exit criteria

- **Ear-to-voice lag within the design targets**: the page's **Voice lag**,
  target ≤ 1200 ms median for similar-word-order pairs.
- **Natural voice**: a listening test (MOS ≥ 4.0). Not done yet: it needs
  real speech and a real voice.

Verified so far with the three fakes and the spoken test clip: the voice
track reaches the browser and plays (the page's speaking indicator, driven
by the received audio's level, was on in 54 of 70 samples over 14 s),
sentences play in order, and there were still 0 retractions. Voice lag was
**1412 ms** median with 200 ms recognition, 250 ms model and 150 ms TTS, and
**1024 ms** with the model at 100 ms. Before a sentence's first words can be
spoken, two translator answers must agree (the price of never retracting), so
voice lag is dominated by model round trips, about 2.6 per sentence here.
**Whether the target holds therefore depends on Claude's real response time**,
which needs a key to measure. Levers if it doesn't: a faster model, the lag
ceiling in `policy.py`, and `INTERPRETER_TTS_BUFFER_MS`.

## Phase 3 exit criteria

- **Zero retractions**: committed translation is never taken back. Enforced by
  construction in `policy.py`, tested with scripted and 200 randomised
  hypothesis sequences, and counted live on the page (**Retractions**).
- **Lag within the design targets**: the page's **Translation lag** is the
  time from the end of a sentence (as captioned) to its complete translation,
  target ≤ 1200 ms median. Most of each sentence is committed before then.
- **Quality**: bilingual review and an automatic metric (e.g. COMET) on a test
  set. Not done yet: it needs real ASR and model output.

Verified so far with both fakes (200 ms recognition, 250 ms to first token)
and the spoken test clip through Chromium's fake microphone: translation
commits while each sentence is still being spoken, the page and a DOM watcher
both counted **0 retractions** over 43 updates, and translation lag was
**265 ms** median, about one model call, which shows the stale request is
cancelled at each sentence end. **Real translation quality and Claude latency
are not yet measured**: that needs an Anthropic key (and a Deepgram key for
real speech).

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

The tests cover the pure modules (protocol, captions, gate, tone, commit
policy, playout and speed rules, echo guard), drive the translation loop with
a scripted translator, run the Deepgram client, the Claude adapter (through
the real Anthropic SDK) and the speaker against the three fakes, simulate
speakers-on echo, and check that protocol constants and language lists match
`src/lib/interpreter/protocol.ts`.
They need no accounts or servers.

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
- **Translation says "Problem: rejected the agent's API key"** (or "can't use
  the translation model"): check `ANTHROPIC_API_KEY` and
  `INTERPRETER_MT_MODEL`. These stop translation for the session; captions
  carry on.
- **Translation is "unavailable"**: the agent has no `ANTHROPIC_API_KEY`, or
  no captions to translate (`DEEPGRAM_API_KEY`).
- **Speech is off**: the agent needs `CARTESIA_API_KEY` and
  `CARTESIA_VOICE_ID`, plus working translation. A rejected key stops speech
  for the session; text carries on. If one sentence fails to synthesise it is
  skipped so later sentences aren't held up.
- **The voice is muted with "use headphones"**: the browser reported echo
  cancellation off on the microphone, or the agent kept removing its own voice
  from it (`echo` = `leaking`). Wear headphones and confirm on the page. To
  see how bad the echo is on a device, run the speech check with speakers on.
- **Captions stay on "Starting" / "retrying"**: the agent can't reach
  Deepgram. It uses `HTTPS_PROXY` if set (unlike the LiveKit connection below),
  so check the proxy or `DEEPGRAM_URL`.
- **Agent logs `405 Invalid response status` when connecting**: an
  `HTTPS_PROXY`/`HTTP_PROXY` in its environment is intercepting the `ws://`
  connection. Unset it for the agent, or add the LiveKit host to `NO_PROXY`.
