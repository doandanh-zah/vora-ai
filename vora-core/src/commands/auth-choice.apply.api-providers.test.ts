import { afterEach, describe, expect, it, vi } from "vitest";
import type { VoraConfig } from "../config/config.js";

const upsertAuthProfile = vi.hoisted(() => vi.fn());
vi.mock("../agents/auth-profiles.js", () => ({
  upsertAuthProfile,
}));

import { applyAuthChoiceApiProviders } from "./auth-choice.apply.api-providers.js";

function createPrompter(params: {
  text?: string[];
  select?: string[];
  confirm?: boolean[];
}) {
  const text = vi.fn();
  for (const value of params.text ?? []) {
    text.mockResolvedValueOnce(value);
  }
  const select = vi.fn();
  for (const value of params.select ?? []) {
    select.mockResolvedValueOnce(value);
  }
  const confirm = vi.fn();
  for (const value of params.confirm ?? []) {
    confirm.mockResolvedValueOnce(value);
  }
  if ((params.confirm ?? []).length === 0) {
    confirm.mockResolvedValue(true);
  }
  const note = vi.fn(async () => {});
  return {
    intro: vi.fn(async () => {}),
    outro: vi.fn(async () => {}),
    note,
    select,
    multiselect: vi.fn(async () => []),
    text,
    confirm,
    progress: vi.fn(() => ({
      update: vi.fn(),
      stop: vi.fn(),
    })),
  };
}

describe("applyAuthChoiceApiProviders", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("configures local Ollama from discovered models", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          models: [{ name: "qwen3:4b" }, { name: "llama3.2" }],
        }),
      })),
    );
    const prompter = createPrompter({
      text: ["http://127.0.0.1:11434"],
      select: ["qwen3:4b"],
    });

    const result = await applyAuthChoiceApiProviders({
      authChoice: "ollama",
      config: { agents: { defaults: {} } } as VoraConfig,
      prompter: prompter as never,
      runtime: {} as never,
      setDefaultModel: true,
      agentDir: "/tmp/vora-test-agent",
    });

    expect(result).not.toBeNull();
    expect(result?.config.models?.providers?.ollama).toMatchObject({
      baseUrl: "http://127.0.0.1:11434",
      api: "ollama",
      models: [
        expect.objectContaining({
          id: "qwen3:4b",
          name: "qwen3:4b",
          api: "ollama",
          contextWindow: 128000,
          maxTokens: 8192,
        }),
      ],
    });
    expect(result?.config.auth?.profiles?.["ollama:default"]).toEqual({
      provider: "ollama",
      mode: "api_key",
    });
    expect(result?.config.agents?.defaults?.model).toEqual({
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

  it("falls back to manual model entry when Ollama discovery is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connect ECONNREFUSED 127.0.0.1:11434");
      }),
    );
    const prompter = createPrompter({
      text: ["http://127.0.0.1:11434", "llama3.2"],
    });

    const result = await applyAuthChoiceApiProviders({
      authChoice: "ollama",
      config: { agents: { defaults: {} } } as VoraConfig,
      prompter: prompter as never,
      runtime: {} as never,
      setDefaultModel: false,
      agentDir: "/tmp/vora-test-agent",
      agentId: "worker",
    });

    expect(result).not.toBeNull();
    expect(result?.agentModelOverride).toBe("ollama/llama3.2");
    expect(result?.config.models?.providers?.ollama).toMatchObject({
      baseUrl: "http://127.0.0.1:11434",
      api: "ollama",
      models: [expect.objectContaining({ id: "llama3.2" })],
    });
    expect(result?.config.agents?.defaults?.models?.["ollama/llama3.2"]).toEqual({});
    expect(prompter.note).toHaveBeenCalledWith(
      expect.stringContaining("Could not query http://127.0.0.1:11434/api/tags."),
      "Ollama",
    );
    expect(prompter.note).toHaveBeenCalledWith(
      'Default model set to ollama/llama3.2 for agent "worker".',
      "Model configured",
    );
  });

  it("applies Groq quota-saving defaults during onboarding", async () => {
    const prompter = createPrompter({});

    const result = await applyAuthChoiceApiProviders({
      authChoice: "groq",
      config: {
        agents: { defaults: {} },
        tools: { profile: "coding" },
      } as VoraConfig,
      prompter: prompter as never,
      runtime: {} as never,
      setDefaultModel: true,
      agentDir: "/tmp/vora-test-agent",
      opts: {
        groqApiKey: "gsk_test",
      },
    });

    expect(result).not.toBeNull();
    expect(result?.config.models?.providers?.groq).toMatchObject({
      baseUrl: "https://api.groq.com/openai/v1",
      api: "openai-responses",
      models: [
        expect.objectContaining({
          id: "llama-3.1-8b-instant",
          contextWindow: 16000,
          maxTokens: 512,
          reasoning: false,
        }),
      ],
    });
    expect(result?.config.tools?.profile).toBe("minimal");
    expect(result?.config.agents?.defaults?.thinkingDefault).toBe("off");
    expect(result?.config.agents?.defaults?.reasoningDefault).toBe("off");
    expect(result?.config.agents?.defaults?.model).toEqual({
      primary: "groq/llama-3.1-8b-instant",
    });
    expect(upsertAuthProfile).toHaveBeenCalledWith({
      profileId: "groq:default",
      credential: {
        type: "api_key",
        provider: "groq",
        key: "gsk_test",
      },
      agentDir: "/tmp/vora-test-agent",
    });
  });

  it("preserves explicit non-coding tool profile and thinking defaults for Groq", async () => {
    const prompter = createPrompter({});

    const result = await applyAuthChoiceApiProviders({
      authChoice: "groq-api-key",
      config: {
        agents: {
          defaults: {
            thinkingDefault: "minimal",
            reasoningDefault: "stream",
          },
        },
        tools: { profile: "full" },
      } as VoraConfig,
      prompter: prompter as never,
      runtime: {} as never,
      setDefaultModel: false,
      agentDir: "/tmp/vora-test-agent",
      opts: {
        groqApiKey: "gsk_test_2",
      },
    });

    expect(result).not.toBeNull();
    expect(result?.config.tools?.profile).toBe("full");
    expect(result?.config.agents?.defaults?.thinkingDefault).toBe("minimal");
    expect(result?.config.agents?.defaults?.reasoningDefault).toBe("stream");
  });
});
