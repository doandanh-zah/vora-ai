import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { BackendStore } from "./lib/store.js";
import { createAuthRouter } from "./routes/auth.routes.js";
import { createActionsRouter } from "./routes/actions.routes.js";
import { createCreditsRouter } from "./routes/credits.routes.js";
import { createPaymentsRouter } from "./routes/payments.routes.js";

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
  app.use("/api/actions", createActionsRouter({ config, store }));
  app.use("/api/credits", createCreditsRouter({ config, store }));
  app.use("/api/payments", createPaymentsRouter({ config, store }));

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
