#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_API_BASE = "https://api.agora.io";
const DEFAULT_BACKEND_URL = "https://vora-ai-backend-uemj.onrender.com";
const DEFAULT_LANGUAGE = "en-US";
const DEFAULT_RTC_UID = "1002";
const DEFAULT_STT_AUDIO_UID = "111";
const DEFAULT_STT_TEXT_UID = "222";
const DEFAULT_STT_BOT_UID = DEFAULT_STT_AUDIO_UID;

function printUsage() {
  const lines = [
  "Agora STT bridge (RTC + Agora RTT capture) for `vora voice`",
    "",
    "Usage:",
    "  node scripts/agora-stt-bridge.mjs [options]",
    "",
    "Options:",
    `  --lang <code>          STT language(s), comma-separated max 2 (default: ${DEFAULT_LANGUAGE})`,
    "  --timeout-ms <ms>      Timeout waiting for final transcript",
    "  --channel <name>       RTC channel name",
    "  --uid <uid>            Capture RTC UID (default: 1002)",
    "  --rtc-token <token>    RTC token for browser + STT bot",
    "  --stt-audio-uid <uid>  STT audio bot UID for Agora RTT service",
    "  --stt-text-uid <uid>   STT text bot UID for Agora RTT data stream",
    "  --stt-bot-uid <uid>    Legacy alias for --stt-audio-uid",
    "  --api-base <url>       Agora API base (default: https://api.agora.io)",
    "  --backend-url <url>    VORA backend URL for provider secrets/tokens",
    "  --app-id <id>          Agora App ID (or VORA_AGORA_APP_ID)",
    "  --customer-key <key>   Agora customer key (or VORA_AGORA_CUSTOMER_KEY)",
    "  --customer-secret <s>  Agora customer secret (or VORA_AGORA_CUSTOMER_SECRET)",
    "  --port <port>          Fixed local bridge port",
    "  --browser-mode <mode>  managed|external|none (default: managed)",
    "  --browser-user-data-dir <path>",
    "                         Persistent browser profile for faster SDK/mic startup",
    "  --show-browser         Show the managed browser window for debugging",
    "  --no-open              Do not start the managed/external capture page",
    "  --help                 Show this help",
    "",
    "Environment fallbacks:",
    "  VORA_BACKEND_URL",
    "  VORA_AGORA_APP_ID, VORA_AGORA_CUSTOMER_KEY, VORA_AGORA_CUSTOMER_SECRET",
    "  VORA_AGORA_CHANNEL, VORA_AGORA_UID, VORA_AGORA_RTC_TOKEN",
    "  VORA_AGORA_STT_AUDIO_UID, VORA_AGORA_STT_TEXT_UID, VORA_AGORA_STT_BOT_UID",
    "  VORA_AGORA_API_BASE, VORA_AGORA_STT_TIMEOUT_MS, VORA_AGORA_STT_LANG",
    "  VORA_AGORA_STT_BROWSER_MODE, VORA_AGORA_STT_SHOW_BROWSER",
    "  VORA_AGORA_STT_BROWSER_USER_DATA_DIR",
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
    if (token === "--show-browser") {
      out["show-browser"] = true;
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

function optionalText(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "";
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

function readBoolean(argValue, envName, fallback = false) {
  if (typeof argValue === "boolean") {
    return argValue;
  }
  const raw = typeof argValue === "string" ? argValue : process.env[envName];
  if (!raw) {
    return fallback;
  }
  const normalized = String(raw).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function resolveBrowserMode(args) {
  const raw = readText(args["browser-mode"], "VORA_AGORA_STT_BROWSER_MODE", "managed").toLowerCase();
  if (raw === "managed" || raw === "external" || raw === "none") {
    return raw;
  }
  return "managed";
}

function browserExecutableCandidates() {
  if (process.platform === "darwin") {
    return [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ];
  }
  if (process.platform === "win32") {
    const roots = [
      process.env.PROGRAMFILES,
      process.env["PROGRAMFILES(X86)"],
      process.env.LOCALAPPDATA,
    ].filter(Boolean);
    return roots.flatMap((root) => [
      `${root}\\Microsoft\\Edge\\Application\\msedge.exe`,
      `${root}\\Google\\Chrome\\Application\\chrome.exe`,
    ]);
  }
  return [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
  ];
}

function defaultBrowserUserDataDir() {
  return path.join(os.homedir(), ".vora", "agora-stt-browser");
}

async function openManagedBrowser(url, showBrowser, userDataDir) {
  let chromium;
  try {
    ({ chromium } = await import("playwright-core"));
  } catch (error) {
    throw new Error(`playwright-core is unavailable: ${String(error)}`);
  }

  const executablePath = browserExecutableCandidates().find((candidate) => {
    try {
      return Boolean(candidate) && typeof candidate === "string" && spawnSync(candidate, ["--version"], {
        stdio: "ignore",
        shell: process.platform === "win32",
      }).status === 0;
    } catch {
      return false;
    }
  });

  const launchOptions = {
    headless: !showBrowser,
    args: [
      "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
      "--no-first-run",
      "--disable-default-apps",
      "--disable-extensions",
      "--disable-background-timer-throttling",
    ],
    permissions: ["microphone"],
    viewport: { width: 720, height: 520 },
  };
  if (executablePath) {
    launchOptions.executablePath = executablePath;
  } else if (process.platform === "win32") {
    launchOptions.channel = "msedge";
  } else {
    launchOptions.channel = "chrome";
  }

  let context;
  try {
    context = await chromium.launchPersistentContext(userDataDir, launchOptions);
  } catch (error) {
    const fallbackDir = path.join(
      os.tmpdir(),
      `vora-agora-stt-browser-${process.pid}-${Date.now()}`,
    );
    process.stderr.write(
      `[agora-stt-bridge] stage=browser persistent profile unavailable; using temp profile (${String(
        error,
      ).slice(0, 180)})\n`,
    );
    context = await chromium.launchPersistentContext(fallbackDir, launchOptions);
  }
  const page = context.pages()[0] || (await context.newPage());
  await page.goto(url, { waitUntil: "domcontentloaded" });
  return {
    close: async () => {
      await context.close().catch(() => undefined);
    },
  };
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

async function backendJsonRequest(backendUrl, path, body) {
  const response = await fetch(`${safeBase(backendUrl)}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const bodyText = await response.text();
  let payload = {};
  try {
    payload = JSON.parse(bodyText);
  } catch {
    payload = { error: bodyText };
  }
  if (!response.ok) {
    const detail =
      typeof payload?.error === "string"
        ? payload.error
        : typeof payload?.message === "string"
          ? payload.message
          : bodyText;
    throw new Error(`backend ${path} failed (${response.status}): ${detail || "unknown error"}`);
  }
  return payload;
}

async function resolveBackendAgoraSession(config) {
  if (!config.backendUrl) {
    return config;
  }
  const session = await backendJsonRequest(config.backendUrl, "/api/agora/token", {
    channel: config.channel || undefined,
    uid: config.uid || DEFAULT_RTC_UID,
    sttAudioUid: config.sttAudioUid || config.sttBotUid || DEFAULT_STT_AUDIO_UID,
    sttTextUid: config.sttTextUid || DEFAULT_STT_TEXT_UID,
    sttBotUid: config.sttBotUid || config.sttAudioUid || DEFAULT_STT_BOT_UID,
    lang: config.lang,
    timeoutMs: config.timeoutMs,
  });
  return {
    ...config,
    appId: ensureRequired(optionalText(session.appId), "backend /api/agora/token appId"),
    channel: ensureRequired(optionalText(session.channel), "backend /api/agora/token channel"),
    uid: optionalText(session.uid) || config.uid || DEFAULT_RTC_UID,
    sttAudioUid:
      optionalText(session.sttAudioUid) ||
      optionalText(session.sttBotUid) ||
      config.sttAudioUid ||
      config.sttBotUid ||
      DEFAULT_STT_AUDIO_UID,
    sttTextUid: optionalText(session.sttTextUid) || config.sttTextUid || DEFAULT_STT_TEXT_UID,
    sttBotUid:
      optionalText(session.sttBotUid) ||
      optionalText(session.sttAudioUid) ||
      config.sttBotUid ||
      config.sttAudioUid ||
      DEFAULT_STT_BOT_UID,
    rtcToken: optionalText(session.rtcToken),
    lang: optionalText(session.lang) || config.lang,
    timeoutMs: Number.isFinite(Number(session.timeoutMs)) ? Number(session.timeoutMs) : config.timeoutMs,
  };
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
          const text = words
            .map((word) => String(word?.text || "").trim())
            .filter(Boolean)
            .join(" ")
            .replace(/\\s+([,.!?;:])/g, "$1")
            .trim();
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

          await post("/stage", { stage: "rtc_join", message: "joining Agora RTC" });
          setStatus("Joining RTC channel...");
          client = AgoraRTC.createClient({ mode: "live", codec: "vp8" });
          if (typeof client.setClientRole === "function") {
            await client.setClientRole("host");
          }
          client.on("stream-message", (...args) => {
            const data = args[args.length - 1];
            void handleStreamMessage(data);
          });

          const rtcToken = CONFIG.rtcToken && CONFIG.rtcToken.length > 0 ? CONFIG.rtcToken : null;
          const uidRaw = Number.parseInt(String(CONFIG.uid), 10);
          const uid = Number.isFinite(uidRaw) ? uidRaw : null;
          await client.join(CONFIG.appId, CONFIG.channel, rtcToken, uid);

          await post("/stage", { stage: "mic", message: "requesting microphone" });
          setStatus("Microphone setup...");
          micTrack = await AgoraRTC.createMicrophoneAudioTrack();
          await client.publish([micTrack]);

          await post("/stage", { stage: "stt_join", message: "joining Agora STT" });
          const start = await post("/api/start", { lang: CONFIG.lang });
          if (!start?.agentId) {
            throw new Error("Agora STT start returned no agentId");
          }
          agentId = String(start.agentId);
          await post("/ready", { agentId });
          setStatus("Listening... speak your command now.", "ok");
        } catch (error) {
          await resolveError(String(error));
        }
      }

      window.addEventListener("beforeunload", () => {
        void cleanup();
      });

      void boot();
    </script>
  </body>
</html>`;
}

function parseLanguages(lang) {
  const languages = String(lang || DEFAULT_LANGUAGE)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 2);
  return languages.length > 0 ? languages : [DEFAULT_LANGUAGE.split(",")[0]];
}

async function startAgoraStt(config, lang) {
  if (config.backendUrl) {
    const payload = await backendJsonRequest(config.backendUrl, "/api/agora/stt/start", {
      channel: config.channel,
      uid: config.uid,
      sttAudioUid: config.sttAudioUid,
      sttTextUid: config.sttTextUid,
      sttBotUid: config.sttBotUid,
      lang,
      timeoutMs: config.timeoutMs,
    });
    if (!payload?.agentId) {
      throw new Error("backend /api/agora/stt/start returned no agentId");
    }
    return String(payload.agentId);
  }
  const apiBase = safeBase(config.apiBase);
  const auth = Buffer.from(`${config.customerKey}:${config.customerSecret}`).toString("base64");
  const startPayload = {
    name: `vora-voice-${Date.now()}`,
    languages: parseLanguages(lang),
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
  if (config.backendUrl) {
    await backendJsonRequest(config.backendUrl, "/api/agora/stt/stop", { agentId }).catch(() => undefined);
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
    backendUrl: readText(args["backend-url"], "VORA_BACKEND_URL", DEFAULT_BACKEND_URL),
    appId: readText(args["app-id"], "VORA_AGORA_APP_ID"),
    customerKey: readText(args["customer-key"], "VORA_AGORA_CUSTOMER_KEY"),
    customerSecret: readText(args["customer-secret"], "VORA_AGORA_CUSTOMER_SECRET"),
    channel:
      readText(args.channel, "VORA_AGORA_CHANNEL") ||
      `vora-voice-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 6)}`,
    uid: readText(args.uid, "VORA_AGORA_UID", DEFAULT_RTC_UID),
    sttAudioUid: readText(args["stt-audio-uid"], "VORA_AGORA_STT_AUDIO_UID"),
    sttTextUid: readText(args["stt-text-uid"], "VORA_AGORA_STT_TEXT_UID"),
    sttBotUid: readText(args["stt-bot-uid"], "VORA_AGORA_STT_BOT_UID", DEFAULT_STT_BOT_UID),
    rtcToken: readText(args["rtc-token"], "VORA_AGORA_RTC_TOKEN"),
    apiBase: readText(args["api-base"], "VORA_AGORA_API_BASE", DEFAULT_API_BASE),
    lang: readText(args.lang, "VORA_AGORA_STT_LANG", DEFAULT_LANGUAGE),
    timeoutMs: readPositiveInt(args["timeout-ms"], "VORA_AGORA_STT_TIMEOUT_MS", DEFAULT_TIMEOUT_MS),
    open: args.open !== false,
    browserMode: args.open === false ? "none" : resolveBrowserMode(args),
    showBrowser: readBoolean(args["show-browser"], "VORA_AGORA_STT_SHOW_BROWSER", false),
    browserUserDataDir: readText(
      args["browser-user-data-dir"],
      "VORA_AGORA_STT_BROWSER_USER_DATA_DIR",
      defaultBrowserUserDataDir(),
    ),
    port: readPositiveInt(args.port, "VORA_AGORA_STT_PORT", 0),
  };

  if (!config.backendUrl) {
    config.appId = ensureRequired(config.appId, "VORA_AGORA_APP_ID / --app-id");
    config.customerKey = ensureRequired(config.customerKey, "VORA_AGORA_CUSTOMER_KEY / --customer-key");
    config.customerSecret = ensureRequired(
      config.customerSecret,
      "VORA_AGORA_CUSTOMER_SECRET / --customer-secret",
    );
  }

  const resolvedConfig = await resolveBackendAgoraSession(config);

  const browserConfig = {
    appId: resolvedConfig.appId,
    channel: resolvedConfig.channel,
    uid: resolvedConfig.uid,
    rtcToken: resolvedConfig.rtcToken,
    lang: resolvedConfig.lang,
    timeoutMs: resolvedConfig.timeoutMs,
  };

  let server;
  let done = false;
  let currentAgentId = "";
  let browserController = null;
  let ready = false;
  let startupTimeout;
  let listenTimeout;

  const emitStage = (stage, message = "") => {
    const safeStage = String(stage || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_");
    const detail = String(message || "").trim();
    process.stderr.write(`[agora-stt-bridge] stage=${safeStage}${detail ? ` ${detail}` : ""}\n`);
  };

  const clearTimers = () => {
    if (startupTimeout) {
      clearTimeout(startupTimeout);
      startupTimeout = undefined;
    }
    if (listenTimeout) {
      clearTimeout(listenTimeout);
      listenTimeout = undefined;
    }
  };

  const closeBrowser = async () => {
    if (!browserController) {
      return;
    }
    const controller = browserController;
    browserController = null;
    await controller.close().catch(() => undefined);
  };

  const fail = async (message) => {
    if (done) {
      return;
    }
    done = true;
    clearTimers();
    await stopAgoraStt(resolvedConfig, currentAgentId).catch(() => undefined);
    await closeBrowser();
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
    clearTimers();
    await stopAgoraStt(resolvedConfig, currentAgentId).catch(() => undefined);
    await closeBrowser();
    if (server) {
      await closeServer(server);
    }
    process.stdout.write(`${text.trim()}\n`);
    process.exit(0);
  };

  const armListenTimeout = () => {
    if (listenTimeout) {
      return;
    }
    listenTimeout = setTimeout(() => {
      void fail(`timeout after ${resolvedConfig.timeoutMs}ms`);
    }, resolvedConfig.timeoutMs);
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
        const lang = typeof body?.lang === "string" && body.lang.trim() ? body.lang.trim() : resolvedConfig.lang;
        emitStage("backend_stt", "requesting STT agent");
        currentAgentId = await startAgoraStt(resolvedConfig, lang);
        jsonResponse(res, 200, { ok: true, agentId: currentAgentId });
      } catch (error) {
        jsonResponse(res, 500, { ok: false, error: String(error) });
      }
      return;
    }

    if (req.method === "POST" && pathname === "/stage") {
      try {
        const body = await readJsonBody(req);
        emitStage(body?.stage, body?.message);
        jsonResponse(res, 200, { ok: true });
      } catch (error) {
        jsonResponse(res, 500, { ok: false, error: String(error) });
      }
      return;
    }

    if (req.method === "POST" && pathname === "/ready") {
      try {
        const body = await readJsonBody(req);
        const agentId =
          typeof body?.agentId === "string" && body.agentId.trim().length > 0
            ? body.agentId.trim()
            : currentAgentId;
        if (agentId && agentId !== currentAgentId) {
          currentAgentId = agentId;
        }
        if (!ready) {
          ready = true;
          process.stderr.write("[agora-stt-bridge] ready\n");
          armListenTimeout();
        }
        jsonResponse(res, 200, { ok: true });
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
        await stopAgoraStt(resolvedConfig, agentId);
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
  const source = resolvedConfig.backendUrl ? `backend=${safeBase(resolvedConfig.backendUrl)}` : "direct-agora";
  emitStage("session", `channel=${resolvedConfig.channel} uid=${resolvedConfig.uid} ${source}`);
  emitStage("server", `local capture URL ${localUrl}`);
  emitStage("browser", "starting hidden capture browser");
  startupTimeout = setTimeout(() => {
    void fail("timeout waiting for microphone/STT readiness");
  }, Math.max(18_000, resolvedConfig.timeoutMs + 8_000));
  if (config.browserMode === "managed") {
    try {
      browserController = await openManagedBrowser(
        localUrl,
        config.showBrowser,
        config.browserUserDataDir,
      );
      emitStage(
        "browser",
        `capture browser started${config.showBrowser ? "" : " hidden"} profile=${config.browserUserDataDir}`,
      );
    } catch (error) {
      await fail(
        [
          `managed browser unavailable: ${String(error)}`,
          "Install Google Chrome/Microsoft Edge, or run with --browser-mode external for manual debugging.",
        ].join("\n"),
      );
      return;
    }
  } else if (config.browserMode === "external") {
    openUrl(localUrl);
  } else {
    process.stderr.write("[agora-stt-bridge] browser auto-open disabled; open the local capture URL manually.\n");
  }

  const stop = async () => {
    clearTimers();
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
