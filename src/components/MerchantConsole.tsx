"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef, type GridApi, type ICellRendererParams } from "ag-grid-community";
import type { QueueRow } from "@/lib/views";
import { ACTION_TONE, Badge, BusyLabel, SourceBadge, Spinner, humanize, money, reasonLabel, shortDate } from "./ui";
import { simulateDispute } from "./SimulateDisputeButton";
import { AnimatedNumber, EASE, SLIDE } from "./motion";

// Stable formatters (AnimatedNumber re-runs when its format function changes).
const fmtSeconds = (n: number) => `${n.toFixed(1)} s`;
const fmtPercent = (n: number) => `${Math.round(n)}%`;

ModuleRegistry.registerModules([AllCommunityModule]);

const gridTheme = themeQuartz.withParams({
  // Read live from the design tokens so the grid follows light and dark themes.
  accentColor: "var(--accent)",
  backgroundColor: "var(--surface)",
  foregroundColor: "var(--ink)",
  borderColor: "var(--line)",
  headerBackgroundColor: "var(--paper)",
  headerTextColor: "var(--ink-2)",
  rowHoverColor: "var(--row-hover)",
  selectedRowBackgroundColor: "var(--accent-soft)",
  inputBackgroundColor: "var(--surface)",
  inputBorder: { color: "var(--line)" },
  fontFamily: "inherit",
  fontSize: 13,
  headerFontWeight: 600,
  wrapperBorderRadius: 12,
  spacing: 7,
});

interface Metrics {
  open: number;
  total: number;
  analyzed: number;
  verifiedRatio: number | null;
  citationsKept: number;
  citationsTotal: number;
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

const SORT_KEY = "ir.merchant.sort.v2";
const TABS = ["queue", "orders", "metrics"] as const;

const StatusCell = (p: ICellRendererParams<QueueRow>) => {
  const s = p.data?.status;
  if (!s || !p.data) return null;
  const tone =
    s === "READY_FOR_REVIEW" ? "accent" : s === "ERROR" ? "danger" : s === "SUBMITTED" || s === "RESOLVED" ? "success" : "neutral";
  return (
    <span className="flex flex-wrap items-center gap-1.5 h-full">
      {(s === "ANALYZING" || s === "RECEIVED") && <span className="h-2 w-2 rounded-full bg-accent animate-pulse" aria-hidden />}
      <Badge tone={tone}>{humanize(s)}</Badge>
      <SourceBadge simulated={p.data.simulated} cached={p.data.cached} />
    </span>
  );
};

const FAULT_SHORT: Record<string, string> = { POSSIBLE: "possible agent fault", LIKELY: "agent at fault" };
const dash = <span className="text-ink-3">—</span>;

// Two-line cells keep the queue to seven columns, so nothing (the SIMULATED label included) hides off-screen at 1280px.
const columns: ColDef<QueueRow>[] = [
  {
    field: "opened_at",
    headerName: "Dispute",
    flex: 1.5,
    minWidth: 230,
    sort: "desc",
    getQuickFilterText: (p) => `${p.data?.buyer} ${p.data?.product} ${p.data?.paypal_dispute_id}`,
    cellRenderer: (p: ICellRendererParams<QueueRow>) =>
      p.data ? (
        <span className="flex flex-col justify-center h-full leading-tight min-w-0">
          <Link href={`/merchant/disputes/${p.data.id}`} tabIndex={-1} className="font-medium truncate hover:text-accent">
            {p.data.buyer} · {p.data.product}
          </Link>
          <span className="text-xs text-ink-3 truncate">
            <span className="font-mono">{p.data.paypal_dispute_id}</span> · {shortDate(p.data.opened_at)}
          </span>
        </span>
      ) : null,
  },
  { field: "amount", headerName: "Amount", width: 100, valueFormatter: (p) => money(p.value ?? 0, p.data?.currency) },
  { field: "reason", headerName: "PayPal reason", width: 175, valueFormatter: (p) => reasonLabel(String(p.value ?? "")) },
  {
    field: "classification",
    headerName: "Analysis",
    flex: 1,
    minWidth: 215,
    getQuickFilterText: (p) => `${humanize(p.value)} ${p.data?.agent_fault ? (FAULT_SHORT[p.data.agent_fault] ?? "") : ""}`,
    cellRenderer: (p: ICellRendererParams<QueueRow>) =>
      p.value ? (
        <span className="flex flex-col justify-center items-start h-full gap-0.5 leading-tight">
          <Badge tone="neutral">{humanize(p.value)}</Badge>
          {p.data?.agent_fault && FAULT_SHORT[p.data.agent_fault] && (
            <span className={`text-xs ${p.data.agent_fault === "LIKELY" ? "text-danger" : "text-warning"}`}>
              {FAULT_SHORT[p.data.agent_fault]}
            </span>
          )}
        </span>
      ) : (
        dash
      ),
  },
  {
    field: "confidence",
    headerName: "Confidence",
    width: 120,
    cellRenderer: (p: ICellRendererParams<QueueRow>) =>
      p.value === null || p.value === undefined ? (
        dash
      ) : (
        <span className="flex items-center gap-2 h-full">
          <span className="h-1.5 w-12 rounded bg-neutral-soft overflow-hidden" aria-hidden>
            <span className="block h-full bg-accent" style={{ width: `${Math.round(p.value * 100)}%` }} />
          </span>
          <span className="text-xs tabular-nums">{Math.round(p.value * 100)}%</span>
        </span>
      ),
  },
  {
    field: "recommended_action",
    headerName: "Recommended",
    width: 165,
    cellRenderer: (p: ICellRendererParams<QueueRow>) =>
      p.value ? <Badge tone={ACTION_TONE[p.value] ?? "neutral"}>{humanize(p.value)}</Badge> : dash,
  },
  {
    field: "status",
    headerName: "Status",
    width: 215,
    getQuickFilterText: (p) => `${humanize(p.value)} ${p.data?.simulated ? "simulated" : "real sandbox"}${p.data?.cached ? " cached" : ""}`,
    cellRenderer: StatusCell,
  },
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
  const quickRef = useRef<HTMLInputElement>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const open = useCallback((id: string) => router.push(`/merchant/disputes/${id}`), [router]);

  // "/" jumps to the filter, as in most queues.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key !== "/" || t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      e.preventDefault();
      setTab("queue");
      requestAnimationFrame(() => quickRef.current?.focus());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
      const sort = api
        .getColumnState()
        .filter((c) => c.sort)
        .map((c) => ({ colId: c.colId, sort: c.sort, sortIndex: c.sortIndex }));
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

  function onTabKey(e: ReactKeyboardEvent) {
    const i = TABS.indexOf(tab);
    const keys: Record<string, number> = {
      ArrowRight: (i + 1) % TABS.length,
      ArrowLeft: (i + TABS.length - 1) % TABS.length,
      Home: 0,
      End: TABS.length - 1,
    };
    const next = keys[e.key];
    if (next === undefined) return;
    e.preventDefault();
    setTab(TABS[next]);
    tabRefs.current[TABS[next]]?.focus();
  }

  const defaultColDef = useMemo<ColDef>(() => ({ sortable: true, filter: true, resizable: true }), []);
  const contest = metrics.byAction.CONTEST ?? 0;
  const accept = metrics.byAction.ACCEPT_AND_REFUND ?? 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Disputes</h1>
          <p className="text-sm text-ink-3 mt-0.5">Fernhill Outfitters · merchant console</p>
        </div>
        <p className="text-sm text-ink-3 max-w-md">AI recommends, you decide. Nothing is sent to PayPal until you click Approve.</p>
      </div>

      <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
        <Kpi label="Open disputes" value={<AnimatedNumber value={metrics.open} />} hint={`of ${metrics.total} in the queue`} />
        <Kpi
          label="Avg time to analysis"
          value={metrics.avgAnalysisMs === null ? "—" : <AnimatedNumber value={metrics.avgAnalysisMs / 1000} format={fmtSeconds} />}
          hint="live runs only"
        />
        <Kpi
          label="Citations kept"
          value={
            metrics.citationsTotal === 0 ? (
              "—"
            ) : (
              <>
                <AnimatedNumber value={metrics.citationsKept} /> <span className="text-base font-normal text-ink-3">of</span>{" "}
                <AnimatedNumber value={metrics.citationsTotal} />
              </>
            )
          }
          hint={
            metrics.citationsTotal === 0
              ? "after the code check"
              : `${metrics.citationsTotal - metrics.citationsKept} rejected by code, never shown`
          }
        />
        <Kpi
          label="Contest / refund"
          value={
            <>
              <AnimatedNumber value={contest} /> / <AnimatedNumber value={accept} />
            </>
          }
          hint={`AI recommendations · ${metrics.agentFault} agent at fault`}
        />
      </dl>

      <div role="tablist" aria-label="Console sections" className="mt-6 flex gap-1 border-b border-line" onKeyDown={onTabKey}>
        {TABS.map((t) => (
          <button
            key={t}
            ref={(el) => {
              tabRefs.current[t] = el;
            }}
            id={`tab-${t}`}
            role="tab"
            type="button"
            aria-selected={tab === t}
            aria-controls="console-panel"
            tabIndex={tab === t ? 0 : -1}
            className={`relative px-4 py-2 text-sm font-medium transition-colors ${tab === t ? "text-ink" : "text-ink-3 hover:text-ink"}`}
            onClick={() => setTab(t)}
          >
            {t === "queue" ? `Dispute queue (${rows.length})` : t === "orders" ? `Orders (${orders.length})` : "Metrics"}
            {tab === t && (
              <motion.span
                layoutId="console-tab"
                transition={SLIDE}
                className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-accent"
                aria-hidden
              />
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          id="console-panel"
          role="tabpanel"
          aria-labelledby={`tab-${tab}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: { duration: 0.1 } }}
          transition={{ duration: 0.22 }}
        >
          {tab === "queue" && (
            <div className="mt-4">
              <div className="flex flex-wrap gap-2 items-center mb-3">
                <label htmlFor="quick" className="sr-only">
                  Filter disputes
                </label>
                <input
                  ref={quickRef}
                  id="quick"
                  className="field px-3 py-2 text-sm w-full sm:w-72"
                  placeholder="Filter by buyer, reason, action…   ( / )"
                  value={quick}
                  onChange={(e) => setQuick(e.target.value)}
                />
                <span className="inline-flex items-center gap-2 text-xs text-ink-3" aria-live="polite">
                  {pending && <Spinner />}
                  {pending ? "Analysis running… updating live" : ""}
                </span>
              </div>
              {rows.length === 0 ? (
                <div className="card p-10 text-center">
                  <p className="font-semibold">No disputes yet</p>
                  <p className="text-sm text-ink-2 mt-1">
                    Real sandbox disputes arrive by webhook. In demo mode you can load the four seeded scenarios.
                  </p>
                  {demoMode && (
                    <button type="button" className="btn btn-primary mt-4" onClick={loadDemo} disabled={loading} aria-busy={loading}>
                      <BusyLabel busy={loading} busyText="Opening disputes…">
                        Load demo disputes S1 to S4 (simulated)
                      </BusyLabel>
                    </button>
                  )}
                  {error && <p className="text-sm text-danger mt-2">{error}</p>}
                </div>
              ) : (
                <div className={`ir-grid ${rows.length > 8 ? "h-[520px]" : ""}`}>
                  <AgGridReact<QueueRow>
                    domLayout={rows.length > 8 ? "normal" : "autoHeight"}
                    theme={gridTheme}
                    rowData={rows}
                    columnDefs={columns}
                    defaultColDef={defaultColDef}
                    getRowId={(p) => p.data.id}
                    quickFilterText={quick}
                    onGridReady={onGridReady}
                    onSortChanged={onSortChanged}
                    onRowClicked={(e) => e.data && open(e.data.id)}
                    onCellKeyDown={(e) => {
                      const k = (e.event as KeyboardEvent | null)?.key;
                      if ((k === "Enter" || k === " ") && e.data) {
                        e.event?.preventDefault();
                        open(e.data.id);
                      }
                    }}
                    rowHeight={56}
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
                    <span className="font-medium">{o.product}</span> · {o.buyer} · {money(o.amount_cents / 100, o.currency)}{" "}
                    <SourceBadge simulated={o.simulated} />
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
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="card p-4">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="text-2xl font-semibold tracking-tight tabular-nums mt-1">{value}</dd>
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
          {entries.map(([k, v], i) => (
            <li key={k} className="grid grid-cols-[150px_1fr_28px] items-center gap-3 text-sm">
              <span className="truncate">{humanize(k)}</span>
              <span className="h-2.5 rounded bg-neutral-soft overflow-hidden">
                <motion.span
                  className="block h-full rounded origin-left"
                  style={{ width: `${(v / max) * 100}%`, background: tone[k] ?? "var(--ink-3)" }}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.6, ease: EASE, delay: 0.08 + i * 0.06 }}
                />
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
        <h3 className="font-semibold">Citations kept by the code check</h3>
        <p className="text-sm text-ink-3">
          {metrics.citationsKept} of {metrics.citationsTotal} analyst citations matched the record they pointed at.
        </p>
        <p className="text-4xl font-semibold tracking-tight mt-4 text-success">
          {pct === null ? "—" : <AnimatedNumber value={pct} format={fmtPercent} />}
        </p>
        <div className="h-2 rounded bg-neutral-soft mt-3 overflow-hidden" aria-hidden>
          <motion.div
            className="h-full bg-success origin-left"
            style={{ width: `${pct ?? 0}%` }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.7, ease: EASE, delay: 0.08 }}
          />
        </div>
        <p className="text-xs text-ink-3 mt-3">The rest were rejected and never shown to you; each dispute lists them with the reason.</p>
      </div>
      <Bars
        title="Recommended actions"
        data={metrics.byAction}
        tone={{
          CONTEST: "var(--accent)",
          ACCEPT_AND_REFUND: "var(--warning)",
          OFFER_PARTIAL: "var(--info)",
          REQUEST_MORE_INFO: "var(--ink-3)",
        }}
      />
      <Bars
        title="Classifications"
        data={metrics.byClass}
        tone={{ AGENT_MISINTERPRETATION: "var(--danger)", BUYER_CHANGED_MIND: "var(--accent)", ITEM_NOT_RECEIVED: "var(--warning)" }}
      />
    </div>
  );
}
