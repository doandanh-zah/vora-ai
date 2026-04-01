import { afterEach, describe, expect, it, vi } from "vitest";

type LoggerModule = typeof import("./logger.js");

const originalGetBuiltinModule = (
  process as NodeJS.Process & { getBuiltinModule?: (id: string) => unknown }
).getBuiltinModule;

async function importBrowserSafeLogger(params?: {
  resolvePreferredVoraTmpDir?: ReturnType<typeof vi.fn>;
}): Promise<{
  module: LoggerModule;
  resolvePreferredVoraTmpDir: ReturnType<typeof vi.fn>;
}> {
  vi.resetModules();
  const resolvePreferredVoraTmpDir =
    params?.resolvePreferredVoraTmpDir ??
    vi.fn(() => {
      throw new Error("resolvePreferredVoraTmpDir should not run during browser-safe import");
    });

  vi.doMock("../infra/tmp-vora-dir.js", async () => {
    const actual = await vi.importActual<typeof import("../infra/tmp-vora-dir.js")>(
      "../infra/tmp-vora-dir.js",
    );
    return {
      ...actual,
      resolvePreferredVoraTmpDir,
    };
  });

  Object.defineProperty(process, "getBuiltinModule", {
    configurable: true,
    value: undefined,
  });

  const module = await import("./logger.js");
  return { module, resolvePreferredVoraTmpDir };
}

describe("logging/logger browser-safe import", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("../infra/tmp-vora-dir.js");
    Object.defineProperty(process, "getBuiltinModule", {
      configurable: true,
      value: originalGetBuiltinModule,
    });
  });

  it("does not resolve the preferred temp dir at import time when node fs is unavailable", async () => {
    const { module, resolvePreferredVoraTmpDir } = await importBrowserSafeLogger();

    expect(resolvePreferredVoraTmpDir).not.toHaveBeenCalled();
    expect(module.DEFAULT_LOG_DIR).toBe("/tmp/vora");
    expect(module.DEFAULT_LOG_FILE).toBe("/tmp/vora/vora.log");
  });

  it("disables file logging when imported in a browser-like environment", async () => {
    const { module, resolvePreferredVoraTmpDir } = await importBrowserSafeLogger();

    expect(module.getResolvedLoggerSettings()).toMatchObject({
      level: "silent",
      file: "/tmp/vora/vora.log",
    });
    expect(module.isFileLogLevelEnabled("info")).toBe(false);
    expect(() => module.getLogger().info("browser-safe")).not.toThrow();
    expect(resolvePreferredVoraTmpDir).not.toHaveBeenCalled();
  });
});
