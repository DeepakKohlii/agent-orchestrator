import { z } from "zod";

// Structured-output schemas for LLM-assisted steps. The LLM only ever returns
// data shaped like these; the orchestrator decides what to do with it.

export const TicketClassificationSchema = z.object({
  category: z.enum(["billing", "technical", "account", "general"]),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  sentiment: z.enum(["positive", "neutral", "negative"]),
  summary: z.string(),
  riskScore: z.number().min(0).max(100),
});
export type TicketClassification = z.infer<typeof TicketClassificationSchema>;

export const DraftReplySchema = z.object({
  subject: z.string(),
  body: z.string(),
  tone: z.enum(["empathetic", "neutral", "formal"]),
});
export type DraftReply = z.infer<typeof DraftReplySchema>;

export const AccountSummarySchema = z.object({
  summary: z.string(),
  riskLevel: z.enum(["low", "medium", "high"]),
  recommendedActions: z.array(z.string()),
});
export type AccountSummary = z.infer<typeof AccountSummarySchema>;
