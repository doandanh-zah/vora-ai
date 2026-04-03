import type { Model } from "@mariozechner/pi-ai";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const resolveProviderStreamFn = vi.fn();
const ensureCustomApiRegistered = vi.fn();
const streamSimple = vi.fn();

vi.mock("../plugins/provider-runtime.js", () => ({
  resolveProviderStreamFn,
}));

vi.mock("./custom-api-registry.js", () => ({
  ensureCustomApiRegistered,
}));

vi.mock("@mariozechner/pi-ai", async () => {
  const actual = await vi.importActual<typeof import("@mariozechner/pi-ai")>("@mariozechner/pi-ai");
  return {
    ...actual,
    streamSimple,
  };
});

let registerProviderStreamForModel: typeof import("./provider-stream.js").registerProviderStreamForModel;

function createModel<TApi extends string>(params: {
  api: TApi;
  provider: string;
  baseUrl?: string;
}): Model<TApi> {
  return {
    id: "test-model",
    name: "Test model",
    api: params.api,
    provider: params.provider,
    baseUrl: params.baseUrl,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 8192,
    maxTokens: 4096,
  } as Model<TApi>;
}

describe("registerProviderStreamForModel", () => {
  beforeAll(async () => {
    ({ registerProviderStreamForModel } = await import("./provider-stream.js"));
  });

  beforeEach(() => {
    resolveProviderStreamFn.mockReset();
    ensureCustomApiRegistered.mockReset();
    streamSimple.mockReset();
  });

  it("prefers provider plugin stream when available", () => {
    const pluginStream = vi.fn();
    resolveProviderStreamFn.mockReturnValueOnce(pluginStream);
    const model = createModel({
      api: "ollama",
      provider: "ollama",
      baseUrl: "http://127.0.0.1:11434",
    });

    const result = registerProviderStreamForModel({ model });

    expect(result).toBe(pluginStream);
    expect(ensureCustomApiRegistered).toHaveBeenCalledWith("ollama", pluginStream);
    expect(streamSimple).not.toHaveBeenCalled();
  });

  it("falls back to built-in Ollama OpenAI-compatible transport when plugin stream is missing", () => {
    resolveProviderStreamFn.mockReturnValueOnce(undefined);
    streamSimple.mockReturnValueOnce("ok");
    const model = createModel({
      api: "ollama",
      provider: "ollama",
      baseUrl: "http://ollama-host:11434",
    });

    const result = registerProviderStreamForModel({ model });

    expect(result).toBeTypeOf("function");
    expect(ensureCustomApiRegistered).toHaveBeenCalledWith("ollama", expect.any(Function));

    result?.(model as never, { messages: [] } as never, {} as never);

    expect(streamSimple).toHaveBeenCalledTimes(1);
    expect(streamSimple).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "ollama",
        api: "openai-completions",
        baseUrl: "http://ollama-host:11434/v1",
        apiKey: "ollama-local",
      }),
      expect.anything(),
      expect.anything(),
    );
  });

  it("preserves explicit model apiKey when using built-in Ollama fallback transport", () => {
    resolveProviderStreamFn.mockReturnValueOnce(undefined);
    streamSimple.mockReturnValueOnce("ok");
    const model = createModel({
      api: "ollama",
      provider: "ollama",
      baseUrl: "http://127.0.0.1:11434",
    }) as Model<"ollama"> & { apiKey?: string };
    model.apiKey = "custom-ollama-key";

    const result = registerProviderStreamForModel({ model });

    expect(result).toBeTypeOf("function");
    result?.(model as never, { messages: [] } as never, {} as never);

    expect(streamSimple).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "ollama",
        api: "openai-completions",
        baseUrl: "http://127.0.0.1:11434/v1",
        apiKey: "custom-ollama-key",
      }),
      expect.anything(),
      expect.anything(),
    );
  });

  it("returns undefined when no provider stream exists for non-ollama providers", () => {
    resolveProviderStreamFn.mockReturnValueOnce(undefined);
    const model = createModel({
      api: "openai-completions",
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
    });

    const result = registerProviderStreamForModel({ model });

    expect(result).toBeUndefined();
    expect(ensureCustomApiRegistered).not.toHaveBeenCalled();
    expect(streamSimple).not.toHaveBeenCalled();
  });
});
