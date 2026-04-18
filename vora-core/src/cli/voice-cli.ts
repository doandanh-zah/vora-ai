import { randomUUID } from "node:crypto";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import type { Command } from "commander";
import {
  DEFAULT_HEARTBEAT_FILENAME,
  resolveDefaultAgentWorkspaceDir,
} from "../agents/workspace.js";
import { defaultRuntime, type RuntimeEnv } from "../runtime.js";
import { formatDocsLink } from "../terminal/links.js";
import { theme } from "../terminal/theme.js";
import { GatewayChatClient } from "../tui/gateway-chat.js";
import { parseTimeoutMs } from "./parse-timeout.js";

type VoiceSttProvider = "manual" | "agora";
type VoiceTtsProvider = "none" | "hume" | "elevenlabs";
type VoiceWakeAckMode = "local" | "agent" | "off";

type VoiceAttachment = {
  type?: string;
  mimeType?: string;
  fileName?: string;
  content?: unknown;
  source?: unknown;
};

type VoiceConversationState = {
  lastUser?: string;
  lastAssistant?: string;
};

type VoiceRootOptions = {
  url?: string;
  token?: string;
  password?: string;
  session?: string;
  deliver?: boolean;
  message?: string;
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
  ttsTimeoutMs?: string;
  humeApiKey?: string;
  humeVoiceId?: string;
  humeSpeed?: string;
  elevenLabsApiKey?: string;
  elevenLabsVoiceId?: string;
  elevenLabsModelId?: string;
  elevenLabsOutputFormat?: string;
  followUp?: boolean;
  followUpMs?: string;
  followUpMaxTurns?: string;
  followUpSttTimeoutMs?: string;
  wakeAck?: string;
  wakeAckWaitMs?: string;
  debug?: boolean;
};

type VoiceDoctorOptions = Omit<VoiceRootOptions, "deliver" | "thinking" | "once"> & {
  json?: boolean;
};

type VoiceSetupOptions = Pick<VoiceRootOptions, "wakeDir" | "python"> & {
  venvDir?: string;
};

type VoiceRuntimeOptions = {
  debug: boolean;
  gateway: {
    url?: string;
    token?: string;
    password?: string;
    sessionKey: string;
    deliver: boolean;
    initialMessage?: string;
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
  wakeAck: {
    mode: VoiceWakeAckMode;
    waitMs: number;
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
    timeoutMs: number;
    humeApiKey?: string;
    humeVoiceId: string;
    humeSpeed: number;
    elevenLabsApiKey?: string;
    elevenLabsVoiceId: string;
    elevenLabsModelId: string;
    elevenLabsOutputFormat: string;
  };
  conversation: {
    followUpEnabled: boolean;
    followUpMs: number;
    followUpMaxTurns: number;
    followUpSttTimeoutMs: number;
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
const DEFAULT_STT_TIMEOUT_MS = 16_000;
const DEFAULT_STT_LANGUAGE = "en-US";
const DEFAULT_HUME_VOICE_ID = "9e068547-5ba4-4c8e-8e03-69282a008f04";
const DEFAULT_HUME_SPEED = 1.2;
const DEFAULT_TTS_TIMEOUT_MS = 8_000;
const DEFAULT_TTS_MAX_CHARS = 900;
const DEFAULT_ELEVENLABS_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";
const DEFAULT_ELEVENLABS_MODEL_ID = "eleven_multilingual_v2";
const DEFAULT_ELEVENLABS_OUTPUT_FORMAT = "mp3_44100_128";
const DEFAULT_VOICE_BACKEND_URL = "https://vora-ai-backend-uemj.onrender.com";
const DEFAULT_FOLLOW_UP_MS = 45_000;
const DEFAULT_FOLLOW_UP_MAX_TURNS = 4;
const DEFAULT_FOLLOW_UP_STT_TIMEOUT_MS = 10_000;
const DEFAULT_BACKEND_PROBE_TIMEOUT_MS = 60_000;
const DEFAULT_BACKEND_STT_PROBE_TIMEOUT_MS = 60_000;
const DEFAULT_STT_BRIDGE_COMMAND_GRACE_MS = 8_000;
const DEFAULT_WAKE_ACK_WAIT_MS = 2_500;
const DEFAULT_WAKE_ACK_MODE: VoiceWakeAckMode = "local";
const DEFAULT_VOICE_THINKING = "off";
const WAKE_PYTHON_MODULES = ["openwakeword", "pyaudio", "numpy"] as const;
const WAKE_PYTHON_DEPENDENCY_CHECK_TIMEOUT_MS = 60_000;

function boolFromEnv(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

function isVoiceDebug(opts?: { debug?: boolean }): boolean {
  return Boolean(opts?.debug) || boolFromEnv(process.env.VORA_VOICE_DEBUG);
}

function formatMs(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)}s`;
}

function voiceDebugLog(message: string, opts?: { debug?: boolean }): void {
  if (isVoiceDebug(opts)) {
    defaultRuntime.log(theme.muted(message));
  }
}

function voiceInfo(message: string): void {
  defaultRuntime.log(`${theme.accent("›")} ${message}`);
}

function voiceSuccess(message: string): void {
  defaultRuntime.log(`${theme.success("✓")} ${message}`);
}

function voiceWarn(message: string): void {
  defaultRuntime.log(`${theme.warn("!")} ${message}`);
}

function voiceBox(title: string, lines: string[]): void {
  const width = Math.max(title.length + 4, ...lines.map((line) => line.length + 4), 52);
  const top = `┌─ ${title} ${"─".repeat(Math.max(0, width - title.length - 4))}`;
  const bottom = `└${"─".repeat(width - 1)}`;
  defaultRuntime.log(theme.accent(top));
  for (const line of lines) {
    defaultRuntime.log(`${theme.accent("│")} ${line}`);
  }
  defaultRuntime.log(theme.accent(bottom));
}

function wrapVoiceText(text: string, width = 86): string[] {
  const output: string[] = [];
  for (const rawLine of text.replace(/\r/g, "").split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      output.push("");
      continue;
    }
    let current = "";
    for (const word of line.split(/\s+/g)) {
      if (!current) {
        current = word;
        continue;
      }
      if (`${current} ${word}`.length > width) {
        output.push(current);
        current = word;
        continue;
      }
      current = `${current} ${word}`;
    }
    if (current) {
      output.push(current);
    }
  }
  return output.length > 0 ? output : [""];
}

function voiceMessageBox(label: string, text: string): void {
  voiceBox(label, wrapVoiceText(text));
}

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
  const parts = [
    "node",
    quoteShell(scriptPath),
    "--lang {lang}",
    "--timeout-ms {timeout_ms}",
    "--browser-mode managed",
  ];
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

function resolveVoiceVenvDir(explicitVenvDir?: string): string {
  return (
    trimToUndefined(explicitVenvDir) ??
    trimToUndefined(process.env.VORA_VOICE_PYTHON_VENV) ??
    path.join(os.homedir(), ".vora", "voice-python")
  );
}

function resolveVenvPythonCandidates(venvDir = resolveVoiceVenvDir()): string[] {
  if (process.platform === "win32") {
    return [path.join(venvDir, "Scripts", "python.exe")];
  }
  return [
    path.join(venvDir, "bin", "python"),
    path.join(venvDir, "bin", "python3"),
    path.join(venvDir, "bin", "python3.11"),
  ];
}

function resolveVenvPythonBin(venvDir = resolveVoiceVenvDir()): string {
  const candidates = resolveVenvPythonCandidates(venvDir);
  return (
    candidates.find((candidate) => commandSucceeds(candidate, ["--version"])) ?? candidates[0]!
  );
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

function parseBoundedNumber(raw: unknown, fallback: number, min: number, max: number): number {
  const text = trimToUndefined(raw);
  if (!text) {
    return fallback;
  }
  const parsed = Number.parseFloat(text);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function parseBoundedInt(raw: unknown, fallback: number, min: number, max: number): number {
  const text = trimToUndefined(raw);
  if (!text) {
    return fallback;
  }
  const parsed = Number.parseInt(text, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
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

function parseTtsProvider(params: {
  raw: string | undefined;
  humeApiKey: string | undefined;
  elevenLabsApiKey: string | undefined;
  backendUrl: string | undefined;
}): VoiceTtsProvider {
  const value = params.raw?.trim().toLowerCase();
  if (value === "none" || value === "hume" || value === "elevenlabs") {
    return value;
  }
  if (params.humeApiKey || params.backendUrl) {
    return "hume";
  }
  return params.elevenLabsApiKey ? "elevenlabs" : "none";
}

function parseWakeAckMode(raw: string | undefined): VoiceWakeAckMode {
  const value = raw?.trim().toLowerCase();
  if (value === "agent" || value === "local" || value === "off") {
    return value;
  }
  return DEFAULT_WAKE_ACK_MODE;
}

function detectPythonBinary(explicitPython?: string): string | null {
  const venvPython = resolveVenvPythonBin();
  const candidates = [
    trimToUndefined(explicitPython),
    trimToUndefined(process.env.VORA_PYTHON),
    existsSync(venvPython) ? venvPython : undefined,
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

function checkWakePythonDependencies(pythonBin: string): {
  ok: boolean;
  missing: string[];
  message: string;
} {
  if (!pythonBin) {
    return {
      ok: false,
      missing: [...WAKE_PYTHON_MODULES],
      message: "python3/python not found",
    };
  }
  const script = [
    "import importlib, json, pathlib, sys",
    "missing=[]",
    `mods=${JSON.stringify(WAKE_PYTHON_MODULES)}`,
    "for m in mods:",
    "    try:",
    "        importlib.import_module(m)",
    "    except Exception as e:",
    "        missing.append(f'{m} ({type(e).__name__}: {e})')",
    "try:",
    "    import openwakeword",
    "    resource_dir = pathlib.Path(openwakeword.__file__).parent / 'resources' / 'models'",
    "    for name in ('melspectrogram.onnx', 'embedding_model.onnx'):",
    "        if not (resource_dir / name).exists():",
    "            missing.append(f'openwakeword resource {name}')",
    "except Exception as e:",
    "    missing.append(f'openwakeword resources ({type(e).__name__}: {e})')",
    "print(json.dumps(missing))",
    "sys.exit(1 if missing else 0)",
  ].join("\n");
  try {
    const result = spawnSync(pythonBin, ["-c", script], {
      encoding: "utf8",
      timeout: WAKE_PYTHON_DEPENDENCY_CHECK_TIMEOUT_MS,
      shell: process.platform === "win32",
    });
    const raw = String(result.stdout ?? "").trim();
    let missing: string[] = [];
    try {
      const parsed = raw ? JSON.parse(raw) : [];
      missing = Array.isArray(parsed) ? parsed.map((entry) => String(entry)) : [];
    } catch {
      missing = result.status === 0 ? [] : [...WAKE_PYTHON_MODULES];
    }
    if (result.status === 0 && missing.length === 0) {
      return { ok: true, missing: [], message: "installed" };
    }
    const stderr = String(result.stderr ?? "").trim();
    const spawnError = result.error as (Error & { code?: string }) | undefined;
    const timedOut = spawnError?.code === "ETIMEDOUT" || result.signal === "SIGTERM";
    return {
      ok: false,
      missing: missing.length > 0 ? missing : [...WAKE_PYTHON_MODULES],
      message:
        missing.length > 0
          ? `missing ${missing.join(", ")}`
          : timedOut
            ? `dependency probe timed out after ${String(WAKE_PYTHON_DEPENDENCY_CHECK_TIMEOUT_MS)}ms`
            : stderr || `dependency probe failed with exit ${String(result.status)}`,
    };
  } catch (error) {
    return {
      ok: false,
      missing: [...WAKE_PYTHON_MODULES],
      message: String(error),
    };
  }
}

function formatWakePythonDependencyError(pythonBin: string, message: string): string {
  return [
    `wake word Python dependencies are not ready for ${pythonBin}: ${message}`,
    "Run: vora voice setup",
    "Then re-check: vora voice doctor --json",
  ].join("\n");
}

function onlyMissingOpenWakeWordResources(missing: string[]): boolean {
  return missing.length > 0 && missing.every((entry) => entry.startsWith("openwakeword resource "));
}

function detectWakeDir(explicitWakeDir?: string): string {
  const fromEnv = trimToUndefined(process.env.VORA_WAKE_WORD_DIR);
  const fromOpt = trimToUndefined(explicitWakeDir);
  const packagedWake = path.resolve(import.meta.dirname, "..", "assets", "wake_word");
  const sourceBundledWake = path.resolve(import.meta.dirname, "..", "..", "assets", "wake_word");
  const repoRelativeWake = path.resolve(import.meta.dirname, "..", "..", "..", "wake_word");
  const candidates = [
    fromOpt,
    fromEnv,
    packagedWake,
    sourceBundledWake,
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
    trimToUndefined(opts.humeApiKey) ??
    trimToUndefined(process.env.VORA_HUME_API_KEY) ??
    trimToUndefined(process.env.HUME_API_KEY);
  const elevenLabsApiKey =
    trimToUndefined(opts.elevenLabsApiKey) ??
    trimToUndefined(process.env.VORA_ELEVENLABS_API_KEY) ??
    trimToUndefined(process.env.ELEVENLABS_API_KEY);
  const ttsProvider = parseTtsProvider({
    raw: trimToUndefined(opts.ttsProvider) ?? trimToUndefined(process.env.VORA_VOICE_TTS_PROVIDER),
    humeApiKey,
    elevenLabsApiKey,
    backendUrl,
  });

  return {
    debug: isVoiceDebug(opts),
    gateway: {
      url: trimToUndefined(opts.url),
      token: trimToUndefined(opts.token),
      password: trimToUndefined(opts.password),
      sessionKey: trimToUndefined(opts.session) ?? "main",
      deliver: Boolean(opts.deliver),
      initialMessage: trimToUndefined(opts.message),
      thinking:
        trimToUndefined(opts.thinking) ??
        trimToUndefined(process.env.VORA_VOICE_THINKING) ??
        DEFAULT_VOICE_THINKING,
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
    wakeAck: {
      mode: parseWakeAckMode(
        trimToUndefined(opts.wakeAck) ?? trimToUndefined(process.env.VORA_VOICE_WAKE_ACK),
      ),
      waitMs: parseMs(opts.wakeAckWaitMs, DEFAULT_WAKE_ACK_WAIT_MS),
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
      timeoutMs: parseMs(opts.ttsTimeoutMs, DEFAULT_TTS_TIMEOUT_MS),
      humeApiKey,
      humeVoiceId:
        trimToUndefined(opts.humeVoiceId) ??
        trimToUndefined(process.env.VORA_HUME_VOICE_ID) ??
        trimToUndefined(process.env.HUME_VOICE_ID) ??
        DEFAULT_HUME_VOICE_ID,
      humeSpeed: parseBoundedNumber(
        trimToUndefined(opts.humeSpeed) ??
          trimToUndefined(process.env.VORA_HUME_SPEED) ??
          trimToUndefined(process.env.HUME_SPEED),
        DEFAULT_HUME_SPEED,
        0.5,
        2,
      ),
      elevenLabsApiKey,
      elevenLabsVoiceId:
        trimToUndefined(opts.elevenLabsVoiceId) ??
        trimToUndefined(process.env.VORA_ELEVENLABS_VOICE_ID) ??
        trimToUndefined(process.env.ELEVENLABS_VOICE_ID) ??
        DEFAULT_ELEVENLABS_VOICE_ID,
      elevenLabsModelId:
        trimToUndefined(opts.elevenLabsModelId) ??
        trimToUndefined(process.env.VORA_ELEVENLABS_MODEL_ID) ??
        trimToUndefined(process.env.ELEVENLABS_MODEL_ID) ??
        DEFAULT_ELEVENLABS_MODEL_ID,
      elevenLabsOutputFormat:
        trimToUndefined(opts.elevenLabsOutputFormat) ??
        trimToUndefined(process.env.VORA_ELEVENLABS_OUTPUT_FORMAT) ??
        trimToUndefined(process.env.ELEVENLABS_OUTPUT_FORMAT) ??
        DEFAULT_ELEVENLABS_OUTPUT_FORMAT,
    },
    conversation: {
      followUpEnabled: opts.followUp !== false,
      followUpMs: parseMs(opts.followUpMs, DEFAULT_FOLLOW_UP_MS),
      followUpMaxTurns: parseBoundedInt(opts.followUpMaxTurns, DEFAULT_FOLLOW_UP_MAX_TURNS, 0, 25),
      followUpSttTimeoutMs: parseMs(opts.followUpSttTimeoutMs, DEFAULT_FOLLOW_UP_STT_TIMEOUT_MS),
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

async function postJsonWithTimeout(
  url: string,
  body: unknown,
  timeoutMs: number,
): Promise<unknown> {
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

function backendProviderStatus(
  payload: unknown,
  provider: "agora" | "hume" | "elevenlabs",
): boolean | undefined {
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
  const wakeDeps = checkWakePythonDependencies(resolved.wake.pythonBin);
  checks.push({
    key: "wake_python_deps",
    label: "wake Python deps",
    ok: wakeDeps.ok,
    message: wakeDeps.ok ? wakeDeps.message : `${wakeDeps.message}; run: vora voice setup`,
  });

  const gatewayOk = await checkGatewayReachable(resolved);
  checks.push(gatewayOk);

  if (resolved.backendUrl) {
    try {
      backendHealth = await fetchJsonWithTimeout(
        `${resolved.backendUrl}/health`,
        DEFAULT_BACKEND_PROBE_TIMEOUT_MS,
      );
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
            DEFAULT_BACKEND_PROBE_TIMEOUT_MS,
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
              DEFAULT_BACKEND_STT_PROBE_TIMEOUT_MS,
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
          message: trimToUndefined(process.env.VORA_AGORA_CUSTOMER_SECRET)
            ? "configured"
            : "missing",
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
      let humeReady = backendProviderStatus(backendHealth, "hume");
      if (humeReady === undefined) {
        try {
          const humeStatus = await fetchJsonWithTimeout(
            `${resolved.tts.backendUrl}/api/tts/hume`,
            DEFAULT_BACKEND_PROBE_TIMEOUT_MS,
          );
          const configured =
            humeStatus &&
            typeof humeStatus === "object" &&
            (humeStatus as { configured?: unknown; ok?: unknown }).configured === true;
          humeReady = configured || (humeStatus as { ok?: unknown })?.ok === true;
        } catch {
          humeReady = undefined;
        }
      }
      checks.push({
        key: "backend_hume",
        label: "backend Hume",
        ok: backendHealthOk && humeReady === true,
        message:
          humeReady === true
            ? `configured on backend (speed=${resolved.tts.humeSpeed})`
            : humeReady === false
              ? "backend is missing Hume env"
              : "backend health does not expose Hume status",
      });
    } else {
      checks.push({
        key: "hume_api_key",
        label: "Hume API key",
        ok: Boolean(resolved.tts.humeApiKey),
        message: resolved.tts.humeApiKey ? "configured" : "missing VORA_HUME_API_KEY/HUME_API_KEY",
      });
    }
    checks.push({
      key: "hume_voice_id",
      label: "Hume voice id",
      ok: Boolean(resolved.tts.humeVoiceId),
      message: resolved.tts.humeVoiceId,
    });
    checks.push({
      key: "hume_speed",
      label: "Hume speed",
      ok: resolved.tts.humeSpeed >= 0.5 && resolved.tts.humeSpeed <= 2,
      message: String(resolved.tts.humeSpeed),
    });
  } else if (resolved.tts.provider === "elevenlabs") {
    if (resolved.tts.backendUrl) {
      const elevenLabsReady = backendProviderStatus(backendHealth, "elevenlabs");
      checks.push({
        key: "backend_elevenlabs",
        label: "backend ElevenLabs",
        ok: backendHealthOk && elevenLabsReady === true,
        message:
          elevenLabsReady === true
            ? "configured on backend"
            : elevenLabsReady === false
              ? "backend is missing ElevenLabs env"
              : "backend health does not expose ElevenLabs status",
      });
    } else {
      checks.push({
        key: "elevenlabs_api_key",
        label: "ElevenLabs API key",
        ok: Boolean(resolved.tts.elevenLabsApiKey),
        message: resolved.tts.elevenLabsApiKey
          ? "configured"
          : "missing VORA_ELEVENLABS_API_KEY/ELEVENLABS_API_KEY",
      });
    }
    checks.push({
      key: "elevenlabs_voice_id",
      label: "ElevenLabs voice id",
      ok: Boolean(resolved.tts.elevenLabsVoiceId),
      message: resolved.tts.elevenLabsVoiceId,
    });
    checks.push({
      key: "elevenlabs_model_id",
      label: "ElevenLabs model id",
      ok: Boolean(resolved.tts.elevenLabsModelId),
      message: resolved.tts.elevenLabsModelId,
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

async function runShellCommand(
  command: string,
  timeoutMs: number,
  opts?: {
    onStderrLine?: (line: string) => void;
  },
): Promise<{
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
  let stderrLineBuffer = "";
  child.stdout?.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr?.on("data", (chunk) => {
    const text = chunk.toString();
    stderr += text;
    if (opts?.onStderrLine) {
      stderrLineBuffer += text;
      const lines = stderrLineBuffer.split(/\r?\n/g);
      stderrLineBuffer = lines.pop() ?? "";
      for (const line of lines) {
        opts.onStderrLine(line);
      }
    }
  });

  const done = new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      if (opts?.onStderrLine && stderrLineBuffer.trim().length > 0) {
        opts.onStderrLine(stderrLineBuffer);
      }
      resolve({
        code: typeof code === "number" ? code : 1,
        stdout,
        stderr,
      });
    });
  });

  let timeoutHandle: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`command timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([done, timeout]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

async function runStreamingCommand(bin: string, args: string[], cwd?: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${bin} ${args.join(" ")} failed with exit ${String(code)}`));
    });
  });
}

async function ensureOpenWakeWordResources(pythonBin: string): Promise<void> {
  const script = [
    "from openwakeword.utils import download_models",
    "# Custom VORA wake-word models still need openWakeWord feature models.",
    "download_models(model_names=['vora_custom_model'])",
  ].join("\n");
  defaultRuntime.log("Preparing openWakeWord runtime models.");
  await runStreamingCommand(pythonBin, ["-c", script]);
}

function commandSucceeds(bin: string, args: string[]): boolean {
  try {
    return (
      spawnSync(bin, args, {
        stdio: "ignore",
        shell: process.platform === "win32",
      }).status === 0
    );
  } catch {
    return false;
  }
}

function firstWorkingPython(candidates: string[]): string | undefined {
  for (const candidate of candidates) {
    if (commandSucceeds(candidate, ["--version"])) {
      return candidate;
    }
  }
  return undefined;
}

function brewFormulaPython(formula: string, executable: string): string | undefined {
  if (!brewFormulaInstalled(formula)) {
    return undefined;
  }
  const result = spawnSync("brew", ["--prefix", formula], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    return undefined;
  }
  const prefix = String(result.stdout ?? "").trim();
  return prefix ? path.join(prefix, "bin", executable) : undefined;
}

function brewFormulaInstalled(formula: string): boolean {
  const result = spawnSync("brew", ["list", "--versions", formula], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  return result.status === 0 && String(result.stdout ?? "").trim().length > 0;
}

async function ensureMacVoiceBuildDependencies(
  runtime: RuntimeEnv = defaultRuntime,
): Promise<void> {
  if (process.platform !== "darwin" || !commandSucceeds("brew", ["--version"])) {
    return;
  }
  if (!brewFormulaInstalled("portaudio")) {
    runtime.log("Installing macOS audio build dependency: brew install portaudio");
    await runStreamingCommand("brew", ["install", "portaudio"]);
  }
  if (!brewFormulaInstalled("python@3.11")) {
    runtime.log("Installing compatible wake-word Python: brew install python@3.11");
    await runStreamingCommand("brew", ["install", "python@3.11"]);
  }
}

function resolveVoiceSetupPython(explicitPython?: string): string | undefined {
  const explicit = trimToUndefined(explicitPython) ?? trimToUndefined(process.env.VORA_PYTHON);
  if (explicit) {
    return explicit;
  }
  const macPython311 = brewFormulaPython("python@3.11", "python3.11");
  const candidates = [
    macPython311,
    "/opt/homebrew/opt/python@3.11/bin/python3.11",
    "/usr/local/opt/python@3.11/bin/python3.11",
    "/opt/homebrew/bin/python3",
    "/usr/local/bin/python3",
    "python3",
    "python",
  ].filter((entry): entry is string => Boolean(entry));
  return firstWorkingPython(candidates);
}

export async function runVoiceSetup(
  opts: VoiceSetupOptions,
  runtime: RuntimeEnv = defaultRuntime,
): Promise<void> {
  const wakeDir = detectWakeDir(opts.wakeDir);
  const requirementsPath = path.join(wakeDir, "requirements.txt");
  if (!(await fileExists(requirementsPath))) {
    throw new Error(`wake requirements not found: ${requirementsPath}`);
  }

  if (!trimToUndefined(opts.python) && !trimToUndefined(process.env.VORA_PYTHON)) {
    await ensureMacVoiceBuildDependencies(runtime);
  }
  const basePython = resolveVoiceSetupPython(opts.python);
  if (!basePython) {
    throw new Error("python runtime missing. Install python3, then run `vora voice setup` again.");
  }

  const venvDir = resolveVoiceVenvDir(opts.venvDir);
  await fs.mkdir(path.dirname(venvDir), { recursive: true });
  let venvPython = resolveVenvPythonBin(venvDir);
  const venvExists = existsSync(venvDir);
  const venvPythonWorks = commandSucceeds(venvPython, ["--version"]);
  const existingDeps = venvPythonWorks ? checkWakePythonDependencies(venvPython) : undefined;
  if (
    venvExists &&
    (!venvPythonWorks ||
      (existingDeps && !existingDeps.ok && !onlyMissingOpenWakeWordResources(existingDeps.missing)))
  ) {
    runtime.log(`Recreating incomplete voice Python venv: ${venvDir}`);
    await fs.rm(venvDir, { recursive: true, force: true });
  }
  venvPython = resolveVenvPythonBin(venvDir);
  if (!commandSucceeds(venvPython, ["--version"])) {
    runtime.log(`Creating voice Python venv: ${venvDir}`);
    await runStreamingCommand(basePython, ["-m", "venv", venvDir]);
  }
  venvPython = resolveVenvPythonBin(venvDir);
  if (!commandSucceeds(venvPython, ["--version"])) {
    throw new Error(`voice Python venv is unusable: ${venvDir}`);
  }

  runtime.log(`Installing wake word dependencies into: ${venvDir}`);
  await runStreamingCommand(venvPython, ["-m", "pip", "install", "--upgrade", "pip"], wakeDir);
  await runStreamingCommand(venvPython, ["-m", "pip", "install", "-r", requirementsPath], wakeDir);
  await ensureOpenWakeWordResources(venvPython);

  const deps = checkWakePythonDependencies(venvPython);
  if (!deps.ok) {
    throw new Error(formatWakePythonDependencyError(venvPython, deps.message));
  }
  runtime.log("Voice Python runtime ready.");
  runtime.log(`Using: ${venvPython}`);
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

async function transcribeSpeech(
  resolved: VoiceRuntimeOptions,
  opts?: { timeoutMs?: number; prompt?: string; phase?: string },
): Promise<string> {
  if (resolved.stt.provider === "manual") {
    return (await promptLine(opts?.prompt ?? "Say command (type transcript): ")).trim();
  }

  const command = resolved.stt.agoraCommand;
  if (!command) {
    throw new Error(
      "Agora STT provider selected but no bridge command is available. Set --agora-stt-command or VORA_AGORA_STT_COMMAND.",
    );
  }
  const timeoutMs = opts?.timeoutMs ?? resolved.stt.timeoutMs;
  const rendered = applyTemplate(command, {
    lang: resolved.stt.language,
    timeout_ms: String(timeoutMs),
  });
  const phase = opts?.phase ?? "voice";
  const startedAt = Date.now();
  voiceInfo(
    `STT ${phase}: starting Agora bridge (${resolved.stt.language}, timeout ${formatMs(
      timeoutMs,
    )}). Wait for "Listening now" before speaking.`,
  );
  let readyLogged = false;
  const result = await runShellCommand(rendered, timeoutMs + DEFAULT_STT_BRIDGE_COMMAND_GRACE_MS, {
    onStderrLine: (line) => {
      const message = line.trim();
      if (!message) {
        return;
      }
      if (message === "[agora-stt-bridge] ready") {
        readyLogged = true;
        if (boolFromEnv(process.env.VORA_VOICE_BEEP)) {
          process.stdout.write("\x07");
        }
        voiceSuccess(`Listening now (${resolved.stt.language}). Speak now.`);
        return;
      }
      const stage = message.match(/^\[agora-stt-bridge\] stage=([a-z0-9_-]+)(?:\s+(.*))?$/i);
      if (stage) {
        const label = stage[1]?.replaceAll("_", " ") ?? "bridge";
        const detail = stage[2]?.trim();
        voiceInfo(`STT ${label}${detail ? `: ${detail}` : ""}`);
        return;
      }
      if (
        message.includes("fatal:") ||
        message.includes("managed browser unavailable") ||
        message.includes("browser auto-open disabled") ||
        message.includes("timeout waiting")
      ) {
        defaultRuntime.error(message);
      }
    },
  });
  if (result.code !== 0) {
    throw new Error(
      `Agora STT bridge failed (exit ${result.code}): ${result.stderr.trim() || "no stderr"}`,
    );
  }
  if (!readyLogged) {
    voiceWarn("STT bridge completed without an explicit ready signal");
  }
  const transcript = extractTranscriptFromCommandOutput(result.stdout);
  voiceDebugLog(`[voice] STT ${phase} completed in ${formatMs(Date.now() - startedAt)}`);
  return transcript;
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

function countAssistantMessages(messages: unknown[]): number {
  return messages.filter(isAssistantMessage).length;
}

async function waitForAssistantReply(params: {
  client: GatewayChatClient;
  sessionKey: string;
  beforeText: string | null;
  beforeAssistantCount: number;
  waitMs: number;
}): Promise<string | null> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < params.waitMs) {
    await sleep(350);
    const history = await params.client.loadHistory({
      sessionKey: params.sessionKey,
      limit: 100,
    });
    const messages = normalizeHistoryMessages(history);
    const current = latestAssistantText(messages);
    if (
      current &&
      (current !== params.beforeText ||
        countAssistantMessages(messages) > params.beforeAssistantCount)
    ) {
      return current;
    }
  }
  return null;
}

async function fetchResponseWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function prepareTtsText(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= DEFAULT_TTS_MAX_CHARS) {
    return normalized;
  }
  return `${normalized.slice(0, DEFAULT_TTS_MAX_CHARS).trim()} ...`;
}

async function synthesizeHumeAudio(params: {
  text: string;
  apiKey?: string;
  backendUrl?: string;
  voiceId: string;
  speed: number;
  timeoutMs: number;
}): Promise<string> {
  const attempts: Array<{
    label: string;
    run: () => Promise<Response>;
  }> = [];

  if (params.backendUrl) {
    attempts.push({
      label: "backend",
      run: () =>
        fetchResponseWithTimeout(
          `${params.backendUrl}/api/tts/hume`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              text: params.text,
              voiceId: params.voiceId,
              speed: params.speed,
            }),
          },
          params.timeoutMs,
        ),
    });
  }
  if (params.apiKey) {
    attempts.push({
      label: "direct",
      run: () =>
        fetchResponseWithTimeout(
          "https://api.hume.ai/v0/tts/file",
          {
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
                  speed: params.speed,
                },
              ],
              format: {
                type: "mp3",
              },
              num_generations: 1,
            }),
          },
          params.timeoutMs,
        ),
    });
  }

  let lastError: Error | undefined;
  for (const attempt of attempts) {
    const response = await attempt.run();
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      lastError = new Error(
        `Hume TTS ${attempt.label} request failed (${response.status}): ${
          detail.slice(0, 280) || "empty response"
        }`,
      );
      continue;
    }

    const audioBytes = Buffer.from(await response.arrayBuffer());
    const filePath = path.join(
      os.tmpdir(),
      `vora-hume-${Date.now()}-${randomUUID().slice(0, 8)}.mp3`,
    );
    await fs.writeFile(filePath, audioBytes);
    return filePath;
  }

  throw lastError ?? new Error("Hume TTS unavailable: missing backend URL or API key");
}

async function synthesizeElevenLabsAudio(params: {
  text: string;
  apiKey?: string;
  backendUrl?: string;
  voiceId: string;
  modelId: string;
  outputFormat: string;
  timeoutMs: number;
}): Promise<string> {
  const attempts: Array<{
    label: string;
    run: () => Promise<Response>;
  }> = [];

  if (params.backendUrl) {
    attempts.push({
      label: "backend",
      run: () =>
        fetchResponseWithTimeout(
          `${params.backendUrl}/api/tts/elevenlabs`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              text: params.text,
              voiceId: params.voiceId,
              modelId: params.modelId,
              outputFormat: params.outputFormat,
            }),
          },
          params.timeoutMs,
        ),
    });
  }
  if (params.apiKey) {
    attempts.push({
      label: "direct",
      run: () =>
        fetchResponseWithTimeout(
          `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(
            params.voiceId,
          )}?output_format=${encodeURIComponent(params.outputFormat)}`,
          {
            method: "POST",
            headers: {
              Accept: "audio/mpeg",
              "Content-Type": "application/json",
              "xi-api-key": params.apiKey ?? "",
            },
            body: JSON.stringify({
              text: params.text,
              model_id: params.modelId,
            }),
          },
          params.timeoutMs,
        ),
    });
  }

  let lastError: Error | undefined;
  for (const attempt of attempts) {
    const response = await attempt.run();
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      lastError = new Error(
        `ElevenLabs TTS ${attempt.label} request failed (${response.status}): ${
          detail.slice(0, 280) || "empty response"
        }`,
      );
      continue;
    }

    const audioBytes = Buffer.from(await response.arrayBuffer());
    const filePath = path.join(
      os.tmpdir(),
      `vora-elevenlabs-${Date.now()}-${randomUUID().slice(0, 8)}.mp3`,
    );
    await fs.writeFile(filePath, audioBytes);
    return filePath;
  }

  throw lastError ?? new Error("ElevenLabs TTS unavailable: missing backend URL or API key");
}

function hasBinary(command: string): boolean {
  const checker = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(checker, [command], {
    stdio: "ignore",
    shell: process.platform === "win32",
  });
  return result.status === 0;
}

async function playAudioFile(filePath: string): Promise<boolean> {
  if (process.platform === "darwin" && hasBinary("afplay")) {
    const result = await runShellCommand(`afplay "${filePath.replaceAll('"', '\\"')}"`, 120_000);
    return result.code === 0;
  }
  if (process.platform === "win32" && hasBinary("powershell")) {
    const script = [
      "Add-Type -AssemblyName PresentationCore;",
      "$player = New-Object System.Windows.Media.MediaPlayer;",
      `$player.Open([Uri]${quotePowerShellLiteral(filePath)});`,
      "$player.Play();",
      "for ($i = 0; $i -lt 100 -and -not $player.NaturalDuration.HasTimeSpan; $i++) { Start-Sleep -Milliseconds 50 };",
      "if ($player.NaturalDuration.HasTimeSpan) { Start-Sleep -Milliseconds ([int]$player.NaturalDuration.TimeSpan.TotalMilliseconds + 250) } else { Start-Sleep -Milliseconds 5000 };",
      "$player.Close();",
    ].join(" ");
    const command = [
      "powershell",
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-STA",
      "-EncodedCommand",
      encodePowerShellCommand(script),
    ].join(" ");
    return (await runShellCommand(command, 120_000)).code === 0;
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

function quotePowerShellLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function encodePowerShellCommand(command: string): string {
  return Buffer.from(command, "utf16le").toString("base64");
}

async function speakWithSystemVoice(text: string): Promise<boolean> {
  const textPath = path.join(
    os.tmpdir(),
    `vora-system-tts-${Date.now()}-${randomUUID().slice(0, 8)}.txt`,
  );
  await fs.writeFile(textPath, text, "utf8");
  try {
    if (process.platform === "darwin" && hasBinary("say")) {
      return (await runShellCommand(`say -f ${quoteShell(textPath)}`, 120_000)).code === 0;
    }
    if (process.platform === "win32" && hasBinary("powershell")) {
      const script = [
        "Add-Type -AssemblyName System.Speech;",
        "$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer;",
        `$speaker.Speak((Get-Content -Raw -LiteralPath ${quotePowerShellLiteral(textPath)}));`,
      ].join(" ");
      const command = [
        "powershell",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-EncodedCommand",
        encodePowerShellCommand(script),
      ].join(" ");
      return (await runShellCommand(command, 120_000)).code === 0;
    }
    if (process.platform === "linux" && hasBinary("espeak")) {
      return (await runShellCommand(`espeak -f ${quoteShell(textPath)}`, 120_000)).code === 0;
    }
    return false;
  } finally {
    await fs.rm(textPath, { force: true }).catch(() => undefined);
  }
}

async function speakReply(resolved: VoiceRuntimeOptions, text: string): Promise<void> {
  if (resolved.tts.provider === "none") {
    return;
  }
  const ttsText = prepareTtsText(text);
  if (!ttsText) {
    return;
  }
  const startedAt = Date.now();

  if (resolved.tts.provider === "hume") {
    if (!resolved.tts.backendUrl && !resolved.tts.humeApiKey) {
      defaultRuntime.error("[voice] Hume TTS skipped: missing backend/API key");
      return;
    }
    let audioPath: string;
    try {
      voiceInfo(`TTS: synthesizing with Hume (timeout ${formatMs(resolved.tts.timeoutMs)})`);
      audioPath = await synthesizeHumeAudio({
        text: ttsText,
        apiKey: resolved.tts.humeApiKey,
        backendUrl: resolved.tts.backendUrl,
        voiceId: resolved.tts.humeVoiceId,
        speed: resolved.tts.humeSpeed,
        timeoutMs: resolved.tts.timeoutMs,
      });
    } catch (error) {
      defaultRuntime.error(
        `[voice] Hume TTS failed after ${formatMs(Date.now() - startedAt)}: ${String(
          error,
        )}; using system fallback`,
      );
      const spoke = await speakWithSystemVoice(ttsText);
      if (!spoke) {
        defaultRuntime.error("[voice] system TTS fallback unavailable");
      }
      return;
    }
    try {
      voiceInfo(`TTS: audio ready in ${formatMs(Date.now() - startedAt)}; playing`);
      const played = await playAudioFile(audioPath);
      if (!played) {
        defaultRuntime.log(`[voice] Hume audio generated: ${audioPath}`);
      } else {
        voiceSuccess(`TTS: finished in ${formatMs(Date.now() - startedAt)}`);
      }
    } finally {
      await fs.rm(audioPath, { force: true }).catch(() => undefined);
    }
    return;
  }

  if (!resolved.tts.backendUrl && !resolved.tts.elevenLabsApiKey) {
    const spoke = await speakWithSystemVoice(ttsText);
    if (!spoke) {
      defaultRuntime.error("[voice] ElevenLabs TTS skipped: missing API key");
    }
    return;
  }
  let audioPath: string;
  try {
    voiceInfo(`TTS: synthesizing with ElevenLabs (timeout ${formatMs(resolved.tts.timeoutMs)})`);
    audioPath = await synthesizeElevenLabsAudio({
      text: ttsText,
      apiKey: resolved.tts.elevenLabsApiKey,
      backendUrl: resolved.tts.backendUrl,
      voiceId: resolved.tts.elevenLabsVoiceId,
      modelId: resolved.tts.elevenLabsModelId,
      outputFormat: resolved.tts.elevenLabsOutputFormat,
      timeoutMs: resolved.tts.timeoutMs,
    });
  } catch (error) {
    defaultRuntime.error(
      `[voice] ElevenLabs TTS failed after ${formatMs(Date.now() - startedAt)}: ${String(error)}`,
    );
    const spoke = await speakWithSystemVoice(ttsText);
    if (!spoke) {
      defaultRuntime.error("[voice] system TTS fallback unavailable");
    }
    return;
  }
  try {
    voiceInfo(`TTS: audio ready in ${formatMs(Date.now() - startedAt)}; playing`);
    const played = await playAudioFile(audioPath);
    if (!played) {
      defaultRuntime.log(`[voice] audio generated: ${audioPath}`);
    } else {
      voiceSuccess(`TTS: finished in ${formatMs(Date.now() - startedAt)}`);
    }
  } finally {
    await fs.rm(audioPath, { force: true }).catch(() => undefined);
  }
}

function normalizeVoiceIntentText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isVoiceSleepIntent(text: string): boolean {
  const normalized = normalizeVoiceIntentText(text);
  return [
    "sleep",
    "go to sleep",
    "stop listening",
    "stop listen",
    "that is all",
    "thats all",
    "thank you vora",
    "thanks vora",
    "nghi di",
    "dung nghe",
  ].includes(normalized);
}

function isRememberScreenIntent(text: string): boolean {
  const normalized = normalizeVoiceIntentText(text);
  return [
    "remember what am i doing now",
    "remember what i am doing now",
    "remember what im doing now",
    "remember what i m doing now",
    "remember what i am doing",
    "remember what im doing",
    "remember this screen",
    "remember my screen",
    "save what i am doing",
    "save what im doing",
    "look at my screen and remember",
    "nho toi dang lam gi",
    "nho man hinh nay",
    "ghi nho man hinh",
    "ghi nho toi dang lam gi",
  ].some((phrase) => normalized.includes(phrase));
}

function truncateForVoiceContext(text: string, maxChars: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, maxChars).trim()}...`;
}

function buildVoiceMessage(params: {
  transcript: string;
  state?: VoiceConversationState;
  followUp?: boolean;
}): string {
  const transcript = params.transcript.trim();
  if (!params.followUp || !params.state?.lastUser || !params.state.lastAssistant) {
    return transcript;
  }
  return [
    "[VORA voice follow-up: answer as part of the same spoken conversation. Use the previous turn only as lightweight context.]",
    `Previous user: ${truncateForVoiceContext(params.state.lastUser, 220)}`,
    `Previous VORA: ${truncateForVoiceContext(params.state.lastAssistant, 320)}`,
    "",
    `Latest user: ${transcript}`,
  ].join("\n");
}

function buildRememberScreenPrompt(transcript: string): string {
  return [
    "The user asked VORA to remember what they are doing now.",
    "Analyze the attached screenshot. Reply in 1-3 short sentences.",
    "State what the user appears to be doing and ask whether they want help continuing.",
    "Keep it natural and concise. Do not mention internal storage unless the user asks.",
    "",
    `User voice command: ${transcript}`,
  ].join("\n");
}

async function captureScreenToPng(): Promise<string> {
  const filePath = path.join(
    os.tmpdir(),
    `vora-screen-${Date.now()}-${randomUUID().slice(0, 8)}.png`,
  );

  if (process.platform === "darwin") {
    const result = await runShellCommand(`screencapture -x ${quoteShell(filePath)}`, 20_000);
    if (result.code !== 0) {
      throw new Error(result.stderr.trim() || "screencapture failed");
    }
    return filePath;
  }

  if (process.platform === "win32" && hasBinary("powershell")) {
    const script = [
      "Add-Type -AssemblyName System.Windows.Forms;",
      "Add-Type -AssemblyName System.Drawing;",
      "$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds;",
      "$bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height;",
      "$graphics = [System.Drawing.Graphics]::FromImage($bitmap);",
      "$graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size);",
      `$bitmap.Save(${quotePowerShellLiteral(filePath)}, [System.Drawing.Imaging.ImageFormat]::Png);`,
      "$graphics.Dispose();",
      "$bitmap.Dispose();",
    ].join(" ");
    const command = [
      "powershell",
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-STA",
      "-EncodedCommand",
      encodePowerShellCommand(script),
    ].join(" ");
    const result = await runShellCommand(command, 20_000);
    if (result.code !== 0) {
      throw new Error(result.stderr.trim() || "PowerShell screen capture failed");
    }
    return filePath;
  }

  if (process.platform === "linux") {
    const commands = [
      hasBinary("gnome-screenshot") ? `gnome-screenshot -f ${quoteShell(filePath)}` : undefined,
      hasBinary("scrot") ? `scrot ${quoteShell(filePath)}` : undefined,
      hasBinary("import") ? `import -window root ${quoteShell(filePath)}` : undefined,
    ].filter((entry): entry is string => Boolean(entry));
    for (const command of commands) {
      const result = await runShellCommand(command, 20_000);
      if (result.code === 0) {
        return filePath;
      }
    }
  }

  throw new Error("screen capture is not available on this OS without an installed capture tool");
}

async function captureScreenAttachment(): Promise<{
  filePath: string;
  attachment: VoiceAttachment;
}> {
  const filePath = await captureScreenToPng();
  const bytes = await fs.readFile(filePath);
  return {
    filePath,
    attachment: {
      type: "image",
      mimeType: "image/png",
      fileName: path.basename(filePath),
      content: bytes.toString("base64"),
    },
  };
}

async function persistScreenMemory(params: {
  transcript: string;
  assistantReply: string;
  screenshotPath?: string;
}): Promise<void> {
  const workspaceDir = resolveDefaultAgentWorkspaceDir();
  const memoryDir = path.join(workspaceDir, "memory", "voice-screen");
  await fs.mkdir(memoryDir, { recursive: true });

  const stamp = new Date().toISOString();
  const safeStamp = stamp.replace(/[:.]/g, "-");
  let screenshotRel = "";
  if (params.screenshotPath) {
    const screenshotTarget = path.join(memoryDir, `${safeStamp}.png`);
    await fs.copyFile(params.screenshotPath, screenshotTarget).catch(() => undefined);
    screenshotRel = path.relative(workspaceDir, screenshotTarget).replace(/\\/g, "/");
  }

  const summary = truncateForVoiceContext(params.assistantReply, 900);
  const memoryPath = path.join(memoryDir, "screen-memory.md");
  await fs.appendFile(
    memoryPath,
    [
      `## ${stamp}`,
      "",
      `User asked: ${params.transcript}`,
      `VORA observed: ${summary}`,
      screenshotRel ? `Screenshot: ${screenshotRel}` : "",
      "",
    ]
      .filter((line) => line !== "")
      .join("\n") + "\n",
    "utf8",
  );

  const heartbeatPath = path.join(workspaceDir, DEFAULT_HEARTBEAT_FILENAME);
  let existing = "# HEARTBEAT.md\n";
  try {
    existing = await fs.readFile(heartbeatPath, "utf8");
  } catch {
    await fs.mkdir(path.dirname(heartbeatPath), { recursive: true });
  }

  const blockStart = "<!-- VORA_VOICE_LAST_SCREEN_START -->";
  const blockEnd = "<!-- VORA_VOICE_LAST_SCREEN_END -->";
  const block = [
    blockStart,
    "## Voice Screen Memory",
    "",
    `Last observed at: ${stamp}`,
    `Summary: ${summary}`,
    screenshotRel ? `Screenshot file: ${screenshotRel}` : "",
    "",
    'On next startup/heartbeat, briefly remind the user: "Last time I saw you were working on this. Do you want help continuing?"',
    "If you already reminded them in this active session, reply HEARTBEAT_OK unless there is a new task.",
    blockEnd,
  ]
    .filter((line) => line !== "")
    .join("\n");

  const pattern = new RegExp(`${blockStart}[\\s\\S]*?${blockEnd}`);
  const next = pattern.test(existing)
    ? existing.replace(pattern, block)
    : `${existing.trimEnd()}\n\n${block}\n`;
  await fs.writeFile(heartbeatPath, next, "utf8");
  defaultRuntime.log(`[voice] screen memory saved: ${memoryPath}`);
}

async function prepareVoiceTurn(params: {
  transcript: string;
  state?: VoiceConversationState;
  followUp?: boolean;
}): Promise<{
  message: string;
  attachments?: VoiceAttachment[];
  rememberScreenshotPath?: string;
}> {
  if (!isRememberScreenIntent(params.transcript)) {
    return {
      message: buildVoiceMessage(params),
    };
  }

  try {
    const snapshot = await captureScreenAttachment();
    defaultRuntime.log("[voice] captured screen for memory");
    return {
      message: buildRememberScreenPrompt(params.transcript),
      attachments: [snapshot.attachment],
      rememberScreenshotPath: snapshot.filePath,
    };
  } catch (error) {
    defaultRuntime.error(`[voice] screen capture failed: ${String(error)}`);
    return {
      message: [
        "The user asked VORA to remember what they are doing now, but screen capture failed.",
        `Capture error: ${String(error)}`,
        "Reply briefly with the failure and ask them to grant screen-recording permission or retry.",
        "",
        `User voice command: ${params.transcript}`,
      ].join("\n"),
    };
  }
}

async function runGatewayVoiceTurn(params: {
  resolved: VoiceRuntimeOptions;
  gatewayClient: GatewayChatClient;
  transcript: string;
  state?: VoiceConversationState;
  followUp?: boolean;
}): Promise<{ replied: boolean; reply?: string }> {
  const transcript = params.transcript.trim();
  if (!transcript) {
    return { replied: false };
  }
  voiceMessageBox("You", transcript);
  const turn = await prepareVoiceTurn({
    transcript,
    state: params.state,
    followUp: params.followUp,
  });

  const beforeHistory = await params.gatewayClient.loadHistory({
    sessionKey: params.resolved.gateway.sessionKey,
    limit: 100,
  });
  const beforeMessages = normalizeHistoryMessages(beforeHistory);
  const beforeText = latestAssistantText(beforeMessages);
  const beforeAssistantCount = countAssistantMessages(beforeMessages);

  const run = await params.gatewayClient.sendChat({
    sessionKey: params.resolved.gateway.sessionKey,
    message: turn.message,
    thinking: params.resolved.gateway.thinking,
    deliver: params.resolved.gateway.deliver,
    attachments: turn.attachments,
    timeoutMs: params.resolved.gateway.timeoutMs,
  });
  voiceDebugLog(`[voice] run started: ${run.runId}`, params.resolved);
  voiceInfo("VORA is thinking...");

  const reply = await waitForAssistantReply({
    client: params.gatewayClient,
    sessionKey: params.resolved.gateway.sessionKey,
    beforeText,
    beforeAssistantCount,
    waitMs: params.resolved.gateway.waitMs,
  });
  if (!reply) {
    defaultRuntime.error(
      `[voice] no assistant reply received within ${params.resolved.gateway.waitMs}ms`,
    );
    return { replied: false };
  }

  voiceMessageBox("Vora", reply);
  await speakReply(params.resolved, reply);
  if (params.state) {
    params.state.lastUser = transcript;
    params.state.lastAssistant = reply;
  }
  if (turn.rememberScreenshotPath) {
    await persistScreenMemory({
      transcript,
      assistantReply: reply,
      screenshotPath: turn.rememberScreenshotPath,
    }).catch((error) => {
      defaultRuntime.error(`[voice] failed to save screen memory: ${String(error)}`);
    });
  }
  return { replied: true, reply };
}

async function runVoiceConversation(params: {
  resolved: VoiceRuntimeOptions;
  gatewayClient: GatewayChatClient;
  firstTranscript: string;
  state: VoiceConversationState;
  onSuccessfulTurn: () => void;
}): Promise<void> {
  let transcript = params.firstTranscript.trim();
  let followUp = false;
  let followUpTurns = 0;

  while (transcript && !isVoiceSleepIntent(transcript)) {
    const result = await runGatewayVoiceTurn({
      resolved: params.resolved,
      gatewayClient: params.gatewayClient,
      transcript,
      state: params.state,
      followUp,
    });
    if (!result.replied) {
      return;
    }

    params.onSuccessfulTurn();
    if (params.resolved.once) {
      return;
    }
    if (
      !params.resolved.conversation.followUpEnabled ||
      followUpTurns >= params.resolved.conversation.followUpMaxTurns
    ) {
      return;
    }

    const followUpListenMs = Math.min(
      params.resolved.conversation.followUpMs,
      params.resolved.conversation.followUpSttTimeoutMs,
    );
    voiceInfo(
      `Follow-up window: ${Math.round(
        followUpListenMs / 1000,
      )}s after STT is ready. Wait for "Listening now".`,
    );

    let nextTranscript = "";
    try {
      nextTranscript = (
        await transcribeSpeech(params.resolved, {
          timeoutMs: followUpListenMs,
          prompt: "Follow-up (blank to sleep): ",
          phase: "follow-up",
        })
      ).trim();
    } catch (error) {
      const message = String(error);
      if (message.toLowerCase().includes("timeout")) {
        voiceInfo("No follow-up heard; returning to wake word.");
        return;
      }
      throw error;
    }

    if (!nextTranscript) {
      voiceInfo("No follow-up heard; returning to wake word.");
      return;
    }
    if (isVoiceSleepIntent(nextTranscript)) {
      voiceInfo("Sleep command heard; wake word will arm again.");
      return;
    }

    followUp = true;
    followUpTurns += 1;
    transcript = nextTranscript;
  }
}

async function runWakeGreeting(params: {
  resolved: VoiceRuntimeOptions;
  gatewayClient: GatewayChatClient;
}): Promise<void> {
  if (params.resolved.wakeAck.mode === "off") {
    return;
  }

  if (params.resolved.wakeAck.mode === "local") {
    voiceMessageBox("Vora", "I'm here. Preparing the microphone now.");
    return;
  }

  const beforeHistory = await params.gatewayClient.loadHistory({
    sessionKey: params.resolved.gateway.sessionKey,
    limit: 100,
  });
  const beforeMessages = normalizeHistoryMessages(beforeHistory);
  const beforeText = latestAssistantText(beforeMessages);
  const beforeAssistantCount = countAssistantMessages(beforeMessages);

  voiceInfo('Wake detected. Sending "Hey Vora!"');
  const run = await params.gatewayClient.sendChat({
    sessionKey: params.resolved.gateway.sessionKey,
    message: "Hey Vora!",
    thinking: params.resolved.gateway.thinking,
    deliver: false,
    timeoutMs: params.resolved.gateway.timeoutMs,
  });
  voiceDebugLog(`[voice] wake ack run started: ${run.runId}`, params.resolved);

  const reply = await waitForAssistantReply({
    client: params.gatewayClient,
    sessionKey: params.resolved.gateway.sessionKey,
    beforeText,
    beforeAssistantCount,
    waitMs: Math.min(params.resolved.gateway.waitMs, params.resolved.wakeAck.waitMs),
  });
  if (reply) {
    voiceMessageBox("Vora", reply);
  } else {
    voiceWarn('VORA did not answer "Hey Vora!" quickly; starting STT anyway.');
  }
}

export async function runVoiceLoop(opts: VoiceRootOptions): Promise<void> {
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
  const wakeDeps = checkWakePythonDependencies(resolved.wake.pythonBin);
  if (!wakeDeps.ok) {
    throw new Error(formatWakePythonDependencyError(resolved.wake.pythonBin, wakeDeps.message));
  }
  if (resolved.stt.provider === "agora" && !resolved.stt.agoraCommand) {
    throw new Error(
      "Agora STT provider needs a bridge command. Use --agora-stt-command or VORA_AGORA_STT_COMMAND.",
    );
  }
  if (resolved.tts.provider === "hume" && !resolved.tts.backendUrl && !resolved.tts.humeApiKey) {
    throw new Error(
      "Hume TTS enabled but no backend/API key is configured. Set --backend-url, --hume-api-key, VORA_HUME_API_KEY, or HUME_API_KEY.",
    );
  }
  if (
    resolved.tts.provider === "elevenlabs" &&
    !resolved.tts.backendUrl &&
    !resolved.tts.elevenLabsApiKey
  ) {
    throw new Error(
      "ElevenLabs TTS enabled but no backend/API key is configured. Set --backend-url, --elevenlabs-api-key, VORA_ELEVENLABS_API_KEY, or ELEVENLABS_API_KEY.",
    );
  }

  const gatewayClient = await GatewayChatClient.connect({
    url: resolved.gateway.url,
    token: resolved.gateway.token,
    password: resolved.gateway.password,
  });
  const wakeWord = new WakeWordEngine(resolved.wake);
  const conversationState: VoiceConversationState = {};
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

    if (resolved.gateway.initialMessage) {
      busy = true;
      try {
        await runGatewayVoiceTurn({
          resolved,
          gatewayClient,
          transcript: resolved.gateway.initialMessage,
          state: conversationState,
        });
      } catch (err) {
        defaultRuntime.error(`[voice] initial turn failed: ${String(err)}`);
      } finally {
        busy = false;
      }
    }

    wakeWord.onVolume((event) => {
      if (!resolved.debug) {
        return;
      }
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
        wakeWord.stop();
        try {
          const latencyMs = (
            Math.max(0, Date.now() / 1000 - event.sourceTimestampSec) * 1000
          ).toFixed(0);
          voiceBox("Wake", [
            `Wake word detected. Score ${event.score.toFixed(2)}.`,
            resolved.debug ? `model=${event.model} latency=${latencyMs}ms` : "VORA is waking up.",
          ]);

          await runWakeGreeting({ resolved, gatewayClient });

          const transcript = (await transcribeSpeech(resolved, { phase: "command" })).trim();
          if (!transcript) {
            voiceInfo("Transcript empty; waiting for next wake trigger.");
            return;
          }
          if (isVoiceSleepIntent(transcript)) {
            voiceInfo("Sleep command heard; wake word remains armed.");
            return;
          }
          await runVoiceConversation({
            resolved,
            gatewayClient,
            firstTranscript: transcript,
            state: conversationState,
            onSuccessfulTurn: () => {
              turns += 1;
            },
          });
          if (resolved.once && turns >= 1) {
            requestStop();
          }
        } catch (err) {
          defaultRuntime.error(`[voice] turn failed: ${String(err)}`);
        } finally {
          busy = false;
          if (!stopRequested) {
            try {
              await wakeWord.start();
              voiceSuccess("Wake word armed for next turn.");
            } catch (err) {
              defaultRuntime.error(`[voice] failed to restart wake word: ${String(err)}`);
              requestStop();
            }
          }
        }
      })();
    });

    await wakeWord.start();
    voiceBox("VORA Voice", [
      `Gateway session: ${resolved.gateway.sessionKey}`,
      `Wake threshold: ${resolved.wake.threshold}`,
      `Wake ack: ${resolved.wakeAck.mode}${
        resolved.wakeAck.mode === "agent" ? ` (${formatMs(resolved.wakeAck.waitMs)} max)` : ""
      }`,
      `STT: ${resolved.stt.provider} (${resolved.stt.language}; English-only default)`,
      `TTS: ${resolved.tts.provider} (timeout ${formatMs(resolved.tts.timeoutMs)})`,
      resolved.conversation.followUpEnabled && !resolved.once
        ? `Follow-up: on, max ${resolved.conversation.followUpMaxTurns}, listen ${Math.round(
            Math.min(resolved.conversation.followUpMs, resolved.conversation.followUpSttTimeoutMs) /
              1000,
          )}s`
        : "Follow-up: off",
      "Say: Hey Vora. Press Ctrl+C to stop.",
      resolved.debug
        ? "Debug logs: on"
        : "Debug logs: off (set VORA_VOICE_DEBUG=1 to inspect internals)",
    ]);

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
    .option("--message <text>", "Send an initial message before listening for wake word")
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
      "External command for Agora STT bridge (supports {lang}, {timeout_ms}); default uses bundled Agora capture bridge",
    )
    .option(
      "--backend-url <url>",
      `Voice backend URL for provider secrets/tokens (default: ${DEFAULT_VOICE_BACKEND_URL}; use "off" for local env mode)`,
    )
    .option("--tts-provider <none|hume|elevenlabs>", "Voice reply provider")
    .option("--tts-timeout-ms <ms>", "TTS synthesis timeout (ms)")
    .option("--hume-api-key <key>", "Hume API key")
    .option("--hume-voice-id <id>", "Hume voice ID")
    .option("--hume-speed <speed>", "Hume speaking speed (0.5..2, default 1.2)")
    .option("--eleven-labs-api-key <key>", "ElevenLabs API key")
    .option("--eleven-labs-voice-id <id>", "ElevenLabs voice ID")
    .option("--eleven-labs-model-id <id>", "ElevenLabs model ID")
    .option("--eleven-labs-output-format <format>", "ElevenLabs output format")
    .option("--no-follow-up", "Require wake word before every voice turn")
    .option("--follow-up-ms <ms>", "Maximum follow-up listening window after each reply")
    .option("--follow-up-max-turns <n>", "Maximum follow-up turns before re-arming wake word")
    .option("--follow-up-stt-timeout-ms <ms>", "STT timeout for each follow-up turn")
    .option(
      "--wake-ack <local|agent|off>",
      'Wake acknowledgement mode. Default "local" avoids a slow model call before STT.',
    )
    .option("--wake-ack-wait-ms <ms>", "Max wait for --wake-ack agent before opening STT")
    .option("--debug", "Show low-level voice runtime diagnostics", false);
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

  voice
    .command("setup")
    .description("Install wake-word Python dependencies into an isolated VORA venv")
    .option("--wake-dir <path>", "Path to wake_word directory")
    .option("--python <bin>", "Base Python binary used to create the venv")
    .option("--venv-dir <path>", "Voice Python venv directory")
    .action(async (opts: VoiceSetupOptions) => {
      try {
        await runVoiceSetup(opts, defaultRuntime);
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
