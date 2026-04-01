import type { VoraConfig } from "../../config/types.js";

export type DirectoryConfigParams = {
  cfg: VoraConfig;
  accountId?: string | null;
  query?: string | null;
  limit?: number | null;
};
