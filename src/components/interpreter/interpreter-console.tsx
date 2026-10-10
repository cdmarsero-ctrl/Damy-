"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle, AudioLines, Captions, Ear, Gauge, Headphones, Languages, PhoneOff, Power, ShieldCheck, Timer,
  Undo2, Volume2,
} from "lucide-react";

import { Button, Card, ErrorMessage, Pill, Progress, Select, Stat } from "@/components/ui";
import { api } from "@/lib/client";
import { CAPTION_TARGET_MS, captionLines } from "@/lib/interpreter/captions";
import { INITIAL_STATE, InterpreterClient, type SessionState } from "@/lib/interpreter/client-session";
import { EAR_TO_VOICE_TARGET_MS, LOOPBACK_TARGET_MS, type LatencySummary } from "@/lib/interpreter/measure";
import {
  CAPTION_LANGUAGES,
  type CaptionLanguage,
  TRANSLATION_LANGUAGES,
  type TranslationLanguage,
} from "@/lib/interpreter/protocol";
import { FLUSH_TARGET_MS } from "@/lib/interpreter/translation";
import { cn } from "@/lib/utils";

/**
 * The live interpreter, Phase 5 (docs/REALTIME-TRANSLATION.md §8): the
 * learner's speech captioned, translated and spoken in the target language
 * as they talk, safe with speakers on (the agent removes its own voice from
 * the microphone; protected mode mutes the voice until headphones when echo
 * can't be trusted), with connection and echo checks below for a new device.
 */

const PHASE_LABEL: Record<SessionState["phase"], string> = {
  idle: "Not connected",
  starting: "Connecting…",
  "waiting-agent": "Waiting for the agent…",
  live: "Live",
  ended: "Session ended",
  error: "Stopped",
};

const ECHO_LABEL: Record<NonNullable<SessionState["echoStatus"]>, { text: string; tone: "success" | "danger" | "neutral" }> = {
  off: { text: "Off", tone: "neutral" },
  clean: { text: "Clean", tone: "success" },
  leaking: { text: "Leaking", tone: "danger" },
};

const ECHO_CHECK_TONE = { clean: "text-success", guarded: "text-warning", leaking: "text-danger", error: "text-danger" } as const;

const STATUS_LABEL: Record<NonNullable<SessionState["captionsStatus"]>, { text: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  starting: { text: "Starting", tone: "warning" },
  live: { text: "Live", tone: "success" },
  unavailable: { text: "Unavailable", tone: "neutral" },
  error: { text: "Problem", tone: "danger" },
};

export function InterpreterConsole({ available }: { available: boolean }) {
  const [state, setState] = useState<SessionState>(INITIAL_STATE);
  const [language, setLanguage] = useState<CaptionLanguage>("multi");
  const [target, setTarget] = useState<TranslationLanguage>("es");
  const client = useRef<InterpreterClient | null>(null);
  const captionsBox = useRef<HTMLDivElement | null>(null);
  const translationBox = useRef<HTMLDivElement | null>(null);

  // Leaving the page must release the mic and the room.
  useEffect(() => () => void client.current?.stop(), []);

  // Today's minutes: on load, and again whenever a session ends.
  const [usage, setUsage] = useState<Usage | null>(null);
  const settled = state.phase === "idle" || state.phase === "ended" || state.phase === "error";
  useEffect(() => {
    if (!available || !settled) return;
    let cancelled = false;
    api
      .get<Usage>("/api/interpreter/usage")
      .then((u) => !cancelled && setUsage(u))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [available, settled]);

  // A once-a-second tick for the session countdown.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (state.endsAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [state.endsAt]);
  const secondsLeft = state.endsAt === null ? null : Math.max(0, Math.round((state.endsAt - now) / 1000));
  const outOfMinutes = usage !== null && usage.remainingSeconds < 30;

  const lines = captionLines(state.captions);
  const lastLine = lines.at(-1);
  // Follow the newest caption, the way a live transcript should. Scrolls the
  // box only; scrollIntoView would also move the page on every update.
  useEffect(() => {
    const box = captionsBox.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [lines.length, lastLine?.committed, lastLine?.pending]);

  const sentences = state.translation.sentences;
  const lastSentence = sentences.at(-1);
  useEffect(() => {
    const box = translationBox.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [sentences.length, lastSentence?.committed, lastSentence?.tentative]);

  const active = state.phase === "starting" || state.phase === "waiting-agent" || state.phase === "live";
  const live = state.phase === "live";
  const sameLanguage = language === target;
  const targetLabel = TRANSLATION_LANGUAGES.find((l) => l.code === target)?.label ?? target;

  function start() {
    void client.current?.stop();
    client.current = new InterpreterClient(setState);
    void client.current.start(language, target);
  }

  // Agent statuses describe a running session; once it's over they'd be stale.
  const captionsLabel = active && state.captionsStatus ? STATUS_LABEL[state.captionsStatus] : null;
  // With echo cancellation off, the protected-mode banner already says so
  // (the echo issue is always listed first).
  const captureIssues =
    state.capture?.issues.slice(state.protectedMode === "aec-off" && state.capture.echo === "off" ? 1 : 0) ?? [];
  const translationLabel = active && state.translationStatus ? STATUS_LABEL[state.translationStatus] : null;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <header className="mb-7">
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <span className="size-10 rounded-xl bg-brand-600 text-white grid place-items-center">
            <AudioLines className="size-5" aria-hidden />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">Live interpreter</h1>
          <Pill tone="info">Phase 6 · production readiness</Pill>
        </div>
        <p className="muted text-pretty">
          Speak, and your words are captioned, translated and spoken in the other language while you&apos;re
          still talking. Grey text is still being worked out. Translated text turns black only once
          it&apos;s safe, and only black text is spoken, so nothing you hear is ever taken back.
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
      {state.notice && !state.error && (
        <p className="mb-4 text-sm text-pretty" role="status">
          {state.notice}
        </p>
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
            <div className="w-48">
              <label htmlFor="target-language" className="block text-xs font-medium muted mb-1.5">
                Translate into
              </label>
              <Select
                id="target-language"
                value={target}
                onChange={(e) => setTarget(e.target.value as TranslationLanguage)}
                disabled={active}
                aria-describedby={sameLanguage ? "same-language" : undefined}
              >
                {TRANSLATION_LANGUAGES.map((l) => (
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
              {live && secondsLeft !== null && (
                <span className="text-sm muted tabular-nums" title="The session ends here (today's minutes)">
                  {formatClock(secondsLeft)} left
                </span>
              )}
            </div>
          </div>
          {active ? (
            <Button variant="danger" onClick={() => void client.current?.stop()}>
              <PhoneOff className="size-4" aria-hidden />
              End session
            </Button>
          ) : (
            <Button onClick={start} disabled={!available || sameLanguage || outOfMinutes}>
              <Power className="size-4" aria-hidden />
              {state.phase === "idle" ? "Start" : "Start again"}
            </Button>
          )}
        </div>
        {sameLanguage && (
          <p id="same-language" className="text-sm text-warning mt-3">
            Pick a translation language different from the one you&apos;ll speak.
          </p>
        )}
        {usage && !active && (
          <p className={cn("text-sm mt-3", outOfMinutes ? "text-warning" : "muted")}>
            {outOfMinutes
              ? "You've used today's interpreter minutes. They reset at midnight UTC."
              : `${Math.floor(usage.remainingSeconds / 60)} of ${Math.round(usage.dailySeconds / 60)} interpreter minutes left today; the next session can last ${formatMinutes(Math.min(usage.maxSessionSeconds, usage.remainingSeconds))}.`}
          </p>
        )}
      </Card>

      {state.protectedMode && (
        <Card className="mb-5 border-warning/40 bg-warning/5" role="status">
          <div className="flex flex-wrap items-start gap-3">
            <Headphones className="size-5 text-warning shrink-0" aria-hidden />
            <div className="flex-1 min-w-60">
              <h2 className="font-semibold text-sm mb-1">Translated voice muted: use headphones</h2>
              <p className="text-sm muted text-pretty">
                {state.protectedMode === "aec-off"
                  ? "Your browser isn't cancelling echo on this microphone, so the translated voice could be picked up and translated again."
                  : "Your microphone keeps picking up the translated voice. The agent is removing it from your captions, but to be safe the voice is muted."}{" "}
                Captions and the written translation carry on.
              </p>
            </div>
            <Button variant="secondary" onClick={() => client.current?.confirmHeadphones()}>
              I&apos;m wearing headphones
            </Button>
          </div>
        </Card>
      )}

      {/* ------------------------------------------ captions and translation */}
      <div className="grid lg:grid-cols-2 gap-5 mb-5">
        <Card>
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
            className="h-64 overflow-y-auto rounded-lg bg-[var(--surface-sunken)] p-4 text-lg leading-relaxed"
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

        <Card>
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="font-semibold flex items-center gap-2">
              <Languages className="size-4 text-brand-500" aria-hidden />
              {targetLabel}
            </h2>
            {translationLabel && <Pill tone={translationLabel.tone}>{translationLabel.text}</Pill>}
          </div>
          {state.translationDetail && <p className="text-sm muted mb-3 text-pretty">{state.translationDetail}</p>}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 mb-3 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={state.speak}
                onChange={(e) => client.current?.setSpeak(e.target.checked)}
              />
              Speak the translation
            </label>
            <span className="flex items-center gap-1.5 muted" aria-live="polite">
              <Volume2
                className={cn("size-4", state.speaking && state.speak ? "text-brand-500 animate-pulse" : "")}
                aria-hidden
              />
              {state.voiceStatus === "unavailable" || state.voiceStatus === "error"
                ? state.voiceDetail || "Speech is off"
                : state.speaking && state.speak
                  ? "Speaking…"
                  : state.voiceStatus === "live"
                    ? "Voice ready"
                    : live
                      ? "Starting voice…"
                      : ""}
            </span>
          </div>
          <div
            ref={translationBox}
            role="log"
            aria-label={`Live translation into ${targetLabel}`}
            className="h-64 overflow-y-auto rounded-lg bg-[var(--surface-sunken)] p-4 text-lg leading-relaxed"
          >
            {sentences.length === 0 ? (
              <p className="muted text-base">
                {!live
                  ? "The translation appears here once the session is live."
                  : state.translationStatus === "unavailable" || state.translationStatus === "error"
                    ? "Translation is off for this session."
                    : "Waiting for you to speak."}
              </p>
            ) : (
              sentences.map((sentence) => (
                <p key={sentence.id} className="mb-2 last:mb-0 text-pretty">
                  {sentence.committed}
                  {sentence.committed && sentence.tentative ? " " : ""}
                  {sentence.tentative && (
                    <span className="muted italic" aria-hidden>
                      {sentence.tentative}
                    </span>
                  )}
                </p>
              ))
            )}
          </div>
        </Card>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <LatencyStat
          label="Caption latency"
          icon={<Captions className="size-4" aria-hidden />}
          value={state.captionLatency}
          empty="no captions yet"
        />
        <LatencyStat
          label="Translation lag"
          icon={<Languages className="size-4" aria-hidden />}
          value={state.flushLatency}
          empty="no sentences yet"
        />
        <LatencyStat
          label="Voice lag"
          icon={<Volume2 className="size-4" aria-hidden />}
          value={state.voiceLag}
          empty="nothing spoken yet"
        />
        <Stat
          label="Retractions"
          icon={<Undo2 className="size-4" aria-hidden />}
          value={state.translation.sentences.length ? state.translation.retractions : "—"}
          sub="committed text taken back (should be 0)"
          tone={state.translation.sentences.length ? (state.translation.retractions === 0 ? "success" : "danger") : "neutral"}
        />
        <LatencyStat label="Audio round trip" icon={<Timer className="size-4" aria-hidden />} value={state.audioRtt} />
        <LatencyStat label="Data round trip" icon={<Gauge className="size-4" aria-hidden />} value={state.dataRtt} />
        <Stat
          label="Echo guard"
          icon={<Ear className="size-4" aria-hidden />}
          value={state.echoStatus ? ECHO_LABEL[state.echoStatus].text : "—"}
          sub={state.echoStatus === "off" ? "nothing is spoken" : "the agent's voice in your mic"}
          tone={state.echoStatus ? ECHO_LABEL[state.echoStatus].tone : "neutral"}
        />
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
        (target {CAPTION_TARGET_MS} ms median). Translation lag runs from the end of a sentence, as
        captioned, to its complete translation (target {FLUSH_TARGET_MS} ms median); most of each sentence
        is committed before you finish it. Voice lag runs from a sentence&apos;s first words reaching the agent
        to its translation starting to play (target {EAR_TO_VOICE_TARGET_MS} ms median). Add about half the
        data round trip for the trip to your screen and speaker.
      </p>
      {state.speak && live && !state.headphones && (
        <p className="text-sm text-pretty mb-5 flex gap-2">
          <Headphones className="size-4 text-brand-500 shrink-0 mt-0.5" aria-hidden />
          Speakers are fine: if your microphone picks up the translated voice, the agent removes it before it
          can be translated again. Headphones still sound best and keep the conversation private.
        </p>
      )}

      {captureIssues.length > 0 && (
        <Card className="mb-5 border-warning/40 bg-warning/5">
          <div className="flex gap-3">
            <Headphones className="size-5 text-warning shrink-0" aria-hidden />
            <ul className="text-sm space-y-1.5 text-pretty">
              {captureIssues.map((issue) => (
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

        <Card className="lg:col-span-2">
          <h3 className="font-semibold mb-1">Check echo with speech</h3>
          <p className="text-sm muted mb-4 text-pretty">
            With the setup you&apos;ll really use (speakers or headphones), stay quiet for about six seconds. The
            agent says a short phrase in {targetLabel} through the translated voice and counts how much of it
            your microphone hears, and whether any of it got past the agent&apos;s echo guard into the captions.
          </p>
          <Button
            variant="secondary"
            onClick={() => void client.current?.runEchoCheck()}
            disabled={!live || state.busy !== null || state.voiceStatus !== "live"}
            loading={state.busy === "echo-check"}
          >
            Run speech check
          </Button>
          {live && state.voiceStatus !== "live" && state.busy === null && (
            <p className="text-sm muted mt-4">Needs the translated voice, which isn&apos;t on.</p>
          )}
          {state.busy === "echo-check" && (
            <p className="text-sm muted mt-4" aria-live="polite">Listening — please stay quiet…</p>
          )}
          {state.echoCheck && (
            <p className={cn("text-sm mt-4 text-pretty", ECHO_CHECK_TONE[state.echoCheck.verdict])} aria-live="polite">
              {state.echoCheck.message}
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

interface Usage {
  dailySeconds: number;
  usedSeconds: number;
  remainingSeconds: number;
  maxSessionSeconds: number;
}

function formatMinutes(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)} seconds`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function formatClock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
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
