"use client";

import { useCallback, useEffect, useState } from "react";
import { BookmarkPlus, Check, Languages, Loader2, Search, Volume2 } from "lucide-react";

import { Button, Card, EmptyState, ErrorMessage, Input, LevelPill, Pill, Select } from "@/components/ui";
import { api, ApiClientError } from "@/lib/client";
import { useSpeechSynthesis } from "@/hooks/use-speech";
import { cn } from "@/lib/utils";
import type { Cefr, CardState, Connotation, LexicalType, Register } from "@prisma/client";

interface Entry {
  id: string;
  headword: string;
  type: LexicalType;
  cefr: Cefr;
  pos: string | null;
  ipa: string | null;
  definition: string;
  register: Register;
  connotation: Connotation;
  domain: string | null;
  synonyms: string[];
  antonyms: string[];
  collocations: string[];
  examples: { text: string; note?: string }[];
  usageNote: string | null;
  card: { state: CardState } | null;
}

const TYPE_LABEL: Record<string, string> = {
  WORD: "Words",
  COLLOCATION: "Collocations",
  PHRASAL_VERB: "Phrasal verbs",
  IDIOM: "Idioms",
  SLANG: "Slang",
  ACADEMIC_PHRASE: "Academic phrases",
  DISCOURSE_MARKER: "Discourse markers",
};

const REGISTER_TONE: Record<Register, "neutral" | "brand" | "warning" | "info" | "danger"> = {
  SLANG: "danger",
  INFORMAL: "warning",
  NEUTRAL: "neutral",
  FORMAL: "info",
  ACADEMIC: "brand",
  LITERARY: "brand",
};

export default function LexiconPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [cefr, setCefr] = useState("");
  const [register, setRegister] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);

  const tts = useSpeechSynthesis();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (type) params.set("type", type);
      if (cefr) params.set("cefr", cefr);
      if (register) params.set("register", register);
      params.set("limit", "60");

      const data = await api.get<{ items: Entry[] }>(`/api/lexicon?${params}`);
      setEntries(data.items);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not load the lexicon.");
    } finally {
      setLoading(false);
    }
  }, [query, type, cefr, register]);

  // Debounced so typing does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(load, query ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, query]);

  async function addToQueue(entry: Entry) {
    setAdding(entry.id);
    try {
      await api.post("/api/reviews/add", { lexicalItemId: entry.id });
      setEntries((current) =>
        current.map((e) => (e.id === entry.id ? { ...e, card: { state: "NEW" } } : e)),
      );
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not add that word.");
    } finally {
      setAdding(null);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <header className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <span className="size-10 rounded-xl bg-brand-600 text-white grid place-items-center">
            <Languages className="size-5" aria-hidden />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">Lexicon</h1>
        </div>
        <p className="muted text-pretty">
          Idioms, collocations, phrasal verbs and academic phrases — each with the register,
          connotation and collocation that the definition alone will not tell you.
        </p>
      </header>

      <Card className="mb-5">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="sm:col-span-2 lg:col-span-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 muted" aria-hidden />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                aria-label="Search the lexicon"
                className="pl-9"
              />
            </div>
          </div>
          <Select value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter by type">
            <option value="">All types</option>
            {Object.entries(TYPE_LABEL).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </Select>
          <Select value={cefr} onChange={(e) => setCefr(e.target.value)} aria-label="Filter by level">
            <option value="">All levels</option>
            <option value="B2">B2</option>
            <option value="C1">C1</option>
            <option value="C2">C2</option>
          </Select>
          <Select value={register} onChange={(e) => setRegister(e.target.value)} aria-label="Filter by register">
            <option value="">All registers</option>
            <option value="SLANG">Slang</option>
            <option value="INFORMAL">Informal</option>
            <option value="NEUTRAL">Neutral</option>
            <option value="FORMAL">Formal</option>
            <option value="ACADEMIC">Academic</option>
            <option value="LITERARY">Literary</option>
          </Select>
        </div>
      </Card>

      {error && <div className="mb-4"><ErrorMessage>{error}</ErrorMessage></div>}

      {loading ? (
        <div className="py-20 grid place-items-center">
          <Loader2 className="size-6 animate-spin muted" aria-label="Loading" />
        </div>
      ) : entries.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Search className="size-10 mx-auto" />}
            title="Nothing matches"
            description="Try a broader search, or clear the filters."
          />
        </Card>
      ) : (
        <>
          <p className="text-sm muted mb-4">
            {entries.length} {entries.length === 1 ? "entry" : "entries"}
          </p>
          <div className="space-y-3">
            {entries.map((entry) => (
              <Card key={entry.id}>
                <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-lg font-semibold">{entry.headword}</h2>
                      {tts.supported && (
                        <button
                          onClick={() => tts.speak(entry.headword)}
                          className="p-1 rounded hover:bg-[var(--surface-sunken)] transition-colors"
                          aria-label={`Hear "${entry.headword}" pronounced`}
                        >
                          <Volume2 className="size-3.5 muted" aria-hidden />
                        </button>
                      )}
                      <LevelPill level={entry.cefr} />
                      <Pill>{entry.type.replace(/_/g, " ").toLowerCase()}</Pill>
                      <Pill tone={REGISTER_TONE[entry.register]}>{entry.register.toLowerCase()}</Pill>
                      {entry.connotation !== "NEUTRAL" && (
                        <Pill
                          tone={
                            entry.connotation === "POSITIVE"
                              ? "success"
                              : entry.connotation === "NEGATIVE"
                                ? "danger"
                                : "warning"
                          }
                        >
                          {entry.connotation.toLowerCase()}
                        </Pill>
                      )}
                    </div>
                    {(entry.ipa || entry.pos) && (
                      <p className="text-xs muted font-mono mt-1">
                        {entry.ipa} {entry.pos && <span className="font-sans italic">· {entry.pos}</span>}
                      </p>
                    )}
                  </div>

                  {entry.card ? (
                    <Pill tone="success">
                      <Check className="size-3" aria-hidden />
                      in review
                    </Pill>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => addToQueue(entry)}
                      loading={adding === entry.id}
                    >
                      <BookmarkPlus className="size-3.5" aria-hidden />
                      Add to review
                    </Button>
                  )}
                </div>

                <p className="text-sm leading-relaxed mb-3 text-pretty">{entry.definition}</p>

                {entry.examples.length > 0 && (
                  <ul className="space-y-1.5 mb-3">
                    {entry.examples.map((example, i) => (
                      <li key={i} className="text-sm font-serif surface-sunken px-3 py-2 rounded-lg">
                        {example.text}
                        {example.note && <span className="text-xs muted font-sans ml-2">— {example.note}</span>}
                      </li>
                    ))}
                  </ul>
                )}

                <dl className="grid sm:grid-cols-3 gap-3 text-xs mb-3">
                  {entry.collocations.length > 0 && (
                    <div>
                      <dt className="font-semibold muted uppercase tracking-wide mb-0.5">Collocations</dt>
                      <dd className="text-pretty">{entry.collocations.join(" · ")}</dd>
                    </div>
                  )}
                  {entry.synonyms.length > 0 && (
                    <div>
                      <dt className="font-semibold muted uppercase tracking-wide mb-0.5">Near synonyms</dt>
                      <dd className="text-pretty">{entry.synonyms.join(", ")}</dd>
                    </div>
                  )}
                  {entry.antonyms.length > 0 && (
                    <div>
                      <dt className="font-semibold muted uppercase tracking-wide mb-0.5">Opposites</dt>
                      <dd className="text-pretty">{entry.antonyms.join(", ")}</dd>
                    </div>
                  )}
                </dl>

                {entry.usageNote && (
                  <div className={cn("border-l-2 border-brand-400 pl-3")}>
                    <p className="text-xs muted leading-relaxed text-pretty">
                      <span className="font-semibold">Usage:</span> {entry.usageNote}
                    </p>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
