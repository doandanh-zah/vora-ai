import { createConfigIO, getRuntimeConfigSnapshot, type VoraConfig } from "../config/config.js";

export function loadBrowserConfigForRuntimeRefresh(): VoraConfig {
  return getRuntimeConfigSnapshot() ?? createConfigIO().loadConfig();
}
