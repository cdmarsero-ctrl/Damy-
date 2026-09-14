import { json, parseBody, requireApiUser, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { settingsUpdateSchema } from "@/lib/validation";

export const runtime = "nodejs";

export const PATCH = route(async (req) => {
  const claims = await requireApiUser(req);
  const body = await parseBody(req, settingsUpdateSchema);

  const settings = await prisma.userSettings.upsert({
    where: { userId: claims.sub },
    update: body,
    create: { userId: claims.sub, ...body },
  });

  return json({ settings });
});
