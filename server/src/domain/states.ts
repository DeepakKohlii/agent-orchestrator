export const RunStatus = {
  PENDING: "PENDING",
  RUNNING: "RUNNING",
  WAITING_APPROVAL: "WAITING_APPROVAL",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
} as const;
export type RunStatus = (typeof RunStatus)[keyof typeof RunStatus];

export const StepStatus = {
  PENDING: "PENDING",
  RUNNING: "RUNNING",
  WAITING_APPROVAL: "WAITING_APPROVAL",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
  SKIPPED: "SKIPPED",
} as const;
export type StepStatus = (typeof StepStatus)[keyof typeof StepStatus];

export const ApprovalStatus = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;
export type ApprovalStatus = (typeof ApprovalStatus)[keyof typeof ApprovalStatus];

export const ToolCallStatus = {
  RUNNING: "RUNNING",
  SUCCESS: "SUCCESS",
  ERROR: "ERROR",
} as const;
export type ToolCallStatus = (typeof ToolCallStatus)[keyof typeof ToolCallStatus];


const RUN_TRANSITIONS: Record<RunStatus, RunStatus[]> = {
  PENDING: ["RUNNING", "FAILED"],
  RUNNING: ["WAITING_APPROVAL", "COMPLETED", "FAILED"],
  WAITING_APPROVAL: ["RUNNING", "FAILED"],
  COMPLETED: [],
  FAILED: [],
};

const STEP_TRANSITIONS: Record<StepStatus, StepStatus[]> = {
  PENDING: ["RUNNING", "SKIPPED"],
  RUNNING: ["WAITING_APPROVAL", "SUCCEEDED", "FAILED"],
  WAITING_APPROVAL: ["RUNNING", "SKIPPED", "FAILED"],
  SUCCEEDED: [],
  FAILED: [],
  SKIPPED: [],
};

export function canTransitionRun(from: RunStatus, to: RunStatus): boolean {
  return RUN_TRANSITIONS[from].includes(to);
}

export function canTransitionStep(from: StepStatus, to: StepStatus): boolean {
  return STEP_TRANSITIONS[from].includes(to);
}

export function assertRunTransition(from: RunStatus, to: RunStatus): void {
  if (!canTransitionRun(from, to)) {
    throw new Error(`Illegal run transition: ${from} -> ${to}`);
  }
}

export function assertStepTransition(from: StepStatus, to: StepStatus): void {
  if (!canTransitionStep(from, to)) {
    throw new Error(`Illegal step transition: ${from} -> ${to}`);
  }
}

export const RunEventType = {
  RUN_STARTED: "RUN_STARTED",
  STEP_STARTED: "STEP_STARTED",
  TOOL_CALL_LOGGED: "TOOL_CALL_LOGGED",
  STEP_SUCCEEDED: "STEP_SUCCEEDED",
  STEP_FAILED: "STEP_FAILED",
  STEP_RETRIED: "STEP_RETRIED",
  APPROVAL_REQUESTED: "APPROVAL_REQUESTED",
  APPROVAL_DECIDED: "APPROVAL_DECIDED",
  POLICY_DENIED: "POLICY_DENIED",
  RUN_COMPLETED: "RUN_COMPLETED",
  RUN_FAILED: "RUN_FAILED",
  RUN_REPLAYED: "RUN_REPLAYED",
} as const;
export type RunEventType = (typeof RunEventType)[keyof typeof RunEventType];
