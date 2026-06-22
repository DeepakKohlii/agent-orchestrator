import { z } from "zod";
import { defineTool } from "./types.js";


export const searchCustomerProfile = defineTool({
  name: "search_customer_profile",
  description: "Look up a customer profile by id or email.",
  requiresApproval: false,
  riskScore: 0,
  inputSchema: z.object({
    customerId: z.string().optional(),
    email: z.string().optional(),
  }),
  outputSchema: z.object({
    customerId: z.string(),
    name: z.string(),
    email: z.string(),
    plan: z.enum(["free", "pro", "enterprise"]),
    tenureMonths: z.number(),
    openTickets: z.number(),
  }),
  async run(input) {
    const id = input.customerId ?? input.email ?? "cust_demo";
    return {
      customerId: id,
      name: "Jordan Avery",
      email: input.email ?? "jordan@example.com",
      plan: "pro" as const,
      tenureMonths: 14,
      openTickets: 1,
    };
  },
});
