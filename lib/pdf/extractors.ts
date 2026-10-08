import { pathToFileURL } from "node:url";
import path from "node:path";

export type PdfParserEngine = "pdf-parse" | "pdfjs-dist";

export type PdfExtractionResult = {
  engine: PdfParserEngine;
  text: string;
  pages: string[];
  pageCount: number;
  elapsedMs: number;
};

export async function extractPdfText(
  data: Uint8Array,
  engine: PdfParserEngine,
): Promise<PdfExtractionResult> {
  ensurePdfRuntimePolyfills();
  await ensurePdfWorkerModule();

  const startedAt = performance.now();
  const result =
    engine === "pdf-parse"
      ? await extractWithPdfParse(data)
      : await extractWithPdfJs(data);

  return {
    engine,
    ...result,
    elapsedMs: Math.round(performance.now() - startedAt),
  };
}

class ServerDOMMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;

  constructor(init?: number[] | ServerDOMMatrix) {
    const values = Array.isArray(init)
      ? init
      : [init?.a, init?.b, init?.c, init?.d, init?.e, init?.f];

    this.a = values[0] ?? 1;
    this.b = values[1] ?? 0;
    this.c = values[2] ?? 0;
    this.d = values[3] ?? 1;
    this.e = values[4] ?? 0;
    this.f = values[5] ?? 0;
  }

  multiplySelf(other: ServerDOMMatrix) {
    const a = this.a * other.a + this.c * other.b;
    const b = this.b * other.a + this.d * other.b;
    const c = this.a * other.c + this.c * other.d;
    const d = this.b * other.c + this.d * other.d;
    const e = this.a * other.e + this.c * other.f + this.e;
    const f = this.b * other.e + this.d * other.f + this.f;

    this.a = a;
    this.b = b;
    this.c = c;
    this.d = d;
    this.e = e;
    this.f = f;

    return this;
  }

  preMultiplySelf(other: ServerDOMMatrix) {
    return this.setFrom(new ServerDOMMatrix(other).multiplySelf(this));
  }

  translate(x = 0, y = 0) {
    return new ServerDOMMatrix(this).translateSelf(x, y);
  }

  translateSelf(x = 0, y = 0) {
    return this.multiplySelf(new ServerDOMMatrix([1, 0, 0, 1, x, y]));
  }

  scale(scaleX = 1, scaleY = scaleX) {
    return new ServerDOMMatrix(this).scaleSelf(scaleX, scaleY);
  }

  scaleSelf(scaleX = 1, scaleY = scaleX) {
    return this.multiplySelf(new ServerDOMMatrix([scaleX, 0, 0, scaleY, 0, 0]));
  }

  invertSelf() {
    const determinant = this.a * this.d - this.b * this.c;

    if (determinant === 0) {
      this.a = Number.NaN;
      this.b = Number.NaN;
      this.c = Number.NaN;
      this.d = Number.NaN;
      this.e = Number.NaN;
      this.f = Number.NaN;
      return this;
    }

    return this.setFrom(
      new ServerDOMMatrix([
        this.d / determinant,
        -this.b / determinant,
        -this.c / determinant,
        this.a / determinant,
        (this.c * this.f - this.e * this.d) / determinant,
        (this.e * this.b - this.a * this.f) / determinant,
      ]),
    );
  }

  private setFrom(other: ServerDOMMatrix) {
    this.a = other.a;
    this.b = other.b;
    this.c = other.c;
    this.d = other.d;
    this.e = other.e;
    this.f = other.f;

    return this;
  }
}

function ensurePdfRuntimePolyfills() {
  if (!("DOMMatrix" in globalThis)) {
    Object.defineProperty(globalThis, "DOMMatrix", {
      configurable: true,
      value: ServerDOMMatrix,
      writable: true,
    });
  }
}

let pdfWorkerModulePromise: Promise<void> | null = null;

async function ensurePdfWorkerModule() {
  if ("pdfjsWorker" in globalThis) {
    return;
  }

  pdfWorkerModulePromise ??=
    import("pdfjs-dist/legacy/build/pdf.worker.mjs").then((workerModule) => {
      if (!("pdfjsWorker" in globalThis)) {
        Object.defineProperty(globalThis, "pdfjsWorker", {
          configurable: true,
          value: workerModule,
          writable: true,
        });
      }
    });

  await pdfWorkerModulePromise;
}

async function extractWithPdfParse(data: Uint8Array) {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: copyPdfBytes(data) });

  try {
    const result = await parser.getText();
    const pages = result.pages.map((page) => page.text.trim());

    return {
      text: result.text.trim(),
      pages,
      pageCount: result.total,
    };
  } finally {
    await parser.destroy();
  }
}

async function extractWithPdfJs(data: Uint8Array) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const standardFontDataUrl = pathToFileURL(
    path.join(process.cwd(), "node_modules", "pdfjs-dist", "standard_fonts") +
      path.sep,
  ).href;

  const loadingTask = pdfjs.getDocument({
    data: copyPdfBytes(data),
    standardFontDataUrl,
  });
  const document = await loadingTask.promise;

  try {
    const pages: string[] = [];

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(textItemsToLines(content.items).trim());
    }

    return {
      text: pages.join("\n\n").trim(),
      pages,
      pageCount: document.numPages,
    };
  } finally {
    await document.destroy();
  }
}

function copyPdfBytes(data: Uint8Array) {
  return new Uint8Array(data);
}

function textItemsToLines(items: Array<unknown>) {
  const lines: string[] = [];
  let currentLine: string[] = [];
  let previousY: number | null = null;

  for (const item of items) {
    if (!isTextItem(item)) {
      continue;
    }

    const y = Math.round(item.transform[5]);
    if (previousY !== null && Math.abs(y - previousY) > 2) {
      lines.push(currentLine.join(" ").replace(/\s+/g, " ").trim());
      currentLine = [];
    }

    currentLine.push(item.str);
    previousY = y;
  }

  if (currentLine.length > 0) {
    lines.push(currentLine.join(" ").replace(/\s+/g, " ").trim());
  }

  return lines.filter(Boolean).join("\n");
}

function isTextItem(item: unknown): item is {
  str: string;
  transform: [number, number, number, number, number, number];
} {
  return (
    typeof item === "object" &&
    item !== null &&
    "str" in item &&
    typeof item.str === "string" &&
    "transform" in item &&
    Array.isArray(item.transform) &&
    typeof item.transform[5] === "number"
  );
}
