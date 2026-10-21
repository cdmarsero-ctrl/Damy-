"use client";

import { useRef, useState, type FormEvent } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { AudioLines, Mic, MicOff, PhoneOff, Send } from "lucide-react";

import { Button, Card, ErrorMessage, Input, Pill } from "@/components/ui";
import { api, ApiClientError } from "@/lib/client";
import { cn } from "@/lib/utils";

/**
 * Live voice session with the DAMI agent (ElevenLabs Conversational AI).
 *
 * Unlike the pronunciation lab, audio here does leave the device: it streams
 * to ElevenLabs for the length of the session. The page says so before the
 * learner starts, and nothing is recorded on our side.
 */

type SessionGrant = { mode: "token"; token: string } | { mode: "public"; agentId: string };

interface Line {
  id: number;
  role: "user" | "agent";
  text: string;
}

export function VoiceAgent() {
  return (
    <ConversationProvider>
      <VoiceAgentInner />
    </ConversationProvider>
  );
}

function VoiceAgentInner() {
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [draft, setDraft] = useState("");
  const nextId = useRef(0);

  const conversation = useConversation({
    onMessage: ({ message, role }) => {
      setLines((prev) => [
        ...prev,
        { id: nextId.current++, role: role === "user" ? "user" : "agent", text: message },
      ]);
    },
    onError: (message) => setError(message || "The voice session hit an error."),
  });

  const { status, isSpeaking, isMuted } = conversation;
  const connected = status === "connected";
  const busy = starting || status === "connecting";

  async function start() {
    setError(null);
    setStarting(true);
    try {
      // Ask for the microphone first so a denial produces a clear message
      // instead of a failed WebRTC negotiation.
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const grant = await api.get<SessionGrant>("/api/voice/session");
      setLines([]);
      if (grant.mode === "token") {
        conversation.startSession({ conversationToken: grant.token, connectionType: "webrtc" });
      } else {
        conversation.startSession({ agentId: grant.agentId, connectionType: "webrtc" });
      }
    } catch (err) {
      if (err instanceof ApiClientError) setError(err.message);
      else if (err instanceof DOMException && err.name === "NotAllowedError")
        setError("Microphone access was denied. Allow it in your browser settings to talk to DAMI.");
      else setError("Could not start the voice session.");
    } finally {
      setStarting(false);
    }
  }

  function sendText(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !connected) return;
    conversation.sendUserMessage(text);
    setDraft("");
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <header className="mb-7">
        <div className="flex items-center gap-3 mb-2">
          <span className="size-10 rounded-xl bg-brand-600 text-white grid place-items-center">
            <AudioLines className="size-5" aria-hidden />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">Voice conversation with DAMI</h1>
        </div>
        <p className="muted text-pretty">
          A real-time spoken conversation with an AI voice agent. Your microphone audio streams to
          ElevenLabs for the length of the session; Lexicon does not store it.
        </p>
      </header>

      {error && <div className="mb-4"><ErrorMessage>{error}</ErrorMessage></div>}

      <Card className="mb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2" role="status" aria-live="polite">
            <Pill tone={connected ? "success" : "neutral"}>{statusLabel(status)}</Pill>
            {connected && (
              <Pill tone={isSpeaking ? "brand" : "info"}>
                {isSpeaking ? "DAMI is speaking" : "Listening"}
              </Pill>
            )}
          </div>
          <div className="flex items-center gap-2">
            {connected ? (
              <>
                <Button
                  variant="secondary"
                  onClick={() => conversation.setMuted(!isMuted)}
                  aria-pressed={isMuted}
                >
                  {isMuted ? <MicOff className="size-4" aria-hidden /> : <Mic className="size-4" aria-hidden />}
                  {isMuted ? "Unmute" : "Mute"}
                </Button>
                <Button variant="danger" onClick={() => conversation.endSession()}>
                  <PhoneOff className="size-4" aria-hidden />
                  End
                </Button>
              </>
            ) : (
              <Button onClick={start} loading={busy}>
                <Mic className="size-4" aria-hidden />
                Start talking
              </Button>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="font-semibold mb-3">Transcript</h2>
        {lines.length === 0 ? (
          <p className="text-sm muted">The conversation will appear here as you talk.</p>
        ) : (
          <ol className="space-y-2" aria-live="polite">
            {lines.map((line) => (
              <li
                key={line.id}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm max-w-[85%]",
                  line.role === "user"
                    ? "ml-auto bg-brand-600 text-white"
                    : "bg-[var(--surface-sunken)]",
                )}
              >
                <span className="sr-only">{line.role === "user" ? "You: " : "DAMI: "}</span>
                {line.text}
              </li>
            ))}
          </ol>
        )}

        <form onSubmit={sendText} className="mt-4 flex gap-2">
          <div className="flex-1">
            <Input
              aria-label="Type a message to DAMI"
              placeholder={connected ? "Or type a message…" : "Start a session to type"}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={!connected}
            />
          </div>
          <Button type="submit" variant="secondary" disabled={!connected || !draft.trim()}>
            <Send className="size-4" aria-hidden />
            Send
          </Button>
        </form>
      </Card>
    </div>
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case "connected":
      return "Connected";
    case "connecting":
      return "Connecting…";
    case "error":
      return "Disconnected (error)";
    default:
      return "Not connected";
  }
}
