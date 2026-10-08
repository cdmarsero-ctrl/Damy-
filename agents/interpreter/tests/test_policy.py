import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from policy import (  # noqa: E402
    CommitPolicy,
    common_prefix,
    detokenize,
    lag_ceiling,
    tokenize,
)


def policy(target="es", ceiling=4) -> CommitPolicy:
    return CommitPolicy(target=target, ceiling=ceiling)


def test_nothing_commits_until_two_candidates_agree():
    p = policy()
    first = p.on_translation("Ayer el equipo", source_tokens=3, final=False, forced=False)
    assert first.committed == [] and first.delta == []
    assert first.tentative == ["Ayer", "el", "equipo"]

    second = p.on_translation("Ayer el equipo de ventas", source_tokens=5, final=False, forced=False)
    assert second.committed == ["Ayer", "el", "equipo"]
    assert second.delta == ["Ayer", "el", "equipo"]
    assert second.tentative == ["de", "ventas"]


def test_disagreement_holds_back_only_the_disputed_tail():
    p = policy()
    p.on_translation("El banco cerró", source_tokens=3, final=False, forced=False)
    out = p.on_translation("El banco del río", source_tokens=5, final=False, forced=False)
    assert out.committed == ["El", "banco"]
    # Later answers are continuations after the committed text.
    out = p.on_translation("del río estaba", source_tokens=6, final=False, forced=False)
    assert out.committed == ["El", "banco", "del", "río"]


def test_final_flushes_the_whole_candidate():
    p = policy()
    p.on_translation("Buenos", source_tokens=2, final=False, forced=False)
    out = p.on_translation("Buenos días a todos.", source_tokens=4, final=True, forced=False)
    assert out.committed == ["Buenos", "días", "a", "todos."]
    assert out.tentative == []
    assert p.text() == "Buenos días a todos."


def test_lag_ceiling_forces_a_commit():
    p = policy(ceiling=4)
    assert not p.should_force(3)
    assert p.should_force(4)
    out = p.on_translation("Hoy vamos a", source_tokens=4, final=False, forced=True)
    assert out.committed == ["Hoy", "vamos", "a"]
    # The ceiling counts from the last commit, not from the start.
    assert not p.should_force(7)
    assert p.should_force(8)


def test_a_forced_empty_answer_still_resets_the_ceiling():
    # The translator may legitimately find nothing safe; don't re-force on
    # every update after that.
    p = policy(ceiling=4)
    p.on_translation("", source_tokens=4, final=False, forced=True)
    assert not p.should_force(5)


def test_committed_text_is_append_only_under_random_wobble():
    rng = random.Random(7)
    vocab = ["el", "la", "banco", "río", "cerró", "abrió", "ayer", "hoy", "temprano", "tarde"]
    for _ in range(200):
        p = policy(ceiling=rng.choice([3, 4, 6]))
        previous: list[str] = []
        source = 0
        for step in range(15):
            source += rng.randint(0, 2)
            final = step == 14
            forced = not final and p.should_force(source)
            continuation = " ".join(rng.choice(vocab) for _ in range(rng.randint(0, 5)))
            out = p.on_translation(continuation, source_tokens=source, final=final, forced=forced)
            assert out.committed[: len(previous)] == previous, "a commit was retracted"
            assert out.committed == previous + out.delta
            previous = out.committed


def test_tokenisation_handles_scripts_without_spaces():
    assert tokenize("今日は 晴れ", "ja") == ["今", "日", "は", "晴", "れ"]
    assert detokenize(["今", "日"], "ja") == "今日"
    assert tokenize("  hola   mundo ", "es") == ["hola", "mundo"]
    assert detokenize(["hola", "mundo"], "es") == "hola mundo"


def test_commits_in_a_character_script_split_per_character():
    p = policy(target="ja")
    p.on_translation("今日は晴れ", source_tokens=3, final=False, forced=False)
    out = p.on_translation("今日は雨", source_tokens=4, final=False, forced=False)
    assert p.text() == "今日は"
    assert out.tentative == ["雨"]


def test_lag_ceiling_depends_on_word_order_and_script():
    assert lag_ceiling("en", "es") == 4
    assert lag_ceiling("multi", "fr") == 4
    assert lag_ceiling("en", "de") == 6
    assert lag_ceiling("ja", "en") == 18  # characters, verb-final
    assert lag_ceiling("hi", "en") == 6


def test_common_prefix():
    assert common_prefix(["a", "b", "c"], ["a", "b", "x"]) == ["a", "b"]
    assert common_prefix([], ["a"]) == []
