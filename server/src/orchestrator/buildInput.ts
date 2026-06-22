import type { StepDef } from "../domain/types.js";

export function buildInput(
  step: StepDef,
  runInput: Record<string, unknown>,
  priorOutputs: Record<string, unknown>,
): Record<string, unknown> {
  const profile = (priorOutputs["search_profile"] ?? {}) as Record<string, unknown>;
  const classification = (priorOutputs["classify"] ?? {}) as Record<string, unknown>;

  switch (step.tool) {
    case "search_customer_profile":
      return { customerId: runInput.customerId, email: runInput.email };

    case "classify_ticket":
      return {
        subject: runInput.subject,
        message: runInput.message,
        customerPlan: profile.plan,
      };

    case "draft_reply":
      return {
        customerName: profile.name,
        subject: runInput.subject,
        message: runInput.message,
        category: classification.category,
        sentiment: classification.sentiment,
      };

    case "create_task":
      return {
        title: `Follow up: ${runInput.subject ?? "support ticket"}`,
        description: `Ticket from ${profile.name ?? "customer"}. ` +
          `Category=${classification.category ?? "n/a"}, priority=${classification.priority ?? "medium"}.`,
        assignee: "support-team",
        priority: classification.priority ?? "medium",
      };

    case "summarize_account":
      return { profile, classification };

    default:
      return { ...runInput };
  }
}
