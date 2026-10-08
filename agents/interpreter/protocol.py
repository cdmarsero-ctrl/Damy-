"""Wire contract between the browser and the interpreter agent.

Mirrors src/lib/interpreter/protocol.ts; the two files must change together.
Pure (no LiveKit imports) so it is unit-testable without the SDK installed.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from typing import Union

CONTROL_TOPIC = "interpreter.control"
# Agent -> client caption stream; see captions.py for the message shapes.
CAPTIONS_TOPIC = "interpreter.captions"

# Source languages offered for captions. "multi" is Nova-3's code-switching
# mode, which covers the same ten languages.
CAPTION_LANGUAGES = ("multi", "en", "es", "fr", "de", "it", "pt", "nl", "ja", "ru", "hi")
DEFAULT_LANGUAGE = "multi"

# Agent -> client translation stream; see translation.py.
TRANSLATION_TOPIC = "interpreter.translation"

# Language names are what the translation prompt uses, so they are spelled
# out here rather than derived from the codes.
LANGUAGE_NAMES = {
    "en": "English", "es": "Spanish", "fr": "French", "de": "German", "it": "Italian",
    "pt": "Portuguese", "nl": "Dutch", "ja": "Japanese", "ko": "Korean", "zh": "Chinese",
    "ru": "Russian", "hi": "Hindi", "ar": "Arabic", "tr": "Turkish", "pl": "Polish",
    "sv": "Swedish", "uk": "Ukrainian", "vi": "Vietnamese", "id": "Indonesian",
}
# Target languages offered in the web app (same order as its picker).
TRANSLATION_LANGUAGES = tuple(LANGUAGE_NAMES)
DEFAULT_TARGET = "es"

# Agent participant attributes. Attributes rather than messages because they
# are state: a client that joins, reconnects or re-renders reads the current
# value instead of depending on having caught an earlier message.
ATTR_CAPTIONS = "captions"  # "starting" | "live" | "unavailable" | "error"
ATTR_CAPTIONS_DETAIL = "captions.detail"  # human-readable reason, may be ""
ATTR_TRANSLATION = "translation"  # same values as ATTR_CAPTIONS
ATTR_TRANSLATION_DETAIL = "translation.detail"

TRACK_MIC = "mic"
TRACK_PROBE = "probe"
TRACK_ECHO_MIC = "echo-mic"
TRACK_ECHO_PROBE = "echo-probe"
TRACK_TONE = "tone"

# Client tracks the loopback returns, and the name each comes back under.
ECHOED_TRACKS = {TRACK_MIC: TRACK_ECHO_MIC, TRACK_PROBE: TRACK_ECHO_PROBE}

# Upper bound on a requested test tone, so a malformed or hostile client
# message can't keep the agent generating audio indefinitely.
MAX_TONE_MS = 10_000


@dataclass(frozen=True)
class Ping:
    id: float
    sent_at: float


@dataclass(frozen=True)
class ToneRequest:
    duration_ms: int


ControlMessage = Union[Ping, ToneRequest]


def _finite(value: object) -> bool:
    # bool is an int subclass; JSON true must not pass as a number.
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def decode_control(payload: bytes) -> ControlMessage | None:
    """Parse a client message; None for anything malformed or unknown.

    The data channel is a trust boundary: one bad packet must never raise into
    the room's event loop.
    """
    try:
        message = json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        return None
    if not isinstance(message, dict):
        return None

    kind = message.get("type")
    if kind == "ping":
        id_, sent_at = message.get("id"), message.get("sentAt")
        if _finite(id_) and _finite(sent_at):
            return Ping(id=id_, sent_at=sent_at)
        return None
    if kind == "tone":
        duration = message.get("durationMs")
        if _finite(duration) and duration > 0:
            return ToneRequest(duration_ms=int(min(duration, MAX_TONE_MS)))
        return None
    return None


def _metadata(metadata: str | None) -> dict:
    try:
        value = json.loads(metadata or "{}")
    except ValueError:
        return {}
    return value if isinstance(value, dict) else {}


def source_language(metadata: str | None) -> str:
    """The learner's chosen caption language from their participant metadata.

    The web app validates this when minting the token; it is checked again
    here because the agent must not pass arbitrary strings into the ASR URL.
    """
    value = _metadata(metadata).get("sourceLanguage")
    return value if value in CAPTION_LANGUAGES else DEFAULT_LANGUAGE


def target_language(metadata: str | None) -> str | None:
    """The language to translate into, or None if the learner didn't ask for
    one (or asked for an unsupported one, which the web app should prevent)."""
    value = _metadata(metadata).get("targetLanguage")
    return value if value in TRANSLATION_LANGUAGES else None


def encode_message(message: dict) -> bytes:
    return json.dumps(message, separators=(",", ":")).encode()


def encode_pong(ping: Ping) -> bytes:
    # Echo the client's own timestamp back: RTT is computed entirely on the
    # client clock, so the two machines' clocks never need to agree.
    return json.dumps({"type": "pong", "id": ping.id, "sentAt": ping.sent_at}).encode()


def encode_tone_started(request: ToneRequest) -> bytes:
    return json.dumps({"type": "tone-started", "durationMs": request.duration_ms}).encode()
