import type { Tool } from "./types.js";
import { searchCustomerProfile } from "./searchCustomerProfile.js";
import { classifyTicket } from "./classifyTicket.js";
import { draftReply } from "./draftReply.js";
import { createTask } from "./createTask.js";
import { summarizeAccount } from "./summarizeAccount.js";

const tools: Tool[] = [
  searchCustomerProfile as Tool,
  classifyTicket as Tool,
  draftReply as Tool,
  createTask as Tool,
  summarizeAccount as Tool,
];

export const toolRegistry = new Map<string, Tool>(tools.map((t) => [t.name, t]));

export function getTool(name: string): Tool {
  const tool = toolRegistry.get(name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return tool;
}
