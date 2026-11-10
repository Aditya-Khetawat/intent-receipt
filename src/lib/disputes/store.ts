import { getDb, bool } from "@/lib/db";
import type { Analysis } from "@/lib/ai/schemas";
import type { ValidationResult } from "@/lib/ai/validator";

export type DisputeStatus = "RECEIVED" | "ANALYZING" | "READY_FOR_REVIEW" | "SUBMITTED" | "RESOLVED" | "ERROR";

export interface DisputeRow {
  id: string;
  paypal_dispute_id: string;
  order_id: string | null;
  status: DisputeStatus;
  reason: string;
  amount_cents: number;
  currency: string;
  payload: Record<string, unknown>;
  simulated: boolean;
  scenario: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: string;
  author_role: string;
  content: string;
  posted_at: string;
}

export interface StoredValidation extends ValidationResult {
  dropped: number;
  attempts: number;
  needs_human_review: boolean;
  injection_flagged: boolean;
  /** Classification/action contradictions left after the corrective re-run (absent on older rows). */
  decision_conflicts?: string[];
}

export interface AnalysisRow {
  id: string;
  dispute_id: string;
  provider: string;
  model: string;
  prompt_version: string;
  input_sha256: string;
  output: Analysis;
  validation: StoredValidation;
  cached: boolean;
  cache_origin: string | null;
  duration_ms: number | null;
  created_at: string;
}

export interface ActionRow {
  id: string;
  dispute_id: string;
  type: string;
  request_preview: { method: string; path: string; body: unknown; attachments?: { name: string; bytes: number; sha256: string }[] };
  response: unknown;
  simulated: boolean;
  approved_by: string;
  created_at: string;
}

type Raw<T> = Record<keyof T, unknown> & Record<string, unknown>;

function toDispute(r: Raw<DisputeRow>): DisputeRow {
  const { payload_json, ...rest } = r as Raw<DisputeRow> & { payload_json: string };
  return { ...(rest as unknown as DisputeRow), payload: JSON.parse(payload_json), simulated: bool(r.simulated) };
}

export function getDispute(id: string): DisputeRow | null {
  const r = getDb().prepare("SELECT * FROM disputes WHERE id = ? OR paypal_dispute_id = ?").get(id, id) as Raw<DisputeRow> | undefined;
  return r ? toDispute(r) : null;
}

export function listDisputes(): DisputeRow[] {
  return (getDb().prepare("SELECT * FROM disputes ORDER BY created_at DESC").all() as Raw<DisputeRow>[]).map(toDispute);
}

export function disputeMessages(disputeId: string): MessageRow[] {
  return getDb()
    .prepare("SELECT id, author_role, content, posted_at FROM dispute_messages WHERE dispute_id = ? ORDER BY posted_at, rowid")
    .all(disputeId) as MessageRow[];
}

function toAnalysis(r: Record<string, unknown>): AnalysisRow {
  const { output_json, validation_json, ...rest } = r as Record<string, unknown> & { output_json: string; validation_json: string };
  return {
    ...(rest as unknown as AnalysisRow),
    output: JSON.parse(output_json),
    validation: JSON.parse(validation_json),
    cached: bool(r.cached),
  };
}

export function latestAnalysis(disputeId: string): AnalysisRow | null {
  const r = getDb().prepare("SELECT * FROM analyses WHERE dispute_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1").get(disputeId) as
    | Record<string, unknown>
    | undefined;
  return r ? toAnalysis(r) : null;
}

export function analysisByInput(inputSha: string, promptVersion: string, model: string): AnalysisRow | null {
  const r = getDb()
    .prepare(
      "SELECT * FROM analyses WHERE input_sha256 = ? AND prompt_version = ? AND model = ? AND cached = 0 ORDER BY created_at DESC LIMIT 1",
    )
    .get(inputSha, promptVersion, model) as Record<string, unknown> | undefined;
  return r ? toAnalysis(r) : null;
}

export function listActions(disputeId: string): ActionRow[] {
  return (getDb().prepare("SELECT * FROM actions WHERE dispute_id = ? ORDER BY created_at").all(disputeId) as Record<string, unknown>[]).map(
    (r) => {
      const { request_preview_json, response_json, ...rest } = r as Record<string, unknown> & {
        request_preview_json: string;
        response_json: string | null;
      };
      return {
        ...(rest as unknown as ActionRow),
        request_preview: JSON.parse(request_preview_json),
        response: response_json ? JSON.parse(response_json) : null,
        simulated: bool(r.simulated),
      };
    },
  );
}

export function setDisputeStatus(id: string, status: DisputeStatus, error: string | null = null) {
  getDb().prepare("UPDATE disputes SET status = ?, error = ?, updated_at = ? WHERE id = ?").run(status, error, new Date().toISOString(), id);
}
