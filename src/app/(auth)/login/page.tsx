"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";

import { Button, ErrorMessage, Input } from "@/components/ui";
import { api, ApiClientError } from "@/lib/client";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const nextPath = params.get("next");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await api.post<{ next: string }>("/api/auth/login", { email, password });
      // The server decides where to send you — an unplaced learner goes to the
      // placement test regardless of where they were trying to reach.
      router.push(nextPath && result.next === "/dashboard" ? nextPath : result.next);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : "Something went wrong. Please try again.",
      );
      setLoading(false);
    }
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="text-sm muted mt-1.5 mb-8">Pick up where you left off.</p>

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <ErrorMessage>{error}</ErrorMessage>}

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

        <Input
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <Button type="submit" loading={loading} fullWidth size="lg">
          Sign in
        </Button>
      </form>

      <p className="text-sm muted mt-6">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="text-brand-600 dark:text-brand-400 font-medium hover:underline">
          Create one
        </Link>
      </p>

      <div className="mt-8 p-3.5 rounded-lg surface-sunken text-xs">
        <p className="font-medium mb-1">Demo account</p>
        <p className="muted">
          demo@lexicon.app · lexicon-demo-2024 — a C1 learner with two weeks of history, a review
          queue and enrolled paths.
        </p>
      </div>
    </>
  );
}

export default function LoginPage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense fallback={<div className="h-64" />}>
      <LoginForm />
    </Suspense>
  );
}
