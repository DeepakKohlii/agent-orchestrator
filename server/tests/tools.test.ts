import { describe, it, expect, beforeAll } from "vitest";
import { setForcedMock } from "../src/runtime.js";
import { searchCustomerProfile } from "../src/tools/searchCustomerProfile.js";
import { classifyTicket } from "../src/tools/classifyTicket.js";
import { draftReply } from "../src/tools/draftReply.js";
import { summarizeAccount } from "../src/tools/summarizeAccount.js";
import { createTask } from "../src/tools/createTask.js";
import { getTool, toolRegistry } from "../src/tools/registry.js";

// Force mock LLM so tool.run() is deterministic and offline (no API key needed).
beforeAll(() => setForcedMock(true));

describe("tool input validation", () => {
  it("classify_ticket rejects missing required fields", () => {
    expect(classifyTicket.inputSchema.safeParse({}).success).toBe(false);
    expect(classifyTicket.inputSchema.safeParse({ subject: "hi" }).success).toBe(false);
  });

  it("classify_ticket accepts a valid ticket (with optional account context)", () => {
    const ok = classifyTicket.inputSchema.safeParse({
      subject: "Billing question",
      message: "How do cycles work?",
      accountContext: { plan: "pro", lifetimeValueUsd: 4200 },
    });
    expect(ok.success).toBe(true);
  });

  it("search_customer_profile requires a customerId or email (refine)", () => {
    expect(searchCustomerProfile.inputSchema.safeParse({}).success).toBe(false);
    expect(searchCustomerProfile.inputSchema.safeParse({ customerId: "cust_1024" }).success).toBe(true);
    expect(searchCustomerProfile.inputSchema.safeParse({ email: "a@b.com" }).success).toBe(true);
  });

  it("create_task rejects an invalid priority enum", () => {
    expect(
      createTask.inputSchema.safeParse({
        title: "t",
        description: "d",
        priority: "whenever",
      }).success,
    ).toBe(false);
  });
});

describe("approval-required tools", () => {
  it("only create_task is approval-required by default", () => {
    expect(createTask.requiresApproval).toBe(true);
    expect(searchCustomerProfile.requiresApproval).toBe(false);
    expect(classifyTicket.requiresApproval).toBe(false);
    expect(draftReply.requiresApproval).toBe(false);
    expect(summarizeAccount.requiresApproval).toBe(false);
  });

  it("create_task carries the highest static risk score", () => {
    expect(createTask.riskScore).toBeGreaterThanOrEqual(70);
  });
});

describe("tool registry", () => {
  it("exposes all five tools and resolves by name", () => {
    expect(toolRegistry.size).toBe(5);
    expect(getTool("create_task").name).toBe("create_task");
  });

  it("throws on an unknown tool name", () => {
    expect(() => getTool("delete_everything")).toThrow(/Unknown tool/);
  });
});

describe("LLM tool output is schema-valid in mock mode", () => {
  it("classify_ticket returns a valid classification", async () => {
    const out = await classifyTicket.run(
      { subject: "I was charged twice", message: "refund please" },
      { runId: "r", stepRunId: "s" },
    );
    expect(classifyTicket.outputSchema.safeParse(out).success).toBe(true);
  });

  it("draft_reply returns a valid draft", async () => {
    const out = await draftReply.run(
      { subject: "Hi", message: "help" },
      { runId: "r", stepRunId: "s" },
    );
    expect(draftReply.outputSchema.safeParse(out).success).toBe(true);
  });

  it("summarize_account returns a valid summary", async () => {
    const out = await summarizeAccount.run(
      { profile: { plan: "pro" } },
      { runId: "r", stepRunId: "s" },
    );
    expect(summarizeAccount.outputSchema.safeParse(out).success).toBe(true);
  });

  it("create_task produces a task id (mock side effect)", async () => {
    const out = await createTask.run(
      { title: "t", description: "d", assignee: "support-team", priority: "medium" },
      { runId: "r", stepRunId: "s" },
    );
    expect(createTask.outputSchema.safeParse(out).success).toBe(true);
  });
});
