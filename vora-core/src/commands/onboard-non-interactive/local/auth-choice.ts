import { resolveAgentDir, resolveDefaultAgentId } from "../../../agents/agent-scope.js";
import { upsertAuthProfile } from "../../../agents/auth-profiles.js";
import type { ApiKeyCredential } from "../../../agents/auth-profiles/types.js";
import { OLLAMA_LOCAL_AUTH_MARKER } from "../../../agents/model-auth-markers.js";
import type { VoraConfig } from "../../../config/config.js";
import type { SecretInput } from "../../../config/types.secrets.js";
import { resolveManifestDeprecatedProviderAuthChoice } from "../../../plugins/provider-auth-choices.js";
import { applyAuthProfileConfig } from "../../../plugins/provider-auth-helpers.js";
import { applyPrimaryModel } from "../../../plugins/provider-model-primary.js";
import type { RuntimeEnv } from "../../../runtime.js";
import { resolveDefaultSecretProviderAlias } from "../../../secrets/ref-contract.js";
import {
  formatDeprecatedNonInteractiveAuthChoiceError,
  isDeprecatedAuthChoice,
} from "../../auth-choice-legacy.js";
import { normalizeSecretInputModeInput } from "../../auth-choice.apply-helpers.js";
import {
  discoverOllamaModelIds,
  mergeOllamaProviderConfig,
  normalizeApiKeyTokenProviderAuthChoice,
  normalizeOllamaBaseUrl,
  OLLAMA_DEFAULT_BASE_URL,
  OLLAMA_PROFILE_ID,
} from "../../auth-choice.apply.api-providers.js";
import {
  applyCustomApiConfig,
  CustomApiError,
  parseNonInteractiveCustomApiFlags,
  resolveCustomProviderId,
} from "../../onboard-custom.js";
import type { AuthChoice, OnboardOptions } from "../../onboard-types.js";
import { resolveNonInteractiveApiKey } from "../api-keys.js";
import { applyNonInteractivePluginProviderChoice } from "./auth-choice.plugin-providers.js";

type ResolvedNonInteractiveApiKey = NonNullable<
  Awaited<ReturnType<typeof resolveNonInteractiveApiKey>>
>;

export async function applyNonInteractiveAuthChoice(params: {
  nextConfig: VoraConfig;
  authChoice: AuthChoice;
  opts: OnboardOptions;
  runtime: RuntimeEnv;
  baseConfig: VoraConfig;
}): Promise<VoraConfig | null> {
  const { opts, runtime, baseConfig } = params;
  const authChoice = normalizeApiKeyTokenProviderAuthChoice({
    authChoice: params.authChoice,
    tokenProvider: opts.tokenProvider,
    config: params.nextConfig,
    env: process.env,
  });
  let nextConfig = params.nextConfig;
  const requestedSecretInputMode = normalizeSecretInputModeInput(opts.secretInputMode);
  if (opts.secretInputMode && !requestedSecretInputMode) {
    runtime.error('Invalid --secret-input-mode. Use "plaintext" or "ref".');
    runtime.exit(1);
    return null;
  }
  const toStoredSecretInput = (resolved: ResolvedNonInteractiveApiKey): SecretInput | null => {
    const storePlaintextSecret = requestedSecretInputMode !== "ref"; // pragma: allowlist secret
    if (storePlaintextSecret) {
      return resolved.key;
    }
    if (resolved.source !== "env") {
      return resolved.key;
    }
    if (!resolved.envVarName) {
      runtime.error(
        [
          `Unable to determine which environment variable to store as a ref for provider "${authChoice}".`,
          "Set an explicit provider env var and retry, or use --secret-input-mode plaintext.",
        ].join("\n"),
      );
      runtime.exit(1);
      return null;
    }
    return {
      source: "env",
      provider: resolveDefaultSecretProviderAlias(baseConfig, "env", {
        preferFirstProviderForSource: true,
      }),
      id: resolved.envVarName,
    };
  };
  const resolveApiKey = (input: Parameters<typeof resolveNonInteractiveApiKey>[0]) =>
    resolveNonInteractiveApiKey({
      ...input,
      secretInputMode: requestedSecretInputMode,
    });
  const toApiKeyCredential = (params: {
    provider: string;
    resolved: ResolvedNonInteractiveApiKey;
    email?: string;
    metadata?: Record<string, string>;
  }): ApiKeyCredential | null => {
    const storeSecretRef = requestedSecretInputMode === "ref" && params.resolved.source === "env"; // pragma: allowlist secret
    if (storeSecretRef) {
      if (!params.resolved.envVarName) {
        runtime.error(
          [
            `--secret-input-mode ref requires an explicit environment variable for provider "${params.provider}".`,
            "Set the provider API key env var and retry, or use --secret-input-mode plaintext.",
          ].join("\n"),
        );
        runtime.exit(1);
        return null;
      }
      return {
        type: "api_key",
        provider: params.provider,
        keyRef: {
          source: "env",
          provider: resolveDefaultSecretProviderAlias(baseConfig, "env", {
            preferFirstProviderForSource: true,
          }),
          id: params.resolved.envVarName,
        },
        ...(params.email ? { email: params.email } : {}),
        ...(params.metadata ? { metadata: params.metadata } : {}),
      };
    }
    return {
      type: "api_key",
      provider: params.provider,
      key: params.resolved.key,
      ...(params.email ? { email: params.email } : {}),
      ...(params.metadata ? { metadata: params.metadata } : {}),
    };
  };
  if (isDeprecatedAuthChoice(authChoice, { config: nextConfig, env: process.env })) {
    runtime.error(
      formatDeprecatedNonInteractiveAuthChoiceError(authChoice, {
        config: nextConfig,
        env: process.env,
      })!,
    );
    runtime.exit(1);
    return null;
  }

  if (authChoice === "setup-token") {
    runtime.error(
      [
        'Auth choice "setup-token" requires interactive mode.',
        'Use "--auth-choice token" with --token and --token-provider anthropic.',
      ].join("\n"),
    );
    runtime.exit(1);
    return null;
  }

  const pluginProviderChoice = await applyNonInteractivePluginProviderChoice({
    nextConfig,
    authChoice,
    opts,
    runtime,
    baseConfig,
    resolveApiKey: (input) =>
      resolveApiKey({
        ...input,
        cfg: baseConfig,
        runtime,
      }),
    toApiKeyCredential,
  });
  if (pluginProviderChoice !== undefined) {
    return pluginProviderChoice;
  }

  const deprecatedChoice = resolveManifestDeprecatedProviderAuthChoice(authChoice as string, {
    config: nextConfig,
    env: process.env,
  });
  if (deprecatedChoice) {
    runtime.error(
      `"${authChoice as string}" is no longer supported. Use --auth-choice ${deprecatedChoice.choiceId} instead.`,
    );
    runtime.exit(1);
    return null;
  }

  if (authChoice === "custom-api-key") {
    try {
      const customAuth = parseNonInteractiveCustomApiFlags({
        baseUrl: opts.customBaseUrl,
        modelId: opts.customModelId,
        compatibility: opts.customCompatibility,
        apiKey: opts.customApiKey,
        providerId: opts.customProviderId,
      });
      const resolvedProviderId = resolveCustomProviderId({
        config: nextConfig,
        baseUrl: customAuth.baseUrl,
        providerId: customAuth.providerId,
      });
      const resolvedCustomApiKey = await resolveApiKey({
        provider: resolvedProviderId.providerId,
        cfg: baseConfig,
        flagValue: customAuth.apiKey,
        flagName: "--custom-api-key",
        envVar: "CUSTOM_API_KEY",
        envVarName: "CUSTOM_API_KEY",
        runtime,
        required: false,
      });
      let customApiKeyInput: SecretInput | undefined;
      if (resolvedCustomApiKey) {
        const storeCustomApiKeyAsRef = requestedSecretInputMode === "ref"; // pragma: allowlist secret
        if (storeCustomApiKeyAsRef) {
          const stored = toStoredSecretInput(resolvedCustomApiKey);
          if (!stored) {
            return null;
          }
          customApiKeyInput = stored;
        } else {
          customApiKeyInput = resolvedCustomApiKey.key;
        }
      }
      const result = applyCustomApiConfig({
        config: nextConfig,
        baseUrl: customAuth.baseUrl,
        modelId: customAuth.modelId,
        compatibility: customAuth.compatibility,
        apiKey: customApiKeyInput,
        providerId: customAuth.providerId,
      });
      if (result.providerIdRenamedFrom && result.providerId) {
        runtime.log(
          `Custom provider ID "${result.providerIdRenamedFrom}" already exists for a different base URL. Using "${result.providerId}".`,
        );
      }
      return result.config;
    } catch (err) {
      if (err instanceof CustomApiError) {
        switch (err.code) {
          case "missing_required":
          case "invalid_compatibility":
            runtime.error(err.message);
            break;
          default:
            runtime.error(`Invalid custom provider config: ${err.message}`);
            break;
        }
        runtime.exit(1);
        return null;
      }
      const reason = err instanceof Error ? err.message : String(err);
      runtime.error(`Invalid custom provider config: ${reason}`);
      runtime.exit(1);
      return null;
    }
  }

  if (authChoice === "ollama") {
    const baseUrl = normalizeOllamaBaseUrl(opts.customBaseUrl ?? OLLAMA_DEFAULT_BASE_URL);
    let modelId = opts.customModelId?.trim();
    if (!modelId) {
      try {
        modelId = (await discoverOllamaModelIds(baseUrl))[0];
      } catch {
        modelId = undefined;
      }
    }
    if (!modelId) {
      runtime.error(
        [
          'Auth choice "ollama" requires a local Ollama model.',
          "Run `ollama serve`, pull a model such as `ollama pull qwen3:4b`, then retry.",
          "Non-interactive fallback: pass --custom-model-id <model>.",
        ].join("\n"),
      );
      runtime.exit(1);
      return null;
    }

    const resolvedAgentId = resolveDefaultAgentId(nextConfig);
    const agentDir = resolveAgentDir(nextConfig, resolvedAgentId, process.env);
    upsertAuthProfile({
      profileId: OLLAMA_PROFILE_ID,
      credential: {
        type: "api_key",
        provider: "ollama",
        key: OLLAMA_LOCAL_AUTH_MARKER,
      },
      agentDir,
    });

    nextConfig = mergeOllamaProviderConfig({
      config: nextConfig,
      baseUrl,
      modelId,
    });
    nextConfig = applyAuthProfileConfig(nextConfig, {
      profileId: OLLAMA_PROFILE_ID,
      provider: "ollama",
      mode: "api_key",
    });
    nextConfig = applyPrimaryModel(nextConfig, `ollama/${modelId}`);
    return nextConfig;
  }

  if (
    authChoice === "oauth" ||
    authChoice === "chutes" ||
    authChoice === "minimax-global-oauth" ||
    authChoice === "minimax-cn-oauth"
  ) {
    runtime.error("OAuth requires interactive mode.");
    runtime.exit(1);
    return null;
  }

  return nextConfig;
}
