import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import agoraToken from "agora-token";

const { RtcRole, RtcTokenBuilder } = agoraToken;

const DEFAULT_LANGUAGE = "en-US";
const DEFAULT_UID = "1002";
const DEFAULT_STT_AUDIO_UID = "111";
const DEFAULT_STT_TEXT_UID = "222";
const MIN_STT_IDLE_SECONDS = 10;
const MAX_STT_IDLE_SECONDS = 300;

const activeTasks = new Map();

const tokenSchema = z.object({
  channel: z.string().min(1).max(128).optional(),
  uid: z.string().regex(/^\d+$/).optional(),
  sttAudioUid: z.string().regex(/^\d+$/).optional(),
  sttTextUid: z.string().regex(/^\d+$/).optional(),
  sttBotUid: z.string().regex(/^\d+$/).optional(),
  lang: z.string().min(2).max(64).optional(),
  timeoutMs: z.coerce.number().int().positive().max(300_000).optional(),
});

const startSchema = tokenSchema.extend({
  channel: z.string().min(1).max(128),
});

const stopSchema = z.object({
  agentId: z.string().min(1).max(256),
});

function safeBase(base) {
  return base.replace(/\/+$/g, "");
}

function requireAgoraConfig(config) {
  const missing = [];
  if (!config.agora.appId) missing.push("AGORA_APP_ID");
  if (!config.agora.appCertificate) missing.push("AGORA_APP_CERTIFICATE");
  if (!config.agora.customerKey) missing.push("AGORA_CUSTOMER_KEY");
  if (!config.agora.customerSecret) missing.push("AGORA_CUSTOMER_SECRET");
  if (missing.length > 0) {
    const error = new Error(`Agora backend env missing: ${missing.join(", ")}`);
    error.statusCode = 503;
    throw error;
  }
}

function buildRtcToken(config, channel, uid) {
  const expireSeconds = Math.max(60, Math.min(24 * 60 * 60, config.agora.tokenExpireSeconds));
  return RtcTokenBuilder.buildTokenWithUid(
    config.agora.appId,
    config.agora.appCertificate,
    channel,
    Number(uid),
    RtcRole.PUBLISHER,
    expireSeconds,
    expireSeconds,
  );
}

function buildSession(config, input) {
  const channel = input.channel || `vora-voice-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 6)}`;
  const uid = input.uid || DEFAULT_UID;
  const sttAudioUid = input.sttAudioUid || input.sttBotUid || DEFAULT_STT_AUDIO_UID;
  const sttTextUid = input.sttTextUid || DEFAULT_STT_TEXT_UID;
  return {
    appId: config.agora.appId,
    channel,
    uid,
    sttAudioUid,
    sttTextUid,
    sttBotUid: sttAudioUid,
    lang: input.lang || DEFAULT_LANGUAGE,
    timeoutMs: input.timeoutMs || 45_000,
    rtcToken: buildRtcToken(config, channel, uid),
  };
}

async function readAgoraJson(response) {
  const bodyText = await response.text();
  let body = {};
  try {
    body = JSON.parse(bodyText);
  } catch {
    body = { message: bodyText };
  }
  return { body, bodyText };
}

function sttIdleSeconds(session) {
  return Math.max(MIN_STT_IDLE_SECONDS, Math.min(MAX_STT_IDLE_SECONDS, Math.ceil(session.timeoutMs / 1000)));
}

function sttLanguages(session) {
  const raw = String(session.lang || DEFAULT_LANGUAGE);
  const languages = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 2);
  return languages.length > 0 ? languages : [DEFAULT_LANGUAGE.split(",")[0]];
}

function buildSttJoinBody(config, session) {
  return {
    name: session.channel,
    languages: sttLanguages(session),
    maxIdleTime: sttIdleSeconds(session),
    rtcConfig: {
      channelName: session.channel,
      subBotUid: String(session.sttAudioUid),
      subBotToken: buildRtcToken(config, session.channel, session.sttAudioUid),
      pubBotUid: String(session.sttTextUid),
      pubBotToken: buildRtcToken(config, session.channel, session.sttTextUid),
    },
  };
}

async function startAgoraStt(config, session) {
  const auth = Buffer.from(`${config.agora.customerKey}:${config.agora.customerSecret}`).toString("base64");
  const response = await fetch(
    `${safeBase(config.agora.apiBase)}/api/speech-to-text/v1/projects/${config.agora.appId}/join`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildSttJoinBody(config, session)),
    },
  );
  const { body, bodyText } = await readAgoraJson(response);
  if (!response.ok) {
    const detail = typeof body?.message === "string" ? body.message : bodyText;
    const invalidAppIdHint = /\binvalid_?appid\b/i.test(detail || "")
      ? " This usually means Real-Time Speech-to-Text is not enabled/entitled for this Agora project, or Signaling/Data Center/Stream Channel is not fully configured in Agora Console."
      : "";
    const error = new Error(
      `Agora STT join failed (${response.status}): ${detail || "unknown error"}.${invalidAppIdHint}`,
    );
    error.statusCode = 502;
    error.providerCode = typeof body?.message === "string" ? body.message : undefined;
    throw error;
  }

  if (!body?.agent_id) {
    const error = new Error("Agora STT join succeeded but no agent_id was returned");
    error.statusCode = 502;
    throw error;
  }
  const status = typeof body?.status === "string" ? body.status.toUpperCase() : "";
  if (status && status !== "RUNNING" && status !== "STARTED" && status !== "IN_PROGRESS") {
    const error = new Error(`Agora STT agent returned unexpected status: ${body.status}`);
    error.statusCode = 502;
    throw error;
  }
  const agentId = randomUUID();
  activeTasks.set(agentId, {
    agentId: String(body.agent_id),
    createdAt: Date.now(),
  });
  return agentId;
}

async function stopAgoraStt(config, agentId) {
  const task = activeTasks.get(agentId);
  if (!task) {
    return;
  }
  const auth = Buffer.from(`${config.agora.customerKey}:${config.agora.customerSecret}`).toString("base64");
  activeTasks.delete(agentId);
  await fetch(
    `${safeBase(config.agora.apiBase)}/api/speech-to-text/v1/projects/${config.agora.appId}/agents/${encodeURIComponent(
      task.agentId,
    )}/leave`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
    },
  );
}

function handleError(res, error) {
  const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
  res.status(statusCode).json({
    error: error.message || "Agora request failed",
    providerCode: error?.providerCode,
  });
}

export function createAgoraRouter({ config }) {
  const router = Router();

  router.get("/token", async (req, res) => {
    try {
      requireAgoraConfig(config);
      const parsed = tokenSchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid query", details: parsed.error.issues });
        return;
      }
      res.json({ ok: true, ...buildSession(config, parsed.data) });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.post("/token", async (req, res) => {
    try {
      requireAgoraConfig(config);
      const parsed = tokenSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid payload", details: parsed.error.issues });
        return;
      }
      res.json({ ok: true, ...buildSession(config, parsed.data) });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.post("/stt/start", async (req, res) => {
    try {
      requireAgoraConfig(config);
      const parsed = startSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid payload", details: parsed.error.issues });
        return;
      }
      const session = buildSession(config, parsed.data);
      const agentId = await startAgoraStt(config, session);
      res.json({ ok: true, agentId });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.post("/stt/probe", async (req, res) => {
    try {
      requireAgoraConfig(config);
      const parsed = tokenSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid payload", details: parsed.error.issues });
        return;
      }
      res.json({
        ok: true,
        apiVersion: "7.x",
        message: "STT 7.x has no separate builder-token probe; /stt/start performs the live join.",
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.post("/stt/stop", async (req, res) => {
    try {
      requireAgoraConfig(config);
      const parsed = stopSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid payload", details: parsed.error.issues });
        return;
      }
      await stopAgoraStt(config, parsed.data.agentId);
      res.json({ ok: true });
    } catch (error) {
      handleError(res, error);
    }
  });

  return router;
}
