// Deterministic mock responses so the whole platform runs offline (no API key).
// Keyed by schema name so each LLM step gets a sensible, realistic shape.

export function mockStructured(schemaName: string, prompt: string): unknown {
  const text = prompt.toLowerCase();

  switch (schemaName) {
    case "TicketClassification": {
      const urgent = /refund|charged twice|down|cannot login|angry|asap/.test(text);
      return {
        category: /bill|charge|refund|invoice/.test(text) ? "billing" : "technical",
        priority: urgent ? "urgent" : "medium",
        sentiment: /thank|great|love/.test(text) ? "positive" : urgent ? "negative" : "neutral",
        summary: "Customer reports an issue requiring follow-up (mock classification).",
        riskScore: urgent ? 80 : 35,
      };
    }
    case "DraftReply":
      return {
        subject: "Re: your recent request",
        body:
          "Hi there,\n\nThanks for reaching out — I understand the issue and we're on it. " +
          "I've created a task for our team and you'll hear back shortly.\n\nBest,\nSupport (mock draft)",
        tone: "empathetic",
      };
    case "AccountSummary":
      return {
        summary: "Account is active with one open issue; payment history is healthy (mock).",
        riskLevel: "low",
        recommendedActions: ["Monitor open ticket", "Confirm resolution within 48h"],
      };
    default:
      return {};
  }
}
