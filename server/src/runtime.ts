import { config } from "./config.js";

// Runtime-toggleable mock mode. Mock is *forced* when no LLM key is configured;
// when a key exists, the user can still flip mock on from the UI to demo the
// offline/deterministic path (and to avoid hitting the DB / LLM).
let forcedMock = false;

export function canUseReal(): boolean {
  return config.llm.provider !== "mock";
}

export function isMockMode(): boolean {
  return forcedMock || !canUseReal();
}

export function setForcedMock(value: boolean): void {
  // If there is no real provider, mock can never be turned off.
  forcedMock = canUseReal() ? value : true;
}

export function effectiveProvider(): string {
  return isMockMode() ? "mock" : config.llm.provider;
}
