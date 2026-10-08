# Live Interpreter — real-time voice-to-voice translation

Design and implementation plan for a streaming speech-to-speech translator: the user
speaks, and a natural translated voice follows a second or two behind, in any target
language they choose, without waiting for them to finish the sentence.

This document follows the house style of `ARCHITECTURE.md`: every significant choice
states *why*, and where it could reasonably have gone the other way, the trade-off is
spelled out.

---

## 0. Setting the latency target honestly

"Near-zero latency" is the goal, but it has a hard floor that no vendor can remove:
**you cannot translate a word that has not been said yet**. German puts the verb at the
end of the clause; Japanese and Turkish are verb-final; English → Spanish reorders
adjectives. A simultaneous system therefore always lags the speaker by *some* amount of
source context. Professional human interpreters run an ear–voice span of roughly
2–3 seconds for the same reason.

What we can engineer away is everything *else*: buffering, round trips, waiting for
end-of-utterance, re-synthesising audio, and jitter. The targets this design commits to:

| Metric | Target (p50) | Target (p95) | Measured as |
|---|---|---|---|
| Ear-to-voice lag, SVO→SVO pairs (EN↔ES/FR/PT/IT) | ≤ 1.2 s | ≤ 2.0 s | source word onset → same concept audible in target |
| Ear-to-voice lag, SVO↔SOV pairs (EN↔DE/JA/KO/TR) | ≤ 2.0 s | ≤ 3.0 s | same |
| Time to first translated audio after speech starts | ≤ 1.0 s | ≤ 1.6 s | VAD speech-start → first TTS sample played |
| Self-echo re-transcribed (translated audio picked up by mic) | 0 words | 0 words | ASR words matching recent TTS text |
| Retracted audio (spoken translation later contradicted) | 0 | 0 | by construction — see §4.3 |

"Perfectly synchronized" is defined here as **a stable lag**: the translated voice keeps
a constant distance behind the speaker instead of bunching up and then rushing. That is
what listeners perceive as synchronized, and it is achievable (§5.4).

---

## 1. Shape of the system

```
┌───────────────────────────── Client (browser / mobile) ─────────────────────────────┐
│ getUserMedia (AEC + NS + AGC on)                                                    │
│   └─► RTCPeerConnection ── Opus 20 ms frames, DTX off ───────────────┐              │
│                                                                      │              │
│ ◄── remote audio track (translated voice) ◄──────────────────────┐   │              │
│       played via <audio> element fed by the PeerConnection ──────┼───┼── AEC ref    │
│ ◄── data channel: live captions (source + target, partial/final)─┼─┐ │              │
└──────────────────────────────────────────────────────────────────┼─┼─┼──────────────┘
                                                                   │ │ │  WebRTC (UDP, SRTP)
┌──────────────────────────── SFU (LiveKit) ───────────────────────┼─┼─┼──────────────┐
└──────────────────────────────────────────────────────────────────┼─┼─┼──────────────┘
                                                                   │ │ ▼
┌─────────────────────────── Interpreter agent (per session) ─────────────────────────┐
│  ┌─────────┐  PCM 16 kHz   ┌──────────────┐  partial+final  ┌──────────────────────┐ │
│  │ Decode  ├──────────────►│ ASR stream   ├────────────────►│ Simultaneous MT      │ │
│  │ + VAD   │  20 ms frames │ (Deepgram WS)│  word timings   │ policy + LLM         │ │
│  └─────────┘               └──────────────┘                 │ (commits stable      │ │
│       ▲                                                     │  target prefix)      │ │
│       │ echo guard: drop ASR words matching recent TTS      └──────────┬───────────┘ │
│       │                                                     committed  │ text chunks │
│  ┌────┴────────┐  PCM 24 kHz  ┌──────────────────┐ ◄────────────────────┘            │
│  │ Pacer +     │◄─────────────┤ TTS stream       │                                   │
│  │ jitter buf. │              │ (Cartesia /      │                                   │
│  │ → Opus      │              │  ElevenLabs WS)  │                                   │
│  └─────────────┘              └──────────────────┘                                   │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

Three properties drive everything below:

1. **Every stage streams.** Nothing waits for an end-of-sentence. Audio flows in as 20 ms
   frames, text flows through as words, synthesized audio flows out as ~50 ms chunks.
2. **Only committed text reaches the speaker.** The MT layer may revise its guess about
   the tail of a sentence, but audio already played can't be unsaid, so TTS only ever
   receives text the policy has committed to (§4.3).
3. **The translated voice returns over the same WebRTC connection.** This is not a
   convenience — it is what makes browser echo cancellation work (§6).

---

## 2. Tech stack

| Layer | Recommendation | Alternatives | Why this one |
|---|---|---|---|
| Client transport | **WebRTC** via LiveKit client SDK (`livekit-client`) | Daily (Pipecat transport), raw `RTCPeerConnection` + own SFU | UDP with jitter buffer, Opus FEC, congestion control and — critically — AEC reference for remote audio. WebSockets over TCP add head-of-line blocking on lossy mobile networks. |
| Media server | **LiveKit** (self-host or Cloud) | mediasoup, Janus | Open source, Go, first-class server-side agent framework, region pinning. |
| Agent runtime | **Python, LiveKit Agents** (or **Pipecat**) | Node with `@livekit/rtc-node` | Best-supported ASR/TTS plugins, Silero VAD, asyncio fits the many-stream fan-in. |
| VAD | **Silero VAD** (on-agent) | WebRTC VAD | Robust to noise; gates ASR billing and drives turn bookkeeping. |
| ASR | **Deepgram Nova-3, streaming WebSocket** | Speechmatics Realtime, AssemblyAI Universal-Streaming, self-hosted streaming Whisper (§3.4) | ~150–300 ms partials, word timestamps, multilingual + code-switching, `endpointing`/`utterance_end_ms` controls. |
| Noise reduction | Browser NS + **Krisp / RNNoise** on agent ingress (optional) | DeepFilterNet | Defence in depth; Deepgram is itself noise-robust. |
| Simultaneous MT | **Streaming LLM under a commit policy** (§4): Claude Haiku 5.5 as default, prompt-cached | Gemini Flash, GPT-class mini models; DeepL / Google NMT for re-translation-only mode | LLMs keep discourse context, handle idiom and register, and can be told to produce *only the next safe segment*. Classic NMT APIs translate whole sentences and can't do that. |
| TTS | **Cartesia Sonic (WebSocket, continuation contexts)** | ElevenLabs Flash v2.5 (`stream-input` WS), OpenAI TTS streaming, self-hosted XTTS / F5 | Continuation contexts let us push text in fragments while the voice keeps one continuous prosodic line — the key to "organic" output. ~90 ms model latency. |
| Voice | Stock expressive voice, or **instant voice clone** of the user (with explicit consent) | — | Hearing *your own* voice in another language is the most natural result. |
| Captions / control | WebRTC **data channel** | — | Same connection, same ordering, no second socket. |
| Observability | OpenTelemetry spans per stage + per-session latency histogram | — | Latency regressions are the product's main failure mode. |

**All-in-one alternatives worth benchmarking in Phase 0.** OpenAI's Realtime API, Gemini
Live and Meta's open SeamlessStreaming each do speech-in/speech-out in a single model.
They are simpler, but give little control over the commit policy, the voice, the glossary,
or which language pairs get extra wait. The cascaded design here is chosen for control
and per-stage observability; keep one end-to-end option as a fallback provider behind the
same interface so it can be swapped in if it wins on a given language pair.

> Vendor APIs change quickly. Before Phase 1, re-verify the endpoints, model names and
> parameters below against each provider's current documentation.

---

## 3. Stage 1 — streaming ASR

### 3.1 Audio framing

The client never "chunks" audio itself. WebRTC delivers a continuous stream of 20 ms Opus
frames; the agent decodes to 16 kHz mono PCM (linear16) and forwards each frame to the ASR
socket as soon as it arrives. With a streaming-native ASR there is no reason to build
overlapping windows: the model keeps its own acoustic state across frames and emits
revised hypotheses as context grows. Overlap only matters for windowed models like
Whisper (§3.4).

### 3.2 Deepgram connection

```
wss://api.deepgram.com/v1/listen
  ?model=nova-3
  &language=multi            # or a fixed source language for best accuracy
  &encoding=linear16
  &sample_rate=16000
  &channels=1
  &interim_results=true      # partial hypotheses every ~100–300 ms
  &smart_format=true
  &punctuate=true
  &endpointing=300           # ms of silence before a "final" for that segment
  &utterance_end_ms=1000     # separate, word-timing-based end-of-utterance signal
  &vad_events=true
```

Handling rules:

- **Partials (`is_final=false`)** feed the MT policy as an *unstable* source suffix.
- **Finals (`is_final=true`)** freeze that span of words; they never change again.
- **`speech_final` / `UtteranceEnd`** mark a sentence boundary: the MT policy flushes any
  remaining uncommitted target text.
- Send a `KeepAlive` message every ~5 s of silence and `CloseStream` on teardown so
  the socket isn't dropped mid-session.
- Use **keyterm prompting** (Nova-3) for names, product terms and the user's glossary.
- Open the socket **before** the user starts speaking (on session join) — a cold TLS +
  WS handshake costs 150–400 ms you never get back.

### 3.3 Noise

Three layers, cheapest first: browser `noiseSuppression` (§6), optional Krisp/RNNoise on
agent ingress for very noisy environments (cafés, cars), and the ASR model's own
robustness. Do not stack aggressive suppressors by default — each one smears consonants
and costs ASR accuracy. Turn the server-side one on per session when the measured SNR
is low.

### 3.4 Self-hosted alternative: streaming Whisper

Whisper is not a streaming model; it transcribes ~30 s windows. To stream it:

- Run **faster-whisper** (CTranslate2) or **WhisperLive** on a GPU per ~N sessions.
- Feed a growing buffer every ~0.5–1.0 s (the "tiny overlapping chunks" approach), and
  emit only the words on which the last two hypotheses agree (**LocalAgreement-2**, as in
  `whisper_streaming`). Trim the buffer at the last committed sentence boundary.
- Expect ~1–2 s additional latency vs Deepgram and hallucinations on silence — gate it
  with VAD. Worth it only for on-prem/privacy requirements or cost at very high volume.

---

## 4. Stage 2 — simultaneous machine translation

### 4.1 The problem

A sentence-level translator waits for the full stop; a word-level one produces nonsense.
Simultaneous MT decides, as each source word arrives, whether to **READ** (wait for more
source) or **WRITE** (emit more target). Two well-studied policies, combined here:

- **wait-k**: target lags the source by *k* words. Simple and predictable; *k* is tuned
  per language pair (≈2–3 for EN→ES, ≈4–6 for EN→DE/JA).
- **Local agreement / prefix stability**: re-translate the whole current source
  prefix on every update and commit only the target prefix that has stayed the same
  across the last *n* translations. Adapts automatically: easy stretches flow fast,
  ambiguous stretches wait.

### 4.2 LLM as the translation engine

Each update calls a fast LLM with streaming output and a cached system prompt:

```
SYSTEM (cached):
You are a simultaneous interpreter from {src} to {tgt}.
You receive: the conversation so far (already translated), the target text already
spoken aloud (immutable), and the current source sentence, which may be incomplete.
Output ONLY the continuation of the target that is safe to say now: text that will
remain correct however the source sentence ends. If nothing is safe yet, output nothing.
Never repeat or contradict the already-spoken target; adapt grammar so it continues it
naturally. Keep register, names and the glossary: {glossary}.

USER:
<context>{last ~6 translated sentences, source + target}</context>
<spoken>{committed target for this sentence}</spoken>
<source final="{bool}">{frozen words} [{unstable partial words}]</source>
```

Why this works for the requirements:

- **Context**: the rolling window of prior sentences resolves pronouns, gender agreement
  and terminology across sentences.
- **Grammar adjusted on the fly**: the model sees what has already been spoken and must
  *continue* it grammatically — e.g. having said "Ayer, el equipo…", it waits for the verb
  rather than guessing, then continues with the correct agreement.
- **No retractions**: `spoken` is immutable by contract and the policy re-checks it (§4.3).

Engineering details that matter for latency:

- Keep the system prompt + glossary identical across calls so **prompt caching** applies;
  only the short tail changes. Time-to-first-token is the dominant cost.
- **Debounce** partial updates to one MT call per ~150 ms or per new word, whichever is
  later; cancel the in-flight request when a newer source prefix arrives.
- On `final=true`, the model must emit the complete remainder; this is the flush.
- Pre-warm the HTTP/2 connection to the LLM provider at session start.

### 4.3 Commit policy (the piece that makes it safe)

```
on every MT result R for the current sentence:
    candidate = R appended to committed_target
    history.push(candidate)
    stable    = longest_common_prefix(history[-2:])         # LocalAgreement-2
    stable    = trim_to_word_or_phrase_boundary(stable)
    if source_is_final:
        stable = candidate                                   # flush
    if len(stable) > len(committed_target):
        delta = stable[len(committed_target):]
        committed_target = stable
        tts.push(delta)                                      # only ever appends
    enforce_max_lag(wait_k_ceiling)                          # §4.4
```

Committed text is append-only. TTS never receives anything that can later change, so
the listener never hears a correction.

### 4.4 Lag control

A per-pair ceiling (from wait-k) bounds how far behind the target may fall: if the source
is more than *k_max* words ahead of the committed target, the next MT call is instructed to
commit its best continuation now. A floor stops it running ahead of the speaker on
partials that are still unstable. Both are tuned per language pair from the Phase-0
benchmark and stored as configuration, not code.

### 4.5 Alternatives

- **Classic NMT (DeepL, Google Translation)**: sentence-level only. Usable in a
  "re-translate the stable prefix" mode with LocalAgreement, but quality on partial
  sentences is noticeably worse than an LLM told the input is incomplete. Good fallback.
- **Dedicated simultaneous models** (SeamlessStreaming, research SimulMT models):
  self-hostable, lowest marginal cost, weaker on long-range context and register.

---

## 5. Stage 3 — streaming neural TTS

### 5.1 Requirements

Natural intonation, breathing pauses and rhythm come from the TTS model *seeing enough of
the sentence to plan its prosody*. Sending isolated three-word fragments to independent
requests produces a flat, choppy "robot reading a list" voice. Sending whole sentences
adds seconds of lag. The solution is a TTS stream that accepts text incrementally into one
continuous utterance.

### 5.2 Cartesia Sonic (recommended)

Open one WebSocket per session; for each sentence, use a **context id** and send fragments
with `continue: true`, then a final message with `continue: false`:

```json
{ "model_id": "sonic-2", "context_id": "s-42", "continue": true,
  "transcript": "Ayer, el equipo ",
  "voice": { "mode": "id", "id": "<voice-id>" },
  "language": "es",
  "output_format": { "container": "raw", "encoding": "pcm_s16le", "sample_rate": 24000 } }
```

The model keeps prosodic state across fragments within a context, so the sentence comes
out as one natural line even though it was submitted piecewise.

### 5.3 ElevenLabs (alternative)

`wss://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream-input?model_id=eleven_flash_v2_5`
— send text pieces as they commit and use `flush: true` at sentence boundaries; tune
`chunk_length_schedule` low (e.g. `[50, 90, 120]`) to start speaking sooner. The
multi-context WebSocket variant allows the same per-sentence context handling as Cartesia.

### 5.4 Pacing and synchronization

- **Jitter buffer of ~150–250 ms** on the agent before audio goes out, so short TTS
  hiccups don't become audible gaps.
- **Adaptive rate**: if the backlog of unplayed target audio exceeds ~1.5 s, raise the TTS
  speaking rate (both providers expose speed controls) by up to ~10–15 %; return to 1.0
  when it drains. This holds the lag constant, which is what reads as "synchronized".
- **Natural pauses**: when the source pauses (VAD), let the target finish its sentence and
  then pause too — don't fill silence. Pass punctuation through so the TTS inserts breaths.
- **Barge-in is not needed** in this product (the target voice is for the user, not a
  turn-taking agent), so TTS is never interrupted by the user speaking — that is exactly the
  simultaneous case. Only `session end` or a language change cancels the context.

---

## 6. Strict client-side acoustic echo cancellation

The danger: translated audio plays from the speaker, the microphone hears it, ASR
transcribes it, and the system translates its own output in a loop.

### 6.1 Why the translated audio must come back over WebRTC

Browser AEC (WebRTC APM / AEC3) subtracts a **reference signal** — the audio it knows is
being played — from the microphone. In Chromium the reference is reliably the audio from
remote `RTCPeerConnection` tracks; audio you play yourself through Web Audio or an
`<audio>` element fed from fetched bytes is generally **not** used as the reference on every
platform, so it leaks into the mic. By returning the TTS audio as a remote WebRTC track,
the browser's echo canceller always has the exact reference. This one decision does more
for echo than every other measure combined.

### 6.2 Capture constraints

```ts
const mic = await navigator.mediaDevices.getUserMedia({
  audio: {
    echoCancellation: true,      // AEC3 against the remote track
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
    sampleRate: 48000,
  },
});

// Verify the browser actually honoured the constraints — some devices silently don't.
const s = mic.getAudioTracks()[0].getSettings();
if (!s.echoCancellation) degradeToProtectedMode("aec-unavailable");
```

Where supported, the newer `echoCancellation: "all"` value (Media Capture extensions)
asks the browser to cancel *all* system playback, not just WebRTC audio.
`getSupportedConstraints()` only reports constraint *names*, not which values a browser
accepts, so try it with `applyConstraints()` and read `getSettings()` back; that is what
`tryUpgradeToSystemWideAec()` in `src/lib/interpreter/aec.ts` does.

Playback:

```ts
room.on(RoomEvent.TrackSubscribed, (track) => {
  if (track.kind === Track.Kind.Audio) {
    const el = track.attach();   // <audio> bound to the remote MediaStream → AEC reference
    document.body.appendChild(el);
  }
});
```

Don't route the remote track through a `MediaStreamAudioDestinationNode`, resample it, or
play it from a second tab/app — each breaks the reference path.

### 6.3 Defence in depth (because "completely isolates" needs more than one layer)

1. **Transcript-level echo guard (agent).** Keep the last ~10 s of TTS text with play-out
   timestamps. Drop any ASR words that fuzzy-match recently played target text within the
   expected acoustic delay window. This catches residual echo that AEC missed, and since
   the target is in a different language from the source, false positives are rare.
2. **Double-talk aware gain (client, optional).** While translated audio is playing and
   the mic RMS is close to the expected echo level, attenuate the mic send by a few dB.
   Never fully gate it — the user is expected to keep talking over the translation.
3. **Protected mode.** If AEC is unavailable or the echo guard trips repeatedly, prompt the
   user to use headphones (which eliminates acoustic echo physically) and show a banner.
   Headphones are the recommended setup regardless; they also preserve privacy.
4. **Native apps.** iOS: `AVAudioSession` category `.playAndRecord`, mode `.voiceChat`
   (enables the VoiceProcessingIO unit's AEC). Android: `MediaRecorder.AudioSource.VOICE_COMMUNICATION`
   plus `AcousticEchoCanceler` / `NoiseSuppressor` on the session. The LiveKit mobile
   SDKs configure both by default.

### 6.4 Testing AEC

An automated harness plays a scripted target-language clip through the speaker of a test
device while a source-language clip plays from a second speaker; pass = ASR output contains
zero words from the target clip. Run it per browser × OS × device class (laptop speakers,
phone speakerphone, Bluetooth).

---

## 7. Latency budget (EN → ES, speaker-on, same region)

| Stage | Budget |
|---|---|
| Capture + Opus encode + network to SFU/agent | 40–80 ms |
| Decode + VAD | 10–20 ms |
| ASR partial for a word after it is spoken | 150–300 ms |
| Policy wait (k ≈ 2–3 words) | 300–700 ms (linguistic, irreducible) |
| LLM time-to-first-token (cached prompt) | 150–300 ms |
| TTS time-to-first-audio | 90–200 ms |
| Jitter buffer + network to client + playout | 150–250 ms |
| **Total ear-to-voice** | **≈ 0.9–2.0 s** |

Co-locate the agent with the ASR, LLM and TTS provider regions; a transatlantic hop in the
middle of the pipeline costs more than any model choice.

---

## 8. Step-by-step implementation plan

### Phase 0 — Benchmarks and spikes (1 week)
1. Build a CLI harness that plays recorded source audio in real time through
   ASR → MT → TTS and logs per-word timestamps at each stage.
2. Benchmark Deepgram vs one alternative ASR; Claude Haiku vs one alternative LLM;
   Cartesia vs ElevenLabs — on 3 language pairs (EN→ES, EN→DE, EN→JA) with ~30 min of
   varied speech each.
3. Benchmark one end-to-end speech-to-speech model as the comparison baseline.
4. **Exit criteria:** chosen vendors, initial *k* per pair, measured budget per stage.

### Phase 1 — Transport skeleton (1 week)
1. Stand up LiveKit (Cloud for dev). Token endpoint in the Next.js app:
   `POST /api/interpreter/session` → validates the session, returns a room token. API keys
   stay server-side; the browser never sees vendor keys.
2. Python agent that joins the room and **echoes the user's audio back** as a remote track.
3. Client page `/(app)/interpreter`: mic capture with the constraints in §6.2, remote
   track playback, constraint verification, connection state UI.
4. **Exit criteria:** loopback round-trip < 150 ms; with speakers on, the echoed audio is
   not re-captured (AEC verified on Chrome, Safari, Firefox, iOS, Android).

**Status: built.** The **Live interpreter** page runs the loopback and measures both exit
criteria in the browser: tone bursts on a separate `probe` track time the audio round
trip, and a test tone played on the agent's `tone` track checks how much survives echo
cancellation on the processed mic signal. Measured so far with headless Chromium and
everything on one container: 140–152 ms median across paced runs (up to ~200 ms with the
CPU saturated). That covers
two WebRTC hops and two jitter buffers but not the sound card's own latency, and it has no
network distance. Real-device runs of the echo test on the browser matrix are still
outstanding. See `agents/interpreter/README.md`.

### Phase 2 — Live captions (1 week)
1. Agent: Silero VAD → Deepgram streaming; publish partial/final source captions over
   the data channel.
2. Client: caption view with stable (final) and unstable (partial) styling.
3. **Exit criteria:** source captions within 300 ms p50 of speech.

**Status: built.** The agent gates the learner's microphone with Silero VAD, streams it
to Deepgram over its own thin WebSocket client (`agents/interpreter/asr.py`) and sends
interim and final captions on `interpreter.captions`; the page renders committed text and
the revising tail differently and breaks lines at utterance ends. Caption latency is
measured on the agent from audio *arrival* to caption send, so gating delay counts. Verified
end to end with a fake Deepgram (`tests/fake_deepgram.py`): with 200 ms of simulated
recognition time the page reports 203 ms. Real Deepgram latency and accuracy still need a
run with an API key.

### Phase 3 — Simultaneous translation (2 weeks)
1. Implement the commit policy (§4.3) as a **pure, unit-tested module** — feed it scripted
   sequences of partial/final hypotheses and assert committed output is append-only and
   lag-bounded. (Same principle as `srs.ts`: the logic that matters has no I/O.)
2. LLM adapter with streaming, cancellation, debounce and prompt caching; glossary and
   rolling context.
3. Publish target captions (committed + tentative) over the data channel.
4. **Exit criteria:** zero retractions across the test corpus; lag within §0 targets
   on captions; quality checked by bilingual reviewers + COMET on the benchmark set.

### Phase 4 — Streaming voice (1–2 weeks)
1. TTS adapter (Cartesia contexts / ElevenLabs stream-input) fed only by committed deltas.
2. Pacer: jitter buffer, adaptive speaking rate, publish as the agent's audio track.
3. Voice selection; optional consented voice cloning flow.
4. **Exit criteria:** end-to-end ear-to-voice lag within §0 targets; MOS-style listening
   test ≥ 4.0 for naturalness.

### Phase 5 — Echo hardening (1 week)
1. Transcript-level echo guard (§6.3.1) with unit tests.
2. Protected mode and headphone prompt.
3. Automated AEC harness on the device matrix (§6.4).
4. **Exit criteria:** zero self-transcribed words across the matrix with speakers on.

### Phase 6 — Production readiness (1–2 weeks)
1. Per-stage OpenTelemetry spans; dashboard of ear-to-voice lag p50/p95 per pair.
2. Resilience: auto-reconnect of each vendor socket with replay of the un-finalized audio
   tail; provider failover behind the adapter interfaces.
3. Rate limiting and per-user minute quotas (reuse `src/lib/rate-limit.ts` for the
   session-token endpoint); cost metering per session.
4. Privacy: no audio stored by default; vendor zero-retention options enabled; explicit
   consent for voice cloning, with deletion.
5. Load test: N concurrent sessions per agent worker; autoscale workers on room count.

**Total: roughly 8–10 weeks** for one experienced engineer pair to production quality on
the three benchmark language pairs. Additional pairs are mostly configuration (*k*,
glossary, voice) plus a benchmark run.

---

## 9. Code layout

```
src/app/(app)/interpreter/page.tsx         # client UI: language picker, captions, status
src/app/api/interpreter/session/route.ts   # auth → LiveKit room token
src/lib/interpreter/aec.ts                 # constraint setup + verification
agents/interpreter/
  main.py                                  # LiveKit agent entrypoint
  asr.py                                   # Deepgram streaming adapter
  policy.py                                # commit policy (pure) + tests
  mt.py                                    # LLM adapter: streaming, cancel, cache
  tts.py                                   # Cartesia / ElevenLabs adapters
  pacer.py                                 # jitter buffer + adaptive rate
  echo_guard.py                            # transcript-level echo filter (pure) + tests
  config/pairs.yaml                        # per-pair k, lag ceiling, voice, glossary
```

New environment variables (server-side only): `LIVEKIT_URL`, `LIVEKIT_API_KEY`,
`LIVEKIT_API_SECRET`, `DEEPGRAM_API_KEY`, `ANTHROPIC_API_KEY` (or the chosen MT provider),
`CARTESIA_API_KEY` / `ELEVENLABS_API_KEY`.

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| Verb-final languages feel laggy | Per-pair *k*; prompt the model to use interpreter strategies (anticipation only when safe, restructuring, summarizing); show target captions so the user sees progress. |
| AEC fails on a device class | Protected mode + headphones; transcript echo guard as a backstop. |
| Vendor outage or latency spike | Adapter interfaces with failover; per-stage health checks. |
| Cost at scale (ASR + LLM + TTS minutes) | VAD gating so silence isn't billed; prompt caching; self-hosted Whisper / open TTS for high-volume pairs. |
| Voice-clone misuse | Clone only the authenticated user's own voice, with recorded consent; never expose clone ids across accounts. |
