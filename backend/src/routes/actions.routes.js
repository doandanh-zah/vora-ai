import { Router } from "express";
import { z } from "zod";
import { requireAdmin, requireAuth } from "../middleware/auth.js";

const createActionSchema = z.object({
  type: z.string().min(2).max(120),
  status: z.enum(["ok", "failed", "denied", "pending"]).optional(),
  input: z.any().optional(),
  output: z.any().optional(),
  metadata: z.any().optional(),
});

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export function createActionsRouter({ config, store }) {
  const router = Router();

  router.post("/", requireAuth(config), async (req, res) => {
    const parsed = createActionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid payload", details: parsed.error.issues });
      return;
    }

    const action = await store.addAction({
      userId: req.auth.userId,
      ...parsed.data,
    });

    res.status(201).json({ action });
  });

  router.get("/mine", requireAuth(config), async (req, res) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query", details: parsed.error.issues });
      return;
    }

    const limit = parsed.data.limit ?? 100;
    const actions = await store.listActionsByUser(req.auth.userId, limit);
    res.json({ actions, count: actions.length });
  });

  router.get("/all", requireAuth(config), requireAdmin, async (req, res) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query", details: parsed.error.issues });
      return;
    }

    const limit = parsed.data.limit ?? 200;
    const actions = await store.listAllActions(limit);
    res.json({ actions, count: actions.length });
  });

  return router;
}
