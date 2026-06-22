import { z } from "zod";

export interface ToolContext {
  runId: string;
  stepRunId: string;
}

export interface Tool<I = unknown, O = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodSchema<I>;
  outputSchema: z.ZodSchema<O>;
  requiresApproval: boolean;
  riskScore: number;
  run(input: I, ctx: ToolContext): Promise<O>;
}

export function defineTool<I, O>(tool: Tool<I, O>): Tool<I, O> {
  return tool;
}
