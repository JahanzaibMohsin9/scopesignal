import { describe, expect, it } from "vitest";

import { normalizeParsedPdfText } from "./normalizer";

describe("normalizeParsedPdfText", () => {
  it("strips repeated headers, footers, and page markers from benchmark-style RFP pages", () => {
    const result = normalizeParsedPdfText([
      [
        "MVRPC Request For Proposals Website Redesign",
        "Page 1 of 3",
        "Scope of Work Attachment A",
        "The Miami Valley Regional Planning Commission is seeking a vendor to",
        "redesign, reorganize and reimagine current content.",
        "-- 1 of 3 --",
      ].join("\n"),
      [
        "MVRPC Request For Proposals Website Redesign",
        "Page 2 of 3",
        "The selected vendor must provide discovery, design, development,",
        "training, launch support, and warranty services.",
        "-- 2 of 3 --",
      ].join("\n"),
      [
        "MVRPC Request For Proposals Website Redesign",
        "Page 3 of 3",
        "Cost Proposal in MS Excel format shall be emailed separately",
        "from the project proposal.",
        "-- 3 of 3 --",
      ].join("\n"),
    ]);

    expect(result.text).not.toContain("MVRPC Request For Proposals");
    expect(result.text).not.toContain("Page 1 of 3");
    expect(result.text).not.toContain("-- 1 of 3 --");
    expect(result.text).toContain(
      "The Miami Valley Regional Planning Commission is seeking a vendor to redesign, reorganize and reimagine current content.",
    );
    expect(result.text).toContain(
      "The selected vendor must provide discovery, design, development, training, launch support, and warranty services.",
    );
  });

  it("normalizes whitespace, bullets, and list markers", () => {
    const result = normalizeParsedPdfText([
      [
        "Scope of Services",
        "•   Weekly status reporting",
        "(a)   Maintain the project plan",
        "1)   Provide launch support",
        "The contractor shall coordinate with the client",
        "before publishing production changes",
      ].join("\n"),
    ]);

    expect(result.text).toContain("- Weekly status reporting");
    expect(result.text).toContain("a. Maintain the project plan");
    expect(result.text).toContain("1. Provide launch support");
    expect(result.text).toContain(
      "The contractor shall coordinate with the client before publishing production changes",
    );
  });

  it("removes table-of-contents entries and signature labels while keeping clauses", () => {
    const result = normalizeParsedPdfText([
      [
        "TABLE OF CONTENTS",
        "1. Project Overview .......... 2",
        "2. Pricing and Fees .......... 8",
        "PROJECT OVERVIEW",
        "Agency will produce campaign concepts and two rounds of revision.",
        "AUTHORIZED SIGNATURE:",
        "Printed Name:",
        "Date:",
      ].join("\n"),
    ]);

    expect(result.text).not.toContain("TABLE OF CONTENTS");
    expect(result.text).not.toContain("Pricing and Fees");
    expect(result.text).not.toContain("AUTHORIZED SIGNATURE");
    expect(result.text).toContain(
      "Agency will produce campaign concepts and two rounds of revision.",
    );
  });
});
