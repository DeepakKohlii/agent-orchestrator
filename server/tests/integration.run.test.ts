import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma, nowIso } from "../src/db/client.js";
import { setForcedMock } from "../src/runtime.js";
import { createRun, decideApproval, getRun } from "../src/orchestrator/runService.js";
import { RunStatus, StepStatus } from "../src/domain/states.js";

// This is a real end-to-end test against the database. It self-seeds its own
// definition + customer, runs in forced mock-LLM mode (deterministic, offline),
// then cleans everything up. Skipped automatically when no DATABASE_URL is set.
const HAS_DB = !!process.env.DATABASE_URL;

const CUSTOMER_ID = "cust__test__integration";
const DEF_NAME = "__TEST__ Integration Triage";
let defId: string;

const STEPS = [
  { key: "search_profile", name: "Search profile", type: "TOOL", tool: "search_customer_profile", dependsOn: [] },
  { key: "classify", name: "Classify", type: "LLM", tool: "classify_ticket", dependsOn: ["search_profile"] },
  { key: "summarize", name: "Summarize", type: "LLM", tool: "summarize_account", dependsOn: ["classify"] },
  { key: "create_task", name: "Create task", type: "TOOL", tool: "create_task", dependsOn: ["summarize"] },
];

const INPUT = {
  customerId: CUSTOMER_ID,
  subject: "Question about my plan",
  message: "Hi, I had a small question about how billing cycles work. Thanks!",
};


async function waitFor(runId: string, statuses: string[], timeoutMs = 45000) {
  const start = Date.now();
  let last = "";
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const row = await prisma.workflowRun.findUnique({
      where: { id: runId },
      select: { status: true },
    });
    last = row?.status ?? "";
    if (row && statuses.includes(row.status)) return getRun(runId);
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timed out waiting for ${statuses.join("/")}, got ${last}`);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
}

describe.skipIf(!HAS_DB)("integration: full run with approval", () => {
  beforeAll(async () => {
    setForcedMock(true); // never hit a real LLM, even if a key is configured

    await prisma.customer.upsert({
      where: { id: CUSTOMER_ID },
      update: {},
      create: {
        id: CUSTOMER_ID,
        name: "Test User",
        email: "test.user@integration.test",
        company: "Integration Co",
        plan: "pro",
        region: "US-East",
        phone: "+1-000-000-0000",
        tenureMonths: 6,
        signupDate: "2025-12-01",
        openTickets: 0,
        lifetimeValueUsd: 1000,
        accountStatus: "active",
        paymentStatus: "current",
        satisfactionScore: 80,
        lastContactAt: "2026-06-01",
        notes: "integration test fixture",
      },
    });

    const def = await prisma.workflowDefinition.upsert({
      where: { name: DEF_NAME },
      update: { steps: STEPS },
      create: {
        name: DEF_NAME,
        description: "integration test definition",
        triggerType: "manual",
        steps: STEPS,
        allowedTools: STEPS.map((s) => s.tool),
        approvalRequiredTools: ["create_task"],
        createdAt: nowIso(),
      },
    });
    defId = def.id;
  });

  afterAll(async () => {
    const runs = await prisma.workflowRun.findMany({
      where: { definitionId: defId },
      select: { id: true },
    });
    const runIds = runs.map((r) => r.id);
    await prisma.task.deleteMany({ where: { runId: { in: runIds } } });
    await prisma.toolCall.deleteMany({ where: { stepRun: { runId: { in: runIds } } } });
    await prisma.runEvent.deleteMany({ where: { runId: { in: runIds } } });
    await prisma.approval.deleteMany({ where: { runId: { in: runIds } } });
    await prisma.stepRun.deleteMany({ where: { runId: { in: runIds } } });
    await prisma.workflowRun.deleteMany({ where: { id: { in: runIds } } });
    await prisma.workflowDefinition.delete({ where: { id: defId } }).catch(() => {});
    await prisma.customer.delete({ where: { id: CUSTOMER_ID } }).catch(() => {});
    await prisma.$disconnect();
  });

  it(
    "pauses for approval, resumes on approve, and completes with audit trail",
    async () => {
      const created = await createRun(defId, INPUT);

      // It must pause at the approval-required step.
      let run = await waitFor(created.id, [RunStatus.WAITING_APPROVAL, RunStatus.FAILED]);
      expect(run.status).toBe(RunStatus.WAITING_APPROVAL);

      const pending = run.approvals.find((a) => a.status === "PENDING");
      expect(pending).toBeTruthy();
      expect(pending!.proposedAction).toBe("create_task");

      // Approve every pending approval until the run finishes.
      while (run.status === RunStatus.WAITING_APPROVAL) {
        const p = run.approvals.find((a) => a.status === "PENDING")!;
        await decideApproval(p.id, "APPROVED", "tester");
        run = await waitFor(created.id, [RunStatus.WAITING_APPROVAL, RunStatus.COMPLETED, RunStatus.FAILED]);
      }

      expect(run.status).toBe(RunStatus.COMPLETED);

      // Every step succeeded.
      expect(run.stepRuns.every((s) => s.status === StepStatus.SUCCEEDED)).toBe(true);

      // Final output captured the created task.
      const finalOutput = run.finalOutput as Record<string, any>;
      expect(finalOutput.create_task?.taskId).toBeTruthy();

      // Idempotency: create_task ran exactly once (not re-fired on resume).
      const createStep = run.stepRuns.find((s) => s.stepKey === "create_task")!;
      const successfulCreateCalls = createStep.toolCalls.filter((t) => t.status === "SUCCESS");
      expect(successfulCreateCalls.length).toBe(1);

      // Audit trail contains the key lifecycle events in order.
      const types = run.events.map((e) => e.type);
      expect(types).toContain("RUN_STARTED");
      expect(types).toContain("APPROVAL_REQUESTED");
      expect(types).toContain("APPROVAL_DECIDED");
      expect(types).toContain("RUN_COMPLETED");
      expect(types.indexOf("RUN_STARTED")).toBeLessThan(types.indexOf("RUN_COMPLETED"));
    },
    60000,
  );

  it(
    "terminates the run when an approval is rejected",
    async () => {
      const created = await createRun(defId, INPUT);
      let run = await waitFor(created.id, [RunStatus.WAITING_APPROVAL, RunStatus.FAILED]);
      expect(run.status).toBe(RunStatus.WAITING_APPROVAL);

      const pending = run.approvals.find((a) => a.status === "PENDING")!;
      await decideApproval(pending.id, "REJECTED", "tester");

      run = await waitFor(created.id, [RunStatus.FAILED, RunStatus.COMPLETED]);
      expect(run.status).toBe(RunStatus.FAILED);

      const rejectedStep = run.stepRuns.find((s) => s.stepKey === "create_task")!;
      expect(rejectedStep.status).toBe(StepStatus.SKIPPED);
      expect(run.events.map((e) => e.type)).toContain("RUN_FAILED");
    },
    60000,
  );
});
