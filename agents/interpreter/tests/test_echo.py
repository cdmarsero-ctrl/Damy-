"""Phase 5: the transcript-level echo guard, and a simulated speakers-on run
(the agent's own voice leaking back into the learner's microphone)."""

import asyncio
import random
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from captions import AsrResult, AsrWord  # noqa: E402
from echo_guard import (  # noqa: E402
    CHECK_PHRASES,
    ECHO_DELAY_S,
    HORIZON_S,
    TRIP_WINDOW_S,
    TRIPS_TO_LEAK,
    EchoGuard,
    normalize,
    played_tokens,
    similar,
)
from protocol import TRANSLATION_LANGUAGES  # noqa: E402


class Clock:
    def __init__(self, t: float = 100.0) -> None:
        self.t = t

    def __call__(self) -> float:
        return self.t


def asr(text: str, *, final: bool = True) -> AsrResult:
    words = tuple(AsrWord(w, i * 0.3, i * 0.3 + 0.25) for i, w in enumerate(text.split()))
    return AsrResult(transcript=text, is_final=final, speech_final=False, words=words)


def guard_with(text: str, *, language: str = "es", played_at: float = 100.0, duration: float = 2.0):
    clock = Clock(played_at)
    guard = EchoGuard(language, clock)
    guard.playing(0, text)
    clock.t = played_at + duration
    guard.playing(0, text)
    return guard, clock


# ------------------------------------------------------------- matching


def test_normalize_ignores_case_accents_and_punctuation():
    assert normalize("Días,") == "dias"
    assert normalize("«Hola»") == "hola"
    assert normalize("D'être") == "detre"
    assert normalize("...") == ""
    # Indic vowel signs are part of the letter and stay.
    assert normalize("धन्यवाद।") == "धन्यवाद"


def test_similar_tolerates_misrecognition_of_longer_words_only():
    assert similar("equipo", "equipo")
    assert similar("trato", "trado")  # one letter off
    assert not similar("el", "al")  # short words must match exactly
    assert not similar("gracias", "grace")


def test_played_tokens_split_by_word_or_character():
    assert played_tokens("Ayer, el equipo.", "es") == ["ayer", "el", "equipo"]
    assert played_tokens("大家好。", "zh") == ["大", "家", "好"]


# ---------------------------------------------------------------- guard


def test_echo_inside_the_delay_window_is_removed_and_the_learners_words_kept():
    guard, clock = guard_with("Ayer el equipo de ventas cerró el trato.")
    arrivals = [101.0] * 7
    result = guard.filter(asr("so ayer el equipo cerro the deal"), arrivals)
    assert result.transcript == "so the deal"
    assert [w.text for w in result.words] == ["so", "the", "deal"]


def test_a_single_shared_word_is_not_echo():
    # "no" is English and Spanish; a lone match must not cost the learner a word.
    guard, _ = guard_with("No lo sé todavía.")
    result = guard.filter(asr("no I said the bank"), [101.0] * 5)
    assert result.transcript == "no I said the bank"


def test_a_result_that_is_one_echoed_word_is_removed():
    guard, _ = guard_with("Gracias.")
    assert guard.filter(asr("gracias"), [101.0]).transcript == ""
    # ...but not a short one.
    guard, _ = guard_with("Sí.")
    assert guard.filter(asr("si"), [101.0]).transcript == "si"


def test_words_outside_the_delay_window_are_not_echo():
    guard, _ = guard_with("Ayer el equipo.", played_at=100.0, duration=1.0)
    before = guard.filter(asr("ayer el equipo"), [99.0] * 3)  # before playout
    late = guard.filter(asr("ayer el equipo"), [101.0 + ECHO_DELAY_S + 0.5] * 3)
    assert before.transcript == late.transcript == "ayer el equipo"
    inside = guard.filter(asr("ayer el equipo"), [101.0 + ECHO_DELAY_S - 0.1] * 3)
    assert inside.transcript == ""


def test_unknown_arrival_times_count_as_now():
    guard, _ = guard_with("Ayer el equipo.")
    assert guard.filter(asr("ayer el equipo"), [None, None, None]).transcript == ""


def test_played_text_is_forgotten_after_the_horizon():
    guard, clock = guard_with("Ayer el equipo.")
    clock.t += HORIZON_S + 1
    assert guard.filter(asr("ayer el equipo"), [None] * 3).transcript == "ayer el equipo"
    assert guard.last_played(0) is None


def test_text_growing_while_playing_is_matched():
    clock = Clock()
    guard = EchoGuard("es", clock)
    guard.playing(0, "Ayer el")
    clock.t += 0.5
    guard.playing(0, "Ayer el equipo cerró")
    assert guard.spoken_words(0) == 4
    assert guard.filter(asr("equipo cerro"), [None, None]).transcript == ""


def test_character_script_echo():
    guard, _ = guard_with("大家早上好", language="zh")
    result = guard.filter(asr("大 家 早 上 好 thanks"), [101.0] * 6)
    assert result.transcript == "thanks"


def test_no_playout_means_nothing_is_removed():
    guard = EchoGuard("es", Clock())
    result = asr("ayer el equipo")
    assert guard.filter(result, [None] * 3) is result


def test_stats_count_final_words_once_and_trips_mark_a_leak():
    guard, clock = guard_with("Ayer el equipo de ventas cerró el trato.")
    guard.filter(asr("ayer el", final=False), [None] * 2)  # interims don't count
    for _ in range(TRIPS_TO_LEAK - 1):
        guard.filter(asr("hello ayer el equipo"), [None] * 4)
        guard.playing(0, "Ayer el equipo de ventas cerró el trato.")
    assert guard.stats.heard == 4 * (TRIPS_TO_LEAK - 1)
    assert guard.stats.passed == TRIPS_TO_LEAK - 1
    assert not guard.leaking()
    guard.filter(asr("ayer el equipo"), [None] * 3)
    assert guard.leaking()
    clock.t += TRIP_WINDOW_S + 1
    assert not guard.leaking()  # it stopped happening


def test_there_is_a_check_phrase_for_every_target_language():
    assert set(CHECK_PHRASES) == set(TRANSLATION_LANGUAGES)
    for language, phrase in CHECK_PHRASES.items():
        assert len(played_tokens(phrase, language)) >= 5, language


# ----------------------------------------- simulated speakers-on harness

aiohttp = pytest.importorskip("aiohttp")
from aiohttp import web  # noqa: E402

import fake_cartesia  # noqa: E402
from speech import Speaker  # noqa: E402
from tts import CartesiaStream  # noqa: E402

LEARNER = "so yesterday I told the team we should close the deal before Friday".split()
TRANSLATION = [
    "Ayer le dije al equipo",
    "que deberíamos cerrar el trato",
    "antes del viernes.",
]


def mishear(word: str, rng: random.Random) -> str:
    """What an English recogniser makes of a Spanish word: accents lost,
    sometimes a letter wrong, sometimes capitalised."""
    plain = normalize(word)
    if len(plain) > 4 and rng.random() < 0.3:
        i = rng.randrange(1, len(plain) - 1)
        plain = plain[:i] + "e" + plain[i + 1:]
    return plain.capitalize() if rng.random() < 0.2 else plain


def test_speakers_on_simulation_removes_every_echoed_word_and_no_learner_words():
    """The agent speaks a translation (fake TTS) while the learner keeps
    talking; the microphone delivers both, the echo 300-900 ms after it was
    played and misheard by the recogniser, and recognition splits it across
    results. Over 50 randomised runs nothing of the echo may survive, and
    every learner word must."""

    async def scenario():
        app = fake_cartesia.make_app(0)
        runner = web.AppRunner(app)
        await runner.setup()
        site = web.TCPSite(runner, "127.0.0.1", 0)
        await site.start()
        url = f"ws://127.0.0.1:{site._server.sockets[0].getsockname()[1]}/tts/websocket"
        loop = asyncio.get_running_loop()
        guard = EchoGuard("es", loop.time)
        played: list[tuple[float, str]] = []  # (time, text) per frame

        def on_playing(sentence: int, text: str) -> None:
            guard.playing(sentence, text)
            played.append((loop.time(), text))

        try:
            async with aiohttp.ClientSession() as session:
                async def connect():
                    stream = CartesiaStream(session, fake_cartesia.API_KEY, url)
                    await stream.connect()
                    return stream

                async def sink(pcm):
                    await asyncio.sleep(0.01)  # real-time playout, 10 ms frames

                async def noop(*_):
                    pass

                speaker = Speaker(
                    connect=connect, sink=sink, publish=noop, set_status=noop,
                    voice_id="fake-voice", model="sonic-3.6", language="es", on_playing=on_playing,
                )
                task = asyncio.create_task(speaker.run())
                for i, piece in enumerate(TRANSLATION):
                    speaker.on_commit(0, piece, i == len(TRANSLATION) - 1, None)
                await asyncio.sleep(4.0)
                task.cancel()
                await asyncio.gather(task, return_exceptions=True)
        finally:
            await runner.cleanup()
        return guard, played

    _, played = asyncio.run(scenario())
    assert played, "the speaker played nothing"
    for seed in range(50):
        kept_echo, kept_learner = _replay(played, seed)
        assert kept_echo == [], seed
        assert kept_learner == LEARNER, seed


def _replay(played: list[tuple[float, str]], seed: int) -> tuple[list[str], list[str]]:
    """One simulated microphone over a recorded playout: returns the echo
    words and the learner words that got through the guard."""
    rng = random.Random(seed)
    clock = Clock()
    guard = EchoGuard("es", clock)
    for at, text in played:
        clock.t = at
        guard.playing(0, text)
    start, end = played[0][0], played[-1][0]
    spoken = " ".join(TRANSLATION).split()

    # Echo words spread over the playout, delayed by the room's round trip
    # (fixed per session, a little jitter per word); learner words
    # interleaved with them.
    delay = rng.uniform(0.3, 0.9)
    timeline = []
    for i, word in enumerate(spoken):
        at = start + (end - start) * i / len(spoken) + delay + rng.uniform(0, 0.02)
        timeline.append((at, mishear(word, rng), "echo"))
    for i, word in enumerate(LEARNER):
        timeline.append((start + (end - start + 1.0) * i / len(LEARNER) + rng.uniform(0, 0.1), word, "learner"))
    timeline.sort()

    # Recognition returns final results of 2-6 words.
    kept_echo, kept_learner = [], []
    i = 0
    while i < len(timeline):
        chunk = timeline[i:i + rng.randint(2, 6)]
        i += len(chunk)
        result = AsrResult(
            " ".join(w for _, w, _ in chunk), True, False, tuple(AsrWord(w, 0, 0) for _, w, _ in chunk)
        )
        clock.t = max(t for t, _, _ in chunk) + 0.2
        survivors = [w.text for w in guard.filter(result, [t for t, _, _ in chunk]).words]
        for _, w, kind in chunk:
            if w in survivors:
                survivors.remove(w)
                (kept_echo if kind == "echo" else kept_learner).append(w)
    return kept_echo, kept_learner


# ------------------------------------------------- captioner integration


def test_captioner_removes_echo_before_captions_and_reports_a_leak():
    pytest.importorskip("livekit")
    import json

    from captioner import Captioner

    clock = Clock(200.0)
    guard = EchoGuard("es", clock)
    guard.playing(0, "Ayer el equipo de ventas cerró el trato.")
    published, statuses = [], []

    async def publish(message):
        published.append(message)

    async def set_echo_status(status, detail):
        statuses.append(status)

    async def noop(*_):
        pass

    captioner = Captioner(
        vad=None, api_key="k", base_url="ws://x", language="en",
        publish=publish, set_status=noop, echo_guard=guard, set_echo_status=set_echo_status,
    )
    captioner._clock.record(16_000 * 5, arrived_at=200.5)  # 5 s of audio, all just arrived

    def deepgram(words, final=True):
        return json.dumps({
            "type": "Results", "is_final": final, "speech_final": False,
            "channel": {"alternatives": [{
                "transcript": " ".join(words),
                "words": [{"word": w, "start": i * 0.3, "end": i * 0.3 + 0.2} for i, w in enumerate(words)],
            }]},
        })

    async def scenario():
        await captioner._on_message(deepgram(["so", "ayer", "el", "equipo"], final=False))
        for _ in range(TRIPS_TO_LEAK):
            await captioner._on_message(deepgram(["so", "ayer", "el", "equipo"]))

    asyncio.run(scenario())
    assert [m["text"] for m in published] == ["so"] * (1 + TRIPS_TO_LEAK)
    assert statuses == ["leaking"]
