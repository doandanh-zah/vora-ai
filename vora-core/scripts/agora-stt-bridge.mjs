#!/usr/bin/env node

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import http from "node:http";

const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_API_BASE = "https://api.agora.io";
const DEFAULT_LANGUAGE = "vi-VN";
const DEFAULT_RTC_UID = "1002";
const DEFAULT_STT_BOT_UID = "9001";

function printUsage() {
  const lines = [
    "Agora STT bridge (browser + RTC + Agora STT v7) for `vora voice`",
    "",
    "Usage:",
    "  node scripts/agora-stt-bridge.mjs [options]",
    "",
    "Options:",
    "  --lang <code>          STT language (default: vi-VN)",
    "  --timeout-ms <ms>      Timeout waiting for final transcript",
    "  --channel <name>       RTC channel name",
    "  --uid <uid>            Browser RTC UID (default: 1002)",
    "  --rtc-token <token>    RTC token for browser + STT bot",
    "  --stt-bot-uid <uid>    STT bot UID for Agora STT service",
    "  --api-base <url>       Agora API base (default: https://api.agora.io)",
    "  --app-id <id>          Agora App ID (or VORA_AGORA_APP_ID)",
    "  --customer-key <key>   Agora customer key (or VORA_AGORA_CUSTOMER_KEY)",
    "  --customer-secret <s>  Agora customer secret (or VORA_AGORA_CUSTOMER_SECRET)",
    "  --port <port>          Fixed local bridge port",
    "  --no-open              Do not auto-open browser",
    "  --help                 Show this help",
    "",
    "Environment fallbacks:",
    "  VORA_AGORA_APP_ID, VORA_AGORA_CUSTOMER_KEY, VORA_AGORA_CUSTOMER_SECRET",
    "  VORA_AGORA_CHANNEL, VORA_AGORA_UID, VORA_AGORA_RTC_TOKEN, VORA_AGORA_STT_BOT_UID",
    "  VORA_AGORA_API_BASE, VORA_AGORA_STT_TIMEOUT_MS, VORA_AGORA_STT_LANG",
  ];
  process.stderr.write(`${lines.join("\n")}\n`);
}

function parseArgs(argv) {
  /** @type {Record<string, string | boolean>} */
  const out = { open: true };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }
    if (token === "--help") {
      out.help = true;
      continue;
    }
    if (token === "--no-open") {
      out.open = false;
      continue;
    }
    if (token === "--open") {
      out.open = true;
      continue;
    }
    const eq = token.indexOf("=");
    if (eq >= 0) {
      const key = token.slice(2, eq);
      const value = token.slice(eq + 1);
      out[key] = value;
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    out[key] = next;
    index += 1;
  }
  return out;
}

function readText(argValue, envName, fallback = "") {
  if (typeof argValue === "string" && argValue.trim().length > 0) {
    return argValue.trim();
  }
  const envValue = process.env[envName];
  if (typeof envValue === "string" && envValue.trim().length > 0) {
    return envValue.trim();
  }
  return fallback;
}

function readPositiveInt(argValue, envName, fallback) {
  const raw = typeof argValue === "string" ? argValue : process.env[envName];
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function ensureRequired(value, name) {
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required config: ${name}`);
  }
  return value.trim();
}

function safeBase(base) {
  return base.replace(/\/+$/g, "");
}

function openUrl(url) {
  const platform = process.platform;
  try {
    if (platform === "darwin") {
      const child = spawn("open", [url], { detached: true, stdio: "ignore" });
      child.unref();
      return;
    }
    if (platform === "win32") {
      const child = spawn("cmd", ["/c", "start", "", url], {
        detached: true,
        stdio: "ignore",
        shell: true,
      });
      child.unref();
      return;
    }
    const child = spawn("xdg-open", [url], { detached: true, stdio: "ignore" });
    child.unref();
  } catch (error) {
    process.stderr.write(
      `[agora-stt-bridge] Could not auto-open browser. Open manually: ${url}\n${String(error)}\n`,
    );
  }
}

function jsonResponse(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function htmlResponse(res, html) {
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(html);
}

function notFound(res) {
  jsonResponse(res, 404, { error: "Not found" });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => {
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function buildBrowserHtml(browserConfig) {
  const inlineConfig = JSON.stringify(browserConfig).replaceAll("<", "\\u003c");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>VORA Agora STT Bridge</title>
    <script src="https://download.agora.io/sdk/release/AgoraRTC_N.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/protobufjs@7.2.3/dist/protobuf.min.js"></script>
    <style>
      :root {
        --bg: #0b1220;
        --panel: #131e36;
        --line: #23355f;
        --text: #e7eefc;
        --muted: #a2b2d8;
        --ok: #37c47a;
        --err: #ff6a6a;
      }
      body {
        margin: 0;
        min-height: 100vh;
        background: radial-gradient(circle at 20% 20%, #1a2b55 0%, var(--bg) 55%);
        color: var(--text);
        font-family: "Avenir Next", "Segoe UI", sans-serif;
        display: grid;
        place-items: center;
        padding: 20px;
      }
      .panel {
        width: min(680px, 96vw);
        border: 1px solid var(--line);
        border-radius: 14px;
        background: color-mix(in srgb, var(--panel) 88%, transparent);
        backdrop-filter: blur(4px);
        padding: 18px 20px;
      }
      h1 {
        margin: 0 0 10px 0;
        font-size: 20px;
      }
      p {
        margin: 4px 0;
      }
      .muted {
        color: var(--muted);
        font-size: 13px;
      }
      .status {
        margin-top: 16px;
        padding: 10px 12px;
        border-radius: 10px;
        border: 1px solid var(--line);
        background: rgba(0, 0, 0, 0.2);
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        white-space: pre-wrap;
      }
      .ok {
        color: var(--ok);
      }
      .err {
        color: var(--err);
      }
    </style>
  </head>
  <body>
    <section class="panel">
      <h1>VORA Agora STT Bridge</h1>
      <p class="muted">Allow microphone access once. Speak one command clearly.</p>
      <p class="muted">The page will close itself after a final transcript is captured.</p>
      <div id="status" class="status">Booting bridge...</div>
    </section>
    <script>
      const CONFIG = ${inlineConfig};
      const statusEl = document.getElementById("status");
      let resolved = false;
      let client = null;
      let micTrack = null;
      let agentId = "";
      let TextMessage = null;

      function setStatus(text, kind = "info") {
        statusEl.textContent = text;
        statusEl.className = "status";
        if (kind === "ok") statusEl.classList.add("ok");
        if (kind === "err") statusEl.classList.add("err");
      }

      async function post(path, payload) {
        const response = await fetch(path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload || {}),
        });
        let data = {};
        try {
          data = await response.json();
        } catch {
          data = {};
        }
        if (!response.ok) {
          throw new Error(data.error || ("HTTP " + response.status));
        }
        return data;
      }

      async function stopAgentQuietly() {
        if (!agentId) return;
        try {
          await post("/api/stop", { agentId });
        } catch {}
        agentId = "";
      }

      async function cleanup() {
        try {
          await stopAgentQuietly();
        } catch {}
        try {
          if (micTrack) {
            micTrack.stop();
            micTrack.close();
            micTrack = null;
          }
        } catch {}
        try {
          if (client) {
            await client.leave();
            client = null;
          }
        } catch {}
      }

      async function resolveSuccess(text) {
        if (resolved) return;
        resolved = true;
        setStatus("Final transcript: " + text, "ok");
        try {
          await post("/result", { text });
        } finally {
          await cleanup();
          setTimeout(() => window.close(), 250);
        }
      }

      async function resolveError(message) {
        if (resolved) return;
        resolved = true;
        setStatus("Bridge error: " + message, "err");
        try {
          await post("/error", { message });
        } finally {
          await cleanup();
        }
      }

      function handleStreamMessage(data) {
        if (!TextMessage) {
          return;
        }
        let bytes;
        if (data instanceof Uint8Array) {
          bytes = data;
        } else if (data instanceof ArrayBuffer) {
          bytes = new Uint8Array(data);
        } else if (data?.buffer instanceof ArrayBuffer) {
          bytes = new Uint8Array(data.buffer);
        } else {
          return;
        }

        try {
          const msg = TextMessage.decode(bytes);
          if (msg?.data_type !== "transcribe") {
            return;
          }
          const words = Array.isArray(msg.words) ? msg.words : [];
          if (words.length === 0) {
            return;
          }
          const text = words.map((word) => String(word?.text || "")).join("").trim();
          if (!text) {
            return;
          }
          const hasFinal = words.some((word) => word?.isFinal === true);
          if (hasFinal) {
            void resolveSuccess(text);
          } else {
            setStatus("Listening... " + text);
          }
        } catch (error) {
          setStatus("Decode issue (ignored): " + String(error));
        }
      }

      async function boot() {
        try {
          if (!window.AgoraRTC) {
            throw new Error("AgoraRTC SDK not loaded");
          }
          if (!window.protobuf) {
            throw new Error("protobuf.js not loaded");
          }

          const root = protobuf.Root.fromJSON({
            nested: {
              agora: {
                nested: {
                  audio2text: {
                    nested: {
                      Text: {
                        fields: {
                          vendor: { type: "int32", id: 1 },
                          version: { type: "int32", id: 2 },
                          seqnum: { type: "int32", id: 3 },
                          uid: { type: "uint32", id: 4 },
                          flag: { type: "int32", id: 5 },
                          time: { type: "int64", id: 6 },
                          lang: { type: "int32", id: 7 },
                          starttime: { type: "int32", id: 8 },
                          offtime: { type: "int32", id: 9 },
                          words: { rule: "repeated", type: "Word", id: 10 },
                          end_of_segment: { type: "bool", id: 11 },
                          duration_ms: { type: "int32", id: 12 },
                          data_type: { type: "string", id: 13 },
                          trans: { rule: "repeated", type: "Translation", id: 14 }
                        }
                      },
                      Word: {
                        fields: {
                          text: { type: "string", id: 1 },
                          startMs: { type: "int32", id: 2 },
                          durationMs: { type: "int32", id: 3 },
                          isFinal: { type: "bool", id: 4 },
                          confidence: { type: "double", id: 5 }
                        }
                      },
                      Translation: {
                        fields: {
                          isFinal: { type: "bool", id: 1 },
                          lang: { type: "string", id: 2 },
                          texts: { rule: "repeated", type: "string", id: 3 }
                        }
                      }
                    }
                  }
                }
              }
            }
          });
          TextMessage = root.lookupType("agora.audio2text.Text");

          setStatus("Joining RTC channel...");
          client = AgoraRTC.createClient({ mode: "live", codec: "vp8", role: "host" });
          client.on("stream-message", (_uid, data) => {
            void handleStreamMessage(data);
          });

          const rtcToken = CONFIG.rtcToken && CONFIG.rtcToken.length > 0 ? CONFIG.rtcToken : null;
          const uidRaw = Number.parseInt(String(CONFIG.uid), 10);
          const uid = Number.isFinite(uidRaw) ? uidRaw : null;
          await client.join(CONFIG.appId, CONFIG.channel, rtcToken, uid);

          setStatus("Microphone setup...");
          micTrack = await AgoraRTC.createMicrophoneAudioTrack();
          await client.publish([micTrack]);

          const start = await post("/api/start", { lang: CONFIG.lang });
          if (!start?.agentId) {
            throw new Error("Agora STT start returned no agentId");
          }
          agentId = String(start.agentId);
          setStatus("Listening... speak your command now.", "ok");
        } catch (error) {
          await resolveError(String(error));
        }
      }

      setTimeout(() => {
        void resolveError("timeout waiting for final transcript");
      }, Math.max(1000, CONFIG.timeoutMs));

      window.addEventListener("beforeunload", () => {
        void cleanup();
      });

      void boot();
    </script>
  </body>
</html>`;
}

async function startAgoraStt(config, lang) {
  const apiBase = safeBase(config.apiBase);
  const auth = Buffer.from(`${config.customerKey}:${config.customerSecret}`).toString("base64");
  const startPayload = {
    name: `vora-voice-${Date.now()}`,
    languages: [lang],
    maxIdleTime: Math.max(10, Math.min(300, Math.ceil(config.timeoutMs / 1000))),
    rtcConfig: {
      channelName: config.channel,
      subBotUid: String(config.sttBotUid),
      pubBotUid: String(config.sttBotUid),
    },
  };
  if (config.rtcToken) {
    startPayload.rtcConfig.subBotToken = config.rtcToken;
    startPayload.rtcConfig.pubBotToken = config.rtcToken;
  }

  const response = await fetch(`${apiBase}/api/speech-to-text/v1/projects/${config.appId}/join`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(startPayload),
  });

  const bodyText = await response.text();
  let body = {};
  try {
    body = JSON.parse(bodyText);
  } catch {
    body = { message: bodyText };
  }

  if (!response.ok) {
    const detail = typeof body?.message === "string" ? body.message : bodyText;
    throw new Error(`Agora STT start failed (${response.status}): ${detail || "unknown error"}`);
  }

  const agentId = body?.agent_id;
  if (!agentId) {
    throw new Error("Agora STT start succeeded but no agent_id in response");
  }
  return String(agentId);
}

async function stopAgoraStt(config, agentId) {
  if (!agentId) {
    return;
  }
  const apiBase = safeBase(config.apiBase);
  const auth = Buffer.from(`${config.customerKey}:${config.customerSecret}`).toString("base64");
  await fetch(
    `${apiBase}/api/speech-to-text/v1/projects/${config.appId}/agents/${encodeURIComponent(agentId)}/leave`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
    },
  ).catch(() => undefined);
}

function closeServer(server) {
  return new Promise((resolve) => {
    server.close(() => resolve(undefined));
  });
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`[agora-stt-bridge] ${String(error)}\n\n`);
    printUsage();
    process.exit(1);
    return;
  }

  if (args.help) {
    printUsage();
    process.exit(0);
    return;
  }

  const config = {
    appId: ensureRequired(readText(args["app-id"], "VORA_AGORA_APP_ID"), "VORA_AGORA_APP_ID / --app-id"),
    customerKey: ensureRequired(
      readText(args["customer-key"], "VORA_AGORA_CUSTOMER_KEY"),
      "VORA_AGORA_CUSTOMER_KEY / --customer-key",
    ),
    customerSecret: ensureRequired(
      readText(args["customer-secret"], "VORA_AGORA_CUSTOMER_SECRET"),
      "VORA_AGORA_CUSTOMER_SECRET / --customer-secret",
    ),
    channel:
      readText(args.channel, "VORA_AGORA_CHANNEL") ||
      `vora-voice-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 6)}`,
    uid: readText(args.uid, "VORA_AGORA_UID", DEFAULT_RTC_UID),
    sttBotUid: readText(args["stt-bot-uid"], "VORA_AGORA_STT_BOT_UID", DEFAULT_STT_BOT_UID),
    rtcToken: readText(args["rtc-token"], "VORA_AGORA_RTC_TOKEN"),
    apiBase: readText(args["api-base"], "VORA_AGORA_API_BASE", DEFAULT_API_BASE),
    lang: readText(args.lang, "VORA_AGORA_STT_LANG", DEFAULT_LANGUAGE),
    timeoutMs: readPositiveInt(args["timeout-ms"], "VORA_AGORA_STT_TIMEOUT_MS", DEFAULT_TIMEOUT_MS),
    open: args.open !== false,
    port: readPositiveInt(args.port, "VORA_AGORA_STT_PORT", 0),
  };

  const browserConfig = {
    appId: config.appId,
    channel: config.channel,
    uid: config.uid,
    rtcToken: config.rtcToken,
    lang: config.lang,
    timeoutMs: config.timeoutMs,
  };

  let server;
  let done = false;
  let currentAgentId = "";

  const fail = async (message) => {
    if (done) {
      return;
    }
    done = true;
    await stopAgoraStt(config, currentAgentId).catch(() => undefined);
    if (server) {
      await closeServer(server);
    }
    process.stderr.write(`[agora-stt-bridge] ${message}\n`);
    process.exit(1);
  };

  const succeed = async (text) => {
    if (done) {
      return;
    }
    done = true;
    await stopAgoraStt(config, currentAgentId).catch(() => undefined);
    if (server) {
      await closeServer(server);
    }
    process.stdout.write(`${text.trim()}\n`);
    process.exit(0);
  };

  server = http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
    const pathname = requestUrl.pathname;

    if (req.method === "GET" && pathname === "/") {
      htmlResponse(res, buildBrowserHtml(browserConfig));
      return;
    }

    if (req.method === "POST" && pathname === "/api/start") {
      try {
        const body = await readJsonBody(req);
        const lang = typeof body?.lang === "string" && body.lang.trim() ? body.lang.trim() : config.lang;
        currentAgentId = await startAgoraStt(config, lang);
        jsonResponse(res, 200, { ok: true, agentId: currentAgentId });
      } catch (error) {
        jsonResponse(res, 500, { ok: false, error: String(error) });
      }
      return;
    }

    if (req.method === "POST" && pathname === "/api/stop") {
      try {
        const body = await readJsonBody(req);
        const agentId =
          typeof body?.agentId === "string" && body.agentId.trim().length > 0
            ? body.agentId.trim()
            : currentAgentId;
        await stopAgoraStt(config, agentId);
        if (agentId === currentAgentId) {
          currentAgentId = "";
        }
        jsonResponse(res, 200, { ok: true });
      } catch (error) {
        jsonResponse(res, 500, { ok: false, error: String(error) });
      }
      return;
    }

    if (req.method === "POST" && pathname === "/result") {
      try {
        const body = await readJsonBody(req);
        const text = typeof body?.text === "string" ? body.text.trim() : "";
        if (!text) {
          jsonResponse(res, 400, { ok: false, error: "Missing transcript text" });
          return;
        }
        jsonResponse(res, 200, { ok: true });
        await succeed(text);
      } catch (error) {
        jsonResponse(res, 500, { ok: false, error: String(error) });
      }
      return;
    }

    if (req.method === "POST" && pathname === "/error") {
      try {
        const body = await readJsonBody(req);
        const message =
          typeof body?.message === "string" && body.message.trim().length > 0
            ? body.message.trim()
            : "unknown bridge error";
        jsonResponse(res, 200, { ok: true });
        await fail(message);
      } catch (error) {
        jsonResponse(res, 500, { ok: false, error: String(error) });
      }
      return;
    }

    notFound(res);
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, "127.0.0.1", () => {
      resolve(undefined);
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    await fail("bridge failed to bind local port");
    return;
  }

  const localUrl = `http://127.0.0.1:${address.port}/`;
  process.stderr.write(`[agora-stt-bridge] channel=${config.channel} uid=${config.uid}\n`);
  process.stderr.write(`[agora-stt-bridge] open this URL if browser does not auto-open:\n${localUrl}\n`);
  process.stderr.write("[agora-stt-bridge] waiting for one final transcript...\n");
  if (config.open) {
    openUrl(localUrl);
  }

  const timeout = setTimeout(() => {
    void fail(`timeout after ${config.timeoutMs}ms`);
  }, config.timeoutMs + 15_000);

  const stop = async () => {
    clearTimeout(timeout);
    if (!done) {
      await fail("interrupted");
    }
  };
  process.once("SIGINT", () => {
    void stop();
  });
  process.once("SIGTERM", () => {
    void stop();
  });
}

main().catch((error) => {
  process.stderr.write(`[agora-stt-bridge] fatal: ${String(error)}\n`);
  process.exit(1);
});
