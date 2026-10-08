"""A stand-in for the Anthropic Messages API, for tests and local runs.

It does not translate. It checks the request the way the API would (API key,
model, streaming) and streams a deterministic "translation" back as Messages
API server-sent events, so the real SDK client and our adapter are exercised
end to end. The "translation" maps the fake Deepgram's placeholder words
(`word12` -> `palabra12`) and upper-cases anything else; like a cautious
interpreter it holds back the last source word until the sentence is final or
forced.

Run standalone for a browser test (--delay-ms simulates time to first token):
    python tests/fake_anthropic.py --port 8766 --delay-ms 250
    ANTHROPIC_API_KEY=fake ANTHROPIC_BASE_URL=http://127.0.0.1:8766 python main.py dev
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re

from aiohttp import web

API_KEY = "fake"
DELAY = web.AppKey("delay_s", float)
REQUESTS = web.AppKey("requests", list)

_SOURCE = re.compile(r'<source final="(true|false)" force="(true|false)">(.*?)</source>', re.S)
_SPOKEN = re.compile(r"<spoken>(.*?)</spoken>", re.S)
_UNSTABLE = re.compile(r"<unstable>(.*?)</unstable>", re.S)


def fake_translation(user: str) -> str:
    source = _SOURCE.search(user)
    spoken = _SPOKEN.search(user)
    if not source or not spoken:
        return ""
    final, force, text = source.group(1) == "true", source.group(2) == "true", source.group(3)
    words = _UNSTABLE.sub(lambda m: m.group(1), text).split()
    target = [re.sub(r"^word(\d+)$", r"palabra\1", w) if w.startswith("word") else w.upper() for w in words]
    if not final and not force:
        target = target[:-1]
    already = len(spoken.group(1).split())
    return " ".join(target[already:])


def _sse(event: str, data: dict) -> bytes:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n".encode()


async def messages(request: web.Request) -> web.StreamResponse:
    if request.headers.get("x-api-key") != API_KEY:
        return web.json_response(
            {"type": "error", "error": {"type": "authentication_error", "message": "invalid x-api-key"}},
            status=401,
        )
    body = await request.json()
    request.app[REQUESTS].append(body)
    if not body.get("stream") or not body.get("model") or not body.get("max_tokens"):
        return web.json_response(
            {"type": "error", "error": {"type": "invalid_request_error", "message": "bad request"}}, status=400
        )
    user = body["messages"][-1]["content"]
    if isinstance(user, list):
        user = "".join(block.get("text", "") for block in user)
    text = fake_translation(user)

    response = web.StreamResponse(headers={"Content-Type": "text/event-stream", "Cache-Control": "no-cache"})
    await response.prepare(request)
    await asyncio.sleep(request.app[DELAY])
    usage = {"input_tokens": 40, "cache_read_input_tokens": 600, "cache_creation_input_tokens": 0, "output_tokens": 1}
    await response.write(_sse("message_start", {
        "type": "message_start",
        "message": {
            "id": "msg_fake", "type": "message", "role": "assistant", "model": body["model"],
            "content": [], "stop_reason": None, "stop_sequence": None, "usage": usage,
        },
    }))
    await response.write(_sse("content_block_start", {
        "type": "content_block_start", "index": 0, "content_block": {"type": "text", "text": ""},
    }))
    for i, word in enumerate(text.split()):
        piece = word if i == 0 else f" {word}"
        await response.write(_sse("content_block_delta", {
            "type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": piece},
        }))
    await response.write(_sse("content_block_stop", {"type": "content_block_stop", "index": 0}))
    await response.write(_sse("message_delta", {
        "type": "message_delta",
        "delta": {"stop_reason": "end_turn", "stop_sequence": None},
        "usage": {"output_tokens": max(1, len(text.split()))},
    }))
    await response.write(_sse("message_stop", {"type": "message_stop"}))
    await response.write_eof()
    return response


def make_app(delay_ms: float = 0) -> web.Application:
    app = web.Application()
    app[DELAY] = delay_ms / 1000
    app[REQUESTS] = []
    app.router.add_post("/v1/messages", messages)
    return app


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8766)
    parser.add_argument("--delay-ms", type=float, default=0, help="simulated time to first token")
    args = parser.parse_args()
    web.run_app(make_app(args.delay_ms), host="127.0.0.1", port=args.port)
