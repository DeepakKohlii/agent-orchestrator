import { z } from "zod";
import { defineTool } from "./types.js";
import { structuredComplete } from "../llm/client.js";
import { DraftReplySchema } from "../llm/schemas.js";

export const draftReply = defineTool({
  name: "draft_reply",
  description: "Draft a customer-facing reply based on the ticket and classification.",
  requiresApproval: false,
  riskScore: 20,
  inputSchema: z.object({
    customerName: z.string().optional(),
    subject: z.string(),
    message: z.string(),
    category: z.string().optional(),
    sentiment: z.string().optional(),
  }),
  outputSchema: DraftReplySchema,
  async run(input) {
    return structuredComplete({
      schemaName: "DraftReply",
      schema: DraftReplySchema,
      system:
        "You are a customer support agent. Write a concise, helpful reply. " +
        "Match tone to sentiment. Do not promise refunds or actions not yet approved.",
      prompt:
        `Customer: ${input.customerName ?? "there"}\nSubject: ${input.subject}\n` +
        `Message: ${input.message}\nCategory: ${input.category ?? "n/a"}\n` +
        `Sentiment: ${input.sentiment ?? "n/a"}\n`,
    });
  },
});
