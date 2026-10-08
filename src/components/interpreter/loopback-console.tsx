"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, AudioLines, Gauge, Headphones, PhoneOff, Power, ShieldCheck, Timer } from "lucide-react";

import { Button, Card, ErrorMessage, Pill, Progress, Stat } from "@/components/ui";
import { LOOPBACK_TARGET_MS, type LatencySummary } from "@/lib/interpreter/measure";
import { INITIAL_STATE, LoopbackSession, type LoopbackState } from "@/lib/interpreter/loopback-session";
import { cn } from "@/lib/utils";

/**
 * Phase 1 of the live interpreter (docs/REALTIME-TRANSLATION.md §8): a WebRTC
 * loopback through the agent, used to verify transport latency and echo
 * cancellation before any speech recognition or translation is added.
 */

const PHASE_LABEL: Record<LoopbackState["phase"], string> = {
  idle: "Not connected",
  starting: "Connecting…",
  "waiting-agent": "Waiting for the agent…",
  live: "Live",
  ended: "Session ended",
  error: "Stopped",
};

export function LoopbackConsole({ available }: { available: boolean }) {
  const [state, setState] = useState<LoopbackState>(INITIAL_STATE);
  const session = useRef<LoopbackSession | null>(null);

  // Leaving the page must release the mic and the room.
  useEffect(() => () => void session.current?.stop(), []);

  const active = state.phase === "starting" || state.phase === "waiting-agent" || state.phase === "live";
  const live = state.phase === "live";

  function start() {
    void session.current?.stop();
    session.current = new LoopbackSession(setState);
    void session.current.start();
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <header className="mb-7">
        <div className="flex items-center gap-3 mb-2">
          <span className="size-10 rounded-xl bg-brand-600 text-white grid place-items-center">
            <AudioLines className="size-5" aria-hidden />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">Live interpreter</h1>
          <Pill tone="info">Phase 1 · loopback</Pill>
        </div>
        <p className="muted text-pretty">
          This checks the connection before translation is switched on: your microphone goes to the
          interpreter agent and straight back, so we can measure the round trip and confirm that audio
          played through your speaker is not picked up by your microphone.
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

      <Card className="mb-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
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
          {active ? (
            <Button variant="danger" onClick={() => void session.current?.stop()}>
              <PhoneOff className="size-4" aria-hidden />
              End session
            </Button>
          ) : (
            <Button onClick={start} disabled={!available}>
              <Power className="size-4" aria-hidden />
              {state.phase === "idle" ? "Start loopback" : "Start again"}
            </Button>
          )}
        </div>

        {live && (
          <div className="mt-5">
            <Progress
              value={Math.max(0, Math.min(100, state.micLevelDb + 80))}
              max={80}
              label="Microphone level"
            />
            <label className="flex items-center gap-2 mt-4 text-sm cursor-pointer w-fit">
              <input
                type="checkbox"
                checked={state.monitor}
                onChange={(e) => session.current?.setMonitor(e.target.checked)}
              />
              Hear myself through the agent
            </label>
            <p className="text-xs muted mt-1 text-pretty">
              Your voice comes back after the round trip. With speakers on and echo cancellation working,
              you hear yourself once; if you hear a repeating echo or a howl, the microphone is picking
              up the speaker.
            </p>
          </div>
        )}
      </Card>

      <div className="grid sm:grid-cols-3 gap-4 mb-5">
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

      <div className="grid lg:grid-cols-2 gap-5">
        <Card>
          <h2 className="font-semibold mb-1">Time the audio path</h2>
          <p className="text-sm muted mb-4 text-pretty">
            Sends five short tone bursts on a separate silent track and times how long each takes to come
            back through the agent. Target: {LOOPBACK_TARGET_MS} ms or less (median).
          </p>
          <Button
            variant="secondary"
            onClick={() => void session.current?.measureAudioRoundTrip()}
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
          <h2 className="font-semibold mb-1">Test echo cancellation</h2>
          <p className="text-sm muted mb-4 text-pretty">
            Turn your speaker volume up, take headphones off and stay quiet for about four seconds. A tone
            plays through the speaker the same way translated speech will; we check how much of it reaches
            the processed microphone signal.
          </p>
          <Button
            variant="secondary"
            onClick={() => void session.current?.testEchoCancellation()}
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
      </div>
    </div>
  );
}

function LatencyStat({ label, icon, value }: { label: string; icon: React.ReactNode; value: LatencySummary | null }) {
  return (
    <Stat
      label={label}
      icon={icon}
      value={value ? `${Math.round(value.p50)} ms` : "—"}
      sub={value ? `median of ${value.samples}` : "not measured yet"}
      tone={value ? (value.meetsTarget ? "success" : "warning") : "neutral"}
    />
  );
}
