import type { AcpRuntimeError } from "./errors.js";
import { toAcpRuntimeError } from "./errors.js";

export function formatAcpRuntimeErrorText(
  error: Pick<AcpRuntimeError, "message"> | null | undefined,
): string {
  const message = error?.message?.trim();
  return message || "ACP runtime error.";
}

export function toAcpRuntimeErrorText(params: {
  error: unknown;
  fallbackCode: AcpRuntimeError["code"];
  fallbackMessage: string;
}): string {
  return formatAcpRuntimeErrorText(toAcpRuntimeError(params));
}
