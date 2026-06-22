import { z } from "zod";


export const StepDefSchema = z.object({
  key: z.string(),
  name: z.string(),
  type: z.enum(["TOOL", "LLM"]),
  tool: z.string(),
  dependsOn: z.array(z.string()).default([]),
});
export type StepDef = z.infer<typeof StepDefSchema>;

export const WorkflowDefinitionInputSchema = z.object({
  name: z.string(),
  description: z.string(),
  triggerType: z.string().default("manual"),
  steps: z.array(StepDefSchema).min(1),
  allowedTools: z.array(z.string()),
  approvalRequiredTools: z.array(z.string()).default([]),
});
export type WorkflowDefinitionInput = z.infer<typeof WorkflowDefinitionInputSchema>;

export const CreateRunSchema = z.object({
  definitionId: z.string(),
  input: z.record(z.unknown()),
});

export const ApprovalDecisionSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  editedPayload: z.record(z.unknown()).optional(),
  decidedBy: z.string().default("reviewer"),
});
