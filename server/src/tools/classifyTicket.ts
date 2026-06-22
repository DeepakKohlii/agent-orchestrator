import { z } from "zod";
import { defineTool } from "./types.js";
import { structuredComplete } from "../llm/client.js";
import { TicketClassificationSchema } from "../llm/schemas.js";

// LLM-assisted decision step. Returns Zod-validated structured output.
export const classifyTicket = defineTool({
  name: "classify_ticket",
  description: "Classify a support ticket (category, priority, sentiment, risk).",
  requiresApproval: false,
  riskScore: 0,
  inputSchema: z.object({
    subject: z.string(),
    message: z.string(),
    customerPlan: z.string().optional(),
  }),
  outputSchema: TicketClassificationSchema,
  async run(input) {
    return structuredComplete({
      schemaName: "TicketClassification",
      schema: TicketClassificationSchema,
      system:
        "You are a support triage assistant. Classify the ticket accurately and " +
        "assign a riskScore (0-100) reflecting business/financial impact.",
      prompt:
        `Subject: ${input.subject}\nMessage: ${input.message}\n` +
        (input.customerPlan ? `Customer plan: ${input.customerPlan}\n` : ""),
    });
  },
});
