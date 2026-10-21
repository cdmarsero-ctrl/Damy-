import { VoiceAgent } from "@/components/voice-agent";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Voice (DAMI)" };
export const dynamic = "force-dynamic";

export default async function VoicePage() {
  await requireUser();
  return <VoiceAgent />;
}
