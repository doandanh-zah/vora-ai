import { Router } from "express";
import { z } from "zod";
import {
  calcRefreshExpiryIso,
  createAccessToken,
  hashPassword,
  newRefreshToken,
  normalizeEmail,
  verifyPassword,
} from "../lib/auth.js";
import { buildPublicUser } from "../lib/store.js";
import { requireAuth } from "../middleware/auth.js";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(120),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(20),
});

const logoutSchema = z.object({
  refreshToken: z.string().min(20),
});

function metaFromReq(req) {
  return {
    ip: req.ip,
    userAgent: req.headers["user-agent"] || "",
  };
}

async function safeLogAction(store, payload) {
  try {
    await store.addAction(payload);
  } catch {
    // ignore log failures
  }
}

export function createAuthRouter({ config, store }) {
  const router = Router();

  router.post("/register", async (req, res) => {
    if (!config.app.allowRegistration) {
      res.status(403).json({ error: "Registration is disabled" });
      return;
    }

    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid payload", details: parsed.error.issues });
      return;
    }

    const { email, password, name } = parsed.data;
    const normalizedEmail = normalizeEmail(email);

    try {
      const usersCount = await store.countUsers();
      const role = usersCount === 0 ? "admin" : "user";
      const passwordHash = await hashPassword(password);
      const user = await store.createUser({
        email: normalizedEmail,
        name,
        passwordHash,
        role,
      });
      const refreshToken = newRefreshToken();
      await store.createSession({
        userId: user.id,
        refreshToken,
        expiresAt: calcRefreshExpiryIso(config),
        ...metaFromReq(req),
      });
      const accessToken = createAccessToken(config, user);

      await safeLogAction(store, {
        userId: user.id,
        type: "auth.register",
        status: "ok",
        metadata: { email: normalizedEmail, role },
      });

      res.status(201).json({
        user: buildPublicUser(user),
        accessToken,
        refreshToken,
      });
    } catch (error) {
      if (String(error.message) === "EMAIL_ALREADY_EXISTS") {
        res.status(409).json({ error: "Email already exists" });
        return;
      }
      res.status(500).json({ error: "Could not register user" });
    }
  });

  router.post("/login", async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid payload", details: parsed.error.issues });
      return;
    }

    const { email, password } = parsed.data;
    const normalizedEmail = normalizeEmail(email);
    const user = await store.findUserByEmail(normalizedEmail);

    if (!user) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      await safeLogAction(store, {
        userId: user.id,
        type: "auth.login",
        status: "denied",
        metadata: { reason: "wrong_password" },
      });
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const refreshToken = newRefreshToken();
    await store.createSession({
      userId: user.id,
      refreshToken,
      expiresAt: calcRefreshExpiryIso(config),
      ...metaFromReq(req),
    });
    const accessToken = createAccessToken(config, user);

    await safeLogAction(store, {
      userId: user.id,
      type: "auth.login",
      status: "ok",
      metadata: { email: normalizedEmail },
    });

    res.json({
      user: buildPublicUser(user),
      accessToken,
      refreshToken,
    });
  });

  router.post("/refresh", async (req, res) => {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid payload", details: parsed.error.issues });
      return;
    }

    const { refreshToken } = parsed.data;
    const session = await store.findValidSessionByRefreshToken(refreshToken);
    if (!session) {
      res.status(401).json({ error: "Invalid refresh token" });
      return;
    }

    const user = await store.findUserById(session.userId);
    if (!user) {
      res.status(401).json({ error: "Session user no longer exists" });
      return;
    }

    const rotatedToken = newRefreshToken();
    await store.rotateSessionToken({
      sessionId: session.id,
      refreshToken: rotatedToken,
      expiresAt: calcRefreshExpiryIso(config),
    });

    const accessToken = createAccessToken(config, user);

    await safeLogAction(store, {
      userId: user.id,
      type: "auth.refresh",
      status: "ok",
      metadata: { sessionId: session.id },
    });

    res.json({
      user: buildPublicUser(user),
      accessToken,
      refreshToken: rotatedToken,
    });
  });

  router.post("/logout", async (req, res) => {
    const parsed = logoutSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid payload", details: parsed.error.issues });
      return;
    }

    const { refreshToken } = parsed.data;
    const session = await store.findValidSessionByRefreshToken(refreshToken);
    const revoked = await store.revokeSessionByRefreshToken(refreshToken);

    if (session) {
      await safeLogAction(store, {
        userId: session.userId,
        type: "auth.logout",
        status: revoked ? "ok" : "noop",
      });
    }

    res.json({ ok: true, revoked });
  });

  router.get("/me", requireAuth(config), async (req, res) => {
    const user = await store.findUserById(req.auth.userId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({ user: buildPublicUser(user) });
  });

  return router;
}
