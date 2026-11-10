import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRawStream, PDFString } from "pdf-lib";
import { EMBEDDED_JSON_NAME } from "./pdf";

// Browser-safe: reads the embedded receipt JSON back out of an evidence PDF.

/** The parsed embedded intent-receipt-evidence.json, or null for any PDF without one. */
export async function extractBundleFromPdf(bytes: Uint8Array): Promise<unknown | null> {
  try {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    const names = doc.catalog.lookupMaybe(PDFName.of("Names"), PDFDict);
    const files = names?.lookupMaybe(PDFName.of("EmbeddedFiles"), PDFDict)?.lookupMaybe(PDFName.of("Names"), PDFArray);
    if (!files) return null;
    for (let i = 0; i + 1 < files.size(); i += 2) {
      const name = files.lookup(i);
      if (!(name instanceof PDFString || name instanceof PDFHexString) || name.decodeText() !== EMBEDDED_JSON_NAME) continue;
      const stream = files
        .lookup(i + 1, PDFDict)
        .lookup(PDFName.of("EF"), PDFDict)
        .lookup(PDFName.of("F"));
      if (!(stream instanceof PDFRawStream)) return null;
      return JSON.parse(new TextDecoder().decode(decodePDFRawStream(stream).decode()));
    }
    return null;
  } catch {
    return null;
  }
}
