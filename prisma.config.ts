import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "prisma/config";

// A Prisma config file turns off the CLI's own .env loading ("Prisma config
// detected, skipping environment variable loading"), so `npm run db:migrate`
// after `cp .env.example .env` — the documented first run — failed with
// "Environment variable not found: DATABASE_URL" unless the shell happened to
// export it. CI never caught this because it sets DATABASE_URL in the job env.
// Load it here, without adding a dotenv dependency: process.loadEnvFile exists
// from Node 20.12, and anything already exported wins, so CI and hosts that
// inject real environment variables are unaffected.
const envFile = path.join(process.cwd(), ".env");
if (fs.existsSync(envFile) && typeof process.loadEnvFile === "function") {
  process.loadEnvFile(envFile);
}

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
