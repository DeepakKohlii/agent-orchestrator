import { prisma, nowIso } from "../db/client.js";
import { emit } from "../events/emit.js";
import { RunStatus, StepStatus, RunEventType, assertRunTransition } from "../domain/states.js";
import { StepDefSchema } from "../domain/types.js";
import { tick } from "./tick.js";

function runTickInBackground(runId: string) {
  tick(runId).catch((err) => console.error(`tick failed for run ${runId}:`, err));
}


export async function createRun(definitionId: string, input: Record<string, unknown>) {
  const def = await prisma.workflowDefinition.findUniqueOrThrow({ where: { id: definitionId } });
  const steps = StepDefSchema.array().parse(def.steps);

  const run = await prisma.workflowRun.create({
    data: {
      definitionId,
      inputPayload: input as object,
      status: RunStatus.PENDING,
      createdAt: nowIso(),
      stepRuns: {
        create: steps.map((s) => ({
          stepKey: s.key,
          status: StepStatus.PENDING,
          dependsOn: s.dependsOn,
        })),
      },
    },
  });

  assertRunTransition(RunStatus.PENDING, RunStatus.RUNNING);
  await prisma.workflowRun.update({
    where: { id: run.id },
    data: { status: RunStatus.RUNNING, startedAt: nowIso() },
  });
  await emit(run.id, RunEventType.RUN_STARTED, { definition: def.name });

  runTickInBackground(run.id);
  return getRun(run.id);
}

// Record an approval decision and resume (or terminate) the run.
export async function decideApproval(
  approvalId: string,
  decision: "APPROVED" | "REJECTED",
  decidedBy: string,
  editedPayload?: Record<string, unknown>,
) {
  const approval = await prisma.approval.findUniqueOrThrow({ where: { id: approvalId } });
  if (approval.status !== "PENDING") throw new Error("Approval already decided.");

  await prisma.approval.update({
    where: { id: approvalId },
    data: {
      status: decision,
      editedPayload: (editedPayload ?? undefined) as object | undefined,
      decidedBy,
      decidedAt: nowIso(),
    },
  });
  await emit(approval.runId, RunEventType.APPROVAL_DECIDED, { approvalId, decision });

  if (decision === "REJECTED") {
    await prisma.stepRun.update({
      where: { id: approval.stepRunId },
      data: { status: StepStatus.SKIPPED, finishedAt: nowIso() },
    });
    await prisma.workflowRun.update({
      where: { id: approval.runId },
      data: { status: RunStatus.FAILED, failedAt: nowIso() },
    });
    await emit(approval.runId, RunEventType.RUN_FAILED, { reason: "Approval rejected" });
    return getRun(approval.runId);
  }

  // Approved: step goes back to PENDING so tick() re-evaluates and now executes
  await prisma.stepRun.update({
    where: { id: approval.stepRunId },
    data: { status: StepStatus.PENDING },
  });
  await prisma.workflowRun.update({
    where: { id: approval.runId },
    data: { status: RunStatus.RUNNING },
  });
  runTickInBackground(approval.runId);
  return getRun(approval.runId);
}

// Recent runs for the console sidebar.
export async function listRuns(limit = 20) {
  return prisma.workflowRun.findMany({
    take: limit,
    orderBy: { createdAt: "desc" },
    include: {
      definition: { select: { name: true } },
      _count: { select: { stepRuns: true } },
    },
  });
}

export async function getRun(runId: string) {
  return prisma.workflowRun.findUniqueOrThrow({
    where: { id: runId },
    include: {
      definition: true,
      stepRuns: { include: { toolCalls: true }, orderBy: { startedAt: "asc" } },
      approvals: { orderBy: { createdAt: "asc" } },
      events: { orderBy: { seq: "asc" } },
    },
  });
}
