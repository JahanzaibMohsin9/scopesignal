import { beforeEach, describe, expect, it, vi } from "vitest";

const { openAiConstructorMock, embeddingsCreateMock } = vi.hoisted(() => ({
  openAiConstructorMock: vi.fn(),
  embeddingsCreateMock: vi.fn(),
}));

vi.mock("openai", () => ({
  default: function OpenAI(options: unknown) {
    openAiConstructorMock(options);
    return {
      embeddings: {
        create: embeddingsCreateMock,
      },
    };
  },
}));

import { createEmbeddings } from "./embeddings";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";
});

describe("createEmbeddings", () => {
  it("returns embeddings, model, usage, and request id from OpenAI", async () => {
    embeddingsCreateMock.mockResolvedValue({
      data: [{ embedding: [0.1, 0.2] }, { embedding: [0.3, 0.4] }],
      model: "text-embedding-3-small",
      usage: {
        prompt_tokens: 12,
        total_tokens: 12,
      },
      _request_id: "req_123",
    });

    await expect(createEmbeddings(["alpha", "beta"])).resolves.toEqual({
      embeddings: [
        [0.1, 0.2],
        [0.3, 0.4],
      ],
      model: "text-embedding-3-small",
      usage: {
        promptTokens: 12,
        totalTokens: 12,
        rawUsage: {
          prompt_tokens: 12,
          total_tokens: 12,
        },
        requestId: "req_123",
      },
    });

    expect(openAiConstructorMock).toHaveBeenCalledWith({
      apiKey: "test-key",
    });
    expect(embeddingsCreateMock).toHaveBeenCalledWith({
      model: "text-embedding-3-small",
      input: ["alpha", "beta"],
    });
  });

  it("requires OPENAI_API_KEY when creating a real client", async () => {
    delete process.env.OPENAI_API_KEY;

    await expect(createEmbeddings(["alpha"])).rejects.toThrow(
      "OPENAI_API_KEY is required",
    );
  });
});
