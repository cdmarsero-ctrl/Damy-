"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Loader2, MessageSquareText, Shuffle, Swords } from "lucide-react";

import { Conversation, type ConversationData } from "@/components/conversation";
import { Button, Card, ErrorMessage, Input, Pill, Select } from "@/components/ui";
import { api, ApiClientError } from "@/lib/client";
import { relativeTime } from "@/lib/utils";
import type { ConversationMode } from "@prisma/client";

/**
 * Topic picker and session list, shared by /tutor and /debate.
 *
 * Suggested topics are opinionated on purpose: "your hobbies" produces four
 * turns and a dead conversation, while a topic with a genuine tension in it
 * produces the sustained argument these modes exist to practise.
 */

const TUTOR_TOPICS = [
  "Whether remote work has been good for early-career professionals",
  "The difference between confidence and competence at work",
  "Why some skills resist being taught",
  "What a city owes the people who cannot afford to live in it",
  "Whether expertise is becoming less trusted, and why",
  "The case for and against reading fiction",
];

const DEBATE_MOTIONS = [
  "Universities should abolish standardised admissions tests",
  "Social media companies should be legally liable for content they algorithmically promote",
  "Remote work should be a legal right for jobs that can be done remotely",
  "Voting should be compulsory",
  "Artificial intelligence research should require a licence",
  "Museums should return artefacts acquired during colonial rule",
];

const ROLEPLAY_SCENARIOS = [
  "Negotiating a salary increase with a sceptical manager",
  "Explaining a missed deadline to an important client",
  "Declining a project you do not have capacity for",
  "Giving critical feedback to a defensive colleague",
];

interface Summary {
  id: string;
  mode: ConversationMode;
  topic: string;
  updatedAt: string;
  _count: { messages: number };
}

export function ConversationLauncher({
  mode,
  liveAI,
  title,
  description,
}: {
  mode: "TUTOR" | "DEBATE";
  liveAI: boolean;
  title: string;
  description: string;
}) {
  const [active, setActive] = useState<ConversationData | null>(null);
  const [history, setHistory] = useState<Summary[]>([]);
  const [topic, setTopic] = useState("");
  const [userStance, setUserStance] = useState("for");
  const [subMode, setSubMode] = useState<"TUTOR" | "ROLEPLAY" | "INTERVIEW" | "EXAM_SPEAKING">("TUTOR");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isDebate = mode === "DEBATE";
  const suggestions = isDebate
    ? DEBATE_MOTIONS
    : subMode === "ROLEPLAY"
      ? ROLEPLAY_SCENARIOS
      : TUTOR_TOPICS;

  useEffect(() => {
    void loadHistory();
  }, []);

  async function loadHistory() {
    setLoading(true);
    try {
      const data = await api.get<{ conversations: Summary[] }>("/api/ai/conversations");
      setHistory(data.conversations.filter((c) => (isDebate ? c.mode === "DEBATE" : c.mode !== "DEBATE")));
    } catch {
      // A failed history load must not block starting a new conversation.
    } finally {
      setLoading(false);
    }
  }

  async function start(chosenTopic: string) {
    if (!chosenTopic.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const data = await api.post<{ conversation: ConversationData }>("/api/ai/conversations", {
        mode: isDebate ? "DEBATE" : subMode,
        topic: chosenTopic.trim(),
        ...(isDebate
          ? {
              userStance: userStance === "for" ? `${chosenTopic.trim()}` : `not ${chosenTopic.trim()}`,
              aiStance: userStance === "for" ? "against the motion" : "for the motion",
            }
          : {}),
      });
      setActive(data.conversation);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not start the conversation.");
    } finally {
      setBusy(false);
    }
  }

  async function resume(id: string) {
    setBusy(true);
    try {
      const data = await api.get<{ conversation: ConversationData }>(`/api/ai/conversations/${id}`);
      setActive(data.conversation);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not open that conversation.");
    } finally {
      setBusy(false);
    }
  }

  if (active) {
    return (
      <Conversation
        conversation={active}
        liveAI={liveAI}
        onReset={() => {
          setActive(null);
          setTopic("");
          void loadHistory();
        }}
      />
    );
  }

  const Icon = isDebate ? Swords : MessageSquareText;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <header className="mb-7">
        <div className="flex items-center gap-3 mb-2">
          <span className="size-10 rounded-xl bg-brand-600 text-white grid place-items-center">
            <Icon className="size-5" aria-hidden />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        </div>
        <p className="muted text-pretty">{description}</p>
      </header>

      {error && <div className="mb-4"><ErrorMessage>{error}</ErrorMessage></div>}

      <Card className="mb-5">
        {!isDebate && (
          <div className="mb-4">
            <Select
              label="Mode"
              value={subMode}
              onChange={(e) => setSubMode(e.target.value as typeof subMode)}
            >
              <option value="TUTOR">Open conversation — discuss anything, with correction</option>
              <option value="ROLEPLAY">Role-play — a scenario with realistic friction</option>
              <option value="INTERVIEW">Interview — demanding follow-up questions</option>
              <option value="EXAM_SPEAKING">Exam speaking — IELTS/Cambridge format</option>
            </Select>
          </div>
        )}

        {isDebate && (
          <div className="mb-4">
            <Select
              label="Your side"
              value={userStance}
              onChange={(e) => setUserStance(e.target.value)}
              hint="Your opponent takes the other side and will hold it. It does not concede to be polite."
            >
              <option value="for">I argue FOR the motion</option>
              <option value="against">I argue AGAINST the motion</option>
            </Select>
          </div>
        )}

        <Input
          label={isDebate ? "Motion" : "Topic"}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && start(topic)}
          placeholder={isDebate ? "This house believes that…" : "What would you like to talk about?"}
        />

        <div className="mt-4">
          <div className="flex items-center gap-2 mb-2">
            <Shuffle className="size-3.5 muted" aria-hidden />
            <span className="text-xs font-medium muted uppercase tracking-wide">
              Or pick one with something to argue about
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => setTopic(suggestion)}
                className="px-3 py-1.5 rounded-lg surface-sunken text-xs text-left hover:border-brand-400 border border-[var(--border)] transition-colors max-w-full"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>

        <Button size="lg" className="mt-5" onClick={() => start(topic)} disabled={!topic.trim()} loading={busy}>
          {isDebate ? "Begin the debate" : "Start talking"}
          <ArrowRight className="size-4" aria-hidden />
        </Button>
      </Card>

      {loading ? (
        <div className="py-8 grid place-items-center">
          <Loader2 className="size-5 animate-spin muted" aria-label="Loading" />
        </div>
      ) : (
        history.length > 0 && (
          <Card>
            <h2 className="font-semibold mb-3">Pick up where you left off</h2>
            <ul className="divide-y divide-[var(--border)]">
              {history.slice(0, 8).map((entry) => (
                <li key={entry.id}>
                  <button
                    onClick={() => resume(entry.id)}
                    className="w-full text-left py-3 flex items-center justify-between gap-3 group"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                        {entry.topic}
                      </div>
                      <div className="text-xs muted">{relativeTime(entry.updatedAt)}</div>
                    </div>
                    <Pill>{entry._count.messages} turns</Pill>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )
      )}
    </div>
  );
}
