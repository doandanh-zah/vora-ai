import {
  resolveAgentDir,
  resolveDefaultAgentId,
} from "../agents/agent-scope.js";
import { upsertAuthProfile } from "../agents/auth-profiles.js";
import type {
  ModelDefinitionConfig,
  ModelProviderConfig,
} from "../config/types.models.js";
import { resolveManifestProviderApiKeyChoice } from "../plugins/provider-auth-choices.js";
import { applyAuthProfileConfig } from "../plugins/provider-auth-helpers.js";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { applyPrimaryModel } from "../plugins/provider-model-primary.js";
import { fetchWithTimeout } from "../utils/fetch-timeout.js";
import { createAuthChoiceAgentModelNoter } from "./auth-choice.apply-helpers.js";
import { normalizeTokenProviderInput } from "./auth-choice.apply-helpers.js";
import type {
  ApplyAuthChoiceParams,
  ApplyAuthChoiceResult,
} from "./auth-choice.apply.js";
import { applyDefaultModelChoice } from "./auth-choice.default-model.js";
import type { AuthChoice } from "./onboard-types.js";


function checkOllamaInstalled(): boolean {
  try {
    const result = spawnSync("ollama", ["--version"], {
      encoding: "utf8",
      stdio: "pipe",
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

function isLikelyLocalOllamaBaseUrl(baseUrl: string): boolean {
  try {
    const parsed = new URL(baseUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  } catch {
    return false;
  }
}

async function tryStartOllamaServeInBackground(params: {
  prompter: ApplyAuthChoiceParams["prompter"];
  baseUrl: string;
}): Promise<boolean> {
  if (!isLikelyLocalOllamaBaseUrl(params.baseUrl)) {
    return false;
  }
  if (!checkOllamaInstalled()) {
    return false;
  }

  await params.prompter.note(
    [
      "Could not reach Ollama API yet.",
    ].join("\n"),
    "Ollama",
  );

  const startResult =
    process.platform === "win32"
      ? spawnSync(
          "powershell",
          [
            "-NoProfile",
            "-Command",
            "Start-Process -WindowStyle Hidden ollama -ArgumentList 'serve'",
          ],
          { encoding: "utf8", stdio: "pipe" },
        )
      : spawnSync("sh", ["-lc", "nohup ollama serve >/tmp/vora-ollama.log 2>&1 &"], {
          encoding: "utf8",
          stdio: "pipe",
        });

  if (startResult.status !== 0) {
    return false;
  }

  const tagsUrl = new URL("/api/tags", `${params.baseUrl}/`).toString();
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      const response = await fetchWithTimeout(
        tagsUrl,
        { method: "GET" },
      );
      if (response.ok) {
        await params.prompter.note(
          "Ollama API is now reachable.",
          "Ollama",
        );
        return true;
      }
    } catch {
      // Keep polling until timeout.
    }
  }

  return false;
}

async function autoInstallOllama(
  prompter: ApplyAuthChoiceParams["prompter"],
): Promise<boolean> {
  const shouldInstall = await prompter.confirm({
    message: "🤖 Ollama not found. Should I install it automatically for you?",
    initialValue: true,
  });

  if (!shouldInstall) {
    return false;
  }

  await prompter.note(
    [
      "🚀 Installing Ollama...",
      "This will download and install Ollama on your system.",
      "Please wait for the installation to complete.",
    ].join("\n"),
    "Installing Ollama",
  );

  try {
    // Detect platform and install accordingly
    const isWindows = process.platform === "win32";
    let installResult: any;

    if (isWindows) {
      // Windows installation
      await prompter.note(
        [
          "🪟 Detected Windows system",
          "Installing Ollama for Windows...",
          "This will download Ollama executable.",
        ].join("\n"),
        "Windows Install",
      );

      installResult = spawnSync(
        "powershell",
        [
          "-Command",
          "Start-Process 'https://ollama.com/download/windows'",
        ],
        {
          encoding: "utf8",
          stdio: "pipe",
          shell: true,
        },
      );
    } else {
      // Unix/Linux installation
      installResult = spawnSync(
        "sh",
        ["-lc", "curl -fsSL https://ollama.ai/install.sh | sh"],
        {
          encoding: "utf8",
          stdio: "pipe",
        },
      );
    }

    if (installResult.status !== 0) {
      throw new Error(`Install failed: ${installResult.stderr}`);
    }

    await prompter.note(
      [
        "✅ Ollama installed successfully!",
        "",
        "🚀 Now I'll start Ollama and pull a model for you...",
      ].join("\n"),
      "Ollama Installed",
    );

    // Note: We'll start Ollama in background after setup
    return true;
  } catch (error) {
    const isWindows = process.platform === "win32";
    await prompter.note(
      [
        "❌ Auto-installation failed.",
        "",
        "Please install manually:",
        isWindows
          ? "https://ollama.com/download/windows"
          : "curl -fsSL https://ollama.ai/install.sh | sh",
        "",
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      ].join("\n"),
      "Installation Failed",
    );
    return false;
  }
}

async function autoPullModel(
  prompter: ApplyAuthChoiceParams["prompter"],
  modelId: string,
): Promise<boolean> {
  const shouldPull = await prompter.confirm({
    message: `📦 Should I download the model "${modelId}" for you? (This may take a few minutes)`,
    initialValue: true,
  });

  if (!shouldPull) {
    return false;
  }

  await prompter.note(
    [
      `🚀 Downloading model: ${modelId}`,
      "This may take several minutes depending on your internet connection...",
      "The model is several GB in size.",
    ].join("\n"),
    "Downloading Model",
  );

  try {
    const pullResult = spawnSync("ollama", ["pull", modelId], {
      encoding: "utf8",
      stdio: "pipe",
    });

    if (pullResult.status !== 0) {
      throw new Error(`Pull failed: ${pullResult.stderr}`);
    }

    await prompter.note(
      [
        `✅ Model "${modelId}" downloaded successfully!`,
        "",
        "🎉 You're all set to use Ollama with VORA!",
      ].join("\n"),
      "Model Ready",
    );

    return true;
  } catch (error) {
    await prompter.note(
      [
        `❌ Failed to download model: ${modelId}`,
        "",
        "You can download it manually later:",
        "",
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      ].join("\n"),
      "Download Failed",
    );
    return false;
  }
}

type OllamaTagsResponse = {
  models?: Array<{
    name?: string;
    model?: string;
  }>;
};

export function normalizeOllamaBaseUrl(raw: string | undefined): string {
  const trimmed = String(raw ?? "").trim();
  const candidate = trimmed || "http://127.0.0.1:11434";
  const normalized = candidate.replace(/\/+$/u, "");
  if (normalized.endsWith("/v1")) {
    return normalized.slice(0, -3);
  }
  return normalized;
}

function normalizeOllamaModelId(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

function isReasoningOllamaModel(modelId: string): boolean {
  const normalized = modelId.toLowerCase();
  return (
    normalized.includes("deepseek-r1") ||
    normalized.includes("qwq") ||
    normalized.includes("qwen3") ||
    normalized.includes("reason") ||
    normalized.includes("gpt-oss")
  );
}

function isVisionOllamaModel(modelId: string): boolean {
  const normalized = modelId.toLowerCase();
  return (
    normalized.includes("vision") ||
    normalized.includes("llava") ||
    normalized.includes("vl") ||
    normalized.includes("bakllava")
  );
}

function buildOllamaModelDefinition(modelId: string): ModelDefinitionConfig {
  return {
    id: modelId,
    name: modelId,
    reasoning: isReasoningOllamaModel(modelId),
    input: isVisionOllamaModel(modelId) ? ["text", "image"] : ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  };
}

export async function discoverOllamaModelIds(
  baseUrl: string,
): Promise<string[]> {
  const tagsUrl = new URL("/api/tags", `${baseUrl}/`).toString();
  const response = await fetchWithTimeout(
    tagsUrl,
    { method: "GET" },
  );
  if (!response.ok) {
    throw new Error(`Ollama returned HTTP ${response.status} for ${tagsUrl}`);
  }
  const payload = (await response.json()) as OllamaTagsResponse;
  const discovered = (payload.models ?? [])
    .map((entry) => normalizeOllamaModelId(entry.name ?? entry.model))
    .filter(Boolean);
  return [...new Set(discovered)].toSorted((left, right) =>
    left.localeCompare(right),
  );
}

export function mergeOllamaProviderConfig(params: {
  config: ApplyAuthChoiceParams["config"];
  baseUrl: string;
  modelId: string;
}): ApplyAuthChoiceParams["config"] {
  const existingProvider = params.config.models?.providers?.ollama as
    | ModelProviderConfig
    | undefined;
  const modelDefinition = buildOllamaModelDefinition(params.modelId);
  const existingModels = Array.isArray(existingProvider?.models)
    ? existingProvider.models
    : [];
  const nextModels = [
    modelDefinition,
    ...existingModels.filter(
      (entry) => normalizeOllamaModelId(entry?.id) !== params.modelId,
    ),
  ];

  return {
    ...params.config,
    models: {
      ...params.config.models,
      providers: {
        ...params.config.models?.providers,
        ollama: {
          ...existingProvider,
          baseUrl: params.baseUrl,
          api: "ollama",
          models: nextModels,
        },
      },
    },
  };
}

async function promptOllamaModelId(params: {
  prompter: ApplyAuthChoiceParams["prompter"];
  baseUrl: string;
}): Promise<string> {
  let discoveredModels: string[] = [];
  let discoveryFailed = false;
  try {
    discoveredModels = await discoverOllamaModelIds(params.baseUrl);
  } catch (error) {
    discoveryFailed = true;
    await params.prompter.note(
      [
        `Could not query ${params.baseUrl}/api/tags.`,
        error instanceof Error ? error.message : String(error),
        "Trying to start Ollama automatically, then retrying once.",
      ].join("\n"),
      "Ollama",
    );
  }

  if (discoveryFailed) {
    const started = await tryStartOllamaServeInBackground({
      prompter: params.prompter,
      baseUrl: params.baseUrl,
    });
    if (started) {
      try {
        discoveredModels = await discoverOllamaModelIds(params.baseUrl);
      } catch {
        // Leave discovered models empty and continue with manual fallback.
      }
    }
  }

  if (discoveredModels.length > 0) {
    const choice = await params.prompter.select({
      message: "Ollama model",
      options: [
        ...discoveredModels.map((modelId) => ({
          value: modelId,
          label: modelId,
          hint: "Local Ollama model",
        })),
        {
          value: "__manual__",
          label: "Enter model manually",
          hint: "Use this if your model is not listed yet",
        },
      ],
      initialValue: discoveredModels[0],
    });
    if (choice !== "__manual__") {
      return String(choice);
    }
  } else {
    const pulledDefault = await autoPullModel(params.prompter, "llama3.2");
    if (pulledDefault) {
      return "llama3.2";
    }
    await params.prompter.note(
      [
        "🤖 No local Ollama models detected yet.",
        "",
        "🚀 Quick start commands:",
        "",
        "📦 Pull your first model (pick one):",
        "",
        "💡 After pulling, restart this setup!",
      ].join("\n"),
      "Ollama Models",
    );
  }

  return String(
    await params.prompter.text({
      message: "Ollama model",
      initialValue: discoveredModels[0],
      placeholder: "llama3.2",
      validate: (value) => (value?.trim() ? undefined : "Model ID is required"),
    }),
  ).trim();
}


export function normalizeApiKeyTokenProviderAuthChoice(params: {
  authChoice: AuthChoice;
  tokenProvider?: string;
  config?: ApplyAuthChoiceParams["config"];
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
}): AuthChoice {
  if (params.authChoice !== "apiKey" || !params.tokenProvider) {
    return params.authChoice;
  }
  const normalizedTokenProvider = normalizeTokenProviderInput(
    params.tokenProvider,
  );
  if (!normalizedTokenProvider) {
    return params.authChoice;
  }
  return (
    (resolveManifestProviderApiKeyChoice({
      providerId: normalizedTokenProvider,
      config: params.config,
      workspaceDir: params.workspaceDir,
      env: params.env,
    })?.choiceId as AuthChoice | undefined) ?? params.authChoice
  );
}

async function applyAuthChoiceGroq(
  params: ApplyAuthChoiceParams,
): Promise<ApplyAuthChoiceResult | null> {
  if (params.authChoice !== "groq-api-key" && params.authChoice !== "groq") {
    return null;
  }

  await params.prompter.note(
    [
      "Groq free tier is fast but quota-limited.",
      "",
      "VORA will apply quota-saving defaults for Groq:",
      "- model: llama-3.1-8b-instant",
      "- low output token cap",
      "- tools profile: minimal",
      "- thinking default: off",
      "",
      "Get your API key at: https://console.groq.com/keys",
    ].join("\n"),
    "Groq API",
  );

  let key = params.opts?.groqApiKey || params.opts?.token;
  if (!key) {
    key = String(
      await params.prompter.text({
        message: "Groq API Key (Nhận tại: https://console.groq.com/keys)",
        placeholder: "gsk_...",
        validate: (value) =>
          value?.trim() ? undefined : "API Key is required",
      }),
    ).trim();
  }

  const defaultModel = "groq/llama-3.1-8b-instant";
  const resolvedAgentId =
    params.agentId ?? resolveDefaultAgentId(params.config);
  const agentDir =
    params.agentDir ??
    resolveAgentDir(params.config, resolvedAgentId, params.env ?? process.env);

  upsertAuthProfile({
    profileId: "groq:default",
    credential: {
      type: "api_key",
      provider: "groq",
      key,
    },
    agentDir,
  });

  const existingProvider = params.config.models?.providers?.groq as
    | ModelProviderConfig
    | undefined;
  const existingModels = Array.isArray(existingProvider?.models)
    ? existingProvider.models
    : [];

  const modelDefinition: ModelDefinitionConfig = {
    id: "llama-3.1-8b-instant",
    name: "llama-3.1-8b-instant",
    api: "openai-responses",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 16_000,
    maxTokens: 512,
  };

  const nextModels = [
    modelDefinition,
    ...existingModels.filter((entry) => entry?.id !== "llama-3.1-8b-instant"),
  ];

  const DEFAULT_BASE_URL = "https://api.groq.com/openai/v1";
  const currentToolProfile = params.config.tools?.profile;
  const resolvedToolProfile =
    currentToolProfile && currentToolProfile !== "coding"
      ? currentToolProfile
      : "minimal";

  let nextConfig = {
    ...params.config,
    agents: {
      ...params.config.agents,
      defaults: {
        ...params.config.agents?.defaults,
        thinkingDefault: params.config.agents?.defaults?.thinkingDefault ?? "off",
      },
    },
    tools: {
      ...params.config.tools,
      profile: resolvedToolProfile,
    },
    models: {
      ...params.config.models,
      providers: {
        ...params.config.models?.providers,
        groq: {
          ...existingProvider,
          baseUrl: DEFAULT_BASE_URL,
          api: "openai-responses",
          models: nextModels,
        },
      },
    },
  } as ApplyAuthChoiceParams["config"];

  nextConfig = applyAuthProfileConfig(nextConfig, {
    profileId: "groq:default",
    provider: "groq",
    mode: "api_key",
  });

  return await applyDefaultModelChoice({
    config: nextConfig,
    setDefaultModel: params.setDefaultModel,
    defaultModel,
    applyDefaultConfig: (config) => applyPrimaryModel(config, defaultModel),
    applyProviderConfig: (config) => config,
    noteDefault: defaultModel,
    noteAgentModel: createAuthChoiceAgentModelNoter(params),
    prompter: params.prompter,
  });
}

export async function applyAuthChoiceApiProviders(
  params: ApplyAuthChoiceParams,
): Promise<ApplyAuthChoiceResult | null> {
  const handlers: Array<
    (params: ApplyAuthChoiceParams) => Promise<ApplyAuthChoiceResult | null>
  > = [applyAuthChoiceGroq];
  for (const handler of handlers) {
    const result = await handler(params);
    if (result) {
      return result;
    }
  }
  return null;
}
