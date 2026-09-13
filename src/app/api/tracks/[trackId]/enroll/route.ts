import { ApiError, json, requireApiUser, route } from "@/lib/api";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ trackId: string }> };

export const POST = route<Ctx>(async (req, ctx) => {
  const claims = await requireApiUser(req);
  const { trackId } = await ctx.params;

  const track = await prisma.track.findUnique({ where: { id: trackId } });
  if (!track) throw new ApiError(404, "That learning path does not exist.", "not_found");

  // The first path a learner joins becomes their primary; the dashboard
  // "continue where you left off" card follows it.
  const existingCount = await prisma.enrollment.count({ where: { userId: claims.sub } });

  const enrollment = await prisma.enrollment.upsert({
    where: { userId_trackId: { userId: claims.sub, trackId } },
    update: {},
    create: { userId: claims.sub, trackId, isPrimary: existingCount === 0 },
  });

  return json({ enrollment });
});

export const DELETE = route<Ctx>(async (req, ctx) => {
  const claims = await requireApiUser(req);
  const { trackId } = await ctx.params;
  await prisma.enrollment.deleteMany({ where: { userId: claims.sub, trackId } });
  return json({ ok: true });
});
