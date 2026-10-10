"""Phase 6: OpenTelemetry traces and metrics (docs/REALTIME-TRANSLATION.md §8).

Off unless OTEL_EXPORTER_OTLP_ENDPOINT (or the _TRACES_/_METRICS_ variants)
is set; then spans and metrics go over OTLP/HTTP to any collector (Grafana,
Honeycomb, Datadog, a local otel-collector, ...).

Metrics, all tagged with the language pair (`pair="en->es"`):
  interpreter.caption.latency    histogram, ms   audio in -> caption out
  interpreter.translation.flush  histogram, ms   end of sentence -> full translation
  interpreter.voice.lag          histogram, ms   source speech -> translated voice (ear-to-voice)
  interpreter.asr.seconds        counter, s      audio sent for recognition
  interpreter.mt.tokens          counter         translation tokens (all kinds)
  interpreter.tts.characters     counter         characters sent for speech
A p50/p95 ear-to-voice panel per pair is a histogram-quantile query on
interpreter.voice.lag grouped by `pair`.

Spans: `interpreter.mt` per translation request, `interpreter.tts.sentence`
from a sentence's first text to its first audio, `interpreter.session` for the
whole session. None carries transcript text, and LiveKit's own spans are
exported with PII stripped.
"""

from __future__ import annotations

import logging
import os

from opentelemetry import metrics, trace

logger = logging.getLogger("interpreter.telemetry")

tracer = trace.get_tracer("interpreter")
_meter = metrics.get_meter("interpreter")

_providers: list = []

_HISTOGRAMS = {
    "caption_latency": ("interpreter.caption.latency", "ms", "Audio reaching the agent to its caption leaving it"),
    "translation_flush": ("interpreter.translation.flush", "ms", "End of a sentence to its complete translation"),
    "voice_lag": ("interpreter.voice.lag", "ms", "Source speech to its translated voice starting (ear-to-voice)"),
}
_COUNTERS = {
    "asr_seconds": ("interpreter.asr.seconds", "s", "Audio sent for recognition"),
    "mt_tokens": ("interpreter.mt.tokens", "{token}", "Translation tokens, all kinds"),
    "tts_characters": ("interpreter.tts.characters", "{character}", "Characters sent for speech"),
}


def enabled() -> bool:
    return any(
        os.environ.get(name)
        for name in (
            "OTEL_EXPORTER_OTLP_ENDPOINT",
            "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT",
            "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT",
        )
    )


def setup() -> None:
    """Install OTLP exporters for this process (idempotent). Each job runs in
    its own process, so this runs from the worker's per-process setup."""
    if _providers or not enabled():
        return
    from livekit.agents.telemetry import set_tracer_provider
    from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    from opentelemetry.sdk.metrics import MeterProvider
    from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor

    resource = Resource.create({"service.name": os.environ.get("OTEL_SERVICE_NAME", "interpreter-agent")})
    tracer_provider = TracerProvider(resource=resource)
    tracer_provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    trace.set_tracer_provider(tracer_provider)
    # LiveKit's own spans (job, room, ...) through the same exporter, with
    # conversational content stripped: transcripts don't go to telemetry.
    set_tracer_provider(tracer_provider, allow_pii=False)

    meter_provider = MeterProvider(
        resource=resource,
        metric_readers=[PeriodicExportingMetricReader(OTLPMetricExporter(), export_interval_millis=10_000)],
    )
    metrics.set_meter_provider(meter_provider)
    _providers.extend([tracer_provider, meter_provider])
    logger.info("exporting OpenTelemetry traces and metrics over OTLP")


def flush(timeout_ms: int = 5000) -> None:
    """Jobs are short-lived processes: push what's buffered before exiting."""
    for provider in _providers:
        try:
            provider.force_flush(timeout_ms)
        except Exception:  # telemetry must never break shutdown
            logger.debug("telemetry flush failed", exc_info=True)


class Instruments:
    """The metering sink (metering.Sink) backed by OpenTelemetry instruments.
    Instruments from the API are no-ops until setup() installs a provider."""

    def __init__(self) -> None:
        self._instruments = {
            **{k: _meter.create_histogram(n, unit=u, description=d) for k, (n, u, d) in _HISTOGRAMS.items()},
            **{k: _meter.create_counter(n, unit=u, description=d) for k, (n, u, d) in _COUNTERS.items()},
        }

    def record(self, name: str, value: float, attributes: dict[str, str]) -> None:
        instrument = self._instruments.get(name)
        if instrument is None:
            return
        if name in _HISTOGRAMS:
            instrument.record(value, attributes)
        else:
            instrument.add(value, attributes)
