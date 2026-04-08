import { resolveActiveTalkProviderConfig } from "../../config/talk.js";
import type { VoraConfig } from "../../config/types.js";

export { resolveActiveTalkProviderConfig };

export function getRuntimeConfigSnapshot(): VoraConfig | null {
  return null;
}
