export type NormalizedPdfText = {
  text: string;
  removedRepeatedLines: string[];
  removedLineCount: number;
};

type Line = {
  text: string;
  pageIndex: number;
};

export function normalizeParsedPdfText(pages: string[]): NormalizedPdfText {
  const lines = pages.flatMap((page, pageIndex) =>
    page
      .split(/\r?\n/)
      .map((line) => normalizeLine(line))
      .filter(Boolean)
      .map((text) => ({ text, pageIndex })),
  );
  const repeatedLines = findRepeatedPageFurniture(lines, pages.length);
  const repeatedKeys = new Set(repeatedLines.map(toComparableLine));

  const filteredLines = stripTableOfContentsNoise(
    lines
      .filter((line) => !isPageMarker(line.text))
      .filter((line) => !repeatedKeys.has(toComparableLine(line.text)))
      .filter((line) => !isSignatureBoilerplate(line.text))
      .map((line) => line.text),
  );

  const text = collapseLinesIntoParagraphs(filteredLines);

  return {
    text,
    removedRepeatedLines: repeatedLines,
    removedLineCount: lines.length - filteredLines.length,
  };
}

function normalizeLine(line: string) {
  return line
    .replace(/\u00a0/g, " ")
    .replace(/[•●◦]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .replace(/^\s*[-*]\s*/, "- ")
    .trim();
}

function findRepeatedPageFurniture(lines: Line[], pageCount: number) {
  if (pageCount < 3) {
    return [];
  }

  const pageMap = new Map<string, Set<number>>();
  const originalText = new Map<string, string>();

  for (const line of lines) {
    const key = toComparableLine(line.text);
    if (key.length < 8 || isLikelyBodyClause(line.text)) {
      continue;
    }

    if (!pageMap.has(key)) {
      pageMap.set(key, new Set());
      originalText.set(key, line.text);
    }
    pageMap.get(key)?.add(line.pageIndex);
  }

  const minimumPages = Math.max(3, Math.ceil(pageCount * 0.3));

  return Array.from(pageMap.entries())
    .filter(([, pages]) => pages.size >= minimumPages)
    .map(([key]) => originalText.get(key) ?? key);
}

function isPageMarker(line: string) {
  return (
    /^-+\s*\d+\s+of\s+\d+\s*-+$/i.test(line) ||
    /^page\s+\d+\s+(of|\/)\s+\d+$/i.test(line) ||
    /^p\.?\s*\d+\s+(of|\/)\s+\d+$/i.test(line) ||
    /^\d+\s*\|\s*page$/i.test(line)
  );
}

function stripTableOfContentsNoise(lines: string[]) {
  const cleanLines: string[] = [];
  let inContentsBlock = false;
  let skippedContentsLines = 0;

  for (const line of lines) {
    if (/^table of contents$/i.test(line) || /^contents$/i.test(line)) {
      inContentsBlock = true;
      skippedContentsLines = 0;
      continue;
    }

    if (inContentsBlock) {
      if (isTocEntry(line) || line.length < 4) {
        skippedContentsLines += 1;
        continue;
      }

      if (skippedContentsLines > 0 && isLikelyHeading(line)) {
        inContentsBlock = false;
      } else if (skippedContentsLines < 20) {
        continue;
      } else {
        inContentsBlock = false;
      }
    }

    if (!isTocEntry(line)) {
      cleanLines.push(line);
    }
  }

  return cleanLines;
}

function isTocEntry(line: string) {
  return (
    /\.{3,}\s*\d+$/.test(line) ||
    /^(\d+(\.\d+)*)\s+.+\s+\.{2,}\s*\d+$/.test(line)
  );
}

function isSignatureBoilerplate(line: string) {
  return (
    /^_{3,}$/.test(line) ||
    /^[-=]{6,}$/.test(line) ||
    /^(authorized )?signature:?$/i.test(line) ||
    /^(printed name|print name|title|date):?$/i.test(line) ||
    /^by:\s*_+$/i.test(line)
  );
}

function collapseLinesIntoParagraphs(lines: string[]) {
  const paragraphs: string[] = [];
  let current = "";

  for (const rawLine of lines) {
    const line = normalizeListMarker(rawLine);

    if (isLikelyHeading(line) || isListItem(line) || isTableLikeLine(line)) {
      pushCurrent();
      paragraphs.push(line);
      continue;
    }

    if (!current) {
      current = line;
      continue;
    }

    if (shouldJoinWithPrevious(current, line)) {
      current = `${current} ${line}`;
    } else {
      pushCurrent();
      current = line;
    }
  }

  pushCurrent();
  return paragraphs
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  function pushCurrent() {
    if (current) {
      paragraphs.push(current);
      current = "";
    }
  }
}

function normalizeListMarker(line: string) {
  return line
    .replace(/^[*-]\s+/, "- ")
    .replace(/^\(?([a-zA-Z])\)\s+/, "$1. ")
    .replace(/^(\d+)\)\s+/, "$1. ");
}

function shouldJoinWithPrevious(previous: string, next: string) {
  if (isLikelyHeading(next) || isListItem(next) || isTableLikeLine(next)) {
    return false;
  }

  if (/[.!?:;)"']$/.test(previous)) {
    return false;
  }

  return /^[a-z0-9("'$]/.test(next);
}

function isListItem(line: string) {
  return /^(-|\d+\.|[A-Za-z]\.)\s+/.test(line);
}

function isTableLikeLine(line: string) {
  const numericTokens =
    line.match(/\b\d{1,3}(?:,\d{3})*(?:\.\d+)?%?\b/g)?.length ?? 0;
  return /\t/.test(line) || / {3,}/.test(line) || numericTokens >= 3;
}

function isLikelyHeading(line: string) {
  if (line.length > 100 || /[.!?]$/.test(line)) {
    return false;
  }

  const wordCount = line.split(/\s+/).length;

  return (
    /^[A-Z][A-Z0-9 &()/:,-]{5,}$/.test(line) ||
    /^(\d+(\.\d+)*\.?\s+)[A-Z][A-Za-z0-9 &()/:,-]{2,}$/.test(line) ||
    (wordCount <= 6 && /^[A-Z][A-Za-z0-9 &()/:,-]{2,}$/.test(line))
  );
}

function isLikelyBodyClause(line: string) {
  return line.length > 120 || /[.!?;:]$/.test(line);
}

function toComparableLine(line: string) {
  return line
    .replace(/\b(page|p\.)\s*\d+\s*(of|\/)\s*\d+\b/gi, "page n of n")
    .replace(/\d+/g, "n")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}
