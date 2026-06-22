import { describe, it, expect } from "vitest";
import {
  canTransitionRun,
  canTransitionStep,
  assertRunTransition,
  assertStepTransition,
  RunStatus,
  StepStatus,
} from "../src/domain/states.js";

describe("run state machine", () => {
  it("allows the happy path PENDING → RUNNING → COMPLETED", () => {
    expect(canTransitionRun(RunStatus.PENDING, RunStatus.RUNNING)).toBe(true);
    expect(canTransitionRun(RunStatus.RUNNING, RunStatus.COMPLETED)).toBe(true);
  });

  it("allows pause/resume RUNNING ↔ WAITING_APPROVAL", () => {
    expect(canTransitionRun(RunStatus.RUNNING, RunStatus.WAITING_APPROVAL)).toBe(true);
    expect(canTransitionRun(RunStatus.WAITING_APPROVAL, RunStatus.RUNNING)).toBe(true);
  });

  it("allows failing from RUNNING and from WAITING_APPROVAL (reject)", () => {
    expect(canTransitionRun(RunStatus.RUNNING, RunStatus.FAILED)).toBe(true);
    expect(canTransitionRun(RunStatus.WAITING_APPROVAL, RunStatus.FAILED)).toBe(true);
  });

  it("forbids leaving terminal states", () => {
    for (const to of Object.values(RunStatus)) {
      expect(canTransitionRun(RunStatus.COMPLETED, to)).toBe(false);
      expect(canTransitionRun(RunStatus.FAILED, to)).toBe(false);
    }
  });

  it("forbids skipping straight from PENDING to COMPLETED", () => {
    expect(canTransitionRun(RunStatus.PENDING, RunStatus.COMPLETED)).toBe(false);
  });

  it("assertRunTransition throws on an illegal transition", () => {
    expect(() => assertRunTransition(RunStatus.COMPLETED, RunStatus.RUNNING)).toThrow(
      /Illegal run transition/,
    );
    expect(() => assertRunTransition(RunStatus.PENDING, RunStatus.RUNNING)).not.toThrow();
  });
});

describe("step state machine", () => {
  it("allows PENDING → RUNNING → SUCCEEDED", () => {
    expect(canTransitionStep(StepStatus.PENDING, StepStatus.RUNNING)).toBe(true);
    expect(canTransitionStep(StepStatus.RUNNING, StepStatus.SUCCEEDED)).toBe(true);
  });

  it("allows the approval detour RUNNING → WAITING_APPROVAL → RUNNING", () => {
    expect(canTransitionStep(StepStatus.RUNNING, StepStatus.WAITING_APPROVAL)).toBe(true);
    expect(canTransitionStep(StepStatus.WAITING_APPROVAL, StepStatus.RUNNING)).toBe(true);
  });

  it("allows WAITING_APPROVAL → SKIPPED (reject) and RUNNING → FAILED", () => {
    expect(canTransitionStep(StepStatus.WAITING_APPROVAL, StepStatus.SKIPPED)).toBe(true);
    expect(canTransitionStep(StepStatus.RUNNING, StepStatus.FAILED)).toBe(true);
  });

  it("forbids leaving terminal step states", () => {
    for (const to of Object.values(StepStatus)) {
      expect(canTransitionStep(StepStatus.SUCCEEDED, to)).toBe(false);
      expect(canTransitionStep(StepStatus.FAILED, to)).toBe(false);
      expect(canTransitionStep(StepStatus.SKIPPED, to)).toBe(false);
    }
  });

  it("assertStepTransition throws on an illegal transition", () => {
    expect(() => assertStepTransition(StepStatus.SUCCEEDED, StepStatus.RUNNING)).toThrow(
      /Illegal step transition/,
    );
    expect(() => assertStepTransition(StepStatus.PENDING, StepStatus.RUNNING)).not.toThrow();
  });
});
