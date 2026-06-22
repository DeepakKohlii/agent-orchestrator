import { z } from "zod";
import { defineTool } from "./types.js";
import { structuredComplete } from "../llm/client.js";
import { AccountSummarySchema } from "../llm/schemas.js";

export const summarizeAccount = defineTool({
  name: "summarize_account",
  description: "Summarize account risk from profile + recent activity.",
  requiresApproval: false,
  riskScore: 10,
  inputSchema: z.object({
    profile: z.record(z.unknown()),
    classification: z.record(z.unknown()).optional(),
  }),
  outputSchema: AccountSummarySchema,
  async run(input) {
    return structuredComplete({
      schemaName: "AccountSummary",
      schema: AccountSummarySchema,
      system: "You assess account health and risk for a support context.",
      prompt:
        `Profile: ${JSON.stringify(input.profile)}\n` +
        `Classification: ${JSON.stringify(input.classification ?? {})}\n`,
    });
  },
});
