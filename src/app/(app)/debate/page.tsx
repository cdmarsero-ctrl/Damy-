import { ConversationLauncher } from "@/components/conversation-launcher";
import { hasLiveAI } from "@/lib/env";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Debate" };
export const dynamic = "force-dynamic";

export default async function DebatePage() {
  await requireUser();
  return (
    <ConversationLauncher
      mode="DEBATE"
      liveAI={hasLiveAI()}
      title="Debate practice"
      description="Pick a motion and a side. Your opponent takes the other and holds it — it attacks the weakest link in your reasoning and concedes only what it genuinely must. Argumentative discourse markers are modelled for you to absorb."
    />
  );
}
