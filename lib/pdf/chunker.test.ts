import { describe, expect, it } from "vitest";

import { chunkDocumentText } from "./chunker";

function words(prefix: string, count: number) {
  return Array.from({ length: count }, (_, index) => `${prefix}${index}`).join(
    " ",
  );
}

describe("chunkDocumentText", () => {
  it("keeps short adjacent sections together while retaining their titles", () => {
    const chunks = chunkDocumentText(
      [
        "SCOPE OF WORK",
        words("scope", 18),
        "EXCLUDED SERVICES",
        words("excluded", 18),
      ].join("\n\n"),
      { minTokens: 20, maxTokens: 60, overlapTokens: 8 },
    );

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({
      chunkIndex: 0,
      sectionTitle: "SCOPE OF WORK",
      sectionTitles: ["SCOPE OF WORK", "EXCLUDED SERVICES"],
    });
    expect(chunks[0]?.content).toContain("EXCLUDED SERVICES");
    expect(chunks[0]?.tokenCount).toBeLessThanOrEqual(60);
  });

  it("splits oversized sections with overlap and stable sequence numbers", () => {
    const chunks = chunkDocumentText(
      ["PAYMENT TERMS", words("payment", 72)].join("\n\n"),
      { minTokens: 20, maxTokens: 30, overlapTokens: 6 },
    );

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((chunk) => chunk.chunkIndex)).toEqual(
      chunks.map((_, index) => index),
    );
    expect(
      chunks.every((chunk) => chunk.sectionTitle === "PAYMENT TERMS"),
    ).toBe(true);
    expect(chunks.every((chunk) => chunk.tokenCount <= 30)).toBe(true);

    const firstTail = chunks[0]?.content.split(/\s+/).slice(-6).join(" ");
    expect(chunks[1]?.content).toContain(firstTail);
  });

  it("prefers section boundaries when the next section would exceed max tokens", () => {
    const chunks = chunkDocumentText(
      [
        "INCLUDED SERVICES",
        words("included", 28),
        "CHANGE ORDERS",
        words("change", 28),
      ].join("\n\n"),
      { minTokens: 20, maxTokens: 34, overlapTokens: 5 },
    );

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatchObject({
      chunkIndex: 0,
      sectionTitle: "INCLUDED SERVICES",
    });
    expect(chunks[1]).toMatchObject({
      chunkIndex: 1,
      sectionTitle: "CHANGE ORDERS",
    });
  });
});
