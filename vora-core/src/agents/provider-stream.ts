import type { StreamFn } from "@mariozechner/pi-agent-core";
import { streamSimple, type Api, type Model } from "@mariozechner/pi-ai";
import type { VoraConfig } from "../config/config.js";
import { OLLAMA_LOCAL_AUTH_MARKER } from "./model-auth-markers.js";
import { normalizeProviderId } from "./provider-id.js";
import { resolveProviderStreamFn } from "../plugins/provider-runtime.js";
import { ensureCustomApiRegistered } from "./custom-api-registry.js";

const OLLAMA_PROVIDER_ID = "ollama";
const OLLAMA_OPENAI_COMPAT_API: Api = "openai-completions";
const OLLAMA_NATIVE_BASE_URL = "http://127.0.0.1:11434";

function resolveOllamaCompatBaseUrl(baseUrl?: string): string {
  const trimmed = (baseUrl?.trim() || OLLAMA_NATIVE_BASE_URL).replace(/\/+$/u, "");
  if (!trimmed) {
    return `${OLLAMA_NATIVE_BASE_URL}/v1`;
  }
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

function toOllamaOpenAiCompatModel<TApi extends Api>(model: Model<TApi>): Model<Api> {
  const modelWithApiKey = model as Model<TApi> & { apiKey?: unknown };
  const runtimeApiKey =
    typeof modelWithApiKey.apiKey === "string" && modelWithApiKey.apiKey.trim().length > 0
      ? modelWithApiKey.apiKey
      : OLLAMA_LOCAL_AUTH_MARKER;

  return {
    ...(model as Model<Api>),
    api: OLLAMA_OPENAI_COMPAT_API,
    baseUrl: resolveOllamaCompatBaseUrl(model.baseUrl),
    apiKey: runtimeApiKey,
  };
}

function createBuiltInOllamaCompatStreamFn<TApi extends Api>(model: Model<TApi>): StreamFn | undefined {
  if (normalizeProviderId(model.provider) !== OLLAMA_PROVIDER_ID) {
    return undefined;
  }

  return (runModel, context, options) =>
    streamSimple(toOllamaOpenAiCompatModel(runModel as Model<Api>), context, options);
}

export function registerProviderStreamForModel<TApi extends Api>(params: {
  model: Model<TApi>;
  cfg?: VoraConfig;
  agentDir?: string;
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
}): StreamFn | undefined {
  const streamFn =
    resolveProviderStreamFn({
      provider: params.model.provider,
      config: params.cfg,
      workspaceDir: params.workspaceDir,
      env: params.env,
      context: {
        config: params.cfg,
        agentDir: params.agentDir,
        workspaceDir: params.workspaceDir,
        provider: params.model.provider,
        modelId: params.model.id,
        model: params.model,
      },
    }) ?? createBuiltInOllamaCompatStreamFn(params.model);
  if (!streamFn) {
    return undefined;
  }
  ensureCustomApiRegistered(params.model.api, streamFn);
  return streamFn;
}
