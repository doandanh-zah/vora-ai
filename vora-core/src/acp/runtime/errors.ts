export type AcpRuntimeErrorCode = string;

export class AcpRuntimeError extends Error {
  code: AcpRuntimeErrorCode;

  constructor(code: AcpRuntimeErrorCode, message: string) {
    super(message);
    this.name = "AcpRuntimeError";
    this.code = code;
  }
}

export function isAcpRuntimeError(err: unknown): err is AcpRuntimeError {
  return err instanceof AcpRuntimeError;
}

type ToAcpRuntimeErrorParams = {
  error: unknown;
  fallbackCode: AcpRuntimeErrorCode;
  fallbackMessage: string;
};

function extractMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  return fallbackMessage;
}

export function toAcpRuntimeError(params: ToAcpRuntimeErrorParams | unknown): AcpRuntimeError {
  if (params instanceof AcpRuntimeError) {
    return params;
  }
  if (typeof params === "object" && params !== null && "error" in params) {
    const typed = params as ToAcpRuntimeErrorParams;
    if (typed.error instanceof AcpRuntimeError) {
      return typed.error;
    }
    return new AcpRuntimeError(
      typed.fallbackCode,
      extractMessage(typed.error, typed.fallbackMessage),
    );
  }
  return new AcpRuntimeError("ACP_TURN_FAILED", extractMessage(params, "ACP runtime error."));
}
