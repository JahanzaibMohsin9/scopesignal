import { describe, expect, it } from "vitest";

import { extractPdfText, type PdfParserEngine } from "./extractors";

describe("extractPdfText", () => {
  it.each<PdfParserEngine>(["pdf-parse", "pdfjs-dist"])(
    "extracts text with %s",
    async (engine) => {
      const result = await extractPdfText(
        makeSinglePagePdf("ScopeSignal parser smoke"),
        engine,
      );

      expect(result.engine).toBe(engine);
      expect(result.pageCount).toBe(1);
      expect(result.pages).toHaveLength(1);
      expect(result.text).toContain("ScopeSignal parser smoke");
      expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
    },
  );
});

function makeSinglePagePdf(text: string) {
  const escapedText = text.replace(/([\\()])/g, "\\$1");
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
  ];
  const stream = `BT\n/F1 24 Tf\n72 720 Td\n(${escapedText}) Tj\nET`;
  objects.push(
    `5 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`,
  );

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  for (const object of objects) {
    offsets.push(pdf.length);
    pdf += object;
  }

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;

  for (let index = 1; index <= objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return new TextEncoder().encode(pdf);
}
