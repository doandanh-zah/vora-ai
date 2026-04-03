import {
  resolveAgentDir,
  resolveDefaultAgentId,
} from "../agents/agent-scope.js";
import { upsertAuthProfile } from "../agents/auth-profiles.js";
import { OLLAMA_LOCAL_AUTH_MARKER } from "../agents/model-auth-markers.js";
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

export const OLLAMA_DEFAULT_BASE_URL = "http://127.0.0.1:11434";
const OLLAMA_DEFAULT_CONTEXT_WINDOW = 128_000;
const OLLAMA_DEFAULT_MAX_TOKENS = 8_192;
export const OLLAMA_PROFILE_ID = "ollama:default";
const OLLAMA_DISCOVERY_TIMEOUT_MS = 10_000;

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
          "iwr -useb https://ollama.ai/install.ps1 -OutFile ollama-install.ps1; Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process -Force; ./ollama-install.ps1",
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
        "curl",
        ["-fsSL", "https://ollama.ai/install.sh", "|", "sh"],
        {
          encoding: "utf8",
          stdio: "pipe",
          shell: true,
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
          ? "Visit https://ollama.ai/download"
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
        `ollama pull ${modelId}`,
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
  const candidate = trimmed || OLLAMA_DEFAULT_BASE_URL;
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
    api: "ollama",
    reasoning: isReasoningOllamaModel(modelId),
    input: isVisionOllamaModel(modelId) ? ["text", "image"] : ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: OLLAMA_DEFAULT_CONTEXT_WINDOW,
    maxTokens: OLLAMA_DEFAULT_MAX_TOKENS,
  };
}

export async function discoverOllamaModelIds(
  baseUrl: string,
): Promise<string[]> {
  const tagsUrl = new URL("/api/tags", `${baseUrl}/`).toString();
  const response = await fetchWithTimeout(
    tagsUrl,
    { method: "GET" },
    OLLAMA_DISCOVERY_TIMEOUT_MS,
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
  try {
    discoveredModels = await discoverOllamaModelIds(params.baseUrl);
  } catch (error) {
    await params.prompter.note(
      [
        `Could not query ${params.baseUrl}/api/tags.`,
        error instanceof Error ? error.message : String(error),
        "Run `ollama serve` first, or enter a model name manually.",
      ].join("\n"),
      "Ollama",
    );
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
    await params.prompter.note(
      [
        "🤖 No local Ollama models detected yet.",
        "",
        "🚀 Quick start commands:",
        "curl -fsSL https://ollama.ai/install.sh | sh",
        "ollama serve",
        "",
        "📦 Pull your first model (pick one):",
        "ollama pull llama3.2        # All-purpose",
        "ollama pull qwen2.5:7b      # Great for coding",
        "ollama pull deepseek-coder  # Code specialist",
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

async function applyAuthChoiceOllama(
  params: ApplyAuthChoiceParams,
): Promise<ApplyAuthChoiceResult | null> {
  if (params.authChoice !== "ollama") {
    return null;
  }

  const hasOllama = await params.prompter.confirm({
    message: "Do you already have Ollama installed on this desktop?",
    initialValue: false,
  });

  if (!hasOllama) {
    const platform = await params.prompter.select({
      message: "Are you using macOS/Linux or Windows?",
      options: [
        { value: "mac-linux", label: "macOS/Linux", hint: "Auto-install supported" },
        { value: "windows", label: "Windows", hint: "Manual install required" },
      ],
    });

    if (platform === "mac-linux") {
      await params.prompter.note(
        [
          "Running: curl -fsSL https://ollama.ai/install.sh | sh",
          "Installing Ollama automatically. Please wait...",
        ].join("\n"),
        "Installing Ollama",
      );

      try {
        const installResult = spawnSync(
          "sh",
          ["-c", "curl -fsSL https://ollama.ai/install.sh | sh"],
          {
            encoding: "utf8",
            stdio: "pipe",
          },
        );

        if (installResult.status !== 0) {
          throw new Error(`Install failed: ${installResult.stderr}`);
        }

        await params.prompter.note(
          [
            "Ollama installed successfully.",
            "Run this in a new terminal:",
            "ollama serve",
            "",
            "Keep Ollama running while using VORA.",
          ].join("\n"),
          "Ollama Ready",
        );
      } catch (error) {
        await params.prompter.note(
          [
            "Automatic install failed.",
            "Please install manually:",
            "curl -fsSL https://ollama.ai/install.sh | sh",
            "",
            `Error: ${error instanceof Error ? error.message : String(error)}`,
          ].join("\n"),
          "Installation Failed",
        );
        return null;
      }
    } else if (platform === "windows") {
      await params.prompter.note(
        [
          "For Windows, install Ollama manually:",
          "1. Open https://ollama.ai/download",
          "2. Download and run the Windows installer",
          "3. Start Ollama: ollama serve",
          "",
          "After Ollama is running, start onboarding again.",
        ].join("\n"),
        "Windows Installation Required",
      );
      return null;
    }
  }

  await params.prompter.note(
    [
      "Ollama runs fully local on this machine.",
      "If needed, start it first with: ollama serve",
    ].join("\n"),
    "Ollama",
  );

  const baseUrlInput = await params.prompter.text({
    message: "Ollama base URL",
    initialValue: OLLAMA_DEFAULT_BASE_URL,
    placeholder: OLLAMA_DEFAULT_BASE_URL,
    validate: (value) => {
      try {
        new URL(normalizeOllamaBaseUrl(value));
        return undefined;
      } catch {
        return "Please enter a valid Ollama URL";
      }
    },
  });
  const baseUrl = normalizeOllamaBaseUrl(baseUrlInput);

  const modelId = await promptOllamaModelId({
    prompter: params.prompter,
    baseUrl,
  });
  const defaultModel = `ollama/${modelId}`;

  const resolvedAgentId =
    params.agentId ?? resolveDefaultAgentId(params.config);
  const agentDir =
    params.agentDir ??
    resolveAgentDir(params.config, resolvedAgentId, params.env ?? process.env);
  upsertAuthProfile({
    profileId: OLLAMA_PROFILE_ID,
    credential: {
      type: "api_key",
      provider: "ollama",
      key: OLLAMA_LOCAL_AUTH_MARKER,
    },
    agentDir,
  });

  let nextConfig = mergeOllamaProviderConfig({
    config: params.config,
    baseUrl,
    modelId,
  });
  nextConfig = applyAuthProfileConfig(nextConfig, {
    profileId: OLLAMA_PROFILE_ID,
    provider: "ollama",
    mode: "api_key",
  });

  // Final instructions for starting Ollama
  await params.prompter.note(
    [
      "Final step: keep Ollama running in another terminal.",
      "Command:",
      "ollama serve",
    ].join("\n"),
    "Final Setup",
  );

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
        reasoningDefault: params.config.agents?.defaults?.reasoningDefault ?? "off",
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
  > = [applyAuthChoiceOllama, applyAuthChoiceGroq];
  for (const handler of handlers) {
    const result = await handler(params);
    if (result) {
      return result;
    }
  }
  return null;
}
