import { InterpreterConsole } from "@/components/interpreter/interpreter-console";
import { serverEnv } from "@/lib/env";
import { liveKitConfig } from "@/lib/interpreter/livekit";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Live interpreter" };
export const dynamic = "force-dynamic";

export default async function InterpreterPage() {
  await requireUser();
  return <InterpreterConsole available={liveKitConfig(serverEnv()) !== null} />;
}
