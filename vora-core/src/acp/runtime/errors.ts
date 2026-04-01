// VORA V1 STUB: ACP removed
export type AcpRuntimeErrorCode = string;
export class AcpRuntimeError extends Error {
  code: AcpRuntimeErrorCode;
  constructor(code: AcpRuntimeErrorCode, message: string) { super(message); this.code = code; }
}
export function isAcpRuntimeError(err: unknown): err is AcpRuntimeError { return err instanceof AcpRuntimeError; }
export function toAcpRuntimeError(err: unknown): AcpRuntimeError | null { return err instanceof AcpRuntimeError ? err : null; }
