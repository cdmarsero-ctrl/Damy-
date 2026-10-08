"""Deepgram streaming ASR over WebSocket.

A thin client rather than the LiveKit Deepgram plugin: the caption layer needs
Deepgram's own word timings and segment semantics to measure latency and drive
the translation policy later, and owning the URL lets tests and self-hosted
Deepgram point it elsewhere. Depends only on aiohttp.

Protocol: https://developers.deepgram.com/docs/lower-level-websockets
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from urllib.parse import urlencode

import aiohttp

DEEPGRAM_URL = "wss://api.deepgram.com/v1/listen"
SAMPLE_RATE = 16_000


def listen_url(base: str, language: str, *, sample_rate: int = SAMPLE_RATE) -> str:
    """The streaming endpoint with the parameters from the design doc (§3.2)."""
    params = {
        "model": "nova-3",
        "language": language,
        "encoding": "linear16",
        "sample_rate": sample_rate,
        "channels": 1,
        # Partial hypotheses every ~100-300 ms: what makes captions "live".
        "interim_results": "true",
        "smart_format": "true",
        "punctuate": "true",
        # Silence (ms) before a segment is finalised with speech_final.
        "endpointing": 300,
        # Word-timing-based end of utterance, robust to background noise
        # that keeps endpointing from firing.
        "utterance_end_ms": 1000,
        "vad_events": "true",
    }
    return f"{base}?{urlencode(params)}"


class DeepgramError(Exception):
    def __init__(self, message: str, *, auth: bool = False) -> None:
        super().__init__(message)
        # Auth failures are permanent for this key; retrying won't help.
        self.auth = auth


class DeepgramStream:
    """One streaming session. Not reusable: reconnect by making a new one."""

    def __init__(self, session: aiohttp.ClientSession, api_key: str, url: str) -> None:
        self._session = session
        self._api_key = api_key
        self._url = url
        self._ws: aiohttp.ClientWebSocketResponse | None = None

    async def connect(self) -> None:
        try:
            self._ws = await self._session.ws_connect(
                self._url,
                headers={"Authorization": f"Token {self._api_key}"},
                # Deepgram closes idle streams after ~10 s without audio or a
                # KeepAlive; the caller sends KeepAlive while the gate is shut.
                heartbeat=None,
            )
        except aiohttp.WSServerHandshakeError as err:
            raise DeepgramError(
                f"Deepgram refused the connection ({err.status})",
                auth=err.status in (401, 403),
            ) from err
        except (aiohttp.ClientError, OSError) as err:
            raise DeepgramError(f"Could not reach Deepgram: {err}") from err

    @property
    def closed(self) -> bool:
        return self._ws is None or self._ws.closed

    async def send_audio(self, pcm: bytes) -> None:
        await self._require().send_bytes(pcm)

    async def finalize(self) -> None:
        """Flush: finalise everything sent so far without closing."""
        await self._require().send_str(json.dumps({"type": "Finalize"}))

    async def keepalive(self) -> None:
        await self._require().send_str(json.dumps({"type": "KeepAlive"}))

    async def finish(self) -> None:
        """Graceful end: Deepgram sends its remaining results, then closes,
        which ends `messages()`."""
        await self._require().send_str(json.dumps({"type": "CloseStream"}))

    async def close(self) -> None:
        """Hard close, for teardown. Results still in flight are dropped."""
        if self._ws is None or self._ws.closed:
            return
        try:
            await self._ws.send_str(json.dumps({"type": "CloseStream"}))
        except (aiohttp.ClientError, ConnectionError):
            pass
        await self._ws.close()

    async def messages(self) -> AsyncIterator[str]:
        """Text messages until the stream closes. Raises on an abnormal close."""
        ws = self._require()
        async for msg in ws:
            if msg.type == aiohttp.WSMsgType.TEXT:
                yield msg.data
            elif msg.type == aiohttp.WSMsgType.ERROR:
                raise DeepgramError(f"Deepgram stream error: {ws.exception()}")
        code = ws.close_code
        if code not in (None, 1000):
            # Deepgram explains protocol errors in the close reason, e.g.
            # 1008 DATA-0000 for audio it cannot decode.
            raise DeepgramError(f"Deepgram closed the stream ({code})")

    def _require(self) -> aiohttp.ClientWebSocketResponse:
        if self._ws is None:
            raise DeepgramError("not connected")
        return self._ws
