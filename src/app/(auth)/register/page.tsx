"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { Check, X } from "lucide-react";

import { Button, ErrorMessage, Input } from "@/components/ui";
import { api, ApiClientError } from "@/lib/client";
import { cn } from "@/lib/utils";

/** Mirrors the server rules in src/lib/validation.ts. The server remains the
 *  authority; this exists so a learner is not told after submitting. */
function passwordChecks(value: string) {
  return [
    { label: "At least 10 characters", ok: value.length >= 10 },
    { label: "More than four distinct characters", ok: new Set(value).size > 4 },
    { label: "Not an obvious password", ok: !/^(password|12345678|qwerty)/i.test(value) },
  ];
}

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(false);

  const checks = useMemo(() => passwordChecks(password), [password]);
  const passwordValid = checks.every((c) => c.ok);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await api.post<{ next: string }>("/api/auth/register", {
        name,
        email,
        password,
      });
      router.push(result.next);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "validation_error") {
        const details = err.details as { path: string; message: string }[] | undefined;
        setError(details?.[0]?.message ?? err.message);
      } else {
        setError(
          err instanceof ApiClientError ? err.message : "Something went wrong. Please try again.",
        );
      }
      setLoading(false);
    }
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
      <p className="text-sm muted mt-1.5 mb-8">
        You&apos;ll take a short adaptive placement test next — about ten minutes.
      </p>

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <ErrorMessage>{error}</ErrorMessage>}

        <Input
          label="Name"
          name="name"
          autoComplete="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="How should we address you?"
        />

        <Input
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />

        <div>
          <Input
            label="Password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={() => setTouched(true)}
          />
          {(touched || password.length > 0) && (
            <ul className="mt-2.5 space-y-1" aria-live="polite">
              {checks.map((check) => (
                <li
                  key={check.label}
                  className={cn(
                    "flex items-center gap-1.5 text-xs",
                    check.ok ? "text-success" : "muted",
                  )}
                >
                  {check.ok ? (
                    <Check className="size-3.5 shrink-0" aria-hidden />
                  ) : (
                    <X className="size-3.5 shrink-0 opacity-50" aria-hidden />
                  )}
                  {check.label}
                </li>
              ))}
            </ul>
          )}
        </div>

        <Button type="submit" loading={loading} fullWidth size="lg" disabled={!passwordValid}>
          Create account
        </Button>
      </form>

      <p className="text-sm muted mt-6">
        Already have an account?{" "}
        <Link href="/login" className="text-brand-600 dark:text-brand-400 font-medium hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
