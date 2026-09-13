import { ApiError, json, parseBody, requireApiUser, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { addCardSchema } from "@/lib/validation";

export const runtime = "nodejs";

/** Manually add a word to the review queue from the lexicon browser. */
export const POST = route(async (req) => {
  const claims = await requireApiUser(req);
  const { lexicalItemId } = await parseBody(req, addCardSchema);

  const item = await prisma.lexicalItem.findUnique({ where: { id: lexicalItemId } });
  if (!item) throw new ApiError(404, "Word not found", "not_found");

  const card = await prisma.reviewCard.upsert({
    where: { userId_lexicalItemId: { userId: claims.sub, lexicalItemId } },
    update: { suspended: false },
    create: { userId: claims.sub, lexicalItemId },
  });

  return json({ card }, { status: 201 });
});

export const DELETE = route(async (req) => {
  const claims = await requireApiUser(req);
  const { lexicalItemId } = await parseBody(req, addCardSchema);
  await prisma.reviewCard.deleteMany({ where: { userId: claims.sub, lexicalItemId } });
  return json({ ok: true });
});
