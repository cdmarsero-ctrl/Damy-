"""VAD gate in front of the ASR stream.

Streaming ASR is billed per second of audio sent, and most of a session is
silence, so audio only flows while the VAD hears speech. The VAD decides a
little after speech begins, so the gate keeps a short pre-roll and flushes it
at onset; without it the first syllable of every utterance would be clipped.
"""

from __future__ import annotations

from collections import deque
from typing import Generic, TypeVar

T = TypeVar("T")


class SpeechGate(Generic[T]):
    def __init__(self, preroll_frames: int) -> None:
        self.open = False
        self._preroll: deque[T] = deque(maxlen=max(1, preroll_frames))

    def push(self, frame: T) -> list[T]:
        """Returns the frames to send now (none while closed)."""
        if self.open:
            return [frame]
        self._preroll.append(frame)
        return []

    def start(self) -> list[T]:
        """Speech began: open, and return the pre-roll to send first."""
        if self.open:
            return []
        self.open = True
        flushed = list(self._preroll)
        self._preroll.clear()
        return flushed

    def stop(self) -> bool:
        """Speech ended. True if the gate was open, i.e. the ASR should be
        asked to finalize what it has rather than wait for more audio."""
        was_open = self.open
        self.open = False
        return was_open
