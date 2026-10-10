"""Phase 0: the benchmark harness (docs/REALTIME-TRANSLATION.md §8).

Plays recorded speech in real time through the agent's own pipeline, with no
LiveKit and no browser:

    WAV -> Silero VAD gate -> streaming ASR -> simultaneous MT -> streaming TTS

It uses the same Captioner, TranslationLoop and Speaker the live agent runs,
and logs a timestamp for every stage. What it measures:

* per word: from its audio being played to its first interim caption, and to
  its final caption;
* per sentence: from its first words to the first committed translation, from
  its end to the complete translation (flush), and from its first words to the
  first translated audio (ear-to-voice);
* quality: caption WER against a reference transcript, and translation chrF
  against a reference translation, when the manifest has them. All
  translations are also written out for bilingual review or COMET.

Compare configurations by passing several values: --mt-model A B compares
translation models, and --k 3 4 6 sweeps the wait-k lag ceiling to choose k
per pair. Every clip runs once per combination.

    python bench.py --manifest clips.jsonl --out bench-results --k 4 6 --mt-model claude-haiku-5-5

The manifest has one JSON object per line:

    {"audio": "clips/en-1.wav", "source": "en", "target": "es",
     "reference": "the source transcript (optional)",
     "translation": "a reference translation (optional)"}

Vendors and keys come from the same environment variables as the agent
(DEEPGRAM_*, ANTHROPIC_*, CARTESIA_*); point them at tests/fake_*.py to try
the harness without keys. Stages without a key are skipped.
"""

from __future__ import annotations

import argparse
import asyncio
import itertools
import json
import os
import re
import time
import unicodedata
import wave
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

from metering import percentile

FRAME_SAMPLES = 320  # 20 ms at 16 kHz, as the live captioner reads
TAIL_S = 2.5  # silence after the clip, so the VAD hears the end
QUIET_S = 3.0  # the run is over once nothing has happened for this long
MAX_DRAIN_S = 30.0


# ----------------------------------------------------------- quality (pure)


def _words(text: str) -> list[str]:
    text = unicodedata.normalize("NFKC", text).casefold()
    return re.findall(r"\w+", text)


def wer(reference: str, hypothesis: str) -> float | None:
    """Word error rate: word-level edit distance over the reference length."""
    ref, hyp = _words(reference), _words(hypothesis)
    if not ref:
        return None
    prev = list(range(len(hyp) + 1))
    for i, r in enumerate(ref, 1):
        cur = [i] + [0] * len(hyp)
        for j, h in enumerate(hyp, 1):
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (r != h))
        prev = cur
    return prev[-1] / len(ref)


def chrf(reference: str, hypothesis: str, n: int = 6, beta: float = 2.0) -> float | None:
    """chrF (Popović 2015): character n-gram F-score, 0-100, whitespace ignored.
    A quick automatic signal for comparing runs; COMET or a bilingual reviewer
    decides quality."""
    ref, hyp = re.sub(r"\s+", "", reference), re.sub(r"\s+", "", hypothesis)
    if not ref:
        return None
    precisions, recalls = [], []
    for k in range(1, n + 1):
        r = Counter(ref[i:i + k] for i in range(len(ref) - k + 1))
        h = Counter(hyp[i:i + k] for i in range(len(hyp) - k + 1))
        if not r or not h:
            continue
        overlap = sum((r & h).values())
        precisions.append(overlap / sum(h.values()))
        recalls.append(overlap / sum(r.values()))
    if not precisions:
        return 0.0
    p, rc = sum(precisions) / len(precisions), sum(recalls) / len(recalls)
    if p == 0 and rc == 0:
        return 0.0
    return 100 * (1 + beta**2) * p * rc / (beta**2 * p + rc)


def stats(values: list[float]) -> dict:
    p50, p95 = percentile(values, 50), percentile(values, 95)
    return {"n": len(values), "p50": None if p50 is None else round(p50, 1), "p95": None if p95 is None else round(p95, 1)}


# -------------------------------------------------------------- recording


@dataclass
class SentenceLog:
    id: int
    source: str = ""
    translation: str = ""
    speech_started: float | None = None
    closed_at: float | None = None
    first_commit: float | None = None
    flush_ms: float | None = None
    voice_lag_ms: float | None = None


@dataclass
class Run:
    clip: dict
    k: int | None
    model: str | None
    t0: float = 0.0
    events: list[dict] = field(default_factory=list)
    word_interim: dict[tuple, float] = field(default_factory=dict)
    word_final: dict[tuple, float] = field(default_factory=dict)
    finals: list[str] = field(default_factory=list)
    sentences: dict[int, SentenceLog] = field(default_factory=dict)
    last_event: float = 0.0
    usage: dict = field(default_factory=lambda: Counter())

    def log(self, stage: str, **data) -> None:
        now = time.monotonic()
        self.last_event = now
        self.events.append({"t": round(now - self.t0, 3), "stage": stage, **data})

    def sentence(self, sid: int) -> SentenceLog:
        return self.sentences.setdefault(sid, SentenceLog(sid))

    def summary(self) -> dict:
        hypothesis = " ".join(self.finals)
        translation = " ".join(s.translation for s in sorted(self.sentences.values(), key=lambda s: s.id))
        ms = lambda a, b: (a - b) * 1000  # noqa: E731
        sent = list(self.sentences.values())
        return {
            "clip": self.clip["audio"],
            "pair": f"{self.clip['source']}->{self.clip['target']}",
            "k": self.k,
            "model": self.model,
            "caption_interim_ms": stats(list(self.word_interim.values())),
            "caption_final_ms": stats(list(self.word_final.values())),
            "first_commit_ms": stats([
                ms(s.first_commit, s.speech_started) for s in sent if s.first_commit and s.speech_started
            ]),
            "flush_ms": stats([s.flush_ms for s in sent if s.flush_ms is not None]),
            "ear_to_voice_ms": stats([s.voice_lag_ms for s in sent if s.voice_lag_ms is not None]),
            "sentences": len(sent),
            "wer": _round(wer(self.clip["reference"], hypothesis)) if self.clip.get("reference") else None,
            "chrf": _round(chrf(self.clip["translation"], translation)) if self.clip.get("translation") else None,
            "usage": dict(self.usage),
            "captions": hypothesis,
            "translation": translation,
        }


def _round(v: float | None, digits: int = 3) -> float | None:
    return None if v is None else round(v, digits)


# ------------------------------------------------------------------ audio


def read_clip(path: str) -> tuple[bytes, int, int]:
    with wave.open(path, "rb") as w:
        if w.getsampwidth() != 2:
            raise SystemExit(f"{path}: needs 16-bit PCM WAV")
        return w.readframes(w.getnframes()), w.getframerate(), w.getnchannels()


def to_16k_frames(pcm: bytes, rate: int, channels: int):
    """The clip as 20 ms, 16 kHz mono frames (what the captioner reads)."""
    from livekit import rtc

    if channels > 1:
        from array import array

        samples = array("h", pcm)
        pcm = array("h", (sum(samples[i:i + channels]) // channels for i in range(0, len(samples), channels))).tobytes()
    resampler = rtc.AudioResampler(rate, 16000, num_channels=1)
    out = bytearray()
    step = rate // 100 * 2  # 10 ms in
    for i in range(0, len(pcm), step):
        chunk = pcm[i:i + step]
        for frame in resampler.push(rtc.AudioFrame(chunk, rate, 1, len(chunk) // 2)):
            out += bytes(frame.data)
    for frame in resampler.flush():
        out += bytes(frame.data)
    out += b"\x00\x00" * int(16000 * TAIL_S)
    size = FRAME_SAMPLES * 2
    return [bytes(out[i:i + size]).ljust(size, b"\x00") for i in range(0, len(out), size)]


async def play(frames: list[bytes], t0: float):
    """Yield frames at real time, as a microphone would deliver them."""
    from livekit import rtc

    for i, pcm in enumerate(frames):
        delay = t0 + i * FRAME_SAMPLES / 16000 - time.monotonic()
        if delay > 0:
            await asyncio.sleep(delay)
        yield rtc.AudioFrame(pcm, 16000, 1, FRAME_SAMPLES)


# ------------------------------------------------------------------- runs


async def run_clip(clip: dict, k: int | None, model: str | None, vad, env: dict) -> Run:
    import aiohttp

    from captioner import Captioner
    from captions import AsrResult
    from translation import SourceSentences, TranslationLoop

    run = Run(clip, k, model)
    frames = to_16k_frames(*read_clip(clip["audio"]))

    async def noop(*_):
        pass

    # ---- translation and speech (optional)
    loop = speaker = translator_client = tts_session = None
    mirror = SourceSentences()
    if env["anthropic_key"] and model:
        import anthropic

        from mt import ClaudeTranslator, language_label
        from protocol import LANGUAGE_NAMES

        translator_client = anthropic.AsyncAnthropic(
            api_key=env["anthropic_key"], timeout=anthropic.Timeout(10.0, connect=3.0), max_retries=1
        )
        translator = ClaudeTranslator(
            translator_client,
            source_label=language_label(clip["source"], LANGUAGE_NAMES),
            target_label=LANGUAGE_NAMES[clip["target"]],
            model=model,
        )

        async def translate(request):
            result = await translator.translate(request)
            run.usage["mt_requests"] += 1
            for key, value in result.usage.items():
                run.usage[f"mt_{key}_tokens"] += value
            return result

        if env["cartesia_key"] and env["cartesia_voice"]:
            from speech import BYTES_PER_SECOND, Speaker
            from tts import CartesiaStream

            tts_session = aiohttp.ClientSession(trust_env=True)

            async def connect():
                stream = CartesiaStream(tts_session, env["cartesia_key"], env["cartesia_url"])
                await stream.connect()
                return stream

            async def sink(pcm: bytes) -> None:
                run.last_event = time.monotonic()
                await asyncio.sleep(len(pcm) / BYTES_PER_SECOND)  # real-time playout

            async def on_voice(message: dict) -> None:
                if isinstance(message.get("lagMs"), (int, float)):
                    run.sentence(message["sentence"]).voice_lag_ms = message["lagMs"]
                    run.log("tts.first_audio", sentence=message["sentence"], lag_ms=message["lagMs"])

            speaker = Speaker(
                connect=connect, sink=sink, publish=on_voice, set_status=noop,
                voice_id=env["cartesia_voice"], model=env["tts_model"], language=clip["target"],
            )

        async def on_translation(message: dict) -> None:
            s = run.sentence(message["sentence"])
            if message["committed"] and s.first_commit is None:
                s.first_commit = time.monotonic()
            run.log("mt", sentence=message["sentence"], committed=message["committed"],
                    tentative=message["tentative"], final=message["final"], mt_ms=message.get("mtMs"))
            if message["final"]:
                s.translation = message["committed"]
                s.flush_ms = message.get("flushMs")

        loop = TranslationLoop(
            translate=translate, publish=on_translation, set_status=noop,
            source=clip["source"], target=clip["target"], ceiling=k,
            on_commit=speaker.on_commit if speaker else None,
        )

    # ---- captions
    def on_result(result: AsrResult, arrivals: list) -> None:
        now = time.monotonic()
        table = run.word_final if result.is_final else run.word_interim
        words = []
        for word, arrived in zip(result.words, arrivals):
            if arrived is None:
                continue
            # A word is identified by where it starts and what it says, so its
            # first interim and its final are timed once each.
            norm = _words(word.text)
            table.setdefault((round(word.start, 1), norm[0] if norm else ""), (now - arrived) * 1000)
            words.append({"w": word.text, "audio_end": round(arrived - run.t0, 3)})
        run.log("asr.final" if result.is_final else "asr.interim", words=words)

    async def publish(message: dict) -> None:
        now = time.monotonic()
        if message.get("type") == "caption" and message.get("final") and message.get("text"):
            run.finals.append(message["text"])
        # The same sentence split the translation loop makes, for the source
        # text and timings of each sentence.
        mirror.apply(message, now)
        for s in mirror.pending:
            log = run.sentence(s.id) if (s.frozen or s.unstable) else None
            if log is None:
                continue
            log.speech_started = log.speech_started or s.speech_started
            log.source = " ".join(s.frozen + ([s.unstable] if s.unstable else []))
            if s.closed and log.closed_at is None:
                log.closed_at = s.closed_at
        if loop is not None:
            loop.on_caption(message)

    captioner = Captioner(
        vad=vad, api_key=env["deepgram_key"], base_url=env["deepgram_url"], language=clip["source"],
        publish=publish, set_status=noop, on_result=on_result,
    )

    run.t0 = run.last_event = time.monotonic()
    tasks = [asyncio.create_task(captioner.run_frames(play(frames, run.t0)), name="bench-captions")]
    if loop is not None:
        tasks.append(asyncio.create_task(loop.run(), name="bench-translation"))
    if speaker is not None:
        tasks.append(asyncio.create_task(speaker.run(), name="bench-speech"))
    audio_end = run.t0 + len(frames) * FRAME_SAMPLES / 16000
    try:
        while True:
            await asyncio.sleep(0.25)
            now = time.monotonic()
            if any(t.done() for t in tasks):
                for t in tasks:
                    if t.done() and t.exception():
                        raise t.exception()
            if now > audio_end and (now - run.last_event > QUIET_S or now - audio_end > MAX_DRAIN_S):
                break
    finally:
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        if translator_client is not None:
            await translator_client.close()
        if tts_session is not None:
            await tts_session.close()
    run.usage["asr_seconds"] = round(captioner.audio_seconds, 2)
    if speaker is not None:
        run.usage["tts_characters"] = speaker.characters_sent
    return run


# ---------------------------------------------------------------- reports


def aggregate(summaries: list[dict]) -> list[dict]:
    """One row per (pair, model, k), pooling the clips' per-clip percentiles
    as medians of medians (and the max of p95s)."""
    rows = []
    key = lambda s: (s["pair"], s["model"] or "-", s["k"] if s["k"] is not None else -1)  # noqa: E731
    for (pair, model, k), group in itertools.groupby(sorted(summaries, key=key), key=key):
        group = list(group)

        def pooled(metric: str) -> str:
            p50s = [g[metric]["p50"] for g in group if g[metric]["p50"] is not None]
            p95s = [g[metric]["p95"] for g in group if g[metric]["p95"] is not None]
            if not p50s:
                return "—"
            return f"{percentile(p50s, 50):.0f} / {max(p95s):.0f}"

        def mean(metric: str) -> str:
            values = [g[metric] for g in group if g[metric] is not None]
            return "—" if not values else f"{sum(values) / len(values):.3g}"

        rows.append({
            "pair": pair, "model": model, "k": "default" if k == -1 else k, "clips": len(group),
            "caption interim": pooled("caption_interim_ms"), "caption final": pooled("caption_final_ms"),
            "first commit": pooled("first_commit_ms"), "flush": pooled("flush_ms"),
            "ear-to-voice": pooled("ear_to_voice_ms"), "WER": mean("wer"), "chrF": mean("chrf"),
        })
    return rows


def markdown(rows: list[dict]) -> str:
    if not rows:
        return "No runs.\n"
    cols = list(rows[0])
    lines = ["| " + " | ".join(cols) + " |", "|" + "---|" * len(cols)]
    lines += ["| " + " | ".join(str(r[c]) for c in cols) + " |" for r in rows]
    return (
        "Latencies in ms, p50 / p95. Captions per word (audio played to caption); first commit from a "
        "sentence's first words; flush from its end; ear-to-voice from its first words.\n\n"
        + "\n".join(lines) + "\n"
    )


def load_manifest(path: str) -> list[dict]:
    base = Path(path).parent
    clips = []
    for n, line in enumerate(Path(path).read_text().splitlines(), 1):
        if not line.strip():
            continue
        clip = json.loads(line)
        if not {"audio", "source", "target"} <= clip.keys():
            raise SystemExit(f"{path}:{n}: needs audio, source and target")
        if not os.path.isabs(clip["audio"]):
            clip["audio"] = str(base / clip["audio"])
        clips.append(clip)
    return clips


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--out", default="bench-results")
    parser.add_argument("--k", type=int, nargs="*", default=[], help="lag ceilings to sweep (default: per-pair)")
    parser.add_argument("--mt-model", nargs="*", default=[os.environ.get("INTERPRETER_MT_MODEL", "claude-haiku-5-5")])
    parser.add_argument("--pause", type=float, default=2.0, help="seconds between runs")
    args = parser.parse_args()

    from asr import DEEPGRAM_URL
    from livekit.plugins import silero
    from tts import CARTESIA_URL, DEFAULT_MODEL as TTS_MODEL

    env = {
        "deepgram_key": os.environ.get("DEEPGRAM_API_KEY", ""),
        "deepgram_url": os.environ.get("DEEPGRAM_URL", DEEPGRAM_URL),
        "anthropic_key": os.environ.get("ANTHROPIC_API_KEY", ""),
        "cartesia_key": os.environ.get("CARTESIA_API_KEY", ""),
        "cartesia_voice": os.environ.get("CARTESIA_VOICE_ID", ""),
        "cartesia_url": os.environ.get("CARTESIA_URL", CARTESIA_URL),
        "tts_model": os.environ.get("INTERPRETER_TTS_MODEL", TTS_MODEL),
    }
    if not env["deepgram_key"]:
        raise SystemExit("DEEPGRAM_API_KEY is required (or point DEEPGRAM_URL at tests/fake_deepgram.py)")
    clips = load_manifest(args.manifest)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    vad = silero.VAD.load()
    (out / "sentences.tsv").write_text("run\tsentence\tsource\ttranslation\n")

    summaries = []
    combos = list(itertools.product(clips, args.k or [None], args.mt_model or [None]))
    for i, (clip, k, model) in enumerate(combos):
        if i:
            await asyncio.sleep(args.pause)
        name = f"{Path(clip['audio']).stem}-k{k if k is not None else 'default'}-{model or 'nomt'}"
        print(f"[{i + 1}/{len(combos)}] {name}", flush=True)
        run = await run_clip(clip, k, model, vad, env)
        with open(out / f"{name}.events.jsonl", "w") as f:
            for event in run.events:
                f.write(json.dumps(event, ensure_ascii=False) + "\n")
        summary = run.summary()
        summaries.append(summary)
        with open(out / "sentences.tsv", "a") as f:
            for s in sorted(run.sentences.values(), key=lambda s: s.id):
                f.write("\t".join([name, str(s.id), s.source, s.translation]) + "\n")
        print(
            f"    captions {summary['caption_interim_ms']['p50']} ms, first commit {summary['first_commit_ms']['p50']} ms, "
            f"flush {summary['flush_ms']['p50']} ms, ear-to-voice {summary['ear_to_voice_ms']['p50']} ms, "
            f"WER {summary['wer']}, chrF {summary['chrf']}",
            flush=True,
        )
    (out / "results.json").write_text(json.dumps(summaries, indent=2, ensure_ascii=False))
    report = markdown(aggregate(summaries))
    (out / "summary.md").write_text(report)
    print("\n" + report)


if __name__ == "__main__":
    asyncio.run(main())
