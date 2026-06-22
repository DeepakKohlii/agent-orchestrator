import type { WorkflowDefinitionInput } from "../domain/types.js";


export const supportTicketTriage: WorkflowDefinitionInput = {
  name: "Support Ticket Triage",
  description:
    "Look up the customer, classify the ticket with an LLM, summarize account risk, " +
    "then create an internal follow-up task (requires approval).",
  triggerType: "manual",
  steps: [
    { key: "search_profile", name: "Search customer profile", type: "TOOL", tool: "search_customer_profile", dependsOn: [] },
    { key: "classify", name: "Classify ticket (LLM)", type: "LLM", tool: "classify_ticket", dependsOn: ["search_profile"] },
    { key: "summarize", name: "Summarize account risk (LLM)", type: "LLM", tool: "summarize_account", dependsOn: ["classify"] },
    { key: "create_task", name: "Create follow-up task", type: "TOOL", tool: "create_task", dependsOn: ["summarize"] },
  ],
  allowedTools: ["search_customer_profile", "classify_ticket", "summarize_account", "create_task"],
  approvalRequiredTools: ["create_task"],
};

export const customerFollowUp: WorkflowDefinitionInput = {
  name: "Customer Follow-up Drafting",
  description:
    "Look up the customer, classify the ticket, draft a reply with an LLM, then create " +
    "a task to send the reply (requires approval).",
  triggerType: "manual",
  steps: [
    { key: "search_profile", name: "Search customer profile", type: "TOOL", tool: "search_customer_profile", dependsOn: [] },
    { key: "classify", name: "Classify ticket (LLM)", type: "LLM", tool: "classify_ticket", dependsOn: ["search_profile"] },
    { key: "draft", name: "Draft customer reply (LLM)", type: "LLM", tool: "draft_reply", dependsOn: ["classify"] },
    { key: "create_task", name: "Create send-reply task", type: "TOOL", tool: "create_task", dependsOn: ["draft"] },
  ],
  allowedTools: ["search_customer_profile", "classify_ticket", "draft_reply", "create_task"],
  approvalRequiredTools: ["create_task"],
};

export const seedDefinitions = [supportTicketTriage, customerFollowUp];
