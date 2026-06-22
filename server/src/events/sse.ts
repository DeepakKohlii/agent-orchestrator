import type { Response } from "express";

// In-process SSE hub. Clients subscribe per-run; emit() (events/emit.ts) fans out.
// Production note: replace with Redis pub/sub so multiple server instances share streams.
type Client = { id: number; res: Response };
const clientsByRun = new Map<string, Set<Client>>();
let nextId = 1;

export function subscribe(runId: string, res: Response): () => void {
  const client: Client = { id: nextId++, res };
  let set = clientsByRun.get(runId);
  if (!set) {
    set = new Set();
    clientsByRun.set(runId, set);
  }
  set.add(client);
  return () => {
    set!.delete(client);
    if (set!.size === 0) clientsByRun.delete(runId);
  };
}

export function publish(runId: string, event: { type: string; seq: number; payload: unknown }) {
  const set = clientsByRun.get(runId);
  if (!set) return;
  const data = `id: ${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
  for (const client of set) client.res.write(data);
}
