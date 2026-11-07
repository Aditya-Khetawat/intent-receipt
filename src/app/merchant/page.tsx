import type { Metadata } from "next";
import { disputeQueue, merchantMetrics, ordersView, appStatus } from "@/lib/views";
import { MerchantConsole } from "@/components/MerchantConsole";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Merchant console" };

export default function MerchantPage() {
  return (
    <MerchantConsole
      initialRows={disputeQueue()}
      initialMetrics={merchantMetrics()}
      orders={ordersView()}
      demoMode={appStatus().demoMode}
    />
  );
}
