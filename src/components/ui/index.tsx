"use client";

import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Cefr } from "@prisma/client";

/* ------------------------------------------------------------------ Button */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success" | "outline";
type ButtonSize = "sm" | "md" | "lg";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 shadow-sm shadow-brand-600/20",
  secondary:
    "bg-[var(--surface-sunken)] text-[var(--text)] hover:bg-[var(--border)] border border-[var(--border)]",
  ghost: "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-sunken)]",
  danger: "bg-danger text-white hover:opacity-90 active:opacity-80",
  success: "bg-success text-white hover:opacity-90 active:opacity-80",
  outline:
    "border border-brand-500 text-brand-600 dark:text-brand-300 hover:bg-brand-50 dark:hover:bg-brand-950",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2.5",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", loading, fullWidth, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      // `aria-busy` lets a screen reader announce the pending state that the
      // spinner communicates visually.
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-medium transition-all",
        "disabled:opacity-50 disabled:pointer-events-none",
        "active:scale-[0.98]",
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        fullWidth && "w-full",
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

/* -------------------------------------------------------------------- Card */

export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("surface p-5", className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
  icon,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div className="flex items-start gap-3 min-w-0">
        {icon && <div className="shrink-0 mt-0.5 text-brand-500">{icon}</div>}
        <div className="min-w-0">
          <h2 className="font-semibold leading-tight truncate">{title}</h2>
          {description && <p className="text-sm muted mt-1 text-pretty">{description}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------- Badge */

type BadgeTone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: "bg-[var(--surface-sunken)] text-[var(--text-muted)] border-[var(--border)]",
  brand: "bg-brand-50 text-brand-700 border-brand-200 dark:bg-brand-950 dark:text-brand-300 dark:border-brand-800",
  success: "bg-success/10 text-success border-success/30",
  warning: "bg-warning/10 text-warning border-warning/30",
  danger: "bg-danger/10 text-danger border-danger/30",
  info: "bg-info/10 text-info border-info/30",
};

export function Pill({
  tone = "neutral",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** CEFR level chip. Colour AND text — never colour alone. WCAG SC 1.4.1 */
export function LevelPill({ level, className }: { level: Cefr; className?: string }) {
  const styles: Record<Cefr, string> = {
    B2: "bg-b2/10 text-b2 border-b2/30",
    C1: "bg-c1/10 text-c1 border-c1/30",
    C2: "bg-c2/10 text-c2 border-c2/30",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold tracking-wide",
        styles[level],
        className,
      )}
    >
      {level}
    </span>
  );
}

/* ---------------------------------------------------------------- Progress */

export function Progress({
  value,
  max = 1,
  label,
  className,
  tone = "brand",
  showValue,
}: {
  value: number;
  max?: number;
  label?: string;
  className?: string;
  tone?: "brand" | "success" | "warning";
  showValue?: boolean;
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const tones = { brand: "bg-brand-500", success: "bg-success", warning: "bg-warning" };

  return (
    <div className={className}>
      {(label || showValue) && (
        <div className="flex justify-between items-baseline mb-1.5 text-xs">
          {label && <span className="muted font-medium">{label}</span>}
          {showValue && <span className="tabular-nums muted">{Math.round(pct)}%</span>}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "Progress"}
        className="h-2 rounded-full bg-[var(--surface-sunken)] overflow-hidden"
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-500 ease-out", tones[tone])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- Input */

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, label, error, hint, id, ...props },
  ref,
) {
  const inputId = id ?? props.name ?? label?.toLowerCase().replace(/\s+/g, "-");
  const describedBy = [error && `${inputId}-error`, hint && `${inputId}-hint`]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={cn(
          "w-full h-10 px-3 rounded-lg bg-[var(--surface-raised)] border text-sm",
          "placeholder:text-[var(--text-muted)] transition-colors",
          "focus:border-brand-500",
          error ? "border-danger" : "border-[var(--border)]",
          className,
        )}
        {...props}
      />
      {hint && !error && (
        <p id={`${inputId}-hint`} className="text-xs muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${inputId}-error`} className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, label, error, hint, id, ...props },
  ref,
) {
  const fieldId = id ?? props.name ?? label?.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={fieldId} className="block text-sm font-medium">
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        className={cn(
          "w-full px-3 py-2.5 rounded-lg bg-[var(--surface-raised)] border text-sm leading-relaxed",
          "placeholder:text-[var(--text-muted)] transition-colors resize-y min-h-24",
          "focus:border-brand-500",
          error ? "border-danger" : "border-[var(--border)]",
          className,
        )}
        {...props}
      />
      {hint && !error && <p className="text-xs muted">{hint}</p>}
      {error && (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, label, hint, id, children, ...props },
  ref,
) {
  const fieldId = id ?? props.name;
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={fieldId} className="block text-sm font-medium">
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={fieldId}
        className={cn(
          "w-full h-10 px-3 rounded-lg bg-[var(--surface-raised)] border border-[var(--border)] text-sm",
          "focus:border-brand-500 transition-colors",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      {hint && <p className="text-xs muted">{hint}</p>}
    </div>
  );
});

/* ------------------------------------------------------------------ States */

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="text-center py-12 px-6">
      {icon && <div className="mx-auto mb-4 text-[var(--text-muted)] opacity-60">{icon}</div>}
      <h3 className="font-semibold mb-1.5">{title}</h3>
      {description && <p className="text-sm muted max-w-md mx-auto text-pretty">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("shimmer rounded-lg", className)} aria-hidden />;
}

export function ErrorMessage({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div
      role="alert"
      className="rounded-lg border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-danger"
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ Stat */

export function Stat({
  label,
  value,
  sub,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  tone?: BadgeTone;
}) {
  const tones: Record<BadgeTone, string> = {
    neutral: "text-[var(--text)]",
    brand: "text-brand-500",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
    info: "text-info",
  };
  return (
    <div className="surface p-4">
      <div className="flex items-center gap-2 mb-1.5">
        {icon && <span className={cn("shrink-0", tones[tone])}>{icon}</span>}
        <span className="text-xs font-medium muted uppercase tracking-wide">{label}</span>
      </div>
      <div className={cn("text-2xl font-semibold tabular-nums leading-none", tones[tone])}>
        {value}
      </div>
      {sub && <div className="text-xs muted mt-1.5">{sub}</div>}
    </div>
  );
}

/* --------------------------------------------------------------- Tab group */

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: { id: T; label: string; count?: number }[];
  active: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex gap-1 p-1 rounded-xl bg-[var(--surface-sunken)] border border-[var(--border)]",
        className,
      )}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap",
            active === tab.id
              ? "bg-[var(--surface-raised)] shadow-sm text-[var(--text)]"
              : "muted hover:text-[var(--text)]",
          )}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className="ml-1.5 text-xs opacity-70 tabular-nums">{tab.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
