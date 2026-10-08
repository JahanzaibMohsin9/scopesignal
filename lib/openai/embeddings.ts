import OpenAI from "openai";
import { getEmbeddingModel, getOpenAiApiKey } from "@/lib/openai/config";

export type EmbeddingUsage = {
  promptTokens: number;
  totalTokens: number;
  rawUsage: unknown;
  requestId: string | null;
};

export type EmbeddingResult = {
  embeddings: number[][];
  model: string;
  usage: EmbeddingUsage;
};

export type EmbeddingClient = Pick<OpenAI, "embeddings">;

export async function createEmbeddings(
  input: string[],
  client: EmbeddingClient = createOpenAiEmbeddingClient(),
): Promise<EmbeddingResult> {
  if (input.length === 0) {
    return {
      embeddings: [],
      model: getEmbeddingModel(),
      usage: {
        promptTokens: 0,
        totalTokens: 0,
        rawUsage: {},
        requestId: null,
      },
    };
  }

  const response = await client.embeddings.create({
    model: getEmbeddingModel(),
    input,
  });

  return {
    embeddings: response.data.map((item) => item.embedding),
    model: response.model,
    usage: {
      promptTokens: response.usage.prompt_tokens,
      totalTokens: response.usage.total_tokens,
      rawUsage: response.usage,
      requestId: response._request_id ?? null,
    },
  };
}

export function createOpenAiEmbeddingClient(
  apiKey = getOpenAiApiKey(),
): OpenAI {
  return new OpenAI({
    apiKey,
  });
}
