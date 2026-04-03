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
}) {
  const text = vi.fn();
  for (const value of params.text ?? []) {
    text.mockResolvedValueOnce(value);
  }
  const select = vi.fn();
  for (const value of params.select ?? []) {
    select.mockResolvedValueOnce(value);
  }
  const note = vi.fn(async () => {});
  return {
    intro: vi.fn(async () => {}),
    outro: vi.fn(async () => {}),
    note,
    select,
    multiselect: vi.fn(async () => []),
    text,
    confirm: vi.fn(async () => true),
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
});
