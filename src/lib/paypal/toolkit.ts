import { env, assertSandbox } from "@/lib/env";
import { PayPalNotConfiguredError } from "./client";

// PayPal Agent Toolkit (@paypal/agent-toolkit/ai-sdk). The toolkit ships tools
// built for AI SDK v4 ({ description, parameters, execute }). This app uses AI SDK
// v7, so we call the toolkit tools' `execute` directly and re-expose the ones the
// agent needs as v7 tools (see src/lib/ai/agent.ts). Restricted to the minimum
// read-only set; order creation goes through our guarded REST call because the
// toolkit's create_order cannot set purchase_units[].custom_id (see docs/PAYPAL_NOTES.md).

type ToolkitTool = { description: string; execute: (args: unknown, opts: unknown) => Promise<unknown> };

const g = globalThis as unknown as { __ppToolkit?: Record<string, ToolkitTool> };

export const TOOLKIT_ACTIONS = {
  orders: { get: true },
  disputes: { get: true, list: true },
};

async function tools(): Promise<Record<string, ToolkitTool>> {
  assertSandbox();
  if (!env.paypalConfigured) throw new PayPalNotConfiguredError();
  if (!g.__ppToolkit) {
    const { PayPalAgentToolkit } = await import("@paypal/agent-toolkit/ai-sdk");
    const tk = new PayPalAgentToolkit({
      clientId: env.paypalClientId,
      clientSecret: env.paypalClientSecret,
      configuration: { actions: TOOLKIT_ACTIONS, context: { sandbox: true } },
    });
    g.__ppToolkit = tk.getTools() as unknown as Record<string, ToolkitTool>;
  }
  return g.__ppToolkit;
}

async function call(name: string, args: Record<string, unknown>): Promise<unknown> {
  const t = (await tools())[name];
  if (!t) throw new Error(`PayPal Agent Toolkit tool ${name} is not enabled`);
  const out = await t.execute(args, { toolCallId: `ir-${Date.now()}`, messages: [] });
  if (typeof out === "string") {
    try {
      return JSON.parse(out);
    } catch {
      return out;
    }
  }
  return out;
}

/** Toolkit `get_order` tool. */
export const toolkitGetOrder = (id: string) => call("get_order", { id });
/** Toolkit `get_dispute` tool. */
export const toolkitGetDispute = (disputeId: string) => call("get_dispute", { dispute_id: disputeId });
