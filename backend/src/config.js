import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";

dotenv.config();

function readText(name, fallback = "") {
  const value = process.env[name];
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function readInt(name, fallback) {
  const value = Number.parseInt(readText(name, String(fallback)), 10);
  return Number.isFinite(value) ? value : fallback;
}

function readBool(name, fallback) {
  const value = readText(name, fallback ? "true" : "false").toLowerCase();
  if (value === "true" || value === "1" || value === "yes") {
    return true;
  }
  if (value === "false" || value === "0" || value === "no") {
    return false;
  }
  return fallback;
}

const dataDirRaw = readText("DATA_DIR", "./data");
const jwtAccessSecret = readText("JWT_ACCESS_SECRET", "dev-access-secret-change-me");
const jwtRefreshSecret = readText("JWT_REFRESH_SECRET", "dev-refresh-secret-change-me");

if (
  jwtAccessSecret === "dev-access-secret-change-me" ||
  jwtRefreshSecret === "dev-refresh-secret-change-me"
) {
  // eslint-disable-next-line no-console
  console.warn("[backend] JWT secrets are using insecure dev defaults. Set JWT_ACCESS_SECRET/JWT_REFRESH_SECRET.");
}

export const config = {
  app: {
    port: readInt("PORT", 8788),
    corsOrigin: readText("CORS_ORIGIN", "*"),
    dataDir: path.isAbsolute(dataDirRaw)
      ? dataDirRaw
      : path.resolve(process.cwd(), dataDirRaw),
    allowRegistration: readBool("ALLOW_REGISTRATION", true),
  },
  auth: {
    accessSecret: jwtAccessSecret,
    refreshSecret: jwtRefreshSecret,
    accessExpiresIn: readText("JWT_ACCESS_EXPIRES_IN", "15m"),
    refreshExpiresDays: readInt("JWT_REFRESH_EXPIRES_DAYS", 30),
  },
  credits: {
    lamportsPerCredit: readInt("LAMPORTS_PER_CREDIT", 500_000),
  },
  solana: {
    cluster: readText("SOLANA_CLUSTER", "devnet"),
    receiverAddress: readText("SOLANA_RECEIVER_ADDRESS", ""),
    verifyOnChain: readBool("SOLANA_VERIFY_ONCHAIN", false),
  },
  agora: {
    appId: readText("AGORA_APP_ID", ""),
    appCertificate: readText("AGORA_APP_CERTIFICATE", ""),
    customerKey: readText("AGORA_CUSTOMER_KEY", ""),
    customerSecret: readText("AGORA_CUSTOMER_SECRET", ""),
    apiBase: readText("AGORA_API_BASE", "https://api.agora.io"),
    tokenExpireSeconds: readInt("AGORA_TOKEN_EXPIRE_SECONDS", 3600),
  },
  hume: {
    apiKey: readText("HUME_API_KEY", readText("VORA_HUME_API_KEY", "")),
    secretKey: readText("HUME_SECRET_KEY", ""),
    voiceId: readText("HUME_VOICE_ID", "9e068547-5ba4-4c8e-8e03-69282a008f04"),
  },
};
