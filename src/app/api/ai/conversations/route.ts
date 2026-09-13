import { json, parseBody, requireApiUser, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { openingLine } from "@/lib/ai/tutor";
import { startConversationSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const claims = await requireApiUser(req);
  const conversations = await prisma.conversation.findMany({
    where: { userId: claims.sub },
    orderBy: { updatedAt: "desc" },
    take: 30,
    select: {
      id: true, mode: true, topic: true, cefr: true, aiStance: true,
      status: true, createdAt: true, updatedAt: true,
      _count: { select: { messages: true } },
    },
  });
  return json({ conversations });
});

/** Opens a conversation and seeds the AI's first turn so the learner arrives
 *  at something to respond to rather than a blank box. */
export const POST = route(async (req) => {
  const claims = await requireApiUser(req);
  const body = await parseBody(req, startConversationSchema);

  const profile = await prisma.profile.findUnique({ where: { userId: claims.sub } });
  const cefr = profile?.cefrLevel ?? "B2";

  // In debate mode the AI takes the side the learner did not choose; if the
  // learner did not state one, it argues against the motion by default.
  const aiStance =
    body.mode === "DEBATE"
      ? body.aiStance ??
        (body.userStance ? `against the position that ${body.userStance}` : "against the motion")
      : null;

  const conversation = await prisma.conversation.create({
    data: {
      userId: claims.sub,
      mode: body.mode,
      topic: body.topic,
      cefr,
      persona: body.persona ?? null,
      userStance: body.userStance ?? null,
      aiStance,
      messages: {
        create: {
          role: "ASSISTANT",
          content: openingLine(body.mode, body.topic, aiStance),
        },
      },
    },
    include: { messages: true },
  });

  return json({ conversation }, { status: 201 });
});
