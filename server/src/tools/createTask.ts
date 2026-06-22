import { z } from "zod";
import { defineTool } from "./types.js";

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
  }),
  outputSchema: z.object({
    taskId: z.string(),
    createdAt: z.string(),
  }),
  async run(input) {
    // Mock side effect: would write to a Task table / external system.
    return {
      taskId: `task_${Math.random().toString(36).slice(2, 10)}`,
      createdAt: new Date().toISOString(),
    };
  },
});
