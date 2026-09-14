import { ConversationLauncher } from "@/components/conversation-launcher";
import { hasLiveAI } from "@/lib/env";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Conversation" };
export const dynamic = "force-dynamic";

export default async function TutorPage() {
  await requireUser();
  return (
    <ConversationLauncher
      mode="TUTOR"
      liveAI={hasLiveAI()}
      title="Conversation partner"
      description="Free-form dialogue with error correction and higher-level rephrasings. Your partner engages with what you actually said — it will disagree, add information and push you to develop a point."
    />
  );
}
