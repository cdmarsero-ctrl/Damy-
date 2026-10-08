"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle, AudioLines, Captions, Gauge, Headphones, PhoneOff, Power, ShieldCheck, Timer,
} from "lucide-react";

import { Button, Card, ErrorMessage, Pill, Progress, Select, Stat } from "@/components/ui";
import { CAPTION_TARGET_MS, captionLines } from "@/lib/interpreter/captions";
import { INITIAL_STATE, InterpreterClient, type SessionState } from "@/lib/interpreter/client-session";
import { LOOPBACK_TARGET_MS, type LatencySummary } from "@/lib/interpreter/measure";
import { CAPTION_LANGUAGES, type CaptionLanguage } from "@/lib/interpreter/protocol";
import { cn } from "@/lib/utils";

/**
 * The live interpreter, Phase 2 (docs/REALTIME-TRANSLATION.md §8): the
 * learner's speech captioned live, with the Phase 1 connection diagnostics
 * kept below for checking latency and echo cancellation on a new device.
 */

const PHASE_LABEL: Record<SessionState["phase"], string> = {
  idle: "Not connected",
  starting: "Connecting…",
  "waiting-agent": "Waiting for the agent…",
  live: "Live",
  ended: "Session ended",
  error: "Stopped",
};

const CAPTIONS_LABEL: Record<NonNullable<SessionState["captionsStatus"]>, { text: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  starting: { text: "Starting", tone: "warning" },
  live: { text: "Live", tone: "success" },
  unavailable: { text: "Unavailable", tone: "neutral" },
  error: { text: "Problem", tone: "danger" },
};

export function InterpreterConsole({ available }: { available: boolean }) {
  const [state, setState] = useState<SessionState>(INITIAL_STATE);
  const [language, setLanguage] = useState<CaptionLanguage>("multi");
  const client = useRef<InterpreterClient | null>(null);
  const captionsBox = useRef<HTMLDivElement | null>(null);

  // Leaving the page must release the mic and the room.
  useEffect(() => () => void client.current?.stop(), []);

  const lines = captionLines(state.captions);
  const lastLine = lines.at(-1);
  // Follow the newest caption, the way a live transcript should. Scrolls the
  // box only; scrollIntoView would also move the page on every update.
  useEffect(() => {
    const box = captionsBox.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [lines.length, lastLine?.committed, lastLine?.pending]);

  const active = state.phase === "starting" || state.phase === "waiting-agent" || state.phase === "live";
  const live = state.phase === "live";

  function start() {
    void client.current?.stop();
    client.current = new InterpreterClient(setState);
    void client.current.start(language);
  }

  const captionsLabel = state.captionsStatus ? CAPTIONS_LABEL[state.captionsStatus] : null;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <header className="mb-7">
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <span className="size-10 rounded-xl bg-brand-600 text-white grid place-items-center">
            <AudioLines className="size-5" aria-hidden />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">Live interpreter</h1>
          <Pill tone="info">Phase 2 · live captions</Pill>
        </div>
        <p className="muted text-pretty">
          Speak and your words appear as you say them. Grey text is still being worked out; it settles
          into black as the recogniser commits to it. Translation comes next, building on these captions.
        </p>
      </header>

      {!available && (
        <Card className="mb-5 border-warning/40 bg-warning/5">
          <div className="flex gap-3">
            <AlertCircle className="size-5 text-warning shrink-0" aria-hidden />
            <div>
              <h2 className="font-semibold text-sm mb-1">Not configured on this server</h2>
              <p className="text-sm muted text-pretty">
                Set <code>LIVEKIT_URL</code>, <code>LIVEKIT_API_KEY</code> and{" "}
                <code>LIVEKIT_API_SECRET</code>, and run the agent in <code>agents/interpreter</code>.
                See its README for a one-command local setup.
              </p>
            </div>
          </div>
        </Card>
      )}

      {state.error && (
        <div className="mb-4">
          <ErrorMessage>{state.error}</ErrorMessage>
        </div>
      )}

      {/* ------------------------------------------------------- session bar */}
      <Card className="mb-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="w-56">
              <label htmlFor="source-language" className="block text-xs font-medium muted mb-1.5">
                I&apos;ll be speaking
              </label>
              <Select
                id="source-language"
                value={language}
                onChange={(e) => setLanguage(e.target.value as CaptionLanguage)}
                disabled={active}
              >
                {CAPTION_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex items-center gap-2.5 pb-2.5">
              <span
                className={cn(
                  "size-2.5 rounded-full",
                  live ? "bg-success" : active ? "bg-warning animate-pulse" : "bg-[var(--border)]",
                )}
                aria-hidden
              />
              <span className="font-medium" aria-live="polite">
                {PHASE_LABEL[state.phase]}
              </span>
            </div>
          </div>
          {active ? (
            <Button variant="danger" onClick={() => void client.current?.stop()}>
              <PhoneOff className="size-4" aria-hidden />
              End session
            </Button>
          ) : (
            <Button onClick={start} disabled={!available}>
              <Power className="size-4" aria-hidden />
              {state.phase === "idle" ? "Start" : "Start again"}
            </Button>
          )}
        </div>
      </Card>

      {/* ---------------------------------------------------------- captions */}
      <Card className="mb-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="font-semibold flex items-center gap-2">
            <Captions className="size-4 text-brand-500" aria-hidden />
            Captions
          </h2>
          {captionsLabel && <Pill tone={captionsLabel.tone}>{captionsLabel.text}</Pill>}
        </div>
        {state.captionsDetail && <p className="text-sm muted mb-3 text-pretty">{state.captionsDetail}</p>}
        <div
          ref={captionsBox}
          role="log"
          aria-label="Live captions"
          className="h-56 overflow-y-auto rounded-lg bg-[var(--surface-sunken)] p-4 text-lg leading-relaxed"
        >
          {lines.length === 0 ? (
            <p className="muted text-base">
              {!live
                ? "Captions appear here once the session is live."
                : state.captionsStatus === "live"
                  ? "Listening — start speaking."
                  : state.captionsStatus === "unavailable" || state.captionsStatus === "error"
                    ? "Captions are off for this session."
                    : "Starting captions…"}
            </p>
          ) : (
            lines.map((line, i) => (
              <p key={i} className="mb-2 last:mb-0 text-pretty">
                {line.committed}
                {line.committed && line.pending ? " " : ""}
                {/* Interim text is revised many times a second; keep it out of
                    the screen-reader announcement until it settles. */}
                {line.pending && (
                  <span className="muted italic" aria-hidden>
                    {line.pending}
                  </span>
                )}
              </p>
            ))
          )}
        </div>
      </Card>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <LatencyStat
          label="Caption latency"
          icon={<Captions className="size-4" aria-hidden />}
          value={state.captionLatency}
          empty="no captions yet"
        />
        <LatencyStat label="Audio round trip" icon={<Timer className="size-4" aria-hidden />} value={state.audioRtt} />
        <LatencyStat label="Data round trip" icon={<Gauge className="size-4" aria-hidden />} value={state.dataRtt} />
        <Stat
          label="Echo cancellation"
          icon={<ShieldCheck className="size-4" aria-hidden />}
          value={state.capture ? (state.capture.ok ? (state.capture.echo === "system" ? "System" : "On") : "Off") : "—"}
          sub={state.capture ? "as reported by the browser" : "starts with the session"}
          tone={state.capture ? (state.capture.ok ? "success" : "danger") : "neutral"}
        />
      </div>
      <p className="text-xs muted -mt-2 mb-6 text-pretty">
        Caption latency is measured on the agent, from your audio reaching it to the caption leaving it
        (target {CAPTION_TARGET_MS} ms median); add about half the data round trip for the trip to your
        screen.
      </p>

      {state.capture && state.capture.issues.length > 0 && (
        <Card className="mb-5 border-warning/40 bg-warning/5">
          <div className="flex gap-3">
            <Headphones className="size-5 text-warning shrink-0" aria-hidden />
            <ul className="text-sm space-y-1.5 text-pretty">
              {state.capture.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      {/* ------------------------------------------------------- diagnostics */}
      <h2 className="font-semibold mb-3">Connection checks</h2>
      <div className="grid lg:grid-cols-2 gap-5">
        <Card>
          <h3 className="font-semibold mb-1">Time the audio path</h3>
          <p className="text-sm muted mb-4 text-pretty">
            Sends five short tone bursts on a separate silent track and times how long each takes to come
            back through the agent. Target: {LOOPBACK_TARGET_MS} ms or less (median).
          </p>
          <Button
            variant="secondary"
            onClick={() => void client.current?.measureAudioRoundTrip()}
            disabled={!live || state.busy !== null}
            loading={state.busy === "timing"}
          >
            Measure round trip
          </Button>
          {state.audioRtt && (
            <p className="text-sm mt-4">
              Median <strong className="tabular-nums">{Math.round(state.audioRtt.p50)} ms</strong> (range{" "}
              {Math.round(state.audioRtt.min)}–{Math.round(state.audioRtt.max)} ms,{" "}
              {state.audioRtt.samples} of {state.audioRtt.samples + state.audioRttLost} bursts returned).{" "}
              {state.audioRtt.meetsTarget ? (
                <span className="text-success">Within target.</span>
              ) : (
                <span className="text-warning">Above target — check region and network.</span>
              )}
            </p>
          )}
          {!state.audioRtt && state.audioRttLost > 0 && (
            <p className="text-sm text-danger mt-4">No bursts came back. The agent may not be echoing the probe track.</p>
          )}
        </Card>

        <Card>
          <h3 className="font-semibold mb-1">Test echo cancellation</h3>
          <p className="text-sm muted mb-4 text-pretty">
            Turn your speaker volume up, take headphones off and stay quiet for about four seconds. A tone
            plays through the speaker the same way translated speech will; we check how much of it reaches
            the processed microphone signal.
          </p>
          <Button
            variant="secondary"
            onClick={() => void client.current?.testEchoCancellation()}
            disabled={!live || state.busy !== null}
            loading={state.busy === "aec"}
          >
            Run echo test
          </Button>
          {state.busy === "aec" && <p className="text-sm muted mt-4" aria-live="polite">Listening — please stay quiet…</p>}
          {state.leak && (
            <p className="text-sm mt-4" aria-live="polite">
              The tone raised the microphone level by{" "}
              <strong className="tabular-nums">{state.leak.leakDb.toFixed(1)} dB</strong>.{" "}
              {state.leak.verdict === "pass" && <span className="text-success">Echo is cancelled.</span>}
              {state.leak.verdict === "marginal" && (
                <span className="text-warning">Some echo is getting through; headphones are recommended.</span>
              )}
              {state.leak.verdict === "fail" && (
                <span className="text-danger">
                  Echo is not being cancelled on this device. Use headphones for the interpreter.
                </span>
              )}
            </p>
          )}
        </Card>

        {live && (
          <Card className="lg:col-span-2">
            <Progress
              value={Math.max(0, Math.min(100, state.micLevelDb + 80))}
              max={80}
              label="Microphone level"
            />
            <label className="flex items-center gap-2 mt-4 text-sm cursor-pointer w-fit">
              <input
                type="checkbox"
                checked={state.monitor}
                onChange={(e) => client.current?.setMonitor(e.target.checked)}
              />
              Hear myself through the agent
            </label>
            <p className="text-xs muted mt-1 text-pretty">
              Your voice comes back after the round trip. With speakers on and echo cancellation working,
              you hear yourself once; if you hear a repeating echo or a howl, the microphone is picking
              up the speaker.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}

function LatencyStat({
  label,
  icon,
  value,
  empty = "not measured yet",
}: {
  label: string;
  icon: React.ReactNode;
  value: LatencySummary | null;
  empty?: string;
}) {
  return (
    <Stat
      label={label}
      icon={icon}
      value={value ? `${Math.round(value.p50)} ms` : "—"}
      sub={value ? `median of ${value.samples}` : empty}
      tone={value ? (value.meetsTarget ? "success" : "warning") : "neutral"}
    />
  );
}
