# Security

---

## Threat model

Lexicon stores learner-generated text (writing submissions, conversation turns), progress
data and credentials. It does not store payment details, government identifiers or audio.
The realistic threats are account takeover, cross-tenant data access, and abuse of the
paid model provider.

---

## Authentication

**Passwords** are hashed with bcrypt at cost 12 — roughly 250 ms on commodity hardware,
slow enough to matter against offline cracking and fast enough that login does not feel
broken.

The policy follows NIST 800-63B: **length over composition**. Ten characters minimum, a
check against common breached passwords, and a repetition check. No forced symbol, because
that requirement produces `Password1!` and nothing else.

**Access tokens** are HS256 JWTs with a 30-minute default lifetime, carrying `sub`,
`email`, `name` and `role`, with issuer and audience both verified. Short-lived and
stateless, so the common "is this authenticated?" check costs no database round trip.

**Refresh tokens** are opaque 48-byte random values. Only a SHA-256 hash is stored, so a
database leak cannot be replayed. They rotate on every use, and **presenting an
already-consumed token revokes the entire session family** — the standard mitigation for
token theft. The attacker and the victim cannot both keep using the chain; whoever
refreshes second logs everyone out, which surfaces the compromise.

**Cookies** are `httpOnly`, `sameSite=lax`, `secure` in production, `path=/`. Nothing
touches `localStorage`, so an XSS bug cannot exfiltrate a session.

**Timing.** An unknown email is compared against a fixed dummy hash so a missing account
and a wrong password take the same time to answer. Without this, response timing
enumerates registered addresses.

---

## Authorisation

**Middleware is a gate, not the boundary.** `src/middleware.ts` runs on the Edge runtime
and cannot reach Prisma. It verifies the token signature so unauthenticated visitors are
redirected cheaply — and that is all. Every route handler independently calls
`requireApiUser`; every server component independently calls `requireUser`.

This matters because Next.js middleware has had several published bypasses. Treating it as
a performance optimisation means such a bypass costs a redirect, not a data breach.

**Ownership is checked on every resource**, and a resource owned by another user returns
**404, not 403**, so the endpoints cannot be used to probe for valid ids.

---

## Input validation

Every request body and query string is parsed through a Zod schema in
`src/lib/validation.ts`. Route handlers never touch `req.json()` directly. A validation
failure returns 422 with field-level detail; it never reaches the database layer.

Exercise responses use a tagged union, so the grader cannot be handed a shape it does not
expect.

---

## Answer-key protection

`Exercise.solution` and `ExamTask.solution` are excluded from every read path a browser
can observe — including the RSC payload of the lesson page, which is why that page uses an
explicit `select` rather than a convenient `include`. A server component's props are
serialised into the page and readable by anyone.

Exam rubrics and solutions are released only after `POST /api/exams/submit` scores the
attempt.

The smoke test asserts both directly.

---

## SQL injection

Prisma parameterises everything. The one raw query in the documentation
(`SELECT 1` for a health check) takes no user input. `src/app/api/lexicon/route.ts` builds
a `where` object from validated enum values and a length-capped search string — Prisma's
`contains` is parameterised, not interpolated.

---

## XSS

React escapes by default. `dangerouslySetInnerHTML` appears exactly once, in
`src/components/layout/theme-script.tsx`, where the content is a hard-coded constant with
no interpolation — it must be a blocking inline script to prevent a flash of the wrong
theme.

Lesson content is Markdown, but it is parsed into React elements by
`src/components/markdown.tsx` rather than converted to an HTML string, so there is no
injection surface even if content later becomes user-authored. Link hrefs are restricted
to `https?:` and in-app paths, blocking `javascript:` and `data:` URLs.

---

## CSRF

Cookies are `sameSite=lax`, which blocks cross-site POSTs. All mutating endpoints are
POST, PATCH or DELETE — never GET — so a cross-site `<img>` or link cannot trigger one.

---

## Rate limiting

| Scope | Default | Applied to |
|---|---|---|
| Auth | 10/min per IP | Register, login |
| AI | 20/min per user | Conversation, writing, outline |

The AI limits protect the paid provider from a compromised or abusive account. The limiter
is in-process; see [EXTENDING.md](EXTENDING.md#rate-limiting) for the Redis version needed
behind multiple instances.

---

## Response headers

Set in `next.config.ts` for every response:

| Header | Value |
|---|---|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), geolocation=(), microphone=(self), interest-cohort=()` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` |

The microphone is allowed for `self` because pronunciation practice genuinely needs it;
everything else is denied.

---

## Error handling

`route()` in `src/lib/api.ts` wraps every handler. Unexpected errors are logged
server-side and returned as a generic `internal_error` — stack traces, Prisma error codes
and query fragments never reach the client.

---

## Privacy

**Audio never leaves the device.** The browser's `SpeechRecognition` API transcribes
locally (or via the browser vendor's own service, outside our control and outside our
storage), and only the resulting text reaches the server. No recording is stored.

**What is sent to the model provider**: the learner's text, the topic and their CEFR
level. **What is not**: email address, name, user id, or any audio.

**Erasure** is a single statement. Every user-owned row cascades from `User`, so
`prisma.user.delete({ where: { id } })` satisfies a GDPR erasure request completely.

---

## Deliberately not implemented

Stated so the gaps are known rather than assumed:

| Not implemented | Reasoning |
|---|---|
| Email verification | Nothing gated behind a verified address. `User.emailVerified` exists for when something is |
| Password reset | Requires an email provider, which the app does not otherwise need. The flow is well-understood: a single-use, short-lived, hashed token |
| Two-factor authentication | Disproportionate for a learning app with no payment data. `AuthSession` is structured to accommodate it |
| Account lockout | Rate limiting covers credential stuffing without giving an attacker a denial-of-service against a known address |
| Content Security Policy | Next.js inline scripts need either a nonce or `unsafe-inline`; a nonce-based CSP is worth adding and is genuine work. The XSS surface is minimal in the meantime |
| Audit log | `XpEvent`, `ReviewLog`, `ExerciseAttempt` and `SyncMutation` provide an activity trail, but there is no security-event log |

---

## Reporting a vulnerability

Open a private security advisory on the repository rather than a public issue.
