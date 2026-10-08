"""A stand-in for Cartesia's streaming TTS WebSocket, for tests and local runs.

It does not synthesise speech. It checks requests the way the API would
(bearer key, API version header, required fields, one voice per context) and
answers each piece of a context with a soft tone, WORD_MS per word, as base64
PCM `chunk` messages, then `done` once the context ends. That exercises the
TTS client, sentence ordering, pacing and the voice track end to end without
an API key.

Run standalone for a browser test (--delay-ms simulates time to first audio):
    python tests/fake_cartesia.py --port 8767 --delay-ms 150
    CARTESIA_API_KEY=fake CARTESIA_VOICE_ID=fake-voice \\
      CARTESIA_URL=ws://127.0.0.1:8767/tts/websocket python main.py dev
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import json
import math
from array import array

from aiohttp import WSMsgType, web

API_KEY = "fake"
VERSION = "2026-08-14"
WORD_MS = 250
CHUNK_MS = 40
DELAY = web.AppKey("delay_s", float)
REQUESTS = web.AppKey("requests", list)
REQUIRED = ("model_id", "transcript", "voice", "output_format", "context_id")


def tone(ms: int, rate: int, hz: float = 220.0) -> bytes:
    n = rate * ms // 1000
    amp = 32767 * 0.1
    samples = array("h", (int(amp * math.sin(2 * math.pi * hz * i / rate)) for i in range(n)))
    return samples.tobytes()


async def tts(request: web.Request) -> web.StreamResponse:
    if request.headers.get("Authorization") != f"Bearer {API_KEY}":
        raise web.HTTPUnauthorized()
    if request.headers.get("Cartesia-Version") != VERSION:
        raise web.HTTPBadRequest()
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    delay = request.app[DELAY]
    voices: dict[str, str] = {}
    cancelled: set[str] = set()
    lock = asyncio.Lock()  # one context's audio at a time, in request order

    async def synthesise(req: dict) -> None:
        context = req["context_id"]
        rate = req["output_format"]["sample_rate"]
        words = len(req["transcript"].split())
        async with lock:
            await asyncio.sleep(delay)
            pcm = tone(WORD_MS * words, rate) if words else b""
            step = rate * 2 * CHUNK_MS // 1000
            for i in range(0, len(pcm), step):
                if context in cancelled:
                    return
                await ws.send_str(json.dumps({
                    "type": "chunk", "data": base64.b64encode(pcm[i:i + step]).decode(),
                    "done": False, "status_code": 206, "step_time": 5.0, "context_id": context,
                }))
            if not req["continue"]:
                await ws.send_str(json.dumps({"type": "done", "done": True, "status_code": 200, "context_id": context}))

    tasks = []
    async for msg in ws:
        if msg.type != WSMsgType.TEXT:
            continue
        req = json.loads(msg.data)
        request.app[REQUESTS].append(req)
        if req.get("cancel") is True:
            cancelled.add(req["context_id"])
            continue
        missing = [k for k in REQUIRED if k not in req]
        voice = json.dumps(req.get("voice"), sort_keys=True)
        if missing or voices.setdefault(req.get("context_id", ""), voice) != voice:
            await ws.send_str(json.dumps({
                "type": "error", "status_code": 400, "title": "Invalid request",
                "message": f"missing {missing}" if missing else "voice changed within a context",
                "context_id": req.get("context_id"),
            }))
            continue
        tasks.append(asyncio.create_task(synthesise(req)))
    for task in tasks:
        task.cancel()
    return ws


def make_app(delay_ms: float = 0) -> web.Application:
    app = web.Application()
    app[DELAY] = delay_ms / 1000
    app[REQUESTS] = []
    app.router.add_get("/tts/websocket", tts)
    return app


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8767)
    parser.add_argument("--delay-ms", type=float, default=0, help="simulated time to first audio")
    args = parser.parse_args()
    web.run_app(make_app(args.delay_ms), host="127.0.0.1", port=args.port)
