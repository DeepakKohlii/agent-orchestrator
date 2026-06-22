import { Router } from "express";
import { prisma } from "../db/client.js";
import { CreateRunSchema, ApprovalDecisionSchema } from "../domain/types.js";
import { createRun, decideApproval, getRun, listRuns } from "../orchestrator/runService.js";
import { subscribe } from "../events/sse.js";
import { ApiError } from "./errors.js";

export const router = Router();

const wrap =
  (fn: (req: any, res: any) => Promise<unknown>) =>
  (req: any, res: any, next: any) =>
    fn(req, res).catch(next);

router.get(
  "/workflows",
  wrap(async (_req, res) => {
    const defs = await prisma.workflowDefinition.findMany({ orderBy: { name: "asc" } });
    res.json(defs);
  }),
);


router.get(
  "/runs",
  wrap(async (_req, res) => {
    res.json(await listRuns());
  }),
);


router.post(
  "/runs",
  wrap(async (req, res) => {
    const { definitionId, input } = CreateRunSchema.parse(req.body);
    const run = await createRun(definitionId, input);
    res.status(201).json(run);
  }),
);

router.get(
  "/runs/:id",
  wrap(async (req, res) => {
    const run = await getRun(req.params.id);
    res.json(run);
  }),
);

router.get(
  "/runs/:id/events",
  wrap(async (req, res) => {
    const events = await prisma.runEvent.findMany({
      where: { runId: req.params.id },
      orderBy: { seq: "asc" },
    });
    res.json(events);
  }),
);

router.get(
  "/runs/:id/stream",
  wrap(async (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const lastEventId = Number(req.headers["last-event-id"] ?? 0);
    const missed = await prisma.runEvent.findMany({
      where: { runId: req.params.id, seq: { gt: lastEventId } },
      orderBy: { seq: "asc" },
    });
    for (const e of missed) {
      res.write(`id: ${e.seq}\nevent: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
    }

    const unsubscribe = subscribe(req.params.id, res);
    req.on("close", unsubscribe);
  }),
);

router.post(
  "/approvals/:id/decision",
  wrap(async (req, res) => {
    const { decision, editedPayload, decidedBy } = ApprovalDecisionSchema.parse(req.body);
    const run = await decideApproval(req.params.id, decision, decidedBy, editedPayload);
    res.json(run);
  }),
);
