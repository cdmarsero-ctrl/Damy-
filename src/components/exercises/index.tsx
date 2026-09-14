"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, GripVertical, Mic } from "lucide-react";

import { Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useSpeechRecognition } from "@/hooks/use-speech";
import type { ExerciseType } from "@prisma/client";

/**
 * Exercise renderers.
 *
 * One component per ExerciseType, dispatched by `ExerciseRenderer`. Each is a
 * controlled component over a `response` object whose shape matches what
 * src/lib/grading.ts expects — the contract is documented in
 * docs/DATA-MODEL.md and enforced by the Zod union in src/lib/validation.ts.
 *
 * The renderers never see the solution. Feedback arrives from the server after
 * submission and is displayed by the lesson player, not here.
 */

export interface ExerciseData {
  id: string;
  type: ExerciseType;
  skill: string;
  cefr: string;
  prompt: string;
  instructions?: string | null;
  payload: Record<string, unknown>;
  points: number;
}

export type ExerciseResponse = Record<string, unknown>;

interface RendererProps {
  exercise: ExerciseData;
  response: ExerciseResponse;
  onChange: (response: ExerciseResponse) => void;
  disabled?: boolean;
}

/** True when the learner has supplied enough to submit. */
export function isAnswered(type: ExerciseType, response: ExerciseResponse): boolean {
  switch (type) {
    case "MULTIPLE_CHOICE":
    case "LISTENING_COMPREHENSION":
    case "READING_ANALYSIS":
      return typeof response.answerIndex === "number";
    case "MULTI_SELECT":
      return Array.isArray(response.answerIndexes) && response.answerIndexes.length > 0;
    case "GAP_FILL":
    case "COLLOCATION_BUILD":
    case "ERROR_CORRECTION":
      return Array.isArray(response.answers) && response.answers.some((a) => String(a).trim());
    case "DRAG_ORDER":
      return Array.isArray(response.order) && response.order.length > 0;
    case "MATCHING":
      return Boolean(response.pairs) && Object.keys(response.pairs as object).length > 0;
    default:
      return String(response.text ?? "").trim().length > 0;
  }
}

export function ExerciseRenderer(props: RendererProps) {
  switch (props.exercise.type) {
    case "MULTIPLE_CHOICE":
    case "LISTENING_COMPREHENSION":
    case "READING_ANALYSIS":
      return <SingleChoice {...props} />;
    case "MULTI_SELECT":
      return <MultiChoice {...props} />;
    case "GAP_FILL":
    case "COLLOCATION_BUILD":
      return <GapFill {...props} />;
    case "ERROR_CORRECTION":
      return <ErrorCorrection {...props} />;
    case "DRAG_ORDER":
      return <Reorder {...props} />;
    case "MATCHING":
      return <Matching {...props} />;
    case "DICTATION":
      return <Dictation {...props} />;
    case "SPEAKING_PROMPT":
      return <SpeakingPrompt {...props} />;
    default:
      // TRANSFORMATION, OPEN_WRITING, REGISTER_SHIFT, NOTE_TAKING
      return <FreeText {...props} />;
  }
}

/* ------------------------------------------------------- shared subviews */

function Passage({ text, serif = true }: { text: string; serif?: boolean }) {
  return (
    <div
      className={cn(
        "surface-sunken p-4 mb-5 text-sm leading-relaxed whitespace-pre-line",
        serif && "font-serif text-[15px]",
      )}
    >
      {text}
    </div>
  );
}

function OptionList({
  options,
  isSelected,
  onToggle,
  disabled,
  multiple,
}: {
  options: string[];
  isSelected: (index: number) => boolean;
  onToggle: (index: number) => void;
  disabled?: boolean;
  multiple?: boolean;
}) {
  return (
    <fieldset className="space-y-2.5" disabled={disabled}>
      <legend className="sr-only">{multiple ? "Select all that apply" : "Choose one answer"}</legend>
      {options.map((option, index) => {
        const selected = isSelected(index);
        return (
          <label
            key={index}
            className={cn(
              "flex items-start gap-3 p-3.5 rounded-xl border-2 transition-all",
              disabled ? "cursor-default opacity-90" : "cursor-pointer",
              selected
                ? "border-brand-500 bg-brand-50 dark:bg-brand-950"
                : !disabled && "border-[var(--border)] hover:border-brand-300 hover:bg-[var(--surface-sunken)]",
              !selected && disabled && "border-[var(--border)]",
            )}
          >
            <input
              type={multiple ? "checkbox" : "radio"}
              name={`option-${multiple ? "multi" : "single"}`}
              checked={selected}
              onChange={() => onToggle(index)}
              disabled={disabled}
              className="sr-only"
            />
            <span
              className={cn(
                "size-6 grid place-items-center shrink-0 text-xs font-semibold border-2 transition-colors",
                multiple ? "rounded-md" : "rounded-full",
                selected ? "border-brand-500 bg-brand-500 text-white" : "border-[var(--border)] muted",
              )}
              aria-hidden
            >
              {String.fromCharCode(65 + index)}
            </span>
            <span className="text-sm leading-relaxed pt-0.5">{option}</span>
          </label>
        );
      })}
    </fieldset>
  );
}

/* -------------------------------------------------------- single choice */

function SingleChoice({ exercise, response, onChange, disabled }: RendererProps) {
  const options = (exercise.payload.options as string[]) ?? [];
  const passage = (exercise.payload.passage ?? exercise.payload.transcript ?? exercise.payload.context) as
    | string
    | undefined;
  const selected = response.answerIndex as number | undefined;

  return (
    <div>
      {passage && <Passage text={passage} />}
      <OptionList
        options={options}
        isSelected={(i) => selected === i}
        onToggle={(i) => onChange({ answerIndex: i })}
        disabled={disabled}
      />
    </div>
  );
}

function MultiChoice({ exercise, response, onChange, disabled }: RendererProps) {
  const options = (exercise.payload.options as string[]) ?? [];
  const selected = (response.answerIndexes as number[]) ?? [];

  return (
    <div>
      <p className="text-sm muted mb-3">Select all that apply.</p>
      <OptionList
        options={options}
        multiple
        isSelected={(i) => selected.includes(i)}
        onToggle={(i) =>
          onChange({
            answerIndexes: selected.includes(i)
              ? selected.filter((s) => s !== i)
              : [...selected, i].sort((a, b) => a - b),
          })
        }
        disabled={disabled}
      />
    </div>
  );
}

/* -------------------------------------------------------------- gap fill */

function GapFill({ exercise, response, onChange, disabled }: RendererProps) {
  const gaps = (exercise.payload.gaps as { placeholder?: string }[]) ?? [];
  const answers = (response.answers as string[]) ?? [];

  function update(index: number, value: string) {
    const next = [...answers];
    while (next.length < gaps.length) next.push("");
    next[index] = value;
    onChange({ answers: next });
  }

  return (
    <div className="space-y-3">
      {gaps.map((gap, index) => (
        <div key={index} className="flex items-center gap-3">
          <span
            className="size-7 rounded-full bg-brand-100 dark:bg-brand-900 text-brand-700 dark:text-brand-300 grid place-items-center text-xs font-semibold shrink-0"
            aria-hidden
          >
            {index + 1}
          </span>
          <input
            type="text"
            value={answers[index] ?? ""}
            onChange={(e) => update(index, e.target.value)}
            disabled={disabled}
            placeholder={gap.placeholder ?? `Gap ${index + 1}`}
            aria-label={`Gap ${index + 1}${gap.placeholder ? `: ${gap.placeholder}` : ""}`}
            // Autocorrect and spellcheck would do the exercise for the learner.
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="flex-1 h-10 px-3 rounded-lg bg-[var(--surface-raised)] border border-[var(--border)] text-sm focus:border-brand-500 transition-colors disabled:opacity-70"
          />
        </div>
      ))}
    </div>
  );
}

function ErrorCorrection({ exercise, response, onChange, disabled }: RendererProps) {
  const lines = (exercise.payload.lines as string[]) ?? [];
  const answers = (response.answers as string[]) ?? [];

  function update(index: number, value: string) {
    const next = [...answers];
    while (next.length < lines.length) next.push("");
    next[index] = value;
    onChange({ answers: next });
  }

  return (
    <div className="space-y-4">
      {lines.map((line, index) => (
        <div key={index}>
          <p className="text-sm mb-2 px-3 py-2 rounded-lg surface-sunken line-through decoration-danger/50 decoration-2">
            {line}
          </p>
          <input
            type="text"
            value={answers[index] ?? ""}
            onChange={(e) => update(index, e.target.value)}
            disabled={disabled}
            placeholder="Your correction…"
            aria-label={`Correction for line ${index + 1}`}
            autoComplete="off"
            className="w-full h-10 px-3 rounded-lg bg-[var(--surface-raised)] border border-[var(--border)] text-sm focus:border-brand-500 transition-colors disabled:opacity-70"
          />
        </div>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------- reorder */

/**
 * Reordering via up/down buttons rather than drag-and-drop.
 *
 * Native HTML drag-and-drop is unusable with a keyboard and poorly supported by
 * touch. Buttons work everywhere, are announced correctly by screen readers,
 * and are genuinely faster on a phone.
 */
function Reorder({ exercise, response, onChange, disabled }: RendererProps) {
  const items = (exercise.payload.items as { id: string; label: string }[]) ?? [];

  // Shuffle once per exercise, deterministically from the id so a re-render
  // (or a React strict-mode double-invoke) does not reshuffle under the user.
  const initial = useMemo(() => {
    const seed = exercise.id.split("").reduce((sum, c) => sum + c.charCodeAt(0), 0);
    const shuffled = [...items];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = (seed * (i + 1)) % (i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.map((item) => item.id);
  }, [exercise.id, items]);

  const order = (response.order as string[]) ?? initial;

  useEffect(() => {
    if (!response.order) onChange({ order: initial });
    // Seeding the initial order once on mount; re-running on every change
    // would fight the learner's edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const labelById = new Map(items.map((i) => [i.id, i.label]));

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    onChange({ order: next });
  }

  return (
    <ol className="space-y-2">
      {order.map((id, index) => (
        <li
          key={id}
          className="flex items-center gap-3 p-3 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)]"
        >
          <GripVertical className="size-4 muted shrink-0" aria-hidden />
          <span
            className="size-6 rounded-full bg-brand-100 dark:bg-brand-900 text-brand-700 dark:text-brand-300 grid place-items-center text-xs font-semibold shrink-0 tabular-nums"
            aria-hidden
          >
            {index + 1}
          </span>
          <span className="flex-1 text-sm">{labelById.get(id) ?? id}</span>
          <div className="flex flex-col gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() => move(index, -1)}
              disabled={disabled || index === 0}
              aria-label={`Move "${labelById.get(id)}" up`}
              className="p-1 rounded hover:bg-[var(--surface-sunken)] disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronUp className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => move(index, 1)}
              disabled={disabled || index === order.length - 1}
              aria-label={`Move "${labelById.get(id)}" down`}
              className="p-1 rounded hover:bg-[var(--surface-sunken)] disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronDown className="size-4" aria-hidden />
            </button>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* -------------------------------------------------------------- matching */

function Matching({ exercise, response, onChange, disabled }: RendererProps) {
  const left = (exercise.payload.left as { id: string; label: string }[]) ?? [];
  const right = (exercise.payload.right as { id: string; label: string }[]) ?? [];
  const passage = exercise.payload.passage as string | undefined;
  const pairs = (response.pairs as Record<string, string>) ?? {};

  return (
    <div>
      {passage && <Passage text={passage} />}
      <div className="space-y-3">
        {left.map((item) => (
          <div key={item.id} className="grid sm:grid-cols-2 gap-2.5 items-center">
            <div className="text-sm p-3 rounded-lg surface-sunken leading-relaxed">{item.label}</div>
            <select
              value={pairs[item.id] ?? ""}
              onChange={(e) => onChange({ pairs: { ...pairs, [item.id]: e.target.value } })}
              disabled={disabled}
              aria-label={`Match for: ${item.label}`}
              className="h-11 px-3 rounded-lg bg-[var(--surface-raised)] border border-[var(--border)] text-sm focus:border-brand-500 transition-colors disabled:opacity-70"
            >
              <option value="">Choose…</option>
              {right.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- free text */

function FreeText({ exercise, response, onChange, disabled }: RendererProps) {
  const text = String(response.text ?? "");
  const minWords = Number(exercise.payload.minWords ?? 0);
  const maxWords = Number(exercise.payload.maxWords ?? 0);
  const original = exercise.payload.original as string | undefined;
  const keyword = exercise.payload.keyword as string | undefined;

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <div>
      {original && (
        <div className="surface-sunken p-3.5 mb-4">
          <p className="text-xs font-medium muted uppercase tracking-wide mb-1.5">Original</p>
          <p className="text-sm leading-relaxed">{original}</p>
        </div>
      )}
      {keyword && (
        <div className="mb-4">
          <span className="inline-block px-3 py-1.5 rounded-lg bg-brand-100 dark:bg-brand-900 text-brand-700 dark:text-brand-300 font-mono text-sm font-semibold tracking-wide">
            {keyword}
          </span>
        </div>
      )}

      <Textarea
        value={text}
        onChange={(e) => onChange({ text: e.target.value })}
        disabled={disabled}
        placeholder={(exercise.payload.placeholder as string) ?? "Write your answer…"}
        rows={minWords > 80 ? 10 : 4}
        aria-label="Your answer"
      />

      {(minWords > 0 || maxWords > 0) && (
        <p
          className={cn(
            "text-xs mt-2 tabular-nums",
            minWords > 0 && wordCount < minWords ? "text-warning" : "muted",
            maxWords > 0 && wordCount > maxWords && "text-warning",
          )}
          aria-live="polite"
        >
          {wordCount} {wordCount === 1 ? "word" : "words"}
          {minWords > 0 && ` · minimum ${minWords}`}
          {maxWords > 0 && ` · maximum ${maxWords}`}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- dictation */

function Dictation({ exercise, response, onChange, disabled }: RendererProps) {
  const hint = exercise.payload.audioHint as string | undefined;
  const audioUrl = exercise.payload.audioUrl as string | undefined;
  const text = String(response.text ?? "");

  return (
    <div>
      {audioUrl ? (
        <audio controls src={audioUrl} className="w-full mb-4">
          <track kind="captions" />
        </audio>
      ) : hint ? (
        <div className="surface-sunken p-4 mb-4">
          <p className="text-xs font-medium muted uppercase tracking-wide mb-2">
            Phonetic transcription
          </p>
          <p className="font-mono text-base tracking-wide">{hint}</p>
          <p className="text-xs muted mt-2 text-pretty">
            No audio is bundled with this exercise — work from the IPA. Read it aloud; hearing your
            own voice produce the reduction is the point.
          </p>
        </div>
      ) : null}

      <Textarea
        value={text}
        onChange={(e) => onChange({ text: e.target.value })}
        disabled={disabled}
        placeholder="Type what you hear…"
        rows={3}
        aria-label="Transcription"
        autoCorrect="off"
        spellCheck={false}
      />
    </div>
  );
}

/* ------------------------------------------------------- speaking prompt */

function SpeakingPrompt({ exercise, response, onChange, disabled }: RendererProps) {
  const text = String(response.text ?? "");
  const speech = useSpeechRecognition();
  const [mode, setMode] = useState<"speak" | "type">("speak");

  // Speech results stream in; append them to whatever is already there so a
  // learner can speak in several passes.
  useEffect(() => {
    if (speech.finalTranscript) {
      onChange({ text: `${text} ${speech.finalTranscript}`.trim() });
      speech.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech.finalTranscript]);

  const canSpeak = speech.supported && mode === "speak";

  return (
    <div>
      {speech.supported && (
        <div className="flex gap-2 mb-4">
          {(["speak", "type"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setMode(option)}
              aria-pressed={mode === option}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                mode === option
                  ? "bg-brand-600 text-white"
                  : "surface-sunken muted hover:text-[var(--text)]",
              )}
            >
              {option === "speak" ? "Speak" : "Type instead"}
            </button>
          ))}
        </div>
      )}

      {canSpeak ? (
        <div className="text-center py-6 surface-sunken mb-4">
          <button
            type="button"
            onClick={() => (speech.listening ? speech.stop() : speech.start())}
            disabled={disabled}
            className={cn(
              "size-16 rounded-full grid place-items-center mx-auto transition-all",
              speech.listening
                ? "bg-danger text-white scale-110 shadow-lg shadow-danger/30"
                : "bg-brand-600 text-white hover:bg-brand-700",
            )}
            aria-label={speech.listening ? "Stop recording" : "Start recording"}
          >
            <Mic className="size-7" aria-hidden />
          </button>
          <p className="text-sm muted mt-3" aria-live="polite">
            {speech.listening ? "Listening — speak naturally" : "Tap to record your answer"}
          </p>
          {speech.interimTranscript && (
            <p className="text-sm mt-2 italic muted">{speech.interimTranscript}</p>
          )}
          {speech.error && <p className="text-xs text-danger mt-2">{speech.error}</p>}
        </div>
      ) : !speech.supported ? (
        <p className="text-xs muted mb-3 text-pretty">
          Your browser does not expose the Web Speech API, so this answer is typed. Chrome, Edge and
          Safari support it.
        </p>
      ) : null}

      <Textarea
        value={text}
        onChange={(e) => onChange({ text: e.target.value })}
        disabled={disabled}
        placeholder={canSpeak ? "Your speech appears here — edit it freely." : "Write your answer…"}
        rows={5}
        aria-label="Your answer"
      />
    </div>
  );
}
