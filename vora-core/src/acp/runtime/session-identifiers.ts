import type { SessionAcpIdentity, SessionAcpMeta } from "../../config/sessions/types.js";

export const ACP_SESSION_IDENTITY_RENDERER_VERSION = 1;

function appendIdentifierLine(lines: string[], label: string, value: string | undefined): void {
  const trimmed = value?.trim();
  if (!trimmed) {
    return;
  }
  lines.push(`${label}: ${trimmed}`);
}

export function resolveAcpSessionIdentifierLinesFromIdentity(params: {
  backend?: string;
  identity?: SessionAcpIdentity | null;
}): string[] {
  const identity = params.identity;
  if (!identity) {
    return [];
  }

  const lines: string[] = [];
  appendIdentifierLine(lines, "agent session id", identity.agentSessionId);
  appendIdentifierLine(lines, "acpx session id", identity.acpxSessionId);
  appendIdentifierLine(lines, "acpx record id", identity.acpxRecordId);
  return lines;
}

export function resolveAcpThreadSessionDetailLines(params: {
  sessionKey?: string;
  meta?: SessionAcpMeta | null;
}): string[] {
  return resolveAcpSessionIdentifierLinesFromIdentity({
    backend: params.meta?.backend,
    identity: params.meta?.identity,
  });
}

export function resolveAcpSessionCwd(meta: SessionAcpMeta | null | undefined): string | undefined {
  const runtimeCwd = meta?.runtimeOptions?.cwd?.trim();
  if (runtimeCwd) {
    return runtimeCwd;
  }
  const cwd = meta?.cwd?.trim();
  return cwd || undefined;
}
