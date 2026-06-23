import { z } from "zod";
import { defineTool } from "./types.js";
import { prisma } from "../db/client.js";

export const createTask = defineTool({
  name: "create_task",
  description: "Create an internal task. High-impact: requires human approval.",
  requiresApproval: true,
  riskScore: 75,
  inputSchema: z.object({
    title: z.string(),
    description: z.string(),
    assignee: z.string().default("support-team"),
    priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
    replySubject: z.string().optional(),
    replyBody: z.string().optional(),
  }),
  outputSchema: z.object({
    taskId: z.string(),
    createdAt: z.string(),
  }),
  async run(input, ctx) {
    const task = await prisma.task.create({
      data: {
        title: input.title,
        description: input.description,
        assignee: input.assignee ?? "support-team",
        priority: input.priority ?? "medium",
        status: "open",
        replySubject: input.replySubject,
        replyBody: input.replyBody,
        runId: ctx.runId,
        stepRunId: ctx.stepRunId,
        createdAt: new Date().toISOString(),
      },
    });
    return { taskId: task.id, createdAt: task.createdAt };
  },
});
