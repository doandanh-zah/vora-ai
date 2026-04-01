import type { VoraConfig } from "../config/config.js";
import type { PluginRuntime } from "./runtime/types.js";
import type { VoraPluginApi, PluginLogger } from "./types.js";

export type BuildPluginApiParams = {
  id: string;
  name: string;
  version?: string;
  description?: string;
  source: string;
  rootDir?: string;
  registrationMode: VoraPluginApi["registrationMode"];
  config: VoraConfig;
  pluginConfig?: Record<string, unknown>;
  runtime: PluginRuntime;
  logger: PluginLogger;
  resolvePath: (input: string) => string;
  handlers?: Partial<
    Pick<
      VoraPluginApi,
      | "registerTool"
      | "registerHook"
      | "registerHttpRoute"
      | "registerChannel"
      | "registerGatewayMethod"
      | "registerCli"
      | "registerService"
      | "registerCliBackend"
      | "registerProvider"
      | "registerSpeechProvider"
      | "registerMediaUnderstandingProvider"
      | "registerImageGenerationProvider"
      | "registerWebSearchProvider"
      | "registerInteractiveHandler"
      | "onConversationBindingResolved"
      | "registerCommand"
      | "registerContextEngine"
      | "registerMemoryPromptSection"
      | "registerMemoryFlushPlan"
      | "registerMemoryRuntime"
      | "registerMemoryEmbeddingProvider"
      | "on"
    >
  >;
};

const noopRegisterTool: VoraPluginApi["registerTool"] = () => {};
const noopRegisterHook: VoraPluginApi["registerHook"] = () => {};
const noopRegisterHttpRoute: VoraPluginApi["registerHttpRoute"] = () => {};
const noopRegisterChannel: VoraPluginApi["registerChannel"] = () => {};
const noopRegisterGatewayMethod: VoraPluginApi["registerGatewayMethod"] = () => {};
const noopRegisterCli: VoraPluginApi["registerCli"] = () => {};
const noopRegisterService: VoraPluginApi["registerService"] = () => {};
const noopRegisterCliBackend: VoraPluginApi["registerCliBackend"] = () => {};
const noopRegisterProvider: VoraPluginApi["registerProvider"] = () => {};
const noopRegisterSpeechProvider: VoraPluginApi["registerSpeechProvider"] = () => {};
const noopRegisterMediaUnderstandingProvider: VoraPluginApi["registerMediaUnderstandingProvider"] =
  () => {};
const noopRegisterImageGenerationProvider: VoraPluginApi["registerImageGenerationProvider"] =
  () => {};
const noopRegisterWebSearchProvider: VoraPluginApi["registerWebSearchProvider"] = () => {};
const noopRegisterInteractiveHandler: VoraPluginApi["registerInteractiveHandler"] = () => {};
const noopOnConversationBindingResolved: VoraPluginApi["onConversationBindingResolved"] =
  () => {};
const noopRegisterCommand: VoraPluginApi["registerCommand"] = () => {};
const noopRegisterContextEngine: VoraPluginApi["registerContextEngine"] = () => {};
const noopRegisterMemoryPromptSection: VoraPluginApi["registerMemoryPromptSection"] = () => {};
const noopRegisterMemoryFlushPlan: VoraPluginApi["registerMemoryFlushPlan"] = () => {};
const noopRegisterMemoryRuntime: VoraPluginApi["registerMemoryRuntime"] = () => {};
const noopRegisterMemoryEmbeddingProvider: VoraPluginApi["registerMemoryEmbeddingProvider"] =
  () => {};
const noopOn: VoraPluginApi["on"] = () => {};

export function buildPluginApi(params: BuildPluginApiParams): VoraPluginApi {
  const handlers = params.handlers ?? {};
  return {
    id: params.id,
    name: params.name,
    version: params.version,
    description: params.description,
    source: params.source,
    rootDir: params.rootDir,
    registrationMode: params.registrationMode,
    config: params.config,
    pluginConfig: params.pluginConfig,
    runtime: params.runtime,
    logger: params.logger,
    registerTool: handlers.registerTool ?? noopRegisterTool,
    registerHook: handlers.registerHook ?? noopRegisterHook,
    registerHttpRoute: handlers.registerHttpRoute ?? noopRegisterHttpRoute,
    registerChannel: handlers.registerChannel ?? noopRegisterChannel,
    registerGatewayMethod: handlers.registerGatewayMethod ?? noopRegisterGatewayMethod,
    registerCli: handlers.registerCli ?? noopRegisterCli,
    registerService: handlers.registerService ?? noopRegisterService,
    registerCliBackend: handlers.registerCliBackend ?? noopRegisterCliBackend,
    registerProvider: handlers.registerProvider ?? noopRegisterProvider,
    registerSpeechProvider: handlers.registerSpeechProvider ?? noopRegisterSpeechProvider,
    registerMediaUnderstandingProvider:
      handlers.registerMediaUnderstandingProvider ?? noopRegisterMediaUnderstandingProvider,
    registerImageGenerationProvider:
      handlers.registerImageGenerationProvider ?? noopRegisterImageGenerationProvider,
    registerWebSearchProvider: handlers.registerWebSearchProvider ?? noopRegisterWebSearchProvider,
    registerInteractiveHandler:
      handlers.registerInteractiveHandler ?? noopRegisterInteractiveHandler,
    onConversationBindingResolved:
      handlers.onConversationBindingResolved ?? noopOnConversationBindingResolved,
    registerCommand: handlers.registerCommand ?? noopRegisterCommand,
    registerContextEngine: handlers.registerContextEngine ?? noopRegisterContextEngine,
    registerMemoryPromptSection:
      handlers.registerMemoryPromptSection ?? noopRegisterMemoryPromptSection,
    registerMemoryFlushPlan: handlers.registerMemoryFlushPlan ?? noopRegisterMemoryFlushPlan,
    registerMemoryRuntime: handlers.registerMemoryRuntime ?? noopRegisterMemoryRuntime,
    registerMemoryEmbeddingProvider:
      handlers.registerMemoryEmbeddingProvider ?? noopRegisterMemoryEmbeddingProvider,
    resolvePath: params.resolvePath,
    on: handlers.on ?? noopOn,
  };
}
