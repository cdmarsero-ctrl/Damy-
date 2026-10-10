"""Cartesia streaming TTS over WebSocket (design doc §5.2).

A thin client, like asr.py: the speaker needs per-sentence contexts, its own
pacing and the raw PCM, and owning the URL lets tests point it at
tests/fake_cartesia.py. Depends only on aiohttp.

Protocol (checked against Cartesia's docs and its Python SDK, API version
2026-08-14): one WebSocket carries many *contexts*. Each sentence is one
context; its text is sent in pieces with `continue: true`, and an empty
transcript with `continue: false` ends it (what the SDK's `no_more_inputs()`
sends). The model keeps prosody across the pieces of a context, so a
sentence sounds like one sentence even though it arrives a few words at a
time. Audio comes back as base64 `chunk` messages, then `done`.
"""

from __future__ import annotations

import base64
import json
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Union

import aiohttp

CARTESIA_URL = "wss://api.cartesia.ai/tts/websocket"
CARTESIA_VERSION = "2026-08-14"
DEFAULT_MODEL = "sonic-3.6"
SAMPLE_RATE = 24_000

# Speed limits the API accepts for generation_config.speed.
MIN_SPEED, MAX_SPEED = 0.6, 1.5


def generation_request(
    *,
    context_id: str,
    transcript: str,
    more: bool,
    voice_id: str,
    model: str,
    language: str,
    speed: float,
    buffer_ms: int,
) -> dict:
    """One piece of a context. `more=False` ends the context."""
    return {
        "context_id": context_id,
        "model_id": model,
        "transcript": transcript,
        "voice": {"id": voice_id},
        "language": language,
        "continue": more,
        "output_format": {"container": "raw", "encoding": "pcm_s16le", "sample_rate": SAMPLE_RATE},
        # Our commit policy already batches text into phrases, so the server
        # only needs a short wait to smooth prosody across tiny pieces.
        "max_buffer_delay_ms": buffer_ms,
        "generation_config": {"speed": round(min(MAX_SPEED, max(MIN_SPEED, speed)), 2)},
    }


@dataclass(frozen=True)
class TtsAudio:
    context_id: str
    pcm: bytes


@dataclass(frozen=True)
class TtsDone:
    context_id: str


@dataclass(frozen=True)
class TtsError:
    context_id: str | None
    message: str
    #: 401/403: no point retrying with this key.
    auth: bool


TtsEvent = Union[TtsAudio, TtsDone, TtsError]


def parse_tts(raw: str | bytes) -> TtsEvent | None:
    """One server message; None for types we don't use or malformed input."""
    try:
        msg = json.loads(raw)
    except (ValueError, UnicodeDecodeError):
        return None
    if not isinstance(msg, dict):
        return None
    kind = msg.get("type")
    context = msg.get("context_id")
    context = context if isinstance(context, str) else None
    if kind == "chunk" and context and isinstance(msg.get("data"), str):
        try:
            return TtsAudio(context, base64.b64decode(msg["data"], validate=True))
        except ValueError:
            return None
    if kind == "done" and context:
        return TtsDone(context)
    if kind == "error":
        status = msg.get("status_code")
        detail = msg.get("message") or msg.get("title") or "unknown error"
        return TtsError(context, str(detail), auth=status in (401, 403))
    return None


class TtsConnectError(Exception):
    def __init__(self, message: str, *, auth: bool = False) -> None:
        super().__init__(message)
        self.auth = auth


class CartesiaStream:
    """One WebSocket. Not reusable: reconnect by making a new one."""

    def __init__(self, session: aiohttp.ClientSession, api_key: str, url: str = CARTESIA_URL) -> None:
        self._session = session
        self._api_key = api_key
        self._url = url
        self._ws: aiohttp.ClientWebSocketResponse | None = None

    async def connect(self) -> None:
        try:
            self._ws = await self._session.ws_connect(
                self._url,
                headers={"Authorization": f"Bearer {self._api_key}", "Cartesia-Version": CARTESIA_VERSION},
                heartbeat=20,
            )
        except aiohttp.WSServerHandshakeError as err:
            raise TtsConnectError(
                f"Cartesia refused the connection ({err.status})", auth=err.status in (401, 403)
            ) from err
        except (aiohttp.ClientError, OSError) as err:
            raise TtsConnectError(f"Could not reach Cartesia: {err}") from err

    @property
    def closed(self) -> bool:
        return self._ws is None or self._ws.closed

    async def send(self, request: dict) -> None:
        await self._require().send_str(json.dumps(request))

    async def cancel(self, context_id: str) -> None:
        await self._require().send_str(json.dumps({"context_id": context_id, "cancel": True}))

    async def messages(self) -> AsyncIterator[str]:
        ws = self._require()
        async for msg in ws:
            if msg.type == aiohttp.WSMsgType.TEXT:
                yield msg.data
            elif msg.type == aiohttp.WSMsgType.ERROR:
                raise TtsConnectError(f"Cartesia stream error: {ws.exception()}")

    async def close(self) -> None:
        if self._ws is not None and not self._ws.closed:
            await self._ws.close()

    def _require(self) -> aiohttp.ClientWebSocketResponse:
        if self._ws is None:
            raise TtsConnectError("not connected")
        return self._ws
