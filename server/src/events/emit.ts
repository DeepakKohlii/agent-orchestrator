import { prisma, nowIso } from "../db/client.js";
import { publish } from "./sse.js";
import type { RunEventType } from "../domain/states.js";

// Single source of truth for the audit timeline: persist an append-only RunEvent
// AND fan it out over SSE. The UI timeline and live stream are both projections
// of this table. seq is monotonic per-run so clients can resume after reconnect.
export async function emit(runId: string, type: RunEventType, payload: unknown = {}) {
  const last = await prisma.runEvent.findFirst({
    where: { runId },
    orderBy: { seq: "desc" },
    select: { seq: true },
  });
  const seq = (last?.seq ?? 0) + 1;

  await prisma.runEvent.create({
    data: { runId, seq, type, payload: payload as object, createdAt: nowIso() },
  });

  publish(runId, { type, seq, payload });
}
