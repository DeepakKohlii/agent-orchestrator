import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { isMockMode } from "../runtime.js";
import { mockStructured } from "./mock.js";

export interface StructuredRequest<T> {
  system: string;
  prompt: string;
  schema: z.ZodSchema<T>;
  schemaName: string;
}

// Single entrypoint for every LLM-assisted step. Returns a Zod-validated object.
// On validation failure we do one repair attempt, then throw (never return junk).
export async function structuredComplete<T>(req: StructuredRequest<T>): Promise<T> {
  const raw = await callProvider(req);
  const parsed = req.schema.safeParse(raw);
  if (parsed.success) return parsed.data;

  // One repair attempt: re-ask with the validation error appended.
  const repaired = await callProvider({
    ...req,
    prompt: `${req.prompt}\n\nYour previous answer failed validation: ${parsed.error.message}. Return only valid JSON matching the schema.`,
  });
  const reparse = req.schema.safeParse(repaired);
  if (reparse.success) return reparse.data;

  throw new Error(
    `LLM output failed validation for ${req.schemaName}: ${reparse.error.message}`,
  );
}

async function callProvider<T>(req: StructuredRequest<T>): Promise<unknown> {
  // Runtime mock mode (UI toggle or no key) short-circuits any real provider.
  if (isMockMode()) return mockStructured(req.schemaName, req.prompt);
  switch (config.llm.provider) {
    case "anthropic":
      return callAnthropic(req);
    case "openai":
    case "groq":
      return callOpenAiCompatible(req);
    default:
      return mockStructured(req.schemaName, req.prompt);
  }
}

// ── Anthropic (tool-use forces JSON shape) ────────────────────────────────────
async function callAnthropic<T>(req: StructuredRequest<T>): Promise<unknown> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: config.llm.anthropicKey });
  const res = await client.messages.create({
    model: config.llm.model,
    max_tokens: 1024,
    system: req.system,
    messages: [{ role: "user", content: req.prompt }],
    tools: [
      {
        name: "emit",
        description: `Return the result as structured data for ${req.schemaName}.`,
        input_schema: zodToJsonSchema(req.schema) as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: "tool", name: "emit" },
  });
  const block = res.content.find((c) => c.type === "tool_use");
  return block && block.type === "tool_use" ? block.input : {};
}

// ── OpenAI / Groq (OpenAI-compatible JSON mode) ───────────────────────────────
async function callOpenAiCompatible<T>(req: StructuredRequest<T>): Promise<unknown> {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({
    apiKey: config.llm.provider === "groq" ? config.llm.groqKey : config.llm.openaiKey,
    baseURL: config.llm.provider === "groq" ? "https://api.groq.com/openai/v1" : undefined,
  });
  const res = await client.chat.completions.create({
    model: config.llm.model,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: `${req.system}\nRespond with a single JSON object only.` },
      { role: "user", content: req.prompt },
    ],
  });
  const content = res.choices[0]?.message?.content ?? "{}";
  try {
    return JSON.parse(content);
  } catch {
    return {};
  }
}

function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(value);
      if (!(value instanceof z.ZodOptional)) required.push(key);
    }
    return { type: "object", properties, required };
  }
  if (schema instanceof z.ZodArray) return { type: "array", items: zodToJsonSchema(schema.element) };
  if (schema instanceof z.ZodEnum) return { type: "string", enum: schema.options };
  if (schema instanceof z.ZodNumber) return { type: "number" };
  if (schema instanceof z.ZodBoolean) return { type: "boolean" };
  if (schema instanceof z.ZodOptional) return zodToJsonSchema(schema.unwrap());
  return { type: "string" };
}
