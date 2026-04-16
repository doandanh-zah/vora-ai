import { Router } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import AgoraToken from "agora-access-token";
const { RtcTokenBuilder, RtcRole } = AgoraToken;

const exchangeSchema = z.object({
  userId: z.string().min(3).max(120),
  email: z.string().email().optional(),
  role: z.enum(["user", "admin"]).optional(),
});

const agoraSchema = z.object({
  channel: z.string().min(1).max(64),
  uid: z.number().int().nonnegative().optional(),
  expiresInSec: z.number().int().min(60).max(7200).optional(),
});

export function createIntegrationsRouter({ config }) {
  const router = Router();

  router.post("/auth/exchange", async (req, res) => {
    const parsed = exchangeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid payload", details: parsed.error.issues });
      return;
    }

    const user = {
      id: parsed.data.userId,
      email: parsed.data.email || "",
      role: parsed.data.role || "user",
      name: parsed.data.email?.split("@")[0] || "user",
    };

    const jwt = (await import("../lib/auth.js")).createAccessToken(config, user);
    res.json({ ok: true, accessToken: jwt, user: { id: user.id, role: user.role, email: user.email } });
  });

  router.post("/agora/token", async (req, res) => {
    const parsed = agoraSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid payload", details: parsed.error.issues });
      return;
    }

    if (!config.agora.appId || !config.agora.appCertificate) {
      res.status(500).json({ error: "Agora is not configured" });
      return;
    }

    const uid = parsed.data.uid ?? 0;
    const ttl = parsed.data.expiresInSec ?? 3600;
    const privilegeExpiredTs = Math.floor(Date.now() / 1000) + ttl;

    const token = RtcTokenBuilder.buildTokenWithUid(
      config.agora.appId,
      config.agora.appCertificate,
      parsed.data.channel,
      uid,
      RtcRole.PUBLISHER,
      privilegeExpiredTs,
    );

    res.json({
      ok: true,
      appId: config.agora.appId,
      channel: parsed.data.channel,
      uid,
      expiresAt: new Date(privilegeExpiredTs * 1000).toISOString(),
      token,
    });
  });

  router.get("/tts/hume", async (_req, res) => {
    const configured = Boolean(config.hume.apiKey && config.hume.secretKey);
    res.json({
      ok: configured,
      provider: "hume",
      configured,
      note: configured ? "Credentials configured" : "Missing HUME_API_KEY/HUME_SECRET_KEY",
      requestId: crypto.randomUUID(),
    });
  });

  return router;
}
