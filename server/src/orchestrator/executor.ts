import { prisma, nowIso } from "../db/client.js";
import { config } from "../config.js";
import { emit } from "../events/emit.js";
import { RunEventType, ToolCallStatus } from "../domain/states.js";
import type { Tool } from "../tools/types.js";

export interface ExecResult {
  ok: boolean;
  output?: unknown;
  error?: string;
  retries: number;
}

export async function executeTool(
  tool: Tool,
  rawInput: unknown,
  ctx: { runId: string; stepRunId: string },
): Promise<ExecResult> {
  const parsedInput = tool.inputSchema.safeParse(rawInput);
  if (!parsedInput.success) {
    return { ok: false, error: `Invalid tool input: ${parsedInput.error.message}`, retries: 0 };
  }

  let lastError = "";
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    if (attempt > 0) {
      await emit(ctx.runId, RunEventType.STEP_RETRIED, { tool: tool.name, attempt });
    }
    const started = Date.now();
    const toolCall = await prisma.toolCall.create({
      data: {
        stepRunId: ctx.stepRunId,
        toolName: tool.name,
        input: parsedInput.data as object,
        status: ToolCallStatus.RUNNING,
        createdAt: nowIso(),
      },
    });

    try {
      const output = await tool.run(parsedInput.data, ctx);
      const parsedOutput = tool.outputSchema.safeParse(output);
      if (!parsedOutput.success) {
        throw new Error(`Invalid tool output: ${parsedOutput.error.message}`);
      }
      const latencyMs = Date.now() - started;
      await prisma.toolCall.update({
        where: { id: toolCall.id },
        data: { output: parsedOutput.data as object, status: ToolCallStatus.SUCCESS, latencyMs },
      });
      await emit(ctx.runId, RunEventType.TOOL_CALL_LOGGED, {
        tool: tool.name,
        status: "SUCCESS",
        latencyMs,
      });
      return { ok: true, output: parsedOutput.data, retries: attempt };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      const latencyMs = Date.now() - started;
      await prisma.toolCall.update({
        where: { id: toolCall.id },
        data: { status: ToolCallStatus.ERROR, error: lastError, latencyMs },
      });
      await emit(ctx.runId, RunEventType.TOOL_CALL_LOGGED, {
        tool: tool.name,
        status: "ERROR",
        error: lastError,
        latencyMs,
      });
    }
  }

  return { ok: false, error: lastError, retries: config.maxRetries };
}
