import { describe, expect, it, vi } from "vitest";
import {
  ClassificationOutputSchema,
  classifyScope,
  type ClassificationOpenAIClient,
  type ClassificationSupabaseClient,
} from "@/lib/openai/classification";

const input = {
  workspaceId: "workspace-1",
  clientMessage: "Can we add another landing page before launch?",
  threadContext: "Client asked for one additional page in the launch thread.",
  chunks: [
    {
      id: "chunk-1",
      documentTitle: "Website Redesign Proposal",
      documentKind: "proposal" as const,
      documentEffectiveDate: "2026-04-01",
      sectionTitle: "Deliverables",
      content: "The fixed scope includes homepage, pricing, and contact pages.",
      similarity: 0.91,
      authorityScore: 0.91,
    },
  ],
};

function createSupabaseClient({
  usageError = null,
}: {
  usageError?: { message?: string } | null;
} = {}) {
  const insert = vi.fn(async () => ({ error: usageError }));
  const from = vi.fn(() => ({ insert }));

  return {
    client: { from } as unknown as ClassificationSupabaseClient,
    insert,
  };
}

function createOpenAiClient({ responses }: { responses: unknown[] }) {
  const parse = vi.fn(async () => {
    const next = responses.shift();

    if (next instanceof Error) {
      throw next;
    }

    return next;
  });

  return {
    client: { responses: { parse } } as ClassificationOpenAIClient,
    parse,
  };
}

describe("ClassificationOutputSchema", () => {
  it("accepts the strict Day 29 data contract", () => {
    expect(
      ClassificationOutputSchema.parse({
        verdict: "out_of_scope",
        confidence: 0.84,
        reason: "The requested page is not listed in the deliverables.",
        matched_section: "Deliverables",
        needs_human_review: false,
      }),
    ).toEqual({
      verdict: "out_of_scope",
      confidence: 0.84,
      reason: "The requested page is not listed in the deliverables.",
      matched_section: "Deliverables",
      needs_human_review: false,
    });
  });

  it("rejects malformed classification output", () => {
    expect(() =>
      ClassificationOutputSchema.parse({
        verdict: "maybe",
        confidence: 1.4,
        reason: "",
        matched_section: "Deliverables",
        needs_human_review: "no",
      }),
    ).toThrow();
  });
});

describe("classifyScope", () => {
  it("calls Responses API with structured output and logs token usage", async () => {
    const { client: supabase, insert } = createSupabaseClient();
    const { client: openai, parse } = createOpenAiClient({
      responses: [
        {
          output_parsed: {
            verdict: "out_of_scope",
            confidence: 0.82,
            reason: "The contract does not include an extra landing page.",
            matched_section: "Deliverables",
            needs_human_review: false,
          },
          model: "gpt-5-mini",
          usage: {
            input_tokens: 120,
            output_tokens: 35,
            total_tokens: 155,
          },
          _request_id: "req_123",
        },
      ],
    });

    const result = await classifyScope({
      input,
      openai,
      supabase,
      sleep: vi.fn(),
    });

    expect(result.output.verdict).toBe("out_of_scope");
    expect(parse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5-mini",
        input: expect.any(Array),
        text: {
          format: expect.objectContaining({
            type: "json_schema",
          }),
        },
      }),
    );
    expect(insert).toHaveBeenCalledWith({
      workspace_id: "workspace-1",
      source: "managed",
      provider: "openai",
      model: "gpt-5-mini",
      request_type: "classification",
      prompt_tokens: 120,
      completion_tokens: 35,
      total_tokens: 155,
      raw_usage: {
        input_tokens: 120,
        output_tokens: 35,
        total_tokens: 155,
      },
      request_id: "req_123",
    });
  });

  it("retries transient API failures with exponential backoff", async () => {
    const { client: supabase } = createSupabaseClient();
    const { client: openai, parse } = createOpenAiClient({
      responses: [
        new Error("rate limit"),
        {
          output_parsed: {
            verdict: "needs_review",
            confidence: 0.45,
            reason: "The request is ambiguous.",
            matched_section: "Deliverables",
            needs_human_review: true,
          },
          usage: {
            input_tokens: 100,
            output_tokens: 30,
            total_tokens: 130,
          },
        },
      ],
    });
    const sleep = vi.fn(async () => undefined);

    await expect(
      classifyScope({
        input,
        openai,
        supabase,
        sleep,
        initialRetryDelayMs: 10,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        output: expect.objectContaining({ verdict: "needs_review" }),
      }),
    );

    expect(parse).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(10);
  });

  it("rejects and logs no usage for malformed Responses API output", async () => {
    const { client: supabase, insert } = createSupabaseClient();
    const { client: openai } = createOpenAiClient({
      responses: [
        {
          output_parsed: {
            verdict: "out_of_scope",
            confidence: 1.2,
            reason: "",
            matched_section: "Deliverables",
            needs_human_review: false,
          },
          usage: {
            input_tokens: 100,
            output_tokens: 30,
            total_tokens: 130,
          },
        },
      ],
    });

    await expect(
      classifyScope({
        input,
        openai,
        supabase,
        sleep: vi.fn(),
      }),
    ).rejects.toThrow("Malformed classification response");

    expect(insert).not.toHaveBeenCalled();
  });
});
