import { getRuntimeConfigSnapshot, type VoraConfig } from "../../config/config.js";

export function resolveSkillRuntimeConfig(config?: VoraConfig): VoraConfig | undefined {
  return getRuntimeConfigSnapshot() ?? config;
}
