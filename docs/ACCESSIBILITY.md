# Accessibility

Target: **WCAG 2.1 Level AA**. This document states the position feature by feature,
including where it falls short.

---

## Perceivable

**Text alternatives (1.1.1).** Every icon is either `aria-hidden` beside a text label or
carries an `aria-label`. Icon-only controls — the theme toggle, audio playback, reorder
buttons, the microphone — all have labels that name both the action and its current state
("Theme: Dark. Switch to system.").

**Colour is never the only signal (1.4.1).**

| Where | Signal beyond colour |
|---|---|
| CEFR level | The text "B2" / "C1" / "C2" is inside the chip |
| Exercise feedback | A tick or cross icon, plus "Correct" / "Not quite" in words |
| Review grading | Text label and a keyboard number on every button |
| Pronunciation word scores | A legend maps every colour to words; each word also has a `title` |
| Correction severity | The type is spelled out ("grammar", "register") |
| Exam task navigation | Answered state carries a border style, not only a fill |

**Contrast (1.4.3).** Colours are OKLCH tokens with lightness chosen for contrast in both
themes. Body text and muted text meet 4.5:1; large text and UI boundaries meet 3:1. A
**high-contrast mode** in Settings raises this further, to AAA for body text, and is
applied before first paint.

**Resize text (1.4.4).** The viewport sets `maximumScale: 5` — pinch-zoom is explicitly
not disabled. Settings also offers 85–150% interface scaling, applied via a CSS custom
property on `:root` so rem-based spacing scales proportionally rather than breaking
layout.

**Reflow (1.4.10).** Every page is usable at 320 CSS pixels with no horizontal scrolling,
verified with an automated overflow check at 390 px.

---

## Operable

**Keyboard (2.1.1).** Everything is reachable and operable by keyboard. Two flows are
designed keyboard-first:

- **Review**: `Space` reveals, `1`–`4` grade. A learner grading sixty cards never touches
  the mouse.
- **Lessons**: `Enter` checks the answer, then advances. Ignored inside a textarea, where
  `Enter` is a newline the learner actually wants.

Shortcut hints are hidden below `sm`, where they describe keys the user does not have.

**Reordering without drag-and-drop (2.1.1, 2.5.1).** `DRAG_ORDER` exercises use up/down
buttons. Native HTML drag-and-drop is unusable with a keyboard and unreliable on touch;
buttons work everywhere, announce correctly, and are faster on a phone.

**No keyboard trap (2.1.2).** No modal dialogs. The mobile navigation drawer closes on
`Escape` and on navigation.

**Timing (2.2.1).** The only timed feature is exam practice, where the time limit is the
point — and it is stated before the attempt starts, with a live countdown and a warning
before leaving the page. Nothing else expires. Session expiry is handled by silent
refresh, so a learner is never interrupted mid-lesson.

**Motion (2.3.3).** `prefers-reduced-motion` is honoured in CSS, and Settings offers an
in-app override in both directions — for people whose operating system does not expose the
setting, and for people who want motion despite a system-wide preference.

**Skip link (2.4.1).** The first tab stop on every page jumps to `#main`.

**Page titles (2.4.2).** Every route sets a title through Next.js metadata.

**Focus visible (2.4.7).** A 2 px brand-coloured outline with offset, applied via
`:focus-visible` so keyboard users get it and mouse users do not get the outline everyone
disables and then forgets to re-add.

---

## Understandable

**Language (3.1.1).** `<html lang="en">`.

**Consistent navigation and identification (3.2.3, 3.2.4).** The sidebar is identical on
every page, with `aria-current="page"` on the active item. Components are used
consistently — a `Pill` always means a small status label, a `Progress` always means
proportion of a whole.

**Error identification and suggestion (3.3.1, 3.3.3).** Form errors use `role="alert"`,
`aria-invalid` and `aria-describedby`, and they say what to do rather than what went
wrong: "Use at least 10 characters — length beats complexity" rather than "Invalid
password". Password requirements are shown live with `aria-live="polite"` as the learner
types, so nobody is told after submitting.

---

## Robust

**Parsing and name/role/value (4.1.1, 4.1.2).** Semantic HTML throughout: `<nav>`,
`<main>`, `<header>`, `<fieldset>`/`<legend>` for exercise options, `<dl>` for statistics,
real `<label>` elements. Custom controls carry the right roles — `role="switch"` with
`aria-checked` for toggles, `role="progressbar"` with value attributes, `role="tablist"`
with `aria-selected`, `role="timer"` for the exam countdown.

**Status messages (4.1.3).** Exercise feedback uses `role="status"` with
`aria-live="polite"`, so it is announced without stealing focus. The exam timer escalates
to `aria-live="assertive"` in its final minute. Loading buttons set `aria-busy`.

---

## Known gaps

- **No captions on bundled media (1.2.2).** The app ships no audio or video files; the
  `<audio>` element used for dictation includes a `<track kind="captions">` slot, and any
  media added must supply one. Listening exercises currently ship transcripts as text,
  which is a stronger position but not a substitute if audio is added.
- **Speech recognition is browser-dependent.** Firefox does not implement it. Every
  speech surface detects support and offers a typed alternative with an explanation —
  the feature degrades, it does not vanish.
- **Not tested with real assistive technology.** Semantics and keyboard flows were built
  to specification and verified by inspection and automated checks. A pass with NVDA,
  JAWS and VoiceOver — and, more importantly, with people who use them daily — has not
  happened and should before any accessibility claim is made publicly.
- **No CSP.** See [SECURITY.md](SECURITY.md#deliberately-not-implemented).

---

## Testing what you add

1. **Unplug the mouse.** If you cannot complete the flow, neither can a keyboard user.
2. **Tab through it.** Focus must be visible at every stop and must not jump around.
3. **Zoom to 200%.** Nothing may be clipped or require horizontal scrolling.
4. **Check both themes** at the high-contrast setting.
5. **Narrow to 320 px.** No horizontal overflow.
6. **Turn on reduced motion** and confirm nothing depends on an animation to be
   understood.
