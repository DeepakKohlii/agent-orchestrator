import { describe, it, expect } from "vitest";
import { evaluatePolicy } from "../src/orchestrator/policy.js";
import { searchCustomerProfile } from "../src/tools/searchCustomerProfile.js";
import { createTask } from "../src/tools/createTask.js";
import { draftReply } from "../src/tools/draftReply.js";

const allowAll = {
  allowedTools: ["search_customer_profile", "create_task", "draft_reply"],
  approvalRequiredTools: ["create_task"],
};

describe("policy engine", () => {
  it("denies a tool that is not in allowedTools", () => {
    const res = evaluatePolicy(createTask, {
      allowedTools: ["search_customer_profile"],
      approvalRequiredTools: [],
    });
    expect(res.allowed).toBe(false);
    expect(res.needsApproval).toBe(false);
    expect(res.reason).toMatch(/not in this workflow's allowedTools/);
  });

  it("permits a low-risk allowed tool without approval", () => {
    const res = evaluatePolicy(searchCustomerProfile, allowAll);
    expect(res.allowed).toBe(true);
    expect(res.needsApproval).toBe(false);
  });

  it("requires approval for a tool flagged requiresApproval", () => {
    const res = evaluatePolicy(createTask, allowAll);
    expect(res.allowed).toBe(true);
    expect(res.needsApproval).toBe(true);
  });

  it("requires approval for a tool listed in approvalRequiredTools", () => {
    const res = evaluatePolicy(draftReply, {
      allowedTools: ["draft_reply"],
      approvalRequiredTools: ["draft_reply"],
    });
    expect(res.needsApproval).toBe(true);
  });

  it("requires approval when dynamic risk crosses the threshold (>=70)", () => {
    // draft_reply is normally safe (no approval), but a high-risk ticket gates it.
    const safe = evaluatePolicy(draftReply, { allowedTools: ["draft_reply"], approvalRequiredTools: [] }, 40);
    expect(safe.needsApproval).toBe(false);

    const risky = evaluatePolicy(draftReply, { allowedTools: ["draft_reply"], approvalRequiredTools: [] }, 85);
    expect(risky.needsApproval).toBe(true);
    expect(risky.riskScore).toBe(85);
  });

  it("uses the tool's static risk when no dynamic score is supplied", () => {
    const res = evaluatePolicy(createTask, allowAll);
    expect(res.riskScore).toBe(createTask.riskScore);
  });
});
