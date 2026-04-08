// Narrow plugin-sdk surface for the bundled diffs plugin.
// Keep this list additive and scoped to the bundled diffs surface.

export { definePluginEntry } from "./plugin-entry.js";
export type { VoraConfig } from "../config/config.js";
export { resolvePreferredVoraTmpDir } from "../infra/tmp-vora-dir.js";
export type {
  AnyAgentTool,
  VoraPluginApi,
  VoraPluginConfigSchema,
  VoraPluginToolContext,
  PluginLogger,
} from "../plugins/types.js";
