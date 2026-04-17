import { randomUUID } from "node:crypto";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import type { Command } from "commander";
import { defaultRuntime } from "../runtime.js";
import { formatDocsLink } from "../terminal/links.js";
import { theme } from "../terminal/theme.js";
import { GatewayChatClient } from "../tui/gateway-chat.js";
import { parseTimeoutMs } from "./parse-timeout.js";

type VoiceSttProvider = "manual" | "agora";
type VoiceTtsProvider = "none" | "hume";

type VoiceRootOptions = {
  url?: string;
  token?: string;
  password?: string;
  session?: string;
  deliver?: boolean;
  thinking?: string;
  timeoutMs?: string;
  waitMs?: string;
  once?: boolean;
  wakeDir?: string;
  wakeModel?: string;
  wakeThreshold?: string;
  python?: string;
  sttProvider?: string;
  sttLang?: string;
  sttTimeoutMs?: string;
  agoraSttCommand?: string;
  backendUrl?: string;
  ttsProvider?: string;
  humeApiKey?: string;
  humeVoiceId?: string;
};

type VoiceDoctorOptions = Omit<VoiceRootOptions, "deliver" | "thinking" | "once"> & {
  json?: boolean;
};

type VoiceRuntimeOptions = {
  gateway: {
    url?: string;
    token?: string;
    password?: string;
    sessionKey: string;
    deliver: boolean;
    thinking?: string;
    timeoutMs?: number;
    waitMs: number;
  };
  wake: {
    dir: string;
    scriptPath: string;
    modelPath: string;
    threshold: number;
    pythonBin: string;
  };
  backendUrl?: string;
  stt: {
    provider: VoiceSttProvider;
    language: string;
    timeoutMs: number;
    agoraCommand?: string;
    usesBundledBridge: boolean;
  };
  tts: {
    provider: VoiceTtsProvider;
    backendUrl?: string;
    humeApiKey?: string;
    humeVoiceId: string;
  };
  once: boolean;
};

type VoiceCheckItem = {
  key: string;
  label: string;
  ok: boolean;
  message: string;
};

type WakeTriggerEvent = {
  model: string;
  score: number;
  sourceTimestampSec: number;
};

type WakeVolumeEvent = {
  volume: number;
};

const DEFAULT_WAKE_MODEL_FILE = "hey_vora.onnx";
const DEFAULT_WAKE_THRESHOLD = 0.5;
const DEFAULT_WAIT_MS = 40_000;
const DEFAULT_STT_TIMEOUT_MS = 25_000;
const DEFAULT_STT_LANGUAGE = "vi-VN";
const DEFAULT_HUME_VOICE_ID = "9e068547-5ba4-4c8e-8e03-69282a008f04";
const DEFAULT_VOICE_BACKEND_URL = "https://vora-ai-backend-uemj.onrender.com";

function resolveBundledAgoraBridgeScriptPath(): string {
  const candidates = [
    path.resolve(import.meta.dirname, "..", "scripts", "agora-stt-bridge.mjs"),
    path.resolve(import.meta.dirname, "..", "..", "scripts", "agora-stt-bridge.mjs"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

function quoteShell(value: string): string {
  return `"${value.replaceAll('"', '\\"')}"`;
}

function buildBundledAgoraBridgeCommand(backendUrl?: string): string | undefined {
  const scriptPath = resolveBundledAgoraBridgeScriptPath();
  if (!existsSync(scriptPath)) {
    return undefined;
  }
  const parts = ["node", quoteShell(scriptPath), "--lang {lang}", "--timeout-ms {timeout_ms}"];
  if (backendUrl) {
    parts.push("--backend-url", quoteShell(backendUrl));
  }
  return parts.join(" ");
}

function trimToUndefined(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolveVoiceBackendUrl(explicitBackendUrl?: string): string | undefined {
  const raw =
    trimToUndefined(explicitBackendUrl) ??
    trimToUndefined(process.env.VORA_BACKEND_URL) ??
    DEFAULT_VOICE_BACKEND_URL;
  const value = raw.trim();
  if (["0", "false", "none", "off", "local", "direct"].includes(value.toLowerCase())) {
    return undefined;
  }
  return value.replace(/\/+$/g, "");
}

function parseThreshold(raw: unknown): number {
  const text = trimToUndefined(raw);
  if (!text) {
    return DEFAULT_WAKE_THRESHOLD;
  }
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_WAKE_THRESHOLD;
  }
  return Math.max(0, Math.min(1, parsed));
}

function parseMs(raw: unknown, fallback: number): number {
  const parsed = parseTimeoutMs(raw);
  return parsed && parsed > 0 ? parsed : fallback;
}

function parseSttProvider(
  raw: string | undefined,
  agoraCommand: string | undefined,
  backendUrl: string | undefined,
): VoiceSttProvider {
  const value = raw?.trim().toLowerCase();
  if (value === "manual" || value === "agora") {
    return value;
  }
  return agoraCommand || backendUrl ? "agora" : "manual";
}

function parseTtsProvider(
  raw: string | undefined,
  humeApiKey: string | undefined,
  backendUrl: string | undefined,
): VoiceTtsProvider {
  const value = raw?.trim().toLowerCase();
  if (value === "none" || value === "hume") {
    return value;
  }
  return humeApiKey || backendUrl ? "hume" : "none";
}

function detectPythonBinary(explicitPython?: string): string | null {
  const candidates = [
    trimToUndefined(explicitPython),
    trimToUndefined(process.env.VORA_PYTHON),
    "python3",
    "python",
  ].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    try {
      const result = spawnSync(candidate, ["--version"], {
        stdio: "ignore",
        shell: process.platform === "win32",
      });
      if (result.status === 0) {
        return candidate;
      }
    } catch {
      // try next
    }
  }
  return null;
}

function detectWakeDir(explicitWakeDir?: string): string {
  const fromEnv = trimToUndefined(process.env.VORA_WAKE_WORD_DIR);
  const fromOpt = trimToUndefined(explicitWakeDir);
  const repoRelativeWake = path.resolve(import.meta.dirname, "..", "..", "..", "wake_word");
  const candidates = [
    fromOpt,
    fromEnv,
    path.resolve(process.cwd(), "wake_word"),
    path.resolve(process.cwd(), "..", "wake_word"),
    repoRelativeWake,
  ].filter((entry): entry is string => Boolean(entry));
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[0] ?? path.resolve(process.cwd(), "wake_word");
}

function resolveVoiceRuntimeOptions(opts: VoiceRootOptions): VoiceRuntimeOptions {
  const wakeDir = detectWakeDir(opts.wakeDir);
  const wakeModelName = trimToUndefined(opts.wakeModel) ?? DEFAULT_WAKE_MODEL_FILE;
  const pythonBin = detectPythonBinary(opts.python) ?? "";
  const backendUrl = resolveVoiceBackendUrl(opts.backendUrl);
  const sttProviderRaw =
    trimToUndefined(opts.sttProvider) ?? trimToUndefined(process.env.VORA_VOICE_STT_PROVIDER);
  const explicitAgoraCommand =
    trimToUndefined(opts.agoraSttCommand) ?? trimToUndefined(process.env.VORA_AGORA_STT_COMMAND);
  const sttProvider = parseSttProvider(sttProviderRaw, explicitAgoraCommand, backendUrl);
  const bundledAgoraCommand =
    sttProvider === "agora" ? buildBundledAgoraBridgeCommand(backendUrl) : undefined;
  const agoraSttCommand = explicitAgoraCommand ?? bundledAgoraCommand;
  const humeApiKey =
    trimToUndefined(opts.humeApiKey) ?? trimToUndefined(process.env.VORA_HUME_API_KEY);
  const ttsProvider = parseTtsProvider(
    trimToUndefined(opts.ttsProvider) ?? trimToUndefined(process.env.VORA_VOICE_TTS_PROVIDER),
    humeApiKey,
    backendUrl,
  );

  return {
    gateway: {
      url: trimToUndefined(opts.url),
      token: trimToUndefined(opts.token),
      password: trimToUndefined(opts.password),
      sessionKey: trimToUndefined(opts.session) ?? "main",
      deliver: Boolean(opts.deliver),
      thinking: trimToUndefined(opts.thinking),
      timeoutMs: parseTimeoutMs(opts.timeoutMs),
      waitMs: parseMs(opts.waitMs, DEFAULT_WAIT_MS),
    },
    backendUrl,
    wake: {
      dir: wakeDir,
      scriptPath: path.join(wakeDir, "main.py"),
      modelPath: path.isAbsolute(wakeModelName) ? wakeModelName : path.join(wakeDir, wakeModelName),
      threshold: parseThreshold(opts.wakeThreshold),
      pythonBin,
    },
    stt: {
      provider: sttProvider,
      language: trimToUndefined(opts.sttLang) ?? DEFAULT_STT_LANGUAGE,
      timeoutMs: parseMs(opts.sttTimeoutMs, DEFAULT_STT_TIMEOUT_MS),
      agoraCommand: agoraSttCommand,
      usesBundledBridge: explicitAgoraCommand === undefined && bundledAgoraCommand !== undefined,
    },
    tts: {
      provider: ttsProvider,
      backendUrl,
      humeApiKey,
      humeVoiceId:
        trimToUndefined(opts.humeVoiceId) ??
        trimToUndefined(process.env.VORA_HUME_VOICE_ID) ??
        DEFAULT_HUME_VOICE_ID,
    },
    once: Boolean(opts.once),
  };
}

function formatCheck(item: VoiceCheckItem): string {
  const icon = item.ok ? "OK" : "FAIL";
  return `${icon} ${item.label}: ${item.message}`;
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    const text = await response.text();
    let payload: unknown = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { message: text };
    }
    if (!response.ok) {
      const detail =
        payload && typeof payload === "object" && "error" in payload
          ? String((payload as { error?: unknown }).error ?? "")
          : text;
      throw new Error(`HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

async function postJsonWithTimeout(url: string, body: unknown, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    let payload: unknown = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { message: text };
    }
    if (!response.ok) {
      const detail =
        payload && typeof payload === "object" && "error" in payload
          ? String((payload as { error?: unknown }).error ?? "")
          : text;
      throw new Error(`HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

function backendProviderStatus(payload: unknown, provider: "agora" | "hume"): boolean | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  const providers = (payload as { voiceProviders?: unknown }).voiceProviders;
  if (!providers || typeof providers !== "object") {
    return undefined;
  }
  const value = (providers as Record<string, unknown>)[provider];
  return typeof value === "boolean" ? value : undefined;
}

async function runVoiceDoctor(opts: VoiceDoctorOptions) {
  const resolved = resolveVoiceRuntimeOptions(opts);
  const checks: VoiceCheckItem[] = [];
  let backendHealth: unknown;
  let backendHealthOk = false;

  checks.push({
    key: "wake_dir",
    label: "wake_word dir",
    ok: existsSync(resolved.wake.dir),
    message: resolved.wake.dir,
  });

  checks.push({
    key: "wake_script",
    label: "wake script",
    ok: await fileExists(resolved.wake.scriptPath),
    message: resolved.wake.scriptPath,
  });
  checks.push({
    key: "wake_model",
    label: "wake model",
    ok: await fileExists(resolved.wake.modelPath),
    message: resolved.wake.modelPath,
  });
  checks.push({
    key: "python",
    label: "python runtime",
    ok: resolved.wake.pythonBin.length > 0,
    message:
      resolved.wake.pythonBin.length > 0
        ? `using ${resolved.wake.pythonBin}`
        : "python3/python not found",
  });

  const gatewayOk = await checkGatewayReachable(resolved);
  checks.push(gatewayOk);

  if (resolved.backendUrl) {
    try {
      backendHealth = await fetchJsonWithTimeout(`${resolved.backendUrl}/health`, 5_000);
      backendHealthOk = true;
      checks.push({
        key: "voice_backend",
        label: "voice backend",
        ok: true,
        message: resolved.backendUrl,
      });
    } catch (error) {
      checks.push({
        key: "voice_backend",
        label: "voice backend",
        ok: false,
        message: `${resolved.backendUrl}: ${String(error)}`,
      });
    }
  }

  if (resolved.stt.provider === "agora") {
    checks.push({
      key: "stt_agora_command",
      label: "agora STT bridge command",
      ok: Boolean(resolved.stt.agoraCommand),
      message: resolved.stt.agoraCommand
        ? resolved.stt.agoraCommand
        : "missing bridge command (--agora-stt-command / VORA_AGORA_STT_COMMAND / bundled bridge)",
    });
    if (resolved.stt.usesBundledBridge) {
      const bundledScriptPath = resolveBundledAgoraBridgeScriptPath();
      checks.push({
        key: "stt_agora_bridge_script",
        label: "bundled Agora bridge script",
        ok: await fileExists(bundledScriptPath),
        message: bundledScriptPath,
      });
      if (resolved.backendUrl) {
        const agoraReady = backendProviderStatus(backendHealth, "agora");
        let tokenEndpointReady = false;
        try {
          await postJsonWithTimeout(
            `${resolved.backendUrl}/api/agora/token`,
            {
              uid: "1002",
              sttBotUid: "9001",
              lang: resolved.stt.language,
              timeoutMs: resolved.stt.timeoutMs,
            },
            5_000,
          );
          checks.push({
            key: "backend_agora",
            label: "backend Agora",
            ok: true,
            message: "token endpoint ready",
          });
          tokenEndpointReady = true;
        } catch (error) {
          checks.push({
            key: "backend_agora",
            label: "backend Agora",
            ok: false,
            message:
              agoraReady === false
                ? "backend is missing Agora env"
                : `token endpoint failed: ${String(error)}`,
          });
        }
        if (tokenEndpointReady) {
          try {
            await postJsonWithTimeout(
              `${resolved.backendUrl}/api/agora/stt/probe`,
              {
                uid: "1002",
                sttBotUid: "9001",
                lang: resolved.stt.language,
                timeoutMs: resolved.stt.timeoutMs,
              },
              8_000,
            );
            checks.push({
              key: "backend_agora_stt",
              label: "backend Agora STT",
              ok: true,
              message: "Real-Time Speech-to-Text 7.x route ready",
            });
          } catch (error) {
            checks.push({
              key: "backend_agora_stt",
              label: "backend Agora STT",
              ok: false,
              message: `Real-Time Speech-to-Text route failed: ${String(error)}`,
            });
          }
        }
      } else {
        checks.push({
          key: "agora_app_id",
          label: "Agora App ID",
          ok: Boolean(trimToUndefined(process.env.VORA_AGORA_APP_ID)),
          message: trimToUndefined(process.env.VORA_AGORA_APP_ID) ? "configured" : "missing",
        });
        checks.push({
          key: "agora_customer_key",
          label: "Agora customer key",
          ok: Boolean(trimToUndefined(process.env.VORA_AGORA_CUSTOMER_KEY)),
          message: trimToUndefined(process.env.VORA_AGORA_CUSTOMER_KEY) ? "configured" : "missing",
        });
        checks.push({
          key: "agora_customer_secret",
          label: "Agora customer secret",
          ok: Boolean(trimToUndefined(process.env.VORA_AGORA_CUSTOMER_SECRET)),
          message: trimToUndefined(process.env.VORA_AGORA_CUSTOMER_SECRET) ? "configured" : "missing",
        });
      }
      checks.push({
        key: "agora_channel",
        label: "Agora channel",
        ok: true,
        message:
          trimToUndefined(process.env.VORA_AGORA_CHANNEL) ??
          "(optional) auto-generated per bridge run",
      });
      checks.push({
        key: "agora_rtc_token",
        label: "Agora RTC token",
        ok: true,
        message:
          trimToUndefined(process.env.VORA_AGORA_RTC_TOKEN) ??
          "(optional) set when your Agora project requires RTC tokens",
      });
    }
  } else {
    checks.push({
      key: "stt_provider",
      label: "STT provider",
      ok: true,
      message: "manual (type transcript in terminal)",
    });
  }

  if (resolved.tts.provider === "hume") {
    if (resolved.tts.backendUrl) {
      const humeReady = backendProviderStatus(backendHealth, "hume");
      checks.push({
        key: "backend_hume",
        label: "backend Hume",
        ok: backendHealthOk && humeReady === true,
        message:
          humeReady === true
            ? "configured on backend"
            : humeReady === false
              ? "backend is missing Hume env"
              : "backend health does not expose Hume status",
      });
    } else {
      checks.push({
        key: "hume_api_key",
        label: "Hume API key",
        ok: Boolean(resolved.tts.humeApiKey),
        message: resolved.tts.humeApiKey ? "configured" : "missing VORA_HUME_API_KEY",
      });
    }
    checks.push({
      key: "hume_voice_id",
      label: "Hume voice id",
      ok: Boolean(resolved.tts.humeVoiceId),
      message: resolved.tts.humeVoiceId,
    });
  } else {
    checks.push({
      key: "tts_provider",
      label: "TTS provider",
      ok: true,
      message: "disabled",
    });
  }

  const overallOk = checks.every((item) => item.ok);
  if (opts.json === true) {
    defaultRuntime.writeJson({
      overallOk,
      checkedAt: new Date().toISOString(),
      checks,
    });
    return;
  }

  defaultRuntime.log(theme.heading("Voice Doctor"));
  for (const item of checks) {
    defaultRuntime.log(formatCheck(item));
  }
  defaultRuntime.log(overallOk ? "Doctor status: READY" : "Doctor status: NEEDS FIX");
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function checkGatewayReachable(resolved: VoiceRuntimeOptions): Promise<VoiceCheckItem> {
  let client: GatewayChatClient;
  try {
    client = await GatewayChatClient.connect({
      url: resolved.gateway.url,
      token: resolved.gateway.token,
      password: resolved.gateway.password,
    });
  } catch (err) {
    return {
      key: "gateway_connect",
      label: "gateway connect",
      ok: false,
      message: String(err),
    };
  }

  try {
    client.start();
    await client.waitForReady();
    const status = await client.getStatus();
    return {
      key: "gateway_connect",
      label: "gateway connect",
      ok: true,
      message:
        status && typeof status === "object" && "status" in status
          ? String((status as { status?: unknown }).status ?? "ok")
          : "ok",
    };
  } catch (err) {
    return {
      key: "gateway_connect",
      label: "gateway connect",
      ok: false,
      message: String(err),
    };
  } finally {
    client.stop();
  }
}

class WakeWordEngine {
  private process: ChildProcess | null = null;
  private readyResolver: (() => void) | null = null;
  private readyRejecter: ((error: Error) => void) | null = null;
  private started = false;
  private ready = false;
  private triggerHandler: ((event: WakeTriggerEvent) => void) | null = null;
  private volumeHandler: ((event: WakeVolumeEvent) => void) | null = null;

  constructor(private readonly options: VoiceRuntimeOptions["wake"]) {}

  onTrigger(handler: (event: WakeTriggerEvent) => void) {
    this.triggerHandler = handler;
  }

  onVolume(handler: (event: WakeVolumeEvent) => void) {
    this.volumeHandler = handler;
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }
    if (!this.options.pythonBin) {
      throw new Error("python runtime not found");
    }
    this.started = true;
    const readyPromise = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("wake engine timeout waiting for READY"));
      }, 15_000);
      this.readyResolver = () => {
        clearTimeout(timer);
        resolve();
      };
      this.readyRejecter = (error) => {
        clearTimeout(timer);
        reject(error);
      };
    });

    const args = [
      this.options.scriptPath,
      "--model",
      this.options.modelPath,
      "--threshold",
      String(this.options.threshold),
    ];
    this.process = spawn(this.options.pythonBin, args, {
      cwd: this.options.dir,
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });

    this.process.on("error", (err) => {
      if (this.readyRejecter) {
        this.readyRejecter(new Error(`wake engine failed to start: ${String(err)}`));
      }
    });

    const stdout = this.process.stdout;
    const stderr = this.process.stderr;
    if (stdout) {
      const rl = readline.createInterface({ input: stdout });
      rl.on("line", (line) => this.handleStdoutLine(line));
    }
    if (stderr) {
      const rl = readline.createInterface({ input: stderr });
      rl.on("line", (line) => {
        const message = line.trim();
        if (message.length > 0) {
          defaultRuntime.error(`[wake] ${message}`);
        }
      });
    }

    this.process.on("close", (code) => {
      if (!this.ready && this.readyRejecter) {
        this.readyRejecter(new Error(`wake engine exited before READY (code=${String(code)})`));
      }
    });

    await readyPromise;
  }

  stop() {
    this.ready = false;
    this.started = false;
    if (!this.process) {
      return;
    }
    if (process.platform === "win32" && this.process.pid) {
      spawn("taskkill", ["/pid", String(this.process.pid), "/f", "/t"], {
        stdio: "ignore",
        shell: true,
      });
    } else {
      this.process.kill("SIGTERM");
    }
    this.process = null;
  }

  private handleStdoutLine(rawLine: string) {
    const line = rawLine.trim();
    if (!line) {
      return;
    }
    if (line.includes("READY")) {
      this.ready = true;
      this.readyResolver?.();
      this.readyResolver = null;
      this.readyRejecter = null;
      return;
    }
    if (line.startsWith("VOLUME:")) {
      const value = Number.parseInt(line.split(":")[1] ?? "0", 10);
      this.volumeHandler?.({
        volume: Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0,
      });
      return;
    }
    if (line.startsWith("TRIGGER:")) {
      const parts = line.split(":");
      const model = String(parts[1] ?? "unknown");
      const score = Number(parts[2] ?? "0");
      const sourceTimestampSec = Number(parts[3] ?? "0");
      this.triggerHandler?.({
        model,
        score: Number.isFinite(score) ? score : 0,
        sourceTimestampSec: Number.isFinite(sourceTimestampSec) ? sourceTimestampSec : 0,
      });
      return;
    }
    if (line.startsWith("ERROR:")) {
      defaultRuntime.error(`[wake] ${line}`);
      return;
    }
    defaultRuntime.log(`[wake] ${line}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function promptLine(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return await new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function resolveShellCommand(command: string): { bin: string; args: string[] } {
  if (process.platform === "win32") {
    return {
      bin: "cmd.exe",
      args: ["/d", "/s", "/c", command],
    };
  }
  return {
    bin: "/bin/sh",
    args: ["-lc", command],
  };
}

async function runShellCommand(command: string, timeoutMs: number): Promise<{
  code: number;
  stdout: string;
  stderr: string;
}> {
  const shell = resolveShellCommand(command);
  const child = spawn(shell.bin, shell.args, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr?.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const done = new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        code: typeof code === "number" ? code : 1,
        stdout,
        stderr,
      });
    });
  });

  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`command timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return await Promise.race([done, timeout]);
}

function applyTemplate(raw: string, replacements: Record<string, string>): string {
  let output = raw;
  for (const [key, value] of Object.entries(replacements)) {
    output = output.replaceAll(`{${key}}`, value);
  }
  return output;
}

function extractTranscriptFromCommandOutput(rawOutput: string): string {
  const trimmed = rawOutput.trim();
  if (trimmed.length === 0) {
    return "";
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") {
      const obj = parsed as { text?: unknown; transcript?: unknown };
      if (typeof obj.text === "string" && obj.text.trim().length > 0) {
        return obj.text.trim();
      }
      if (typeof obj.transcript === "string" && obj.transcript.trim().length > 0) {
        return obj.transcript.trim();
      }
    }
  } catch {
    // plain text output path
  }
  return trimmed;
}

async function transcribeSpeech(resolved: VoiceRuntimeOptions): Promise<string> {
  if (resolved.stt.provider === "manual") {
    return (await promptLine("Say command (type transcript): ")).trim();
  }

  const command = resolved.stt.agoraCommand;
  if (!command) {
    throw new Error(
      "Agora STT provider selected but no bridge command is available. Set --agora-stt-command or VORA_AGORA_STT_COMMAND.",
    );
  }
  const rendered = applyTemplate(command, {
    lang: resolved.stt.language,
    timeout_ms: String(resolved.stt.timeoutMs),
  });
  const result = await runShellCommand(rendered, resolved.stt.timeoutMs);
  if (result.code !== 0) {
    throw new Error(
      `Agora STT bridge failed (exit ${result.code}): ${result.stderr.trim() || "no stderr"}`,
    );
  }
  return extractTranscriptFromCommandOutput(result.stdout);
}

function normalizeHistoryMessages(payload: unknown): unknown[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const messages = (payload as { messages?: unknown }).messages;
  return Array.isArray(messages) ? messages : [];
}

function extractMessageText(message: unknown): string | undefined {
  if (!message || typeof message !== "object") {
    return undefined;
  }
  const row = message as {
    text?: unknown;
    content?: unknown;
    payload?: unknown;
  };
  if (typeof row.text === "string" && row.text.trim().length > 0) {
    return row.text.trim();
  }
  if (typeof row.content === "string" && row.content.trim().length > 0) {
    return row.content.trim();
  }
  if (Array.isArray(row.content)) {
    for (const block of row.content) {
      if (!block || typeof block !== "object") {
        continue;
      }
      const text = (block as { text?: unknown }).text;
      if (typeof text === "string" && text.trim().length > 0) {
        return text.trim();
      }
    }
  }
  if (row.payload && typeof row.payload === "object") {
    const payloadText = (row.payload as { text?: unknown }).text;
    if (typeof payloadText === "string" && payloadText.trim().length > 0) {
      return payloadText.trim();
    }
  }
  return undefined;
}

function extractMessageRole(message: unknown): string {
  if (!message || typeof message !== "object") {
    return "";
  }
  const role = (message as { role?: unknown }).role;
  return typeof role === "string" ? role.toLowerCase() : "";
}

function isAssistantMessage(message: unknown): boolean {
  const role = extractMessageRole(message);
  return role === "assistant" || role === "agent";
}

function latestAssistantText(messages: unknown[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const item = messages[index];
    if (!isAssistantMessage(item)) {
      continue;
    }
    const text = extractMessageText(item);
    if (text && text.length > 0) {
      return text;
    }
  }
  return null;
}

async function waitForAssistantReply(params: {
  client: GatewayChatClient;
  sessionKey: string;
  beforeText: string | null;
  waitMs: number;
}): Promise<string | null> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < params.waitMs) {
    await sleep(1_000);
    const history = await params.client.loadHistory({
      sessionKey: params.sessionKey,
      limit: 100,
    });
    const messages = normalizeHistoryMessages(history);
    const current = latestAssistantText(messages);
    if (current && current !== params.beforeText) {
      return current;
    }
  }
  return null;
}

async function synthesizeHumeAudio(params: {
  text: string;
  apiKey?: string;
  backendUrl?: string;
  voiceId: string;
}): Promise<string> {
  const response = params.backendUrl
    ? await fetch(`${params.backendUrl}/api/tts/hume`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: params.text,
          voiceId: params.voiceId,
        }),
      })
    : await fetch("https://api.hume.ai/v0/tts/file", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Hume-Api-Key": params.apiKey ?? "",
        },
        body: JSON.stringify({
          utterances: [
            {
              text: params.text,
              voice: {
                id: params.voiceId,
              },
              speed: 1.0,
            },
          ],
          format: {
            type: "mp3",
          },
        }),
      });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Hume TTS request failed (${response.status}): ${detail.slice(0, 280) || "empty response"}`,
    );
  }

  const audioBytes = Buffer.from(await response.arrayBuffer());
  const filePath = path.join(
    os.tmpdir(),
    `vora-hume-${Date.now()}-${randomUUID().slice(0, 8)}.mp3`,
  );
  await fs.writeFile(filePath, audioBytes);
  return filePath;
}

function hasBinary(command: string): boolean {
  const checker = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(checker, [command], { stdio: "ignore", shell: process.platform === "win32" });
  return result.status === 0;
}

async function playAudioFile(filePath: string): Promise<boolean> {
  if (process.platform === "darwin" && hasBinary("afplay")) {
    const result = await runShellCommand(`afplay "${filePath.replaceAll('"', '\\"')}"`, 120_000);
    return result.code === 0;
  }
  if (process.platform === "linux" && hasBinary("ffplay")) {
    const result = await runShellCommand(
      `ffplay -nodisp -autoexit -loglevel quiet "${filePath.replaceAll('"', '\\"')}"`,
      120_000,
    );
    return result.code === 0;
  }
  return false;
}

async function speakReply(resolved: VoiceRuntimeOptions, text: string): Promise<void> {
  if (resolved.tts.provider !== "hume") {
    return;
  }
  if (!resolved.tts.backendUrl && !resolved.tts.humeApiKey) {
    defaultRuntime.error("[voice] Hume TTS skipped: missing API key");
    return;
  }
  const audioPath = await synthesizeHumeAudio({
    text,
    apiKey: resolved.tts.humeApiKey,
    backendUrl: resolved.tts.backendUrl,
    voiceId: resolved.tts.humeVoiceId,
  });
  try {
    const played = await playAudioFile(audioPath);
    if (!played) {
      defaultRuntime.log(`[voice] audio generated: ${audioPath}`);
    }
  } finally {
    await fs.rm(audioPath, { force: true }).catch(() => undefined);
  }
}

async function runVoiceLoop(opts: VoiceRootOptions): Promise<void> {
  const resolved = resolveVoiceRuntimeOptions(opts);
  if (!resolved.wake.pythonBin) {
    throw new Error("python runtime missing. Install python3 and re-run `vora voice doctor`.");
  }
  if (!(await fileExists(resolved.wake.scriptPath))) {
    throw new Error(`wake script not found: ${resolved.wake.scriptPath}`);
  }
  if (!(await fileExists(resolved.wake.modelPath))) {
    throw new Error(`wake model not found: ${resolved.wake.modelPath}`);
  }
  if (resolved.stt.provider === "agora" && !resolved.stt.agoraCommand) {
    throw new Error(
      "Agora STT provider needs a bridge command. Use --agora-stt-command or VORA_AGORA_STT_COMMAND.",
    );
  }
  if (resolved.tts.provider === "hume" && !resolved.tts.backendUrl && !resolved.tts.humeApiKey) {
    throw new Error(
      "Hume TTS enabled but no backend/API key is configured. Set --backend-url, --hume-api-key, or VORA_HUME_API_KEY.",
    );
  }

  const gatewayClient = await GatewayChatClient.connect({
    url: resolved.gateway.url,
    token: resolved.gateway.token,
    password: resolved.gateway.password,
  });
  const wakeWord = new WakeWordEngine(resolved.wake);
  let busy = false;
  let turns = 0;
  let stopRequested = false;
  let latestVolumeLogAt = 0;
  let resolveStopLoop: (() => void) | null = null;

  const requestStop = () => {
    if (stopRequested) {
      return;
    }
    stopRequested = true;
    wakeWord.stop();
    resolveStopLoop?.();
  };

  try {
    gatewayClient.start();
    await gatewayClient.waitForReady();

    wakeWord.onVolume((event) => {
      if (Date.now() - latestVolumeLogAt < 3_000) {
        return;
      }
      latestVolumeLogAt = Date.now();
      defaultRuntime.log(`[voice] mic level=${event.volume}%`);
    });

    wakeWord.onTrigger((event) => {
      void (async () => {
        if (busy || stopRequested) {
          return;
        }
        busy = true;
        try {
          defaultRuntime.log(
            `[voice] wake trigger model=${event.model} score=${event.score.toFixed(2)} latency=${(
              Math.max(0, Date.now() / 1000 - event.sourceTimestampSec) * 1000
            ).toFixed(0)}ms`,
          );

          const transcript = (await transcribeSpeech(resolved)).trim();
          if (!transcript) {
            defaultRuntime.log("[voice] transcript empty; waiting for next wake trigger");
            return;
          }
          defaultRuntime.log(`You: ${transcript}`);

          const beforeHistory = await gatewayClient.loadHistory({
            sessionKey: resolved.gateway.sessionKey,
            limit: 100,
          });
          const beforeText = latestAssistantText(normalizeHistoryMessages(beforeHistory));

          const run = await gatewayClient.sendChat({
            sessionKey: resolved.gateway.sessionKey,
            message: transcript,
            thinking: resolved.gateway.thinking,
            deliver: resolved.gateway.deliver,
            timeoutMs: resolved.gateway.timeoutMs,
          });
          defaultRuntime.log(`[voice] run started: ${run.runId}`);

          const reply = await waitForAssistantReply({
            client: gatewayClient,
            sessionKey: resolved.gateway.sessionKey,
            beforeText,
            waitMs: resolved.gateway.waitMs,
          });
          if (!reply) {
            defaultRuntime.error(
              `[voice] no assistant reply received within ${resolved.gateway.waitMs}ms`,
            );
            return;
          }

          defaultRuntime.log(`Vora: ${reply}`);
          await speakReply(resolved, reply);
          turns += 1;
          if (resolved.once && turns >= 1) {
            requestStop();
          }
        } catch (err) {
          defaultRuntime.error(`[voice] turn failed: ${String(err)}`);
        } finally {
          busy = false;
        }
      })();
    });

    await wakeWord.start();
    defaultRuntime.log(theme.heading("Voice Loop"));
    defaultRuntime.log(
      `wake=${resolved.wake.modelPath} threshold=${resolved.wake.threshold} stt=${resolved.stt.provider} tts=${resolved.tts.provider}`,
    );
    defaultRuntime.log(
      "Listening for wake word. Press Ctrl+C to stop. Run `vora voice doctor` if dependencies fail.",
    );

    await new Promise<void>((resolve) => {
      resolveStopLoop = resolve;
      process.once("SIGINT", requestStop);
      process.once("SIGTERM", requestStop);
    });
  } finally {
    process.removeListener("SIGINT", requestStop);
    process.removeListener("SIGTERM", requestStop);
    wakeWord.stop();
    gatewayClient.stop();
  }
}

function addVoiceOptions(cmd: Command) {
  return cmd
    .option("--url <url>", "Gateway WebSocket URL")
    .option("--token <token>", "Gateway token")
    .option("--password <password>", "Gateway password")
    .option("--session <key>", 'Session key (default: "main")')
    .option("--deliver", "Deliver assistant replies to linked channel routes", false)
    .option("--thinking <level>", "Thinking level override")
    .option("--timeout-ms <ms>", "chat.send timeout override (ms)")
    .option("--wait-ms <ms>", "Wait budget for assistant reply after send (ms)")
    .option("--once", "Stop after one successful wake->reply turn", false)
    .option("--wake-dir <path>", "Path to wake_word directory")
    .option("--wake-model <path>", "Wake model path or file name")
    .option("--wake-threshold <0..1>", "Wake word threshold")
    .option("--python <bin>", "Python binary for wake word process")
    .option("--stt-provider <manual|agora>", "STT mode (agora uses external bridge command)")
    .option("--stt-lang <lang>", "STT language hint passed to bridge command")
    .option("--stt-timeout-ms <ms>", "STT timeout (ms)")
    .option(
      "--agora-stt-command <cmd>",
      "External command for Agora STT bridge (supports {lang}, {timeout_ms}); default uses bundled browser bridge",
    )
    .option(
      "--backend-url <url>",
      `Voice backend URL for provider secrets/tokens (default: ${DEFAULT_VOICE_BACKEND_URL}; use "off" for local env mode)`,
    )
    .option("--tts-provider <none|hume>", "Voice reply provider")
    .option("--hume-api-key <key>", "Hume API key")
    .option("--hume-voice-id <id>", "Hume voice ID");
}

export function registerVoiceCli(program: Command) {
  const voice = addVoiceOptions(
    program
      .command("voice")
      .description(
        "Wake-word terminal voice loop (OpenWakeWord trigger + STT bridge + Gateway chat + optional Hume TTS)",
      )
      .addHelpText(
        "after",
        () =>
          `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/voice", "docs.vora.ai/cli/voice")}\n`,
      ),
  );

  voice.action(async (opts: VoiceRootOptions) => {
    try {
      await runVoiceLoop(opts);
    } catch (err) {
      defaultRuntime.error(String(err));
      defaultRuntime.exit(1);
    }
  });

  addVoiceOptions(
    voice
      .command("doctor")
      .description("Check wake word + gateway + STT/TTS runtime readiness")
      .option("--json", "Output machine-readable JSON", false),
  ).action(async (opts: VoiceDoctorOptions) => {
    try {
      await runVoiceDoctor(opts);
    } catch (err) {
      defaultRuntime.error(String(err));
      defaultRuntime.exit(1);
    }
  });
}
