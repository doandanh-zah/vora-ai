import { Router } from "express";
import { z } from "zod";
import { requireAdmin, requireAuth } from "../middleware/auth.js";

const grantSchema = z.object({
  userId: z.string().uuid(),
  amount: z.number().int().positive(),
  reason: z.string().min(2).max(200),
});

const spendSchema = z.object({
  amount: z.number().int().positive(),
  reason: z.string().min(2).max(200),
  metadata: z.any().optional(),
});

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export function createCreditsRouter({ config, store }) {
  const router = Router();

  router.get("/balance", requireAuth(config), async (req, res) => {
    const balance = await store.getUserBalance(req.auth.userId);
    res.json({ userId: req.auth.userId, balance });
  });

  router.get("/ledger", requireAuth(config), async (req, res) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query", details: parsed.error.issues });
      return;
    }

    const entries = await store.listLedgerByUser(req.auth.userId, parsed.data.limit ?? 100);
    const balance = await store.getUserBalance(req.auth.userId);
    res.json({ balance, entries });
  });

  router.post("/spend", requireAuth(config), async (req, res) => {
    const parsed = spendSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid payload", details: parsed.error.issues });
      return;
    }

    const { amount, reason, metadata } = parsed.data;
    const balance = await store.getUserBalance(req.auth.userId);
    if (balance < amount) {
      await store.addAction({
        userId: req.auth.userId,
        type: "credits.spend",
        status: "denied",
        metadata: { amount, reason, balance },
      });
      res.status(402).json({ error: "Insufficient credits", balance });
      return;
    }

    const entry = await store.addLedgerEntry({
      userId: req.auth.userId,
      type: "spend",
      amount: -amount,
      reason,
      metadata,
    });

    await store.addAction({
      userId: req.auth.userId,
      type: "credits.spend",
      status: "ok",
      metadata: { amount, reason },
    });

    const nextBalance = await store.getUserBalance(req.auth.userId);
    res.status(201).json({ entry, balance: nextBalance });
  });

  router.post("/grant", requireAuth(config), requireAdmin, async (req, res) => {
    const parsed = grantSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid payload", details: parsed.error.issues });
      return;
    }

    const { userId, amount, reason } = parsed.data;
    const user = await store.findUserById(userId);
    if (!user) {
      res.status(404).json({ error: "Target user not found" });
      return;
    }

    const entry = await store.addLedgerEntry({
      userId,
      type: "grant",
      amount,
      reason,
      metadata: { grantedBy: req.auth.userId },
    });

    await store.addAction({
      userId,
      type: "credits.grant",
      status: "ok",
      metadata: { amount, reason, grantedBy: req.auth.userId },
    });

    const nextBalance = await store.getUserBalance(userId);
    res.status(201).json({ entry, balance: nextBalance });
  });

  return router;
}
