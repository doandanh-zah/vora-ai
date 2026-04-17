import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { BackendStore } from "./lib/store.js";
import { createAuthRouter } from "./routes/auth.routes.js";
import { createActionsRouter } from "./routes/actions.routes.js";
import { createAgoraRouter } from "./routes/agora.routes.js";
import { createCreditsRouter } from "./routes/credits.routes.js";
import { createPaymentsRouter } from "./routes/payments.routes.js";
import { createIntegrationsRouter } from "./routes/integrations.routes.js";
import { createTtsRouter } from "./routes/tts.routes.js";

async function bootstrap() {
  const app = express();
  const store = new BackendStore(config.app.dataDir);
  await store.init();

  app.use(
    cors({
      origin: config.app.corsOrigin === "*" ? true : config.app.corsOrigin,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", async (_req, res) => {
    res.json({
      ok: true,
      service: "vora-backend",
      ts: new Date().toISOString(),
      solanaCluster: config.solana.cluster,
      verifyOnChain: config.solana.verifyOnChain,
      voiceProviders: {
        agora: Boolean(
          config.agora.appId &&
            config.agora.appCertificate &&
            config.agora.customerKey &&
            config.agora.customerSecret,
        ),
        elevenlabs: Boolean(config.elevenlabs.apiKey),
      },
    });
  });

  app.get("/", (_req, res) => {
    res.json({
      name: "vora-backend",
      version: "0.1.0",
      endpoints: [
        "POST /api/auth/register",
        "POST /api/auth/login",
        "POST /api/auth/refresh",
        "POST /api/auth/logout",
        "GET  /api/auth/me",
        "GET  /api/agora/token",
        "POST /api/agora/token",
        "POST /api/agora/stt/start",
        "POST /api/agora/stt/stop",
        "POST /api/tts/elevenlabs",
        "POST /api/actions",
        "GET  /api/actions/mine",
        "GET  /api/credits/balance",
        "GET  /api/credits/ledger",
        "POST /api/credits/spend",
        "POST /api/payments/solana/intents",
        "GET  /api/payments/solana/intents/:intentId",
        "POST /api/payments/solana/confirm",
      ],
    });
  });

  app.use("/api/auth", createAuthRouter({ config, store }));
  app.use("/api/agora", createAgoraRouter({ config }));
  app.use("/api/tts", createTtsRouter({ config }));
  app.use("/api/actions", createActionsRouter({ config, store }));
  app.use("/api/credits", createCreditsRouter({ config, store }));
  app.use("/api/payments", createPaymentsRouter({ config, store }));
  app.use("/api", createIntegrationsRouter({ config }));

  app.use((err, _req, res, _next) => {
    // eslint-disable-next-line no-console
    console.error("[backend] unhandled error", err);
    res.status(500).json({ error: "Internal server error" });
  });

  app.listen(config.app.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[backend] listening on http://127.0.0.1:${config.app.port}`);
    // eslint-disable-next-line no-console
    console.log(`[backend] data dir: ${config.app.dataDir}`);
  });
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("[backend] failed to start", error);
  process.exit(1);
});
