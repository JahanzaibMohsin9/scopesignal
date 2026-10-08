import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { classificationEvaluationScenarios } from "@/lib/openai/classification-evaluation-set";
import {
  classifyScope,
  type ClassificationOutput,
  type ClassificationSupabaseClient,
} from "@/lib/openai/classification";

const DEFAULT_MODELS = ["gpt-5-mini", "gpt-5.2"];

const MODEL_PRICING_PER_1M_TOKENS: Record<
  string,
  { inputUsd: number; outputUsd: number; source: string }
> = {
  "gpt-5-mini": {
    inputUsd: 0.25,
    outputUsd: 2,
    source: "https://developers.openai.com/api/docs/models/gpt-5-mini",
  },
  "gpt-5.2": {
    inputUsd: 1.75,
    outputUsd: 14,
    source: "https://developers.openai.com/api/docs/models/gpt-5.2",
  },
};

type ScenarioResult = {
  scenarioId: string;
  scenarioName: string;
  category: string;
  expectedVerdict: string;
  verdict: string | null;
  confidence: number | null;
  needsHumanReview: boolean | null;
  matchedSection: string | null;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  passed: boolean;
  failureReasons: string[];
  error: string | null;
};

function parseModels() {
  const modelsArg = process.argv.find((arg) => arg.startsWith("--models="));
  const modelsValue =
    modelsArg?.slice("--models=".length) ?? process.env.DAY31_MODELS;

  return (modelsValue ? modelsValue.split(",") : DEFAULT_MODELS)
    .map((model) => model.trim())
    .filter(Boolean);
}

function getPricing(model: string) {
  return MODEL_PRICING_PER_1M_TOKENS[model] ?? null;
}

function estimateCost({
  model,
  promptTokens,
  completionTokens,
}: {
  model: string;
  promptTokens: number;
  completionTokens: number;
}) {
  const pricing = getPricing(model);

  if (!pricing) {
    return 0;
  }

  return (
    (promptTokens / 1_000_000) * pricing.inputUsd +
    (completionTokens / 1_000_000) * pricing.outputUsd
  );
}

function createNoopSupabaseClient() {
  return {
    from: () => ({
      insert: async () => ({ error: null }),
    }),
  } as unknown as ClassificationSupabaseClient;
}

function scoreOutput({
  output,
  expected,
}: {
  output: ClassificationOutput;
  expected: {
    verdict: "in_scope" | "out_of_scope";
    needsHumanReview: false;
    matchedChunkId: string;
    minConfidence: number;
  };
}) {
  const failureReasons: string[] = [];

  if (output.verdict !== expected.verdict) {
    failureReasons.push(
      `expected verdict ${expected.verdict}, received ${output.verdict}`,
    );
  }

  if (output.needs_human_review !== expected.needsHumanReview) {
    failureReasons.push(
      `expected needs_human_review ${expected.needsHumanReview}, received ${output.needs_human_review}`,
    );
  }

  if (output.confidence < expected.minConfidence) {
    failureReasons.push(
      `expected confidence >= ${expected.minConfidence}, received ${output.confidence}`,
    );
  }

  if (!output.matched_section.includes(`(${expected.matchedChunkId})`)) {
    failureReasons.push(
      `expected matched_section to cite ${expected.matchedChunkId}`,
    );
  }

  return {
    passed: failureReasons.length === 0,
    failureReasons,
  };
}

function summarize(results: ScenarioResult[]) {
  const passed = results.filter((result) => result.passed).length;
  const completed = results.filter((result) => !result.error).length;
  const totalLatencyMs = results.reduce(
    (total, result) => total + result.latencyMs,
    0,
  );
  const totalPromptTokens = results.reduce(
    (total, result) => total + result.promptTokens,
    0,
  );
  const totalCompletionTokens = results.reduce(
    (total, result) => total + result.completionTokens,
    0,
  );
  const totalEstimatedCostUsd = results.reduce(
    (total, result) => total + result.estimatedCostUsd,
    0,
  );

  return {
    scenarioCount: results.length,
    completed,
    passed,
    accuracy: passed / Math.max(results.length, 1),
    averageLatencyMs: totalLatencyMs / Math.max(results.length, 1),
    totalPromptTokens,
    totalCompletionTokens,
    totalTokens: totalPromptTokens + totalCompletionTokens,
    totalEstimatedCostUsd,
    averageEstimatedCostUsd:
      totalEstimatedCostUsd / Math.max(results.length, 1),
  };
}

async function evaluateModel(model: string) {
  const scenarioResults: ScenarioResult[] = [];
  const supabase = createNoopSupabaseClient();

  for (const scenario of classificationEvaluationScenarios) {
    const started = performance.now();

    try {
      const result = await classifyScope({
        input: scenario.input,
        model,
        supabase,
      });
      const latencyMs = performance.now() - started;
      const scoring = scoreOutput({
        output: result.output,
        expected: scenario.expected,
      });

      scenarioResults.push({
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        category: scenario.category,
        expectedVerdict: scenario.expected.verdict,
        verdict: result.output.verdict,
        confidence: result.output.confidence,
        needsHumanReview: result.output.needs_human_review,
        matchedSection: result.output.matched_section,
        latencyMs,
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        totalTokens: result.usage.totalTokens,
        estimatedCostUsd: estimateCost({
          model,
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
        }),
        passed: scoring.passed,
        failureReasons: scoring.failureReasons,
        error: null,
      });
    } catch (error) {
      scenarioResults.push({
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        category: scenario.category,
        expectedVerdict: scenario.expected.verdict,
        verdict: null,
        confidence: null,
        needsHumanReview: null,
        matchedSection: null,
        latencyMs: performance.now() - started,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
        passed: false,
        failureReasons: ["classification call failed"],
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    model,
    pricing: getPricing(model),
    summary: summarize(scenarioResults),
    scenarioResults,
  };
}

async function main() {
  const models = parseModels();
  const evaluatedAt = new Date().toISOString();
  const modelResults = [];

  for (const model of models) {
    console.log(`Benchmarking ${model}...`);
    modelResults.push(await evaluateModel(model));
  }

  const successfulModels = modelResults.filter(
    (result) => result.summary.completed === result.summary.scenarioCount,
  );
  const productionDefault =
    successfulModels.find(
      (result) =>
        result.model === "gpt-5-mini" && result.summary.accuracy >= 0.9,
    )?.model ??
    [...successfulModels].sort((a, b) => {
      if (b.summary.accuracy !== a.summary.accuracy) {
        return b.summary.accuracy - a.summary.accuracy;
      }

      if (
        a.summary.averageEstimatedCostUsd !== b.summary.averageEstimatedCostUsd
      ) {
        return (
          a.summary.averageEstimatedCostUsd - b.summary.averageEstimatedCostUsd
        );
      }

      return a.summary.averageLatencyMs - b.summary.averageLatencyMs;
    })[0]?.model ??
    models[0];
  const escalationModel = successfulModels.some(
    (result) => result.model === "gpt-5.2",
  )
    ? "gpt-5.2"
    : productionDefault;

  const output = {
    evaluatedAt,
    scenarios: {
      count: classificationEvaluationScenarios.length,
      clearInScope: classificationEvaluationScenarios.filter(
        (scenario) => scenario.category === "clear_in_scope",
      ).length,
      clearOutOfScope: classificationEvaluationScenarios.filter(
        (scenario) => scenario.category === "clear_out_of_scope",
      ).length,
    },
    modelResults,
    policy: {
      productionDefault,
      escalationModel,
      escalationRule:
        "Use the escalation model for low-confidence, needs_review, malformed, or contradictory classifications before alert persistence.",
    },
  };

  writeFileSync(
    resolve(process.cwd(), "docs/classification-model-benchmark.json"),
    `${JSON.stringify(output, null, 2)}\n`,
  );

  console.log("Day 31 classification model benchmark");
  for (const result of modelResults) {
    console.log(
      `${result.model}: accuracy=${(result.summary.accuracy * 100).toFixed(1)}%, avg_latency=${result.summary.averageLatencyMs.toFixed(0)}ms, total_cost=$${result.summary.totalEstimatedCostUsd.toFixed(6)}`,
    );
  }
  console.log(`Production default: ${productionDefault}`);
  console.log(`Escalation model: ${escalationModel}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
