// Thin typed API client. Types kept loose for the scaffold; tighten as the
// backend response shapes stabilize.

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  steps: { key: string; name: string; type: string; tool: string }[];
  allowedTools: string[];
  approvalRequiredTools: string[];
}

export interface Run {
  id: string;
  status: string;
  currentStepKey: string | null;
  finalOutput: unknown;
  definition: WorkflowDefinition;
  stepRuns: StepRun[];
  approvals: Approval[];
  events: RunEvent[];
}

export interface StepRun {
  id: string;
  stepKey: string;
  status: string;
  input: unknown;
  output: unknown;
  error: string | null;
  retryCount: number;
  toolCalls: ToolCall[];
}

export interface ToolCall {
  id: string;
  toolName: string;
  status: string;
  latencyMs: number | null;
  input: unknown;
  output: unknown;
  error: string | null;
}

export interface Approval {
  id: string;
  status: string;
  proposedAction: string;
  reason: string;
  payload: unknown;
  riskNotes: string;
  riskScore: number;
}

export interface RunEvent {
  id: string;
  seq: number;
  type: string;
  payload: unknown;
  createdAt: string;
}

export interface RunSummary {
  id: string;
  status: string;
  createdAt: string;
  definition: { name: string };
  _count: { stepRuns: number };
}

export interface Health {
  ok: boolean;
  llmProvider: string;
  model: string;
  mockMode: boolean;
  canUseReal: boolean;
}

async function http<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  health: () => http<Health>("/health"),
  setMode: (mock: boolean) =>
    http<{ mockMode: boolean; canUseReal: boolean; llmProvider: string; model: string }>(
      "/api/mode",
      { method: "POST", body: JSON.stringify({ mock }) },
    ),
  listWorkflows: () => http<WorkflowDefinition[]>("/api/workflows"),
  listRuns: () => http<RunSummary[]>("/api/runs"),
  createRun: (definitionId: string, input: Record<string, unknown>) =>
    http<Run>("/api/runs", { method: "POST", body: JSON.stringify({ definitionId, input }) }),
  getRun: (id: string) => http<Run>(`/api/runs/${id}`),
  decideApproval: (
    id: string,
    decision: "APPROVED" | "REJECTED",
    editedPayload?: Record<string, unknown>,
  ) =>
    http<Run>(`/api/approvals/${id}/decision`, {
      method: "POST",
      body: JSON.stringify({ decision, editedPayload }),
    }),
};
