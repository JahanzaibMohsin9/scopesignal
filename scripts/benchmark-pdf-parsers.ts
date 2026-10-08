import { promises as fs } from "node:fs";
import path from "node:path";

import {
  extractPdfText,
  type PdfExtractionResult,
  type PdfParserEngine,
} from "@/lib/pdf/extractors";

type Sample = {
  id: string;
  title: string;
  sourceUrl: string;
  profile: string;
};

type BenchmarkMetric = {
  sampleId: string;
  engine: PdfParserEngine;
  status: "ok" | "error";
  elapsedMs?: number;
  pageCount?: number;
  characterCount?: number;
  wordCount?: number;
  lines?: number;
  uniqueLinePercent?: number;
  repeatedLineCount?: number;
  likelyTableLineCount?: number;
  error?: string;
};

const sampleManifestPath = path.join(
  process.cwd(),
  "docs",
  "pdf-samples.json",
);
const sampleDirectory = path.join(process.cwd(), ".tmp", "day17", "samples");
const resultDirectory = path.join(process.cwd(), ".tmp", "day17", "results");
const metricsPath = path.join(
  process.cwd(),
  "docs",
  "pdf-parser-results.json",
);
const engines: PdfParserEngine[] = ["pdf-parse", "pdfjs-dist"];

async function main() {
  const samples = JSON.parse(
    await fs.readFile(sampleManifestPath, "utf8"),
  ) as Sample[];

  await fs.mkdir(sampleDirectory, { recursive: true });
  await fs.mkdir(resultDirectory, { recursive: true });

  const metrics: BenchmarkMetric[] = [];

  for (const sample of samples) {
    const pdfPath = path.join(sampleDirectory, `${sample.id}.pdf`);
    await downloadIfNeeded(sample.sourceUrl, pdfPath);
    const data = await fs.readFile(pdfPath);

    for (const engine of engines) {
      process.stdout.write(`Benchmarking ${sample.id} with ${engine}...\n`);

      try {
        const extraction = await extractPdfText(new Uint8Array(data), engine);
        await fs.writeFile(
          path.join(resultDirectory, `${sample.id}.${engine}.txt`),
          extraction.text,
        );
        metrics.push(toMetric(sample.id, extraction));
      } catch (error) {
        metrics.push({
          sampleId: sample.id,
          engine,
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  await fs.writeFile(metricsPath, `${JSON.stringify(metrics, null, 2)}\n`);
  process.stdout.write(`Wrote benchmark metrics to ${metricsPath}\n`);
  process.stdout.write(`Wrote extracted text files to ${resultDirectory}\n`);
}

async function downloadIfNeeded(url: string, pdfPath: string) {
  try {
    const existing = await fs.readFile(pdfPath);
    if (existing.byteLength > 0) {
      return;
    }
  } catch {
    // Download below.
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }

  const body = new Uint8Array(await response.arrayBuffer());
  if (body.byteLength === 0) {
    throw new Error(`Downloaded empty PDF from ${url}`);
  }

  await fs.writeFile(pdfPath, body);
}

function toMetric(
  sampleId: string,
  extraction: PdfExtractionResult,
): BenchmarkMetric {
  const lines = extraction.text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const normalizedLines = lines.map(normalizeLine);
  const uniqueLineCount = new Set(normalizedLines).size;
  const repeatedLineCount = countRepeatedLines(normalizedLines);

  return {
    sampleId,
    engine: extraction.engine,
    status: "ok",
    elapsedMs: extraction.elapsedMs,
    pageCount: extraction.pageCount,
    characterCount: extraction.text.length,
    wordCount: countWords(extraction.text),
    lines: lines.length,
    uniqueLinePercent:
      lines.length === 0
        ? 0
        : Math.round((uniqueLineCount / lines.length) * 100),
    repeatedLineCount,
    likelyTableLineCount: lines.filter(hasTableShape).length,
  };
}

function countWords(text: string) {
  return text.match(/[A-Za-z0-9][A-Za-z0-9'-]*/g)?.length ?? 0;
}

function normalizeLine(line: string) {
  return line
    .replace(/\b(page|p\.)\s*\d+\s*(of\s*\d+)?\b/gi, "page n")
    .replace(/\d+/g, "n")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

function countRepeatedLines(lines: string[]) {
  const counts = new Map<string, number>();
  for (const line of lines) {
    if (line.length < 8) {
      continue;
    }

    counts.set(line, (counts.get(line) ?? 0) + 1);
  }

  return Array.from(counts.values()).filter((count) => count > 2).length;
}

function hasTableShape(line: string) {
  return (
    /\t/.test(line) ||
    / {3,}/.test(line) ||
    (/\$[\d,]+/.test(line) && /\d{1,3}%|\b\d+\.\d+\b/.test(line))
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
