import { extractPdfText, type PdfParserEngine } from "./extractors";
import { normalizeParsedPdfText } from "./normalizer";

export type ParsedDocumentText = {
  parsedText: string | null;
  parser: PdfParserEngine | null;
  parseError: string | null;
};

const MINIMUM_EXTRACTED_WORDS = 50;

export async function parsePdfForReview(
  data: Uint8Array,
): Promise<ParsedDocumentText> {
  const primary = await tryExtract(copyPdfBytes(data), "pdf-parse");

  if (
    primary.parsedText &&
    countWords(primary.parsedText) >= MINIMUM_EXTRACTED_WORDS
  ) {
    return primary;
  }

  const fallback = await tryExtract(copyPdfBytes(data), "pdfjs-dist");
  if (fallback.parsedText) {
    return fallback;
  }

  return {
    parsedText: null,
    parser: null,
    parseError:
      fallback.parseError ??
      primary.parseError ??
      "No readable text could be extracted from the PDF.",
  };
}

async function tryExtract(
  data: Uint8Array,
  engine: PdfParserEngine,
): Promise<ParsedDocumentText> {
  try {
    const extraction = await extractPdfText(data, engine);
    const normalized = normalizeParsedPdfText(extraction.pages);

    if (!normalized.text || countWords(normalized.text) === 0) {
      return {
        parsedText: null,
        parser: engine,
        parseError: `${engine} did not find readable text.`,
      };
    }

    return {
      parsedText: normalized.text,
      parser: engine,
      parseError: null,
    };
  } catch (error) {
    return {
      parsedText: null,
      parser: engine,
      parseError: error instanceof Error ? error.message : String(error),
    };
  }
}

function countWords(text: string) {
  return text.match(/[A-Za-z0-9][A-Za-z0-9'-]*/g)?.length ?? 0;
}

function copyPdfBytes(data: Uint8Array) {
  return new Uint8Array(data);
}
