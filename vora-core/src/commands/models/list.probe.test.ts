import { describe, expect, it } from "vitest";
import { mapFailoverReasonToProbeStatus, resolveEmbeddedProbeStopError } from "./list.probe.js";

describe("mapFailoverReasonToProbeStatus", () => {
  it("maps auth_permanent to auth", () => {
    expect(mapFailoverReasonToProbeStatus("auth_permanent")).toBe("auth");
  });

  it("keeps existing failover reason mappings", () => {
    expect(mapFailoverReasonToProbeStatus("auth")).toBe("auth");
    expect(mapFailoverReasonToProbeStatus("rate_limit")).toBe("rate_limit");
    expect(mapFailoverReasonToProbeStatus("overloaded")).toBe("rate_limit");
    expect(mapFailoverReasonToProbeStatus("billing")).toBe("billing");
    expect(mapFailoverReasonToProbeStatus("timeout")).toBe("timeout");
    expect(mapFailoverReasonToProbeStatus("format")).toBe("format");
  });

  it("falls back to unknown for unrecognized values", () => {
    expect(mapFailoverReasonToProbeStatus(undefined)).toBe("unknown");
    expect(mapFailoverReasonToProbeStatus(null)).toBe("unknown");
    expect(mapFailoverReasonToProbeStatus("model_not_found")).toBe("unknown");
  });
});

describe("resolveEmbeddedProbeStopError", () => {
  it("returns null when stopReason is not error", () => {
    expect(
      resolveEmbeddedProbeStopError({
        payloads: [{ text: "ok" }],
        meta: { durationMs: 1, stopReason: "completed" },
      }),
    ).toBeNull();
  });

  it("extracts payload text when stopReason=error", () => {
    expect(
      resolveEmbeddedProbeStopError({
        payloads: [{ text: "No API provider registered for api: ollama" }],
        meta: { durationMs: 1, stopReason: "error" },
      }),
    ).toBe("No API provider registered for api: ollama");
  });

  it("falls back to meta.error.message when payload is empty", () => {
    expect(
      resolveEmbeddedProbeStopError({
        payloads: [{ text: "  " }],
        meta: {
          durationMs: 1,
          stopReason: "error",
          error: { kind: "retry_limit", message: "Request timed out" },
        },
      }),
    ).toBe("Request timed out");
  });
});
