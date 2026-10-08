export type DocumentChunk = {
  content: string;
  sectionTitle: string | null;
  sectionTitles: string[];
  chunkIndex: number;
  tokenCount: number;
  metadata: {
    overlapTokens: number;
    source: "pdf-chunker";
    sectionTitles: string[];
  };
};

export type ChunkTextOptions = {
  minTokens?: number;
  maxTokens?: number;
  overlapTokens?: number;
};

type Section = {
  title: string | null;
  paragraphs: string[];
};

type ChunkDraft = {
  content: string;
  sectionTitles: string[];
  overlapTokens: number;
};

const DEFAULT_MIN_TOKENS = 500;
const DEFAULT_MAX_TOKENS = 1000;
const DEFAULT_OVERLAP_TOKENS = 150;

const SENTENCE_BOUNDARY = /(?<=[.!?])\s+/;

export function chunkDocumentText(
  text: string | null | undefined,
  options: ChunkTextOptions = {},
): DocumentChunk[] {
  const normalized = text?.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return [];
  }

  const config = normalizeOptions(options);
  const sections = parseSections(normalized);
  const drafts: ChunkDraft[] = [];
  let pending: ChunkDraft | null = null;

  for (const section of sections) {
    const sectionText = sectionToText(section);
    if (!sectionText) {
      continue;
    }

    if (countEstimatedTokens(sectionText) > config.maxTokens) {
      if (pending) {
        drafts.push(pending);
        pending = null;
      }
      drafts.push(...splitOversizedSection(sectionText, section.title, config));
      continue;
    }

    const sectionDraft = {
      content: sectionText,
      sectionTitles: section.title ? [section.title] : [],
      overlapTokens: 0,
    };

    if (!pending) {
      pending = sectionDraft;
      continue;
    }

    const combined = joinBlocks(pending.content, sectionDraft.content);
    if (countEstimatedTokens(combined) <= config.maxTokens) {
      pending = {
        content: combined,
        sectionTitles: mergeSectionTitles(
          pending.sectionTitles,
          sectionDraft.sectionTitles,
        ),
        overlapTokens: pending.overlapTokens,
      };
      continue;
    }

    drafts.push(pending);
    pending = sectionDraft;
  }

  if (pending) {
    drafts.push(pending);
  }

  return drafts.map((draft, chunkIndex) => {
    const sectionTitles = draft.sectionTitles;

    return {
      content: draft.content,
      sectionTitle: sectionTitles[0] ?? null,
      sectionTitles,
      chunkIndex,
      tokenCount: countEstimatedTokens(draft.content),
      metadata: {
        overlapTokens: draft.overlapTokens,
        source: "pdf-chunker",
        sectionTitles,
      },
    };
  });
}

export function countEstimatedTokens(text: string): number {
  return (
    text.match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)?|[^\sA-Za-z0-9]/g)?.length ?? 0
  );
}

function normalizeOptions(options: ChunkTextOptions) {
  const minTokens = options.minTokens ?? DEFAULT_MIN_TOKENS;
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
  const overlapTokens = options.overlapTokens ?? DEFAULT_OVERLAP_TOKENS;

  if (minTokens < 1) {
    throw new Error("minTokens must be greater than zero.");
  }

  if (maxTokens < minTokens) {
    throw new Error("maxTokens must be greater than or equal to minTokens.");
  }

  if (overlapTokens < 0 || overlapTokens >= maxTokens) {
    throw new Error("overlapTokens must be non-negative and below maxTokens.");
  }

  return { minTokens, maxTokens, overlapTokens };
}

function parseSections(text: string): Section[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((line) => line.trim())
    .filter(Boolean);
  const sections: Section[] = [];
  let current: Section = { title: null, paragraphs: [] };

  for (const paragraph of paragraphs) {
    if (isLikelyHeading(paragraph)) {
      if (current.title || current.paragraphs.length > 0) {
        sections.push(current);
      }
      current = { title: cleanHeading(paragraph), paragraphs: [] };
      continue;
    }

    current.paragraphs.push(paragraph);
  }

  if (current.title || current.paragraphs.length > 0) {
    sections.push(current);
  }

  return sections;
}

function splitOversizedSection(
  text: string,
  sectionTitle: string | null,
  config: Required<ChunkTextOptions>,
): ChunkDraft[] {
  const sectionTitleTokens = sectionTitle
    ? countEstimatedTokens(sectionTitle)
    : 0;
  const bodyText =
    sectionTitle && text.startsWith(sectionTitle)
      ? text.slice(sectionTitle.length).trim()
      : text;
  const pieceTokenBudget = Math.max(
    1,
    config.maxTokens - Math.max(config.overlapTokens, sectionTitleTokens),
  );
  const pieces = recursivelySplitText(bodyText, pieceTokenBudget);
  const drafts: ChunkDraft[] = [];
  let current = sectionTitle && bodyText !== text ? sectionTitle : "";
  let currentOverlapTokens = 0;

  for (const piece of pieces) {
    const candidate = joinInline(current, piece);
    if (current && countEstimatedTokens(candidate) > config.maxTokens) {
      drafts.push({
        content: current,
        sectionTitles: sectionTitle ? [sectionTitle] : [],
        overlapTokens: currentOverlapTokens,
      });
      const nextChunk = joinWithBoundedOverlap(
        current,
        piece,
        config.maxTokens,
        config.overlapTokens,
      );
      current = nextChunk.content;
      currentOverlapTokens = nextChunk.overlapTokens;
      continue;
    }

    current = candidate;
  }

  if (current) {
    drafts.push({
      content: current,
      sectionTitles: sectionTitle ? [sectionTitle] : [],
      overlapTokens: currentOverlapTokens,
    });
  }

  return drafts;
}

function joinWithBoundedOverlap(
  previous: string,
  next: string,
  maxTokens: number,
  overlapTokens: number,
) {
  const nextTokenCount = countEstimatedTokens(next);
  const overlapBudget = Math.min(
    overlapTokens,
    Math.max(0, maxTokens - nextTokenCount),
  );

  return {
    content: joinInline(takeLastTokens(previous, overlapBudget), next),
    overlapTokens: overlapBudget,
  };
}

function recursivelySplitText(text: string, maxTokens: number): string[] {
  if (countEstimatedTokens(text) <= maxTokens) {
    return [text];
  }

  for (const splitter of [/\n{2,}/, SENTENCE_BOUNDARY, /;\s+/, /,\s+/]) {
    const pieces = text
      .split(splitter)
      .map((piece) => piece.trim())
      .filter(Boolean);
    if (pieces.length > 1) {
      return pieces.flatMap((piece) => recursivelySplitText(piece, maxTokens));
    }
  }

  const tokens = tokenizeWithSpacing(text);
  const chunks: string[] = [];
  for (let index = 0; index < tokens.length; index += maxTokens) {
    chunks.push(tokens.slice(index, index + maxTokens).join(" "));
  }
  return chunks;
}

function sectionToText(section: Section) {
  return [section.title, ...section.paragraphs].filter(Boolean).join("\n\n");
}

function isLikelyHeading(text: string) {
  if (text.length > 120 || /[.!?]$/.test(text)) {
    return false;
  }

  const wordCount = text.split(/\s+/).length;

  return (
    /^[A-Z][A-Z0-9 &()/:,-]{5,}$/.test(text) ||
    /^(\d+(\.\d+)*\.?\s+)[A-Z][A-Za-z0-9 &()/:,-]{2,}$/.test(text) ||
    (wordCount <= 8 && /^[A-Z][A-Za-z0-9 &()/:,-]{2,}$/.test(text))
  );
}

function cleanHeading(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function mergeSectionTitles(left: string[], right: string[]) {
  return Array.from(new Set([...left, ...right]));
}

function joinBlocks(left: string, right: string) {
  return [left, right].filter(Boolean).join("\n\n");
}

function joinInline(left: string, right: string) {
  return [left, right].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function takeLastTokens(text: string, tokenCount: number) {
  if (tokenCount === 0) {
    return "";
  }

  return tokenizeWithSpacing(text).slice(-tokenCount).join(" ");
}

function tokenizeWithSpacing(text: string) {
  return text.match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)?|[^\sA-Za-z0-9]/g) ?? [];
}
