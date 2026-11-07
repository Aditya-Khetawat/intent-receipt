import { appStatus } from "@/lib/views";
import { env } from "@/lib/env";
import { ShopClient } from "@/components/ShopClient";

export const dynamic = "force-dynamic";

export default async function ShopPage({ searchParams }: PageProps<"/shop">) {
  const sp = await searchParams;
  const s = appStatus();
  const prompt = typeof sp.prompt === "string" ? sp.prompt.slice(0, 600) : "";
  return (
    <ShopClient
      initialPrompt={prompt}
      paypalClientId={s.paypal.configured ? env.publicPaypalClientId : ""}
      aiAvailable={s.ai.available}
      aiModel={`${s.ai.provider} · ${s.ai.agentModel}`}
    />
  );
}
