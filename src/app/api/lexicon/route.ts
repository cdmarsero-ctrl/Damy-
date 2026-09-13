import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { json, parseQuery, requireApiUser, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { cefrSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  q: z.string().trim().max(80).optional(),
  cefr: cefrSchema.optional(),
  type: z
    .enum(["WORD", "COLLOCATION", "PHRASAL_VERB", "IDIOM", "SLANG", "ACADEMIC_PHRASE", "DISCOURSE_MARKER"])
    .optional(),
  register: z.enum(["SLANG", "INFORMAL", "NEUTRAL", "FORMAL", "ACADEMIC", "LITERARY"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
  cursor: z.string().optional(),
});

/** Browsable, filterable lexicon — idioms, collocations, phrasal verbs, slang. */
export const GET = route(async (req) => {
  const claims = await requireApiUser(req);
  const { q, cefr, type, register, limit, cursor } = parseQuery(req, querySchema);

  const where: Prisma.LexicalItemWhereInput = {
    ...(cefr ? { cefr } : {}),
    ...(type ? { type } : {}),
    ...(register ? { register } : {}),
    ...(q
      ? {
          OR: [
            { headword: { contains: q, mode: "insensitive" } },
            { definition: { contains: q, mode: "insensitive" } },
            { synonyms: { has: q.toLowerCase() } },
            { collocations: { has: q.toLowerCase() } },
          ],
        }
      : {}),
  };

  const items = await prisma.lexicalItem.findMany({
    where,
    orderBy: [{ frequency: "asc" }, { headword: "asc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = items.length > limit;
  const page = hasMore ? items.slice(0, limit) : items;

  // Mark which words are already in the learner's queue so the UI can show
  // "in review" rather than offering to add a duplicate.
  const cards = await prisma.reviewCard.findMany({
    where: { userId: claims.sub, lexicalItemId: { in: page.map((i) => i.id) } },
    select: { lexicalItemId: true, state: true, dueAt: true },
  });
  const byItem = new Map(cards.map((c) => [c.lexicalItemId, c]));

  return json({
    items: page.map((item) => ({ ...item, card: byItem.get(item.id) ?? null })),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  });
});
