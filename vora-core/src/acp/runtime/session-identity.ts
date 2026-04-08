import type { SessionAcpIdentity, SessionAcpMeta } from "../../config/sessions/types.js";

export function resolveSessionIdentityFromMeta(
  meta: SessionAcpMeta | null | undefined,
): SessionAcpIdentity | undefined {
  return meta?.identity;
}

export function isSessionIdentityPending(
  identity: SessionAcpIdentity | null | undefined,
): boolean {
  return identity?.state === "pending";
}
