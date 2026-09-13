import { json, parseBody, requireApiUser, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { profileUpdateSchema } from "@/lib/validation";

export const runtime = "nodejs";

export const PATCH = route(async (req) => {
  const claims = await requireApiUser(req);
  const body = await parseBody(req, profileUpdateSchema);
  const { name, examDate, ...profileFields } = body;

  if (name) {
    await prisma.user.update({ where: { id: claims.sub }, data: { name } });
  }

  const profile = await prisma.profile.upsert({
    where: { userId: claims.sub },
    update: {
      ...profileFields,
      ...(examDate !== undefined ? { examDate: examDate ? new Date(examDate) : null } : {}),
      // Setting any goal counts as finishing onboarding.
      ...(profileFields.goals?.length ? { onboardedAt: new Date() } : {}),
    },
    create: {
      userId: claims.sub,
      ...profileFields,
      ...(examDate ? { examDate: new Date(examDate) } : {}),
      ...(profileFields.goals?.length ? { onboardedAt: new Date() } : {}),
    },
  });

  return json({ profile });
});
