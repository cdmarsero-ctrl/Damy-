"""A stand-in for Deepgram's streaming endpoint, for tests and local runs.

It does not recognise speech. It checks the request the way Deepgram would
(auth header, required query parameters), then emits Deepgram-shaped results
paced by the audio it receives: one placeholder word per WORD_MS of audio as
interim results, a final every FINAL_MS, and on Finalize a final with
speech_final plus an UtteranceEnd. That exercises the client, caption and
latency plumbing end to end without an API key.

Run standalone for a browser test (--delay-ms simulates recognition time):
    python tests/fake_deepgram.py --port 8765 --delay-ms 200
    DEEPGRAM_API_KEY=fake DEEPGRAM_URL=ws://127.0.0.1:8765/v1/listen python main.py dev
"""

from __future__ import annotations

import argparse
import asyncio
import json
from urllib.parse import parse_qs

from aiohttp import WSMsgType, web

API_KEY = "fake"
WORD_MS = 250
FINAL_MS = 1500
DELAY = web.AppKey("delay_s", float)
CONNECTIONS = web.AppKey("connections", list)
CONTROLS = web.AppKey("controls", list)
REQUIRED = ("model", "language", "encoding", "sample_rate", "interim_results")


def _result(words: list[tuple[str, float, float]], *, is_final: bool, speech_final: bool = False) -> str:
    start = words[0][1] if words else 0.0
    end = words[-1][2] if words else start
    return json.dumps(
        {
            "type": "Results",
            "is_final": is_final,
            "speech_final": speech_final,
            "start": start,
            "duration": end - start,
            "channel": {
                "alternatives": [
                    {
                        "transcript": " ".join(w for w, _, _ in words),
                        "words": [
                            {"word": w, "punctuated_word": w, "start": s, "end": e} for w, s, e in words
                        ],
                    }
                ]
            },
        }
    )


async def listen(request: web.Request) -> web.StreamResponse:
    if request.headers.get("Authorization") != f"Token {API_KEY}":
        raise web.HTTPUnauthorized()
    query = parse_qs(request.query_string)
    if any(k not in query for k in REQUIRED) or query["encoding"] != ["linear16"]:
        raise web.HTTPBadRequest()
    rate = int(query["sample_rate"][0])

    ws = web.WebSocketResponse()
    await ws.prepare(request)
    request.app[CONNECTIONS].append(dict(query))
    delay = request.app[DELAY]
    loop = asyncio.get_running_loop()
    outbox: asyncio.Queue[tuple[float, str]] = asyncio.Queue()

    async def deliver() -> None:
        # Each result leaves `delay` after it was produced, in order, without
        # holding up the receive loop (which would add queueing on top).
        while True:
            due, payload = await outbox.get()
            await asyncio.sleep(max(0.0, due - loop.time()))
            await ws.send_str(payload)

    deliverer = asyncio.create_task(deliver())

    async def send(payload: str) -> None:
        await outbox.put((loop.time() + delay, payload))

    received = 0  # bytes of int16 mono audio
    segment: list[tuple[str, float, float]] = []
    seg_start = 0.0
    counter = 0

    def seconds() -> float:
        return received / 2 / rate

    async for msg in ws:
        if msg.type == WSMsgType.BINARY:
            received += len(msg.data)
            now = seconds()
            while now - (segment[-1][2] if segment else seg_start) >= WORD_MS / 1000:
                counter += 1
                s = segment[-1][2] if segment else seg_start
                segment.append((f"word{counter}", s, s + WORD_MS / 1000))
                await send(_result(segment, is_final=False))
            if segment and segment[-1][2] - seg_start >= FINAL_MS / 1000:
                await send(_result(segment, is_final=True))
                seg_start, segment = segment[-1][2], []
        elif msg.type == WSMsgType.TEXT:
            kind = json.loads(msg.data).get("type")
            request.app[CONTROLS].append(kind)
            if kind == "Finalize":
                await send(_result(segment, is_final=True, speech_final=True))
                await send(json.dumps({"type": "UtteranceEnd", "last_word_end": seconds()}))
                seg_start, segment = seconds(), []
            elif kind == "CloseStream":
                await send(json.dumps({"type": "Metadata", "duration": seconds()}))
                while not outbox.empty():
                    await asyncio.sleep(0.01)
                await asyncio.sleep(delay + 0.01)
                await ws.close()
    deliverer.cancel()
    return ws


def make_app(delay_ms: float = 0) -> web.Application:
    app = web.Application()
    app[DELAY] = delay_ms / 1000
    app[CONNECTIONS] = []
    app[CONTROLS] = []
    app.router.add_get("/v1/listen", listen)
    return app


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--delay-ms", type=float, default=0, help="simulated recognition latency")
    args = parser.parse_args()
    web.run_app(make_app(args.delay_ms), host="127.0.0.1", port=args.port)
