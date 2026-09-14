import { ApiError, json, requireApiUser, route } from "@/lib/api";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (req, ctx) => {
  const claims = await requireApiUser(req);
  const { id } = await ctx.params;

  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });

  if (!conversation || conversation.userId !== claims.sub) {
    throw new ApiError(404, "Conversation not found", "not_found");
  }
  return json({ conversation });
});

export const DELETE = route<Ctx>(async (req, ctx) => {
  const claims = await requireApiUser(req);
  const { id } = await ctx.params;
  await prisma.conversation.deleteMany({ where: { id, userId: claims.sub } });
  return json({ ok: true });
});
