import { describe, expect, it, vi } from "vitest";
import { classificationEvaluationScenarios } from "@/lib/openai/classification-evaluation-set";
import {
  CLASSIFICATION_SYSTEM_PROMPT,
  classifyScope,
  type ClassificationOpenAIClient,
  type ClassificationOutput,
  type ClassificationSupabaseClient,
} from "@/lib/openai/classification";
import type { ClassificationEvaluationScenario } from "@/lib/openai/classification-evaluation-set";

function createSupabaseClient() {
  return {
    from: vi.fn(() => ({
      insert: vi.fn(async () => ({ error: null })),
    })),
  } as unknown as ClassificationSupabaseClient;
}

function buildMockOutput(
  scenario: ClassificationEvaluationScenario,
): ClassificationOutput {
  const chunk = scenario.input.chunks.find(
    (candidate) => candidate.id === scenario.expected.matchedChunkId,
  );

  if (!chunk) {
    throw new Error(
      `Missing fixture chunk ${scenario.expected.matchedChunkId}`,
    );
  }

  return {
    verdict: scenario.expected.verdict,
    confidence: scenario.expected.minConfidence + 0.05,
    reason: `The cited ${chunk.sectionTitle ?? "contract"} language clearly supports ${scenario.expected.verdict}.`,
    matched_section: chunk.sectionTitle
      ? `${chunk.documentTitle} > ${chunk.sectionTitle} (${chunk.id})`
      : `${chunk.documentTitle} (${chunk.id})`,
    needs_human_review: scenario.expected.needsHumanReview,
  };
}

function createScenarioClient(
  scenario: ClassificationEvaluationScenario,
): ClassificationOpenAIClient {
  return {
    responses: {
      parse: vi.fn(async (args: unknown) => {
        const request = args as {
          input: Array<{ role: string; content: string }>;
        };
        const systemPrompt = request.input.find(
          (message) => message.role === "system",
        )?.content;
        const userPayload = request.input.find(
          (message) => message.role === "user",
        )?.content;

        expect(systemPrompt).toBe(CLASSIFICATION_SYSTEM_PROMPT);
        expect(userPayload).toContain(scenario.input.clientMessage);
        expect(userPayload).toContain('"rank":1');
        expect(userPayload).toContain(scenario.expected.matchedChunkId);

        return {
          output_parsed: buildMockOutput(scenario),
          model: "gpt-5-mini",
          usage: {
            input_tokens: 200,
            output_tokens: 50,
            total_tokens: 250,
          },
        };
      }),
    },
  };
}

describe("CLASSIFICATION_SYSTEM_PROMPT", () => {
  it("captures Day 30 classification, calibration, and evidence rules", () => {
    expect(CLASSIFICATION_SYSTEM_PROMPT).toContain(
      "ranked proposal or addendum excerpts",
    );
    expect(CLASSIFICATION_SYSTEM_PROMPT).toContain(
      "thread context as contract evidence",
    );
    expect(CLASSIFICATION_SYSTEM_PROMPT).toContain("0.85-1.00");
    expect(CLASSIFICATION_SYSTEM_PROMPT).toContain("needs_review");
    expect(CLASSIFICATION_SYSTEM_PROMPT).toContain(
      "Document Title > Section Title (chunk_id)",
    );
  });
});

describe("Day 30 offline prompt scenarios", () => {
  it.each(classificationEvaluationScenarios)(
    "classifies clear-cut example: $name",
    async (scenario) => {
      const result = await classifyScope({
        input: scenario.input,
        openai: createScenarioClient(scenario),
        supabase: createSupabaseClient(),
        sleep: vi.fn(),
      });

      expect(result.output.verdict).toBe(scenario.expected.verdict);
      expect(result.output.confidence).toBeGreaterThanOrEqual(
        scenario.expected.minConfidence,
      );
      expect(result.output.needs_human_review).toBe(
        scenario.expected.needsHumanReview,
      );
      expect(result.output.matched_section).toContain(
        `(${scenario.expected.matchedChunkId})`,
      );
    },
  );
});
