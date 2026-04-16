import { resolveLegacyAuthChoiceAliasesForCli } from "./auth-choice-legacy.js";
import type { AuthChoice, AuthChoiceGroupId } from "./onboard-types.js";

export type { AuthChoiceGroupId };

export type AuthChoiceOption = {
  value: AuthChoice;
  label: string;
  hint?: string;
  groupId?: AuthChoiceGroupId;
  groupLabel?: string;
  groupHint?: string;
};

export type AuthChoiceGroup = {
  value: AuthChoiceGroupId;
  label: string;
  hint?: string;
  options: AuthChoiceOption[];
};

export const CORE_AUTH_CHOICE_OPTIONS: ReadonlyArray<AuthChoiceOption> = [
  {
    value: "openai-codex",
    label: "OpenAI (OAuth)",
    hint: "Sign in with OpenAI OAuth (recommended)",
    groupId: "openai",
    groupLabel: "OpenAI",
    groupHint: "GPT models via OpenAI",
  },
  {
    value: "openai-api-key",
    label: "OpenAI API Key",
    hint: "Use OPENAI_API_KEY",
    groupId: "openai",
    groupLabel: "OpenAI",
    groupHint: "GPT models via OpenAI",
  },
  {
    value: "groq-api-key",
    label: "Groq (Cloud/Fast)",
    hint: "Use Groq's high-speed inference endpoints",
    groupId: "groq",
    groupLabel: "Groq",
    groupHint: "Blazing fast model inference",
  },
  {
    value: "custom-api-key",
    label: "Custom Provider",
    hint: "Any OpenAI or Anthropic compatible endpoint",
    groupId: "custom",
    groupLabel: "Custom Provider",
    groupHint: "Any OpenAI or Anthropic compatible endpoint",
  },
];

export function formatStaticAuthChoiceChoicesForCli(params?: {
  includeSkip?: boolean;
  includeLegacyAliases?: boolean;
  config?: import("../config/config.js").VoraConfig;
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
}): string {
  const includeSkip = params?.includeSkip ?? true;
  const includeLegacyAliases = params?.includeLegacyAliases ?? false;
  const values = CORE_AUTH_CHOICE_OPTIONS.map((opt) => opt.value);

  if (includeSkip) {
    values.push("skip");
  }
  if (includeLegacyAliases) {
    values.push(...resolveLegacyAuthChoiceAliasesForCli(params));
  }

  return values.join("|");
}
