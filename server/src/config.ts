import "dotenv/config";

export type LlmProvider = "anthropic" | "openai" | "groq" | "mock";

function resolveProvider(): LlmProvider {
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.GROQ_API_KEY) return "groq";
  return "mock";
}

const DEFAULT_MODELS: Record<LlmProvider, string> = {
  anthropic: "claude-haiku-4-5-20251001",
  openai: "gpt-4o-mini",
  groq: "llama-3.3-70b-versatile",
  mock: "mock",
};

export const config = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL ?? "",
  llm: {
    provider: resolveProvider(),
    model: process.env.LLM_MODEL ?? DEFAULT_MODELS[resolveProvider()],
    anthropicKey: process.env.ANTHROPIC_API_KEY,
    openaiKey: process.env.OPENAI_API_KEY,
    groqKey: process.env.GROQ_API_KEY,
  },
  approvalRiskThreshold: 70,
  maxRetries: 2,
  toolTimeoutMs: Number(process.env.TOOL_TIMEOUT_MS ?? 20000),
} as const;
