import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VoraConfig } from "../../../config/config.js";
import { applyNonInteractiveAuthChoice } from "./auth-choice.js";

const resolveDefaultAgentId = vi.hoisted(() => vi.fn(() => "default"));
const resolveAgentDir = vi.hoisted(() => vi.fn(() => "/tmp/vora-test-agent"));
vi.mock("../../../agents/agent-scope.js", () => ({
  resolveDefaultAgentId,
  resolveAgentDir,
}));

const upsertAuthProfile = vi.hoisted(() => vi.fn());
vi.mock("../../../agents/auth-profiles.js", () => ({
  upsertAuthProfile,
}));

const applyNonInteractivePluginProviderChoice = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("./auth-choice.plugin-providers.js", () => ({
  applyNonInteractivePluginProviderChoice,
}));

const resolveNonInteractiveApiKey = vi.hoisted(() => vi.fn());
vi.mock("../api-keys.js", () => ({
  resolveNonInteractiveApiKey,
}));

const resolveManifestDeprecatedProviderAuthChoice = vi.hoisted(() => vi.fn(() => undefined));
const resolveManifestProviderAuthChoices = vi.hoisted(() => vi.fn(() => []));
vi.mock("../../../plugins/provider-auth-choices.js", () => ({
  resolveManifestDeprecatedProviderAuthChoice,
  resolveManifestProviderAuthChoices,
}));

const discoverOllamaModelIds = vi.hoisted(() => vi.fn(async () => ["qwen3:4b"]));
vi.mock("../../auth-choice.apply.api-providers.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../auth-choice.apply.api-providers.js")>();
  return {
    ...actual,
    discoverOllamaModelIds,
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

function createRuntime() {
  return {
    error: vi.fn(),
    exit: vi.fn(),
    log: vi.fn(),
  };
}

describe("applyNonInteractiveAuthChoice", () => {
  it("resolves plugin provider auth before builtin custom-provider handling", async () => {
    const runtime = createRuntime();
    const nextConfig = { agents: { defaults: {} } } as VoraConfig;
    const resolvedConfig = { auth: { profiles: { "demo-provider:default": { mode: "api_key" } } } };
    applyNonInteractivePluginProviderChoice.mockResolvedValueOnce(resolvedConfig as never);

    const result = await applyNonInteractiveAuthChoice({
      nextConfig,
      authChoice: "demo-provider-api-key",
      opts: {} as never,
      runtime: runtime as never,
      baseConfig: nextConfig,
    });

    expect(result).toBe(resolvedConfig);
    expect(applyNonInteractivePluginProviderChoice).toHaveBeenCalledOnce();
  });

  it("fails with manifest-owned replacement guidance for deprecated auth choices", async () => {
    const runtime = createRuntime();
    const nextConfig = { agents: { defaults: {} } } as VoraConfig;
    resolveManifestDeprecatedProviderAuthChoice.mockReturnValueOnce({
      choiceId: "demo-provider-modern-api",
    } as never);

    const result = await applyNonInteractiveAuthChoice({
      nextConfig,
      authChoice: "demo-provider-legacy",
      opts: {} as never,
      runtime: runtime as never,
      baseConfig: nextConfig,
    });

    expect(result).toBeNull();
    expect(runtime.error).toHaveBeenCalledWith(
      '"demo-provider-legacy" is no longer supported. Use --auth-choice demo-provider-modern-api instead.',
    );
    expect(runtime.exit).toHaveBeenCalledWith(1);
    expect(applyNonInteractivePluginProviderChoice).toHaveBeenCalledOnce();
  });

  it("configures local Ollama in non-interactive mode", async () => {
    const runtime = createRuntime();
    const nextConfig = { agents: { defaults: {} } } as VoraConfig;

    const result = await applyNonInteractiveAuthChoice({
      nextConfig,
      authChoice: "ollama",
      opts: {
        customBaseUrl: "http://127.0.0.1:11434",
        customModelId: "qwen3:4b",
      } as never,
      runtime: runtime as never,
      baseConfig: nextConfig,
    });

    expect(result?.models?.providers?.ollama).toMatchObject({
      baseUrl: "http://127.0.0.1:11434",
      api: "ollama",
      models: [expect.objectContaining({ id: "qwen3:4b" })],
    });
    expect(result?.auth?.profiles?.["ollama:default"]).toEqual({
      provider: "ollama",
      mode: "api_key",
    });
    expect(result?.agents?.defaults?.model).toEqual({
      primary: "ollama/qwen3:4b",
    });
    expect(upsertAuthProfile).toHaveBeenCalledWith({
      profileId: "ollama:default",
      credential: {
        type: "api_key",
        provider: "ollama",
        key: "ollama-local",
      },
      agentDir: "/tmp/vora-test-agent",
    });
  });

  it("configures Groq defaults in non-interactive mode", async () => {
    const runtime = createRuntime();
    const nextConfig = {
      agents: { defaults: {} },
      tools: { profile: "coding" },
    } as VoraConfig;
    resolveNonInteractiveApiKey.mockResolvedValueOnce({
      key: "gsk_test_value",
      source: "flag",
    });

    const result = await applyNonInteractiveAuthChoice({
      nextConfig,
      authChoice: "groq-api-key",
      opts: {
        groqApiKey: "gsk_test_value",
      } as never,
      runtime: runtime as never,
      baseConfig: nextConfig,
    });

    expect(result?.agents?.defaults?.model).toEqual({
      primary: "groq/llama-3.1-8b-instant",
    });
    expect(result?.agents?.defaults?.thinkingDefault).toBe("off");
    expect(result?.tools?.profile).toBe("minimal");
    expect(result?.models?.providers?.groq).toMatchObject({
      baseUrl: "https://api.groq.com/openai/v1",
      api: "openai-responses",
      models: [expect.objectContaining({ id: "llama-3.1-8b-instant", maxTokens: 512 })],
    });
    expect(result?.auth?.profiles?.["groq:default"]).toEqual({
      provider: "groq",
      mode: "api_key",
    });
    expect(upsertAuthProfile).toHaveBeenCalledWith({
      profileId: "groq:default",
      credential: {
        type: "api_key",
        provider: "groq",
        key: "gsk_test_value",
      },
      agentDir: "/tmp/vora-test-agent",
    });
    expect(resolveNonInteractiveApiKey).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "groq",
        flagName: "--groq-api-key",
      }),
    );
  });
});
