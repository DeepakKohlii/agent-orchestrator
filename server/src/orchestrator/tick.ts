import { prisma, nowIso } from "../db/client.js";
import { emit } from "../events/emit.js";
import {
  RunStatus,
  StepStatus,
  RunEventType,
  assertRunTransition,
  assertStepTransition,
} from "../domain/states.js";
import { StepDefSchema, type StepDef } from "../domain/types.js";
import { getTool } from "../tools/registry.js";
import { evaluatePolicy } from "./policy.js";
import { buildInput } from "./buildInput.js";
import { executeTool } from "./executor.js";


export async function tick(runId: string): Promise<void> {
  const run = await prisma.workflowRun.findUniqueOrThrow({
    where: { id: runId },
    include: { definition: true, stepRuns: true },
  });

  if (run.status !== RunStatus.RUNNING) return;

  const def = run.definition;
  const steps = StepDefSchema.array().parse(def.steps);

  // Find the next runnable step: first PENDING step whose deps all SUCCEEDED.
  const stepByKey = new Map(run.stepRuns.map((s) => [s.stepKey, s]));
  const next = steps.find((s) => {
    const sr = stepByKey.get(s.key);
    if (!sr || sr.status !== StepStatus.PENDING) return false;
    return s.dependsOn.every((dep) => stepByKey.get(dep)?.status === StepStatus.SUCCEEDED);
  });

  // No runnable step left → complete the run.
  if (!next) {
    const allDone = run.stepRuns.every((s) => s.status === StepStatus.SUCCEEDED);
    if (allDone) return completeRun(run.id, run.status, run.stepRuns);
    return; // nothing runnable but not all succeeded (blocked) — leave as-is
  }

  await runStep(runId, next, steps, stepByKey);
}

async function runStep(
  runId: string,
  step: StepDef,
  steps: StepDef[],
  stepByKey: Map<string, { id: string; stepKey: string; output: unknown }>,
) {
  const run = await prisma.workflowRun.findUniqueOrThrow({
    where: { id: runId },
    include: { definition: true },
  });
  const sr = await prisma.stepRun.findFirstOrThrow({
    where: { runId, stepKey: step.key },
  });

  // PENDING -> RUNNING
  assertStepTransition(sr.status as StepStatus, StepStatus.RUNNING);
  await prisma.stepRun.update({
    where: { id: sr.id },
    data: { status: StepStatus.RUNNING, startedAt: nowIso() },
  });
  await prisma.workflowRun.update({ where: { id: runId }, data: { currentStepKey: step.key } });
  await emit(runId, RunEventType.STEP_STARTED, { stepKey: step.key, name: step.name });

  // Build typed input from run input + prior step outputs.
  const priorOutputs: Record<string, unknown> = {};
  for (const s of stepByKey.values()) priorOutputs[s.stepKey] = s.output;
  const input = buildInput(step, run.inputPayload as Record<string, unknown>, priorOutputs);
  await prisma.stepRun.update({ where: { id: sr.id }, data: { input: input as object } });

  const tool = getTool(step.tool);

  // ── Policy check (Bonus C) — BEFORE any execution ──
  // Approval is gated on ACTION risk (the tool's own static risk), NOT on the
  // LLM's ticket risk score. Rationale: the thing being governed (the LLM) must
  // never decide whether it needs oversight — that's manipulable via prompt
  // injection. The LLM's ticket riskScore is surfaced to the reviewer as context.
  const policy = evaluatePolicy(tool, run.definition);

  if (!policy.allowed) {
    await emit(runId, RunEventType.POLICY_DENIED, { tool: tool.name, reason: policy.reason });
    return failStep(runId, sr.id, run.status as RunStatus, policy.reason);
  }

  // ── Approval gate: pause if needed and not yet approved ──
  if (policy.needsApproval) {
    const existing = await prisma.approval.findFirst({
      where: { stepRunId: sr.id, status: "APPROVED" },
    });
    if (!existing) {
      const ticketRisk = (priorOutputs["classify"] as { riskScore?: number } | undefined)?.riskScore;
      await createApproval(runId, sr.id, tool.name, input, policy, ticketRisk);
      assertStepTransition(StepStatus.RUNNING, StepStatus.WAITING_APPROVAL);
      await prisma.stepRun.update({
        where: { id: sr.id },
        data: { status: StepStatus.WAITING_APPROVAL },
      });
      assertRunTransition(RunStatus.RUNNING, RunStatus.WAITING_APPROVAL);
      await prisma.workflowRun.update({
        where: { id: runId },
        data: { status: RunStatus.WAITING_APPROVAL },
      });
      await emit(runId, RunEventType.APPROVAL_REQUESTED, { stepKey: step.key, tool: tool.name });
      return; 
    }
    // Approved: use edited payload if the reviewer changed it.
    if (existing.editedPayload) Object.assign(input, existing.editedPayload as object);
  }

  // ── Execute ──
  const result = await executeTool(tool, input, { runId, stepRunId: sr.id });

  if (!result.ok) {
    return failStep(runId, sr.id, RunStatus.RUNNING, result.error ?? "tool failed");
  }

  assertStepTransition(StepStatus.RUNNING, StepStatus.SUCCEEDED);
  await prisma.stepRun.update({
    where: { id: sr.id },
    data: {
      status: StepStatus.SUCCEEDED,
      output: result.output as object,
      retryCount: result.retries,
      finishedAt: nowIso(),
    },
  });
  await emit(runId, RunEventType.STEP_SUCCEEDED, { stepKey: step.key });

  // Advance to the next step.
  return tick(runId);
}

async function createApproval(
  runId: string,
  stepRunId: string,
  toolName: string,
  payload: unknown,
  policy: { reason: string; riskScore: number },
  ticketRisk?: number,
) {
  // riskScore on the approval = action risk (why the gate fired). The LLM's
  // ticket risk is added to the notes as decision context, not as the gate.
  const ticketNote =
    typeof ticketRisk === "number"
      ? ` Ticket risk assessed by the LLM: ${ticketRisk}/100 (context only).`
      : "";
  await prisma.approval.create({
    data: {
      runId,
      stepRunId,
      status: "PENDING",
      proposedAction: toolName,
      reason: policy.reason,
      payload: payload as object,
      riskNotes: `${toolName} is a high-impact action and requires approval.${ticketNote} Review the payload before approving.`,
      riskScore: policy.riskScore,
      createdAt: nowIso(),
    },
  });
}

async function failStep(runId: string, stepRunId: string, fromRun: RunStatus, error: string) {
  await prisma.stepRun.update({
    where: { id: stepRunId },
    data: { status: StepStatus.FAILED, error, finishedAt: nowIso() },
  });
  await emit(runId, RunEventType.STEP_FAILED, { error });

  if (fromRun === RunStatus.RUNNING) assertRunTransition(RunStatus.RUNNING, RunStatus.FAILED);
  await prisma.workflowRun.update({
    where: { id: runId },
    data: { status: RunStatus.FAILED, failedAt: nowIso() },
  });
  await emit(runId, RunEventType.RUN_FAILED, { error });
}

async function completeRun(
  runId: string,
  fromRun: string,
  stepRuns: { stepKey: string; output: unknown }[],
) {
  const finalOutput = Object.fromEntries(stepRuns.map((s) => [s.stepKey, s.output]));
  assertRunTransition(fromRun as RunStatus, RunStatus.COMPLETED);
  await prisma.workflowRun.update({
    where: { id: runId },
    data: { status: RunStatus.COMPLETED, completedAt: nowIso(), finalOutput: finalOutput as object },
  });
  await emit(runId, RunEventType.RUN_COMPLETED, {});
}
