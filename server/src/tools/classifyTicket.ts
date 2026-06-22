import { z } from "zod";
import { defineTool } from "./types.js";
import { structuredComplete } from "../llm/client.js";
import { TicketClassificationSchema } from "../llm/schemas.js";

// LLM-assisted decision step. Returns Zod-validated structured output.
// Account context (from the CRM lookup) is fed in so risk reflects the customer,
// not just the ticket text — e.g. an overdue enterprise account scores higher.
export const classifyTicket = defineTool({
  name: "classify_ticket",
  description: "Classify a support ticket (category, priority, sentiment, risk).",
  requiresApproval: false,
  riskScore: 0,
  inputSchema: z.object({
    subject: z.string(),
    message: z.string(),
    customerPlan: z.string().optional(),
    accountContext: z
      .object({
        plan: z.string().optional(),
        accountStatus: z.string().optional(),
        paymentStatus: z.string().optional(),
        openTickets: z.number().optional(),
        lifetimeValueUsd: z.number().optional(),
        satisfactionScore: z.number().optional(),
      })
      .optional(),
  }),
  outputSchema: TicketClassificationSchema,
  async run(input) {
    return structuredComplete({
      schemaName: "TicketClassification",
      schema: TicketClassificationSchema,
      system:
        "You are a support triage assistant. Classify the ticket accurately and " +
        "assign a riskScore (0-100) reflecting business/financial impact. Weigh the " +
        "account context: high lifetime value, enterprise plan, overdue payments, " +
        "at-risk status, many open tickets, or low satisfaction should raise risk.",
      prompt:
        `Subject: ${input.subject}\nMessage: ${input.message}\n` +
        (input.accountContext
          ? `Account context: ${JSON.stringify(input.accountContext)}\n`
          : input.customerPlan
            ? `Customer plan: ${input.customerPlan}\n`
            : ""),
    });
  },
});
