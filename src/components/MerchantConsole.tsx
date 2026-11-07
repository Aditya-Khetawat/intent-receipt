"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef, type GridApi, type ICellRendererParams } from "ag-grid-community";
import type { QueueRow } from "@/lib/views";
import { ACTION_TONE, Badge, FAULT_TONE, SourceBadge, humanize, money, shortDate } from "./ui";
import { simulateDispute } from "./SimulateDisputeButton";

ModuleRegistry.registerModules([AllCommunityModule]);

const gridTheme = themeQuartz.withParams({
  accentColor: "#0B6B6A",
  backgroundColor: "#FFFFFF",
  foregroundColor: "#14181F",
  borderColor: "#E4E0D8",
  headerBackgroundColor: "#F7F5F0",
  headerTextColor: "#4A5160",
  rowHoverColor: "#F3F7F6",
  fontFamily: "inherit",
  fontSize: 13,
  headerFontWeight: 600,
  wrapperBorderRadius: 10,
  spacing: 7,
});

interface Metrics {
  open: number;
  total: number;
  analyzed: number;
  verifiedRatio: number | null;
  avgAnalysisMs: number | null;
  byAction: Record<string, number>;
  byClass: Record<string, number>;
  agentFault: number;
}

interface OrderRowView {
  id: string;
  intent_id: string;
  product: string;
  buyer: string;
  amount_cents: number;
  currency: string;
  status: string;
  simulated: boolean;
  paypal_order_id: string;
  created_at: string;
}

const SORT_KEY = "ir.merchant.sort";

const StatusCell = (p: ICellRendererParams<QueueRow>) => {
  const s = p.data?.status;
  if (!s) return null;
  const tone = s === "READY_FOR_REVIEW" ? "accent" : s === "ERROR" ? "danger" : s === "SUBMITTED" || s === "RESOLVED" ? "success" : "neutral";
  return (
    <span className="inline-flex items-center gap-1.5">
      {(s === "ANALYZING" || s === "RECEIVED") && <span className="h-2 w-2 rounded-full bg-accent animate-pulse" aria-hidden />}
      <Badge tone={tone}>{humanize(s)}</Badge>
    </span>
  );
};

const columns: ColDef<QueueRow>[] = [
  { field: "paypal_dispute_id", headerName: "Dispute", width: 185, cellClass: "font-mono text-[12px]" },
  { field: "buyer", headerName: "Buyer", width: 130 },
  { field: "amount", headerName: "Amount", width: 100, valueFormatter: (p) => money(p.value ?? 0, p.data?.currency) },
  { field: "reason", headerName: "PayPal reason", width: 160, valueFormatter: (p) => humanize(String(p.value ?? "").replace("MERCHANDISE_OR_SERVICE_", "")) },
  {
    field: "classification",
    headerName: "Classification",
    width: 225,
    cellRenderer: (p: ICellRendererParams<QueueRow>) => (p.value ? <Badge tone="neutral">{humanize(p.value)}</Badge> : <span className="text-ink-3">—</span>),
  },
  {
    field: "confidence",
    headerName: "Confidence",
    width: 130,
    cellRenderer: (p: ICellRendererParams<QueueRow>) =>
      p.value === null || p.value === undefined ? (
        <span className="text-ink-3">—</span>
      ) : (
        <span className="flex items-center gap-2 h-full" aria-label={`${Math.round(p.value * 100)} percent`}>
          <span className="h-1.5 w-16 rounded bg-neutral-soft overflow-hidden">
            <span className="block h-full bg-accent" style={{ width: `${Math.round(p.value * 100)}%` }} />
          </span>
          <span className="text-xs">{Math.round(p.value * 100)}%</span>
        </span>
      ),
  },
  {
    field: "agent_fault",
    headerName: "Agent fault",
    width: 130,
    cellRenderer: (p: ICellRendererParams<QueueRow>) =>
      p.value ? <Badge tone={FAULT_TONE[p.value] ?? "neutral"}>{p.value === "LIKELY" ? "Agent fault" : humanize(p.value)}</Badge> : <span className="text-ink-3">—</span>,
  },
  {
    field: "recommended_action",
    headerName: "Recommended",
    width: 190,
    cellRenderer: (p: ICellRendererParams<QueueRow>) => (p.value ? <Badge tone={ACTION_TONE[p.value] ?? "neutral"}>{humanize(p.value)}</Badge> : <span className="text-ink-3">—</span>),
  },
  { field: "status", headerName: "Status", width: 170, cellRenderer: StatusCell },
  {
    headerName: "Source",
    colId: "source",
    width: 190,
    valueGetter: (p) => `${p.data?.simulated ? "SIMULATED" : "REAL"}${p.data?.cached ? " CACHED" : ""}`,
    cellRenderer: (p: ICellRendererParams<QueueRow>) => (p.data ? <SourceBadge simulated={p.data.simulated} cached={p.data.cached} /> : null),
  },
  { field: "opened_at", headerName: "Opened", width: 160, valueFormatter: (p) => (p.value ? shortDate(p.value) : ""), sort: "desc" },
];

export function MerchantConsole({
  initialRows,
  initialMetrics,
  orders,
  demoMode,
}: {
  initialRows: QueueRow[];
  initialMetrics: Metrics;
  orders: OrderRowView[];
  demoMode: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [metrics, setMetrics] = useState(initialMetrics);
  const [tab, setTab] = useState<"queue" | "orders" | "metrics">("queue");
  const [quick, setQuick] = useState("");
  const [api, setApi] = useState<GridApi<QueueRow> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/disputes", { cache: "no-store" });
      const data = await res.json();
      setRows(data.rows);
      setMetrics(data.metrics);
    } catch {
      /* transient; next poll retries */
    }
  }, []);

  const pending = rows.some((r) => r.status === "ANALYZING" || r.status === "RECEIVED");
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, [pending, refresh]);

  const onGridReady = useCallback((e: { api: GridApi<QueueRow> }) => {
    setApi(e.api);
    try {
      const saved = localStorage.getItem(SORT_KEY);
      if (saved) e.api.applyColumnState({ state: JSON.parse(saved), defaultState: { sort: null } });
    } catch {
      /* storage unavailable */
    }
  }, []);

  const onSortChanged = useCallback(() => {
    if (!api) return;
    try {
      const sort = api.getColumnState().filter((c) => c.sort).map((c) => ({ colId: c.colId, sort: c.sort, sortIndex: c.sortIndex }));
      localStorage.setItem(SORT_KEY, JSON.stringify(sort));
    } catch {
      /* storage unavailable */
    }
  }, [api]);

  async function loadDemo() {
    setLoading(true);
    setError(null);
    try {
      for (const s of ["S1", "S2", "S3", "S4"]) await simulateDispute({ scenario: s });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const defaultColDef = useMemo<ColDef>(() => ({ sortable: true, filter: true, resizable: true }), []);
  const contest = metrics.byAction.CONTEST ?? 0;
  const accept = metrics.byAction.ACCEPT_AND_REFUND ?? 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Fernhill Outfitters · merchant console</p>
          <h1 className="text-2xl font-semibold">Disputes</h1>
        </div>
        <p className="text-sm text-ink-3 max-w-md">AI recommends, you decide. Nothing is sent to PayPal until you click Approve.</p>
      </div>

      <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
        <Kpi label="Open disputes" value={String(metrics.open)} />
        <Kpi label="Avg time to analysis" value={metrics.avgAnalysisMs === null ? "—" : `${(metrics.avgAnalysisMs / 1000).toFixed(1)} s`} hint="live runs only" />
        <Kpi label="Evidence verified" value={metrics.verifiedRatio === null ? "—" : `${Math.round(metrics.verifiedRatio * 100)}%`} hint="citations shown after validation" />
        <Kpi label="Contest vs refund" value={`${contest} / ${accept}`} hint={`${metrics.agentFault} with agent fault`} />
      </dl>

      <div role="tablist" aria-label="Console sections" className="mt-6 flex gap-1 border-b border-line">
        {(["queue", "orders", "metrics"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 ${tab === t ? "border-accent text-ink" : "border-transparent text-ink-3 hover:text-ink"}`}
            onClick={() => setTab(t)}
          >
            {t === "queue" ? `Dispute queue (${rows.length})` : t === "orders" ? `Orders (${orders.length})` : "Metrics"}
          </button>
        ))}
      </div>

      {tab === "queue" && (
        <div className="mt-4">
          <div className="flex flex-wrap gap-2 items-center mb-3">
            <label htmlFor="quick" className="sr-only">
              Filter disputes
            </label>
            <input
              id="quick"
              className="rounded-lg border border-line bg-surface px-3 py-2 text-sm w-full sm:w-72"
              placeholder="Quick filter (buyer, reason, action…)"
              value={quick}
              onChange={(e) => setQuick(e.target.value)}
            />
            <span className="text-xs text-ink-3" aria-live="polite">
              {pending ? "Analysis running… updating live" : ""}
            </span>
          </div>
          {rows.length === 0 ? (
            <div className="card p-10 text-center">
              <p className="font-semibold">No disputes yet</p>
              <p className="text-sm text-ink-2 mt-1">Real sandbox disputes arrive by webhook. In demo mode you can load the four seeded scenarios.</p>
              {demoMode && (
                <button type="button" className="btn btn-primary mt-4" onClick={loadDemo} disabled={loading}>
                  {loading ? "Opening disputes…" : "Load demo disputes S1 to S4 (simulated)"}
                </button>
              )}
              {error && <p className="text-sm text-danger mt-2">{error}</p>}
            </div>
          ) : (
            <div className="ir-grid h-[460px]">
              <AgGridReact<QueueRow>
                theme={gridTheme}
                rowData={rows}
                columnDefs={columns}
                defaultColDef={defaultColDef}
                getRowId={(p) => p.data.id}
                quickFilterText={quick}
                onGridReady={onGridReady}
                onSortChanged={onSortChanged}
                onRowClicked={(e) => e.data && router.push(`/merchant/disputes/${e.data.id}`)}
                rowHeight={44}
                animateRows
              />
            </div>
          )}
        </div>
      )}

      {tab === "orders" && (
        <div className="mt-4 card divide-y divide-line">
          {orders.map((o) => (
            <div key={o.id} className="p-3 grid sm:grid-cols-[1fr_auto] gap-2 items-center text-sm">
              <div>
                <span className="font-medium">{o.product}</span> · {o.buyer} · {money(o.amount_cents / 100, o.currency)} <SourceBadge simulated={o.simulated} />
                <div className="text-xs text-ink-3 font-mono">{o.paypal_order_id}</div>
              </div>
              <Link href={`/receipt/${o.intent_id}`} className="btn btn-secondary">
                Intent receipt
              </Link>
            </div>
          ))}
        </div>
      )}

      {tab === "metrics" && <MetricsPanel metrics={metrics} />}
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="text-2xl font-semibold mt-1">{value}</dd>
      {hint && <dd className="text-xs text-ink-3 mt-0.5">{hint}</dd>}
    </div>
  );
}

function Bars({ title, data, tone }: { title: string; data: Record<string, number>; tone: Record<string, string> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  return (
    <div className="card p-5">
      <h3 className="font-semibold">{title}</h3>
      {entries.length === 0 ? (
        <p className="text-sm text-ink-3 mt-3">No analyzed disputes yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {entries.map(([k, v]) => (
            <li key={k} className="grid grid-cols-[150px_1fr_28px] items-center gap-3 text-sm">
              <span className="truncate">{humanize(k)}</span>
              <span className="h-2.5 rounded bg-neutral-soft overflow-hidden">
                <span className="block h-full rounded" style={{ width: `${(v / max) * 100}%`, background: tone[k] ?? "var(--ink-3)" }} />
              </span>
              <span className="text-right tabular-nums">{v}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MetricsPanel({ metrics }: { metrics: Metrics }) {
  const pct = metrics.verifiedRatio === null ? null : Math.round(metrics.verifiedRatio * 100);
  return (
    <div className="mt-4 grid md:grid-cols-3 gap-4">
      <div className="card p-5">
        <h3 className="font-semibold">Verified-evidence ratio</h3>
        <p className="text-sm text-ink-3">Share of analyst citations that matched source data after validation.</p>
        <p className="text-4xl font-semibold mt-4 text-success">{pct === null ? "—" : `${pct}%`}</p>
        <div className="h-2 rounded bg-neutral-soft mt-3 overflow-hidden" aria-hidden>
          <div className="h-full bg-success" style={{ width: `${pct ?? 0}%` }} />
        </div>
        <p className="text-xs text-ink-3 mt-3">Unverified citations are never shown; they are dropped and counted.</p>
      </div>
      <Bars
        title="Recommended actions"
        data={metrics.byAction}
        tone={{ CONTEST: "var(--accent)", ACCEPT_AND_REFUND: "var(--warning)", OFFER_PARTIAL: "var(--info)", REQUEST_MORE_INFO: "var(--ink-3)" }}
      />
      <Bars title="Classifications" data={metrics.byClass} tone={{ AGENT_MISINTERPRETATION: "var(--danger)", BUYER_CHANGED_MIND: "var(--accent)", ITEM_NOT_RECEIVED: "var(--warning)" }} />
    </div>
  );
}
