import { z } from "zod";
import { defineTool } from "./types.js";
import { prisma } from "../db/client.js";
export const searchCustomerProfile = defineTool({
  name: "search_customer_profile",
  description: "Look up a customer profile by id or email from the CRM.",
  requiresApproval: false,
  riskScore: 0,
  inputSchema: z
    .object({
      customerId: z.string().optional(),
      email: z.string().optional(),
    })
    .refine((v) => v.customerId || v.email, {
      message: "Provide a customerId or email to look up.",
    }),
  outputSchema: z.object({
    customerId: z.string(),
    name: z.string(),
    email: z.string(),
    company: z.string(),
    plan: z.enum(["free", "pro", "enterprise"]),
    region: z.string(),
    phone: z.string(),
    tenureMonths: z.number(),
    signupDate: z.string(),
    openTickets: z.number(),
    lifetimeValueUsd: z.number(),
    accountStatus: z.enum(["active", "at_risk", "churned"]),
    paymentStatus: z.enum(["current", "overdue"]),
    satisfactionScore: z.number(),
    lastContactAt: z.string(),
    notes: z.string(),
  }),
  async run(input) {
    const where = input.customerId
      ? { id: input.customerId }
      : { email: input.email! };
    const customer = await prisma.customer.findFirst({ where });

    if (!customer) {
      // Surfaced as a tool error → step fails (demonstrates the failure path).
      throw new Error(
        `Customer not found for ${input.customerId ?? input.email}. ` +
          `Seeded ids: cust_1024, cust_2048, cust_3071, cust_4096, cust_5120.`,
      );
    }

    return {
      customerId: customer.id,
      name: customer.name,
      email: customer.email,
      company: customer.company,
      plan: customer.plan as "free" | "pro" | "enterprise",
      region: customer.region,
      phone: customer.phone,
      tenureMonths: customer.tenureMonths,
      signupDate: customer.signupDate,
      openTickets: customer.openTickets,
      lifetimeValueUsd: customer.lifetimeValueUsd,
      accountStatus: customer.accountStatus as "active" | "at_risk" | "churned",
      paymentStatus: customer.paymentStatus as "current" | "overdue",
      satisfactionScore: customer.satisfactionScore,
      lastContactAt: customer.lastContactAt,
      notes: customer.notes,
    };
  },
});
