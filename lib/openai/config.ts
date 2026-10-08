export const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
export const DEFAULT_CLASSIFICATION_MODEL = "gpt-5-mini";
export const DEFAULT_ESCALATION_MODEL = "gpt-5.2";

export function getOpenAiApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for embedding generation.");
  }

  return apiKey;
}

export function getEmbeddingModel(): string {
  return process.env.OPENAI_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL;
}

export function getClassificationModel(): string {
  return (
    process.env.OPENAI_CLASSIFICATION_MODEL || DEFAULT_CLASSIFICATION_MODEL
  );
}

export function getEscalationModel(): string {
  return process.env.OPENAI_ESCALATION_MODEL || DEFAULT_ESCALATION_MODEL;
}
