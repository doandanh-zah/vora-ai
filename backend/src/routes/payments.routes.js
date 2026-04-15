import { Router } from "express";
import { z } from "zod";
import { isValidSolanaAddress, verifySolanaTransfer } from "../lib/solana.js";
import { requireAuth } from "../middleware/auth.js";

const createIntentSchema = z.object({
  credits: z.number().int().positive().max(1_000_000),
  walletAddress: z.string().min(32).max(64),
});

const confirmSchema = z.object({
  intentId: z.string().uuid(),
  txSignature: z.string().min(60).max(128),
});

export function createPaymentsRouter({ config, store }) {
  const router = Router();

  router.post("/solana/intents", requireAuth(config), async (req, res) => {
    const parsed = createIntentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid payload", details: parsed.error.issues });
      return;
    }

    if (!config.solana.receiverAddress) {
      res.status(500).json({ error: "SOLANA_RECEIVER_ADDRESS is not configured on server" });
      return;
    }

    const { credits, walletAddress } = parsed.data;

    if (!isValidSolanaAddress(walletAddress)) {
      res.status(400).json({ error: "Invalid walletAddress" });
      return;
    }
    if (!isValidSolanaAddress(config.solana.receiverAddress)) {
      res.status(500).json({ error: "Server receiver address is invalid" });
      return;
    }

    const amountLamports = credits * config.credits.lamportsPerCredit;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const intent = await store.createPaymentIntent({
      userId: req.auth.userId,
      walletAddress,
      credits,
      amountLamports,
      cluster: config.solana.cluster,
      receiverAddress: config.solana.receiverAddress,
      expiresAt,
    });

    await store.addAction({
      userId: req.auth.userId,
      type: "payments.solana.intent.create",
      status: "ok",
      metadata: {
        intentId: intent.id,
        credits,
        amountLamports,
        cluster: config.solana.cluster,
      },
    });

    res.status(201).json({
      intent,
      paymentInstruction: {
        cluster: config.solana.cluster,
        receiverAddress: config.solana.receiverAddress,
        amountLamports,
        memo: `vora:intent:${intent.id}`,
      },
    });
  });

  router.get("/solana/intents/:intentId", requireAuth(config), async (req, res) => {
    const intent = await store.getPaymentIntentById(req.params.intentId);
    if (!intent || intent.userId !== req.auth.userId) {
      res.status(404).json({ error: "Intent not found" });
      return;
    }
    res.json({ intent });
  });

  router.post("/solana/confirm", requireAuth(config), async (req, res) => {
    const parsed = confirmSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid payload", details: parsed.error.issues });
      return;
    }

    const { intentId, txSignature } = parsed.data;
    const intent = await store.getPaymentIntentById(intentId);

    if (!intent || intent.userId !== req.auth.userId) {
      res.status(404).json({ error: "Intent not found" });
      return;
    }

    if (intent.status === "confirmed") {
      const balance = await store.getUserBalance(req.auth.userId);
      res.json({ intent, balance, alreadyConfirmed: true });
      return;
    }

    const isExpired = Date.parse(intent.expiresAt) <= Date.now();
    if (isExpired) {
      res.status(400).json({ error: "Intent expired" });
      return;
    }

    const verification = await verifySolanaTransfer(config, {
      txSignature,
      receiverAddress: intent.receiverAddress,
      walletAddress: intent.walletAddress,
      minLamports: intent.amountLamports,
    });

    if (!verification.ok) {
      await store.addAction({
        userId: req.auth.userId,
        type: "payments.solana.confirm",
        status: "failed",
        metadata: { intentId, txSignature, verification },
      });
      res.status(400).json({
        error: "Could not verify transaction",
        verification,
      });
      return;
    }

    const confirmedIntent = await store.markPaymentIntentConfirmed({ intentId, txSignature });
    await store.addLedgerEntry({
      userId: req.auth.userId,
      type: "purchase",
      amount: intent.credits,
      reason: "solana_purchase",
      paymentIntentId: intent.id,
      txSignature,
      metadata: {
        amountLamports: intent.amountLamports,
        verifyMode: verification.mode,
      },
    });

    await store.addAction({
      userId: req.auth.userId,
      type: "payments.solana.confirm",
      status: "ok",
      metadata: {
        intentId,
        txSignature,
        verification,
      },
    });

    const balance = await store.getUserBalance(req.auth.userId);
    res.status(201).json({ intent: confirmedIntent, verification, balance });
  });

  return router;
}
