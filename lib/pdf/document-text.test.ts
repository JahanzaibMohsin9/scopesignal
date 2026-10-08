import { beforeEach, describe, expect, it, vi } from "vitest";

import { parsePdfForReview } from "./document-text";

const { extractPdfTextMock, normalizeParsedPdfTextMock } = vi.hoisted(() => ({
  extractPdfTextMock: vi.fn(),
  normalizeParsedPdfTextMock: vi.fn(),
}));

vi.mock("./extractors", () => ({
  extractPdfText: extractPdfTextMock,
}));

vi.mock("./normalizer", () => ({
  normalizeParsedPdfText: normalizeParsedPdfTextMock,
}));

const pdfBytes = new Uint8Array([1, 2, 3]);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("parsePdfForReview", () => {
  it("returns normalized primary parser text when enough text is extracted", async () => {
    extractPdfTextMock.mockResolvedValue({
      pages: ["primary page"],
    });
    normalizeParsedPdfTextMock.mockReturnValue({
      text: Array.from({ length: 55 }, (_, index) => `word${index}`).join(" "),
    });

    await expect(parsePdfForReview(pdfBytes)).resolves.toEqual({
      parsedText: expect.stringContaining("word0"),
      parser: "pdf-parse",
      parseError: null,
    });
    expect(extractPdfTextMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to pdfjs-dist when primary extraction is too sparse", async () => {
    extractPdfTextMock
      .mockResolvedValueOnce({ pages: ["sparse"] })
      .mockResolvedValueOnce({ pages: ["fallback page"] });
    normalizeParsedPdfTextMock
      .mockReturnValueOnce({ text: "too short" })
      .mockReturnValueOnce({ text: "fallback readable text" });

    await expect(parsePdfForReview(pdfBytes)).resolves.toEqual({
      parsedText: "fallback readable text",
      parser: "pdfjs-dist",
      parseError: null,
    });
    expect(extractPdfTextMock).toHaveBeenNthCalledWith(
      2,
      pdfBytes,
      "pdfjs-dist",
    );
  });

  it("returns a parse error when both engines fail", async () => {
    extractPdfTextMock
      .mockRejectedValueOnce(new Error("primary failed"))
      .mockRejectedValueOnce(new Error("fallback failed"));

    await expect(parsePdfForReview(pdfBytes)).resolves.toEqual({
      parsedText: null,
      parser: null,
      parseError: "fallback failed",
    });
  });

  it("passes separate byte copies to each parser attempt", async () => {
    extractPdfTextMock
      .mockResolvedValueOnce({ pages: ["sparse"] })
      .mockResolvedValueOnce({ pages: ["fallback page"] });
    normalizeParsedPdfTextMock
      .mockReturnValueOnce({ text: "too short" })
      .mockReturnValueOnce({ text: "fallback readable text" });

    await parsePdfForReview(pdfBytes);

    const primaryBytes = extractPdfTextMock.mock.calls[0][0];
    const fallbackBytes = extractPdfTextMock.mock.calls[1][0];

    expect(primaryBytes).toBeInstanceOf(Uint8Array);
    expect(fallbackBytes).toBeInstanceOf(Uint8Array);
    expect(primaryBytes).not.toBe(pdfBytes);
    expect(fallbackBytes).not.toBe(pdfBytes);
    expect(fallbackBytes).not.toBe(primaryBytes);
  });
});
