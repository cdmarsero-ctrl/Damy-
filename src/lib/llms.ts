/**
 * llms.txt — a plain-text description of the site for language models.
 *
 * The format (https://llmstxt.org) is a Markdown file at /llms.txt: an H1
 * with the site name, a blockquote summary, free-form context, then H2
 * sections of links with one-line descriptions. /llms-full.txt carries the
 * full text of every public page so an assistant can answer from it without
 * crawling. Both are generated from the same data as the HTML pages, so they
 * cannot drift from what a visitor sees.
 */

import {
  absoluteUrl,
  PUBLIC_PAGES,
  SITE_AUTHOR,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_TAGLINE_LOWER,
  SOURCE_REPOSITORY,
} from "./site";
import {
  EXAMS,
  FAQ,
  FEATURES,
  INFO_PAGES,
  infoPageToMarkdown,
  LEVELS,
} from "./site-content";

const NAVIGABLE = PUBLIC_PAGES.filter((page) => page.path !== "/login" && page.path !== "/register");

function contactLines(): string[] {
  const lines: string[] = [];
  if (SITE_AUTHOR.name) {
    lines.push(`- Made by: ${SITE_AUTHOR.name}${SITE_AUTHOR.url ? ` (${SITE_AUTHOR.url})` : ""}`);
  }
  if (SITE_AUTHOR.email) lines.push(`- Contact: ${SITE_AUTHOR.email}`);
  for (const link of SITE_AUTHOR.sameAs) lines.push(`- Profile: ${link}`);
  if (SOURCE_REPOSITORY) lines.push(`- Source code: ${SOURCE_REPOSITORY}`);
  return lines;
}

export function buildLlmsTxt(): string {
  const contact = contactLines();
  const parts = [
    `# ${SITE_NAME}`,
    "",
    `> ${SITE_DESCRIPTION}`,
    "",
    `${SITE_NAME} (${SITE_TAGLINE_LOWER}) is a web application for learners whose English is already upper-intermediate or better. It measures the learner's CEFR level with an adaptive placement test (12–22 questions), then builds a personalised path across five curricula: academic English, professional communication, idiomatic fluency, exam preparation and near-native nuance. Study is reinforced with spaced repetition, an AI conversation and debate partner, a writing studio with banded feedback, an on-device pronunciation lab, timed exam modules and analytics. It works offline and targets WCAG 2.1 AA.`,
    "",
    "Key facts:",
    "",
    "- Levels covered: CEFR B2, C1 and C2 only (not for beginners).",
    "- Exams: IELTS Academic, TOEFL iBT, Cambridge C1 Advanced (CAE), Cambridge C2 Proficiency (CPE).",
    "- Creating an account and taking the placement test is free.",
    "- Speech recognition runs in the browser; audio never leaves the device.",
    "- AI feedback is labelled; a deterministic rules engine takes over when no model is available.",
    `- Canonical URL: ${absoluteUrl("/")}`,
  ];

  if (contact.length) parts.push("", "About the maker:", "", ...contact);

  parts.push(
    "",
    "## Pages",
    "",
    ...NAVIGABLE.map((page) => `- [${page.title}](${absoluteUrl(page.path)}): ${page.description}`),
    "",
    "## Full content",
    "",
    `- [llms-full.txt](${absoluteUrl("/llms-full.txt")}): the complete text of every public page in one file.`,
    `- [Sitemap](${absoluteUrl("/sitemap.xml")}): every crawlable URL.`,
    "",
    "## Optional",
    "",
    `- [Sign in](${absoluteUrl("/login")}): existing learners.`,
    `- [Create an account](${absoluteUrl("/register")}): new learners start with the placement test.`,
    "",
  );

  return parts.join("\n");
}

export function buildLlmsFullTxt(): string {
  const contact = contactLines();
  const parts: string[] = [
    `# ${SITE_NAME} — ${SITE_TAGLINE}`,
    "",
    `> ${SITE_DESCRIPTION}`,
    "",
    `Canonical URL: ${absoluteUrl("/")}`,
    `Short summary and link index: ${absoluteUrl("/llms.txt")}`,
  ];

  if (contact.length) parts.push("", ...contact);

  parts.push(
    "",
    "---",
    "",
    "## Features",
    "",
    "Every feature exists because it addresses a specific reason advanced learners plateau.",
    "",
    ...FEATURES.flatMap((feature) => [`### ${feature.title}`, "", feature.summary, "", feature.detail, ""]),
    "---",
    "",
    "## Levels",
    "",
    "The Common European Framework of Reference (CEFR) describes six levels of language ability. Lexicon covers the top three.",
    "",
    ...LEVELS.flatMap((level) => [
      `### ${level.code} — ${level.name}`,
      "",
      level.cefr,
      "",
      `**Where you are.** ${level.where}`,
      "",
      `**Where you plateau.** ${level.plateau}`,
      "",
      "**What we work on:**",
      "",
      ...level.focus.map((item) => `- ${item}`),
      "",
    ]),
    "---",
    "",
    ...INFO_PAGES.flatMap((page) => [infoPageToMarkdown(page), "", "---", ""]),
    "## Exams at a glance",
    "",
    ...EXAMS.map(
      (exam) => `- **${exam.name}** (${exam.body}). ${exam.levels}. Modules: ${exam.modules.join("; ")}.`,
    ),
    "",
    "---",
    "",
    "## Frequently asked questions",
    "",
    ...FAQ.flatMap((item) => [`### ${item.question}`, "", item.answer, ""]),
  );

  return parts.join("\n");
}
