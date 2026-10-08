"""Test-tone generation for the echo-cancellation check.

Produces 16-bit mono PCM frames. Pure Python (array + math) so it is testable
without numpy or the LiveKit SDK.
"""

from __future__ import annotations

import math
import sys
from array import array
from collections.abc import Iterator

SAMPLE_RATE = 48_000
FRAME_MS = 10
SAMPLES_PER_FRAME = SAMPLE_RATE * FRAME_MS // 1000

# 1 kHz is in the speech band and reproduced well even by small laptop
# speakers; -12 dBFS is clearly audible without clipping a laptop speaker.
TONE_HZ = 1_000.0
TONE_DBFS = -12.0
# Short raised-cosine ramps avoid clicks, which would add broadband energy the
# canceller is not being tested on.
RAMP_MS = 10


def tone_frames(
    duration_ms: int,
    *,
    freq_hz: float = TONE_HZ,
    level_dbfs: float = TONE_DBFS,
    sample_rate: int = SAMPLE_RATE,
    frame_ms: int = FRAME_MS,
) -> Iterator[bytes]:
    """Yield little-endian int16 frames of a steady tone with soft edges."""
    per_frame = sample_rate * frame_ms // 1000
    total = max(per_frame, sample_rate * duration_ms // 1000)
    total -= total % per_frame  # whole frames only
    amplitude = 32767 * 10 ** (level_dbfs / 20)
    ramp = min(sample_rate * RAMP_MS // 1000, total // 2)
    step = 2 * math.pi * freq_hz / sample_rate

    for start in range(0, total, per_frame):
        frame = array("h", bytes(per_frame * 2))
        for i in range(per_frame):
            n = start + i
            edge = min(n, total - 1 - n)
            gain = 0.5 - 0.5 * math.cos(math.pi * edge / ramp) if ramp and edge < ramp else 1.0
            frame[i] = int(round(amplitude * gain * math.sin(step * n)))
        if sys.byteorder == "big":
            frame.byteswap()  # LiveKit expects little-endian PCM
        yield frame.tobytes()
