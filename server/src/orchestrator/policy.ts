import { config } from "../config.js";
import type { Tool } from "../tools/types.js";

export interface PolicyResult {
  allowed: boolean;
  needsApproval: boolean;
  reason: string;
  riskScore: number;
}

export function evaluatePolicy(
  tool: Tool,
  def: { allowedTools: string[]; approvalRequiredTools: string[] },
  dynamicRiskScore?: number,
): PolicyResult {
  const riskScore = dynamicRiskScore ?? tool.riskScore;

  if (!def.allowedTools.includes(tool.name)) {
    return {
      allowed: false,
      needsApproval: false,
      reason: `Tool "${tool.name}" is not in this workflow's allowedTools.`,
      riskScore,
    };
  }

  const needsApproval =
    tool.requiresApproval ||
    def.approvalRequiredTools.includes(tool.name) ||
    riskScore >= config.approvalRiskThreshold;

  return {
    allowed: true,
    needsApproval,
    reason: needsApproval
      ? `Approval required (riskScore=${riskScore}, threshold=${config.approvalRiskThreshold}).`
      : "Permitted.",
    riskScore,
  };
}
