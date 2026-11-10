import { PDFDocument, PageSizes, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { EvidenceBundle } from "./types";

// The human-readable side of the pack. PayPal accepts only images and PDFs as evidence, so the
// machine-checkable JSON travels inside this PDF as an embedded file.

export const EMBEDDED_JSON_NAME = "intent-receipt-evidence.json";

/** Fits PayPal's documents[].name pattern: ^[A-Za-z0-9-_,\s]+[.]{1}[A-Za-z]+$ */
export const evidenceFileName = (intentId: string) => `IntentReceipt-evidence-${intentId.replace(/[^A-Za-z0-9_-]/g, "")}.pdf`;

// Characters Windows-1252 adds above 0x7F outside Latin-1; the standard PDF fonts draw only this set.
const CP1252_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");
const REPLACE: Record<string, string> = {
  "→": "->",
  "←": "<-",
  "✓": "OK",
  "✔": "OK",
  "✗": "x",
  "‐": "-",
  "‑": "-",
  "−": "-",
  "≥": ">=",
  "≤": "<=",
  " ": " ",
  "\t": " ",
};

/** Text the standard fonts can draw. The JSON keeps the exact original; the PDF notes any substitution. */
export function toWinAnsi(s: string): { text: string; substituted: boolean } {
  let substituted = false;
  let text = "";
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || CP1252_EXTRA.has(ch)) text += ch;
    else {
      substituted = true;
      text += REPLACE[ch] ?? "?";
    }
  }
  return { text, substituted };
}

const INK = rgb(0.11, 0.12, 0.14);
const MUTED = rgb(0.4, 0.42, 0.46);
const RULE = rgb(0.85, 0.86, 0.88);
const DANGER = rgb(0.7, 0.13, 0.13);
const SUCCESS = rgb(0.1, 0.45, 0.25);
const WARNING = rgb(0.62, 0.38, 0.02);
const MARGIN = 54;

/** A top-to-bottom text cursor that wraps lines and starts new pages. */
class Writer {
  page: PDFPage;
  y = 0;
  substituted = false;
  constructor(
    private doc: PDFDocument,
    private fonts: { regular: PDFFont; bold: PDFFont; mono: PDFFont },
  ) {
    this.page = this.newPage();
  }
  private get width() {
    return PageSizes.Letter[0] - MARGIN * 2;
  }
  private newPage() {
    this.page = this.doc.addPage(PageSizes.Letter);
    this.y = PageSizes.Letter[1] - MARGIN;
    return this.page;
  }
  private ensure(h: number) {
    if (this.y - h < MARGIN + 24) this.newPage();
  }
  private wrap(text: string, font: PDFFont, size: number): string[] {
    const out: string[] = [];
    for (const para of text.split("\n")) {
      let line = "";
      for (const word of para.split(/(?<=\s)|(?=\s)/)) {
        const next = line + word;
        if (font.widthOfTextAtSize(next, size) <= this.width || !line) line = next;
        else {
          out.push(line.trimEnd());
          line = word.trimStart();
        }
        // A single token wider than the line (a hash, a URL) is broken by characters.
        while (font.widthOfTextAtSize(line, size) > this.width) {
          let cut = line.length - 1;
          while (cut > 1 && font.widthOfTextAtSize(line.slice(0, cut), size) > this.width) cut--;
          out.push(line.slice(0, cut));
          line = line.slice(cut);
        }
      }
      out.push(line.trimEnd());
    }
    return out;
  }
  text(raw: string, opts: { size?: number; font?: "regular" | "bold" | "mono"; color?: ReturnType<typeof rgb>; gap?: number } = {}) {
    const { text, substituted } = toWinAnsi(raw);
    this.substituted ||= substituted;
    const size = opts.size ?? 10;
    const font = this.fonts[opts.font ?? "regular"];
    for (const line of this.wrap(text, font, size)) {
      this.ensure(size * 1.4);
      this.page.drawText(line, { x: MARGIN, y: this.y - size, size, font, color: opts.color ?? INK });
      this.y -= size * 1.4;
    }
    this.y -= opts.gap ?? 2;
  }
  heading(t: string) {
    this.ensure(40);
    this.y -= 10;
    this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: MARGIN + this.width, y: this.y }, thickness: 0.6, color: RULE });
    this.y -= 6;
    this.text(t, { size: 12, font: "bold", gap: 4 });
  }
  field(label: string, value: string, mono = false) {
    this.text(label, { size: 8, color: MUTED, gap: 0 });
    this.text(value, { font: mono ? "mono" : "regular", size: mono ? 8.5 : 10, gap: 5 });
  }
}

/** Renders the pack and embeds the bundle as intent-receipt-evidence.json. */
export async function renderEvidencePdf(b: EvidenceBundle): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const generated = new Date(b.generated_at);
  const r = b.intent_record;
  const s = r.selection;
  doc.setTitle(`IntentReceipt evidence: ${toWinAnsi(s.product_name).text}`);
  doc.setAuthor("IntentReceipt");
  doc.setCreator("IntentReceipt");
  doc.setProducer("IntentReceipt (pdf-lib)");
  doc.setSubject(`Signed purchase receipt ${b.intent_id}`);
  doc.setCreationDate(generated);
  doc.setModificationDate(generated);

  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    mono: await doc.embedFont(StandardFonts.Courier),
  };
  const w = new Writer(doc, fonts);
  const label = b.simulated ? "SIMULATED ORDER (demo data, no real payment)" : "REAL SANDBOX ORDER (PayPal sandbox)";

  w.text("IntentReceipt evidence pack", { size: 18, font: "bold", gap: 2 });
  w.text(label, { size: 9, font: "bold", color: b.simulated ? WARNING : SUCCESS, gap: 6 });
  w.text(
    `A readable copy of a signed purchase receipt. The machine-checkable copy is embedded in this PDF as ${EMBEDDED_JSON_NAME}. ` +
      `Anyone can check it at ${b.verify_url}: the check runs in the browser and compares every signature with the merchant's published key.`,
    { size: 9.5, color: MUTED, gap: 4 },
  );

  w.heading("What the buyer asked");
  w.text(`"${r.request.verbatim}"`, { size: 11, gap: 4 });
  w.field("Buyer", `${r.buyer.display_name} · request recorded ${r.created_at}`);

  w.heading("What the buyer confirmed");
  w.text("The exact text on the confirmation card, line by line:", { size: 9, color: MUTED });
  for (const line of r.confirmation?.presented_text.split("\n") ?? []) w.text(line, { size: 10, gap: 1 });
  w.y -= 4;
  if (r.confirmation) {
    w.field(
      "Confirmed",
      `${r.confirmation.confirmed_at} · by ${r.confirmation.method === "ui_button" ? "button press on the card" : r.confirmation.method}`,
    );
    w.field("SHA-256 of the card text", r.confirmation.presented_text_sha256, true);
  }

  w.heading("What the code checked");
  w.text(`Recorded at confirmation by ${r.constraint_check.checker_version}. Compare it with the card text above.`, {
    size: 9,
    color: MUTED,
  });
  for (const c of r.constraint_check.results) {
    w.text(`${c.status} · ${c.key.replace(/_/g, " ")}: asked ${c.expected}, item ${c.actual ?? "unknown"}`, {
      color: c.status === "MET" ? SUCCESS : c.status === "UNMET" ? DANGER : MUTED,
      gap: 1,
    });
  }
  w.y -= 4;
  w.field("Agent's choice", `${s.product_name} · SKU ${s.sku} · ${(s.price_cents / 100).toFixed(2)} ${s.currency} x ${s.quantity}`);
  w.field("Agent", `${r.agent.name} · ${r.agent.provider}/${r.agent.model} · prompt ${r.agent.prompt_version}`);

  w.heading("PayPal order");
  if (b.order) {
    w.field("Order id", b.order.paypal_order_id, true);
    w.field("Capture id", b.order.paypal_capture_id ?? "not captured", true);
    w.field("Amount", `${b.order.amount.value} ${b.order.amount.currency_code}`);
    w.field("purchase_units[0].custom_id", b.order.custom_id, true);
    w.text(
      "custom_id is this receipt's intent id plus the first 16 hex characters of its signed confirmation entry, so the PayPal transaction names the receipt it came from.",
      {
        size: 9,
        color: MUTED,
      },
    );
  } else {
    w.text("No PayPal order yet.", { color: MUTED });
  }

  w.heading("Delivery (merchant shipping records, not signed)");
  if (!b.fulfillment.length) w.text("No delivery events.", { color: MUTED });
  for (const f of b.fulfillment) {
    w.text(`${f.occurred_at} · ${f.status} · ${f.detail}${f.tracking_no ? ` · ${f.carrier ?? "carrier"} ${f.tracking_no}` : ""}`, {
      size: 9.5,
      gap: 1,
    });
  }

  w.heading("Tamper-evident ledger");
  const own = b.ledger.entries.filter((e) => !("redacted" in e));
  w.text(
    `${own.length} of the ledger's first ${b.ledger.entries.length} entries belong to this receipt. Each entry's hash covers the previous entry's hash, and each is signed with Ed25519 by key ${b.ledger.key.key_id}.`,
    { size: 9, color: MUTED },
  );
  for (const e of own) w.text(`#${e.seq} ${e.type}  ${e.hash}`, { font: "mono", size: 8, gap: 1 });

  w.heading("How to verify");
  w.field("Receipt", b.receipt_url, true);
  w.field("Verify this file", `${b.verify_url} (drop this PDF on the page; nothing is uploaded)`, true);
  w.field("Generated", b.generated_at);
  if (w.substituted) {
    w.text(
      "Some characters could not be drawn in this PDF's font and are shown as ? or an ASCII stand-in. The embedded JSON keeps the exact original text, and the hashes are computed over it.",
      { size: 9, color: WARNING },
    );
  }

  const pages = doc.getPages();
  pages.forEach((p, i) =>
    p.drawText(`IntentReceipt evidence · ${toWinAnsi(b.intent_id).text} · page ${i + 1} of ${pages.length}`, {
      x: MARGIN,
      y: MARGIN - 18,
      size: 8,
      font: fonts.regular,
      color: MUTED,
    }),
  );

  await doc.attach(new TextEncoder().encode(JSON.stringify(b, null, 1)), EMBEDDED_JSON_NAME, {
    mimeType: "application/json",
    description: "Machine-checkable IntentReceipt evidence (intentreceipt-evidence/0.1)",
    creationDate: generated,
    modificationDate: generated,
  });
  return doc.save();
}
