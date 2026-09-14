import type { Prisma } from "@prisma/client";

import { ApiError, enforceRateLimit, json, parseBody, requireApiUser, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { respond } from "@/lib/ai/tutor";
import { recordActivity } from "@/lib/services/progress";
import { sendMessageSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * One conversational turn: store the learner's message, get a reply with
 * corrections, store that, award XP, and return both.
 */
export const POST = route(async (req) => {
  const claims = await requireApiUser(req);
  enforceRateLimit(req, "ai-chat", serverEnv().RATE_LIMIT_AI_PER_MIN, claims.sub);

  const { conversationId, message } = await parseBody(req, sendMessageSchema);

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { messages: { orderBy: { createdAt: "asc" }, take: 40 } },
  });
  if (!conversation || conversation.userId !== claims.sub) {
    throw new ApiError(404, "Conversation not found", "not_found");
  }

  const turn = await respond({
    mode: conversation.mode,
    topic: conversation.topic,
    cefr: conversation.cefr,
    persona: conversation.persona,
    aiStance: conversation.aiStance,
    userStance: conversation.userStance,
    history: conversation.messages.map((m) => ({
      role: m.role === "USER" ? "USER" : "ASSISTANT",
      content: m.content,
    })),
    message,
  });

  const [userMessage, assistantMessage] = await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId,
        role: "USER",
        content: message,
        corrections: turn.corrections as unknown as Prisma.InputJsonValue,
        suggestions: turn.upgrades as unknown as Prisma.InputJsonValue,
        metrics: turn.metrics as unknown as Prisma.InputJsonValue,
      },
    }),
    prisma.message.create({
      data: { conversationId, role: "ASSISTANT", content: turn.reply },
    }),
    prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    }),
  ]);

  const isDebate = conversation.mode === "DEBATE";
  const rewards = await recordActivity({
    userId: claims.sub,
    source: isDebate ? "debateTurn" : "speakingTurn",
    refId: conversationId,
    // Accuracy relative to length: a long accurate turn earns most.
    scoreRatio: Math.max(
      0.3,
      1 - turn.metrics.errorCount / Math.max(8, turn.metrics.wordCount / 12),
    ),
    skill: conversation.mode === "EXAM_SPEAKING" ? "SPEAKING" : "WRITING",
    challengeContributions: { SPEAKING_MINUTES: 1 },
  });

  return json({
    userMessage,
    assistantMessage,
    corrections: turn.corrections,
    upgrades: turn.upgrades,
    followUp: turn.followUp,
    metrics: turn.metrics,
    source: turn.source,
    rewards,
  });
});
