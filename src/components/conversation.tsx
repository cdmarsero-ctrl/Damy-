"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle, ArrowUp, Lightbulb, Loader2, Mic, Sparkles, Volume2,
} from "lucide-react";

import { Button, Card, ErrorMessage, LevelPill, Pill } from "@/components/ui";
import { api, ApiClientError } from "@/lib/client";
import { useSpeechRecognition, useSpeechSynthesis } from "@/hooks/use-speech";
import { cn } from "@/lib/utils";
import type { Cefr, ConversationMode } from "@prisma/client";

/**
 * The conversation surface, shared by /tutor and /debate.
 *
 * Corrections are rendered *beside* the learner's own message rather than
 * interrupting the AI's reply. Interleaving them destroys the illusion of a
 * conversation, which is the one thing free dialogue practice needs to work.
 */

export interface Correction {
  span: [number, number];
  type: string;
  original: string;
  suggestion: string;
  explanation: string;
  severity: "minor" | "moderate" | "major";
}

export interface Upgrade {
  label: string;
  text: string;
  rationale: string;
}

interface Message {
  id: string;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
  corrections?: Correction[] | null;
  suggestions?: Upgrade[] | null;
  metrics?: { wordCount: number; estimatedLevel: Cefr; errorCount: number } | null;
}

export interface ConversationData {
  id: string;
  mode: ConversationMode;
  topic: string;
  cefr: Cefr;
  aiStance: string | null;
  messages: Message[];
}

const SEVERITY_TONE = {
  minor: "info",
  moderate: "warning",
  major: "danger",
} as const;

export function Conversation({
  conversation,
  onReset,
  liveAI,
}: {
  conversation: ConversationData;
  onReset: () => void;
  liveAI: boolean;
}) {
  const [messages, setMessages] = useState<Message[]>(conversation.messages);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<"model" | "rules" | null>(null);

  const speech = useSpeechRecognition();
  const tts = useSpeechSynthesis();
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, busy]);

  // Dictated speech lands in the draft box so it can be edited before sending —
  // ASR output is rarely punctuated the way the learner intended.
  useEffect(() => {
    if (speech.finalTranscript) {
      setDraft((d) => `${d} ${speech.finalTranscript}`.trim());
      speech.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech.finalTranscript]);

  async function send() {
    const text = draft.trim();
    if (!text || busy) return;

    setBusy(true);
    setError(null);
    setDraft("");

    // Show the learner's message straight away; corrections arrive with the reply.
    const provisional: Message = { id: `local-${Date.now()}`, role: "USER", content: text };
    setMessages((current) => [...current, provisional]);

    try {
      const data = await api.post<{
        userMessage: Message;
        assistantMessage: Message;
        corrections: Correction[];
        upgrades: Upgrade[];
        source: "model" | "rules";
        metrics: Message["metrics"];
      }>("/api/ai/conversations/message", {
        conversationId: conversation.id,
        message: text,
      });

      setSource(data.source);
      setMessages((current) => [
        ...current.filter((m) => m.id !== provisional.id),
        {
          ...data.userMessage,
          corrections: data.corrections,
          suggestions: data.upgrades,
          metrics: data.metrics,
        },
        data.assistantMessage,
      ]);
    } catch (err) {
      setMessages((current) => current.filter((m) => m.id !== provisional.id));
      setDraft(text);
      setError(err instanceof ApiClientError ? err.message : "Could not send your message.");
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  const isDebate = conversation.mode === "DEBATE";

  return (
    <div className="flex flex-col h-[calc(100dvh-4rem)]">
      {/* ------------------------------------------------------------ header */}
      <div className="shrink-0 px-4 sm:px-6 py-3 border-b border-[var(--border)] flex flex-wrap items-center gap-2.5">
        <LevelPill level={conversation.cefr} />
        <span className="font-medium text-sm truncate">{conversation.topic}</span>
        {isDebate && conversation.aiStance && (
          <Pill tone="danger">AI argues {conversation.aiStance}</Pill>
        )}
        {source === "rules" && (
          <Pill tone="warning">
            <AlertCircle className="size-3" aria-hidden />
            rules engine
          </Pill>
        )}
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={onReset}>
          New conversation
        </Button>
      </div>

      {!liveAI && (
        <div className="shrink-0 px-4 sm:px-6 py-2.5 bg-warning/10 border-b border-warning/30 text-xs text-pretty">
          No model provider is configured, so replies come from the built-in rules engine.
          Corrections are still real — they come from a grammar and register rule set built for
          B2-C2 learners — but the conversation itself will be more scripted. Set{" "}
          <code className="font-mono">OPENAI_API_KEY</code> to enable free-form dialogue.
        </div>
      )}

      {/* ---------------------------------------------------------- messages */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
        <div className="max-w-2xl mx-auto space-y-5">
          {messages.map((message) =>
            message.role === "USER" ? (
              <UserTurn key={message.id} message={message} />
            ) : (
              <AssistantTurn
                key={message.id}
                message={message}
                onSpeak={tts.supported ? () => tts.speak(message.content) : undefined}
                speaking={tts.speaking}
              />
            ),
          )}

          {busy && (
            <div className="flex items-center gap-2.5 muted text-sm">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              <span>Thinking…</span>
            </div>
          )}

          <div ref={endRef} />
        </div>
      </div>

      {/* ------------------------------------------------------------- input */}
      <div className="shrink-0 border-t border-[var(--border)] px-4 sm:px-6 py-4">
        <div className="max-w-2xl mx-auto">
          {error && <div className="mb-3"><ErrorMessage>{error}</ErrorMessage></div>}

          <div className="flex gap-2 items-end">
            {speech.supported && (
              <button
                onClick={() => (speech.listening ? speech.stop() : speech.start())}
                className={cn(
                  "size-11 rounded-xl grid place-items-center shrink-0 transition-all",
                  speech.listening
                    ? "bg-danger text-white animate-pulse"
                    : "surface-sunken muted hover:text-[var(--text)]",
                )}
                aria-label={speech.listening ? "Stop dictating" : "Dictate your message"}
              >
                <Mic className="size-5" aria-hidden />
              </button>
            )}

            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                // Enter sends, Shift+Enter is a newline — the convention every
                // chat interface has trained people to expect.
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={1}
              placeholder={
                speech.listening
                  ? speech.interimTranscript || "Listening…"
                  : isDebate
                    ? "Make your argument…"
                    : "Write your reply…"
              }
              aria-label="Your message"
              className="flex-1 px-3.5 py-3 rounded-xl bg-[var(--surface-raised)] border border-[var(--border)] text-sm resize-none max-h-40 focus:border-brand-500 transition-colors"
              style={{ minHeight: "2.75rem" }}
            />

            <Button
              onClick={send}
              disabled={!draft.trim() || busy}
              className="size-11 rounded-xl p-0 shrink-0"
              aria-label="Send message"
            >
              <ArrowUp className="size-5" aria-hidden />
            </Button>
          </div>

          <p className="text-xs muted mt-2">
            Corrections appear beside your own messages so they do not interrupt the conversation.
            Write at length — development matters as much as accuracy at this level.
          </p>
        </div>
      </div>
    </div>
  );
}

function UserTurn({ message }: { message: Message }) {
  const corrections = message.corrections ?? [];
  const upgrades = message.suggestions ?? [];
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="max-w-[85%] px-4 py-2.5 rounded-2xl rounded-br-sm bg-brand-600 text-white">
        <p className="text-sm leading-relaxed whitespace-pre-wrap">
          {corrections.length > 0 ? highlight(message.content, corrections) : message.content}
        </p>
      </div>

      {(corrections.length > 0 || upgrades.length > 0 || message.metrics) && (
        <div className="max-w-[85%] w-full">
          <button
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-2 text-xs muted hover:text-[var(--text)] transition-colors ml-auto"
            aria-expanded={open}
          >
            {corrections.length > 0 ? (
              <Pill tone={SEVERITY_TONE[worstSeverity(corrections)]}>
                {corrections.length} {corrections.length === 1 ? "note" : "notes"}
              </Pill>
            ) : (
              <Pill tone="success">no errors found</Pill>
            )}
            {message.metrics && (
              <>
                <span>{message.metrics.wordCount} words</span>
                <LevelPill level={message.metrics.estimatedLevel} />
              </>
            )}
          </button>

          {open && (
            <Card className="mt-2 animate-[fade-up_0.2s_ease-out]">
              {corrections.length > 0 && (
                <ul className="space-y-3">
                  {corrections.map((correction, i) => (
                    <li key={i} className="text-sm">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <Pill tone={SEVERITY_TONE[correction.severity]}>{correction.type}</Pill>
                      </div>
                      <p>
                        <span className="line-through decoration-danger/60 decoration-2 muted">
                          {correction.original}
                        </span>{" "}
                        <span aria-hidden>→</span>{" "}
                        <span className="font-medium text-success">{correction.suggestion}</span>
                      </p>
                      <p className="text-xs muted mt-1 text-pretty">{correction.explanation}</p>
                    </li>
                  ))}
                </ul>
              )}

              {upgrades.length > 0 && (
                <div className={cn(corrections.length > 0 && "mt-4 pt-4 border-t border-[var(--border)]")}>
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="size-4 text-brand-500" aria-hidden />
                    <span className="font-semibold text-sm">Say it at a higher level</span>
                  </div>
                  <ul className="space-y-2.5">
                    {upgrades.map((upgrade, i) => (
                      <li key={i} className="text-sm">
                        <p className="font-medium text-brand-600 dark:text-brand-400 text-xs mb-0.5">
                          {upgrade.label}
                        </p>
                        <p className="leading-relaxed">{upgrade.text}</p>
                        {upgrade.rationale && (
                          <p className="text-xs muted mt-0.5 text-pretty">{upgrade.rationale}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function AssistantTurn({
  message,
  onSpeak,
  speaking,
}: {
  message: Message;
  onSpeak?: () => void;
  speaking: boolean;
}) {
  return (
    <div className="flex gap-3">
      <div className="size-8 rounded-full bg-brand-100 dark:bg-brand-900 text-brand-600 dark:text-brand-300 grid place-items-center shrink-0 mt-0.5">
        <Lightbulb className="size-4" aria-hidden />
      </div>
      <div className="max-w-[85%]">
        <div className="px-4 py-2.5 rounded-2xl rounded-tl-sm surface-sunken">
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
        </div>
        {onSpeak && (
          <button
            onClick={onSpeak}
            className="mt-1.5 flex items-center gap-1.5 text-xs muted hover:text-brand-500 transition-colors"
            aria-label="Hear this message read aloud"
          >
            <Volume2 className={cn("size-3.5", speaking && "text-brand-500")} aria-hidden />
            Listen
          </button>
        )}
      </div>
    </div>
  );
}

function worstSeverity(corrections: Correction[]): "minor" | "moderate" | "major" {
  if (corrections.some((c) => c.severity === "major")) return "major";
  if (corrections.some((c) => c.severity === "moderate")) return "moderate";
  return "minor";
}

/** Underlines each corrected span in the learner's own message. */
function highlight(text: string, corrections: Correction[]) {
  const sorted = [...corrections].sort((a, b) => a.span[0] - b.span[0]);
  const parts: React.ReactNode[] = [];
  let cursor = 0;

  sorted.forEach((correction, i) => {
    const [start, end] = correction.span;
    if (start < cursor || start > text.length) return;
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(
      <span
        key={i}
        className="underline decoration-wavy decoration-2 underline-offset-2 decoration-white/70"
        title={correction.suggestion}
      >
        {text.slice(start, end)}
      </span>,
    );
    cursor = end;
  });

  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}
