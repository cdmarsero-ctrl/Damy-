import asyncio
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import translation  # noqa: E402
from mt import TranslationError, TranslationRequest, TranslationResult  # noqa: E402
from translation import SourceSentences, TranslationLoop  # noqa: E402


def cap(text, final=False, utterance_end=False, segment=0):
    message = {"type": "caption", "segment": segment, "text": text, "final": final}
    if utterance_end:
        message["utteranceEnd"] = True
    return message


# ------------------------------------------------------------ sentences


def test_captions_split_into_sentences_at_utterance_ends():
    s = SourceSentences()
    s.apply(cap("good"), 0)
    s.apply(cap("Good morning,", final=True), 1)
    s.apply(cap("everyone."), 2)
    s.apply(cap("everyone.", final=True, utterance_end=True), 3)
    s.apply(cap("Today"), 4)
    first, second = s.pending
    assert first.source_text() == ("Good morning, everyone.", "")
    assert first.closed and first.closed_at == 3
    assert second.source_text() == ("", "Today") and not second.closed


def test_utterance_end_message_closes_and_empty_utterances_are_ignored():
    s = SourceSentences()
    assert s.apply({"type": "utterance-end"}, 1) is False  # nothing said yet
    s.apply(cap("yes", final=True), 2)
    s.apply({"type": "utterance-end"}, 3)
    assert [x.closed for x in s.pending] == [True, False]


def test_a_withdrawn_interim_leaves_nothing_behind():
    s = SourceSentences()
    s.apply(cap("uhm"), 0)
    s.apply(cap("", final=True), 1)
    assert s.current.source_text() == ("", "")


# ----------------------------------------------------------------- loop


def fake_translate(requests, *, delay=0.0, hedge=1):
    """Word-for-word "translation" (uppercase) that, like a cautious
    interpreter, holds back the last `hedge` words until the sentence is final."""

    async def translate(req: TranslationRequest) -> TranslationResult:
        requests.append(req)
        await asyncio.sleep(delay)
        words = f"{req.frozen} {req.unstable}".split()
        target = [w.upper() for w in words]
        if not req.final and not req.force:
            target = target[: max(0, len(target) - hedge)]
        spoken = req.spoken.split()
        return TranslationResult(" ".join(target[len(spoken):]), ttft_ms=1.0, total_ms=delay * 1000)

    return translate


async def drive(loop, feed, *, settle=0.3):
    published = []
    runner = asyncio.create_task(loop.run())
    try:
        for item in feed:
            if isinstance(item, (int, float)):
                await asyncio.sleep(item)
            else:
                loop.on_caption(item)
        await asyncio.sleep(settle)
    finally:
        runner.cancel()
        await asyncio.gather(runner, return_exceptions=True)
    return published


def make_loop(translate, *, source="en", target="es"):
    published, statuses = [], []

    async def publish(message):
        published.append(message)

    async def set_status(status, detail):
        statuses.append((status, detail))

    loop = TranslationLoop(translate=translate, publish=publish, set_status=set_status, source=source, target=target)
    return loop, published, statuses


@pytest.fixture(autouse=True)
def fast(monkeypatch):
    monkeypatch.setattr(translation, "DEBOUNCE_S", 0.0)
    monkeypatch.setattr(translation, "RETRY_DELAY_S", 0.01)


def test_translates_incrementally_and_never_retracts():
    requests = []
    loop, published, statuses = make_loop(fake_translate(requests))
    feed = []
    words = "the sales team finally closed the deal".split()
    for i in range(1, len(words) + 1):
        feed += [cap(" ".join(words[:i])), 0.02]
    feed += [cap(" ".join(words) + ".", final=True, utterance_end=True), 0.05]
    asyncio.run(drive(loop, feed))

    committed = [m["committed"] for m in published]
    for before, after in zip(committed, committed[1:]):
        assert after.startswith(before), f"retracted: {before!r} -> {after!r}"
    final = published[-1]
    assert final["final"] is True
    assert final["committed"] == "THE SALES TEAM FINALLY CLOSED THE DEAL."
    assert final["tentative"] == ""
    assert "flushMs" in final
    # Something was committed before the sentence ended: that's the point.
    assert any(m["committed"] and not m["final"] for m in published)
    assert statuses[0] == ("live", "")


def test_later_sentences_carry_earlier_ones_as_context():
    requests = []
    loop, published, _ = make_loop(fake_translate(requests))
    feed = [cap("Hello there.", final=True, utterance_end=True), 0.05, cap("How are", final=True), 0.05]
    asyncio.run(drive(loop, feed))
    later = [r for r in requests if r.frozen.startswith("How")]
    assert later and later[-1].context == (("Hello there.", "HELLO THERE."),)
    assert later[-1].spoken == published[-1]["committed"]


def test_sentence_end_cancels_the_stale_request_and_flushes_immediately():
    requests = []
    slow = fake_translate(requests, delay=1.0)

    async def translate(req):
        if req.final:
            return await fake_translate(requests)(req)
        return await slow(req)

    loop, published, _ = make_loop(translate)
    feed = [cap("we will meet"), 0.05, cap("We will meet tomorrow.", final=True, utterance_end=True), 0.1]
    asyncio.run(drive(loop, feed, settle=0.1))
    # The 1 s request for the unfinished sentence never completed...
    assert [m["final"] for m in published] == [True]
    # ...and the flush landed well inside it.
    assert published[0]["committed"] == "WE WILL MEET TOMORROW."
    assert published[0]["flushMs"] < 500


def test_lag_ceiling_forces_a_commit_on_a_long_unfinished_sentence():
    requests = []
    # hedge=99: never volunteers anything unless forced or final.
    loop, published, _ = make_loop(fake_translate(requests, hedge=99))
    feed = [cap("one two three four five six", final=True), 0.1]
    asyncio.run(drive(loop, feed))
    assert any(r.force for r in requests)
    assert published[-1]["committed"] == "ONE TWO THREE FOUR FIVE SIX"


def test_transient_errors_are_retried_and_reported():
    calls = {"n": 0}
    ok = fake_translate([])

    async def flaky(req):
        calls["n"] += 1
        if calls["n"] == 1:
            raise TranslationError("rate limited")
        return await ok(req)

    loop, published, statuses = make_loop(flaky)
    asyncio.run(drive(loop, [cap("Hi.", final=True, utterance_end=True)]))
    assert ("error", "rate limited") in statuses
    assert statuses[-1] == ("live", "")
    assert published[-1]["committed"] == "HI."


def test_permanent_errors_stop_the_loop():
    async def broken(req):
        raise TranslationError("bad key", permanent=True)

    loop, _, statuses = make_loop(broken)

    async def scenario():
        runner = asyncio.create_task(loop.run())
        loop.on_caption(cap("Hi.", final=True, utterance_end=True))
        with pytest.raises(TranslationError):
            await asyncio.wait_for(runner, 2)

    asyncio.run(scenario())
    assert statuses[-1] == ("error", "bad key")


def test_stopping_the_loop_cancels_the_request_in_flight():
    cancelled = []

    async def slow(req: TranslationRequest) -> TranslationResult:
        try:
            await asyncio.sleep(10)
        except asyncio.CancelledError:
            cancelled.append(req)
            raise
        raise AssertionError("not reached")

    async def scenario():
        loop, _, _ = make_loop(slow)
        await drive(loop, [cap("Yesterday the team")], settle=0.1)
        await asyncio.sleep(0.01)
        return len(cancelled)  # before asyncio.run's own cleanup cancels stragglers

    assert asyncio.run(scenario()) == 1
