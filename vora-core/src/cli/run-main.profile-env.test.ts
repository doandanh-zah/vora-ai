import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fileState = vi.hoisted(() => ({
  hasCliDotEnv: false,
}));

const dotenvState = vi.hoisted(() => {
  const state = {
    profileAtDotenvLoad: undefined as string | undefined,
    containerAtDotenvLoad: undefined as string | undefined,
  };
  return {
    state,
    loadDotEnv: vi.fn(() => {
      state.profileAtDotenvLoad = process.env.VORA_PROFILE;
      state.containerAtDotenvLoad = process.env.VORA_CONTAINER;
    }),
  };
});

const maybeRunCliInContainerMock = vi.hoisted(() =>
  vi.fn((argv: string[]) => ({ handled: false, argv })),
);

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  type ExistsSyncPath = Parameters<typeof actual.existsSync>[0];
  return {
    ...actual,
    existsSync: vi.fn((target: ExistsSyncPath) => {
      if (typeof target === "string" && target.endsWith(".env")) {
        return fileState.hasCliDotEnv;
      }
      return actual.existsSync(target);
    }),
  };
});

vi.mock("./dotenv.js", () => ({
  loadCliDotEnv: dotenvState.loadDotEnv,
}));

vi.mock("../infra/env.js", () => ({
  normalizeEnv: vi.fn(),
}));

vi.mock("../infra/runtime-guard.js", () => ({
  assertSupportedRuntime: vi.fn(),
}));

vi.mock("../infra/path-env.js", () => ({
  ensureVoraCliOnPath: vi.fn(),
}));

vi.mock("./route.js", () => ({
  tryRouteCli: vi.fn(async () => true),
}));

vi.mock("./windows-argv.js", () => ({
  normalizeWindowsArgv: (argv: string[]) => argv,
}));

vi.mock("./container-target.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./container-target.js")>();
  return {
    ...actual,
    maybeRunCliInContainer: maybeRunCliInContainerMock,
  };
});

import { runCli } from "./run-main.js";

describe("runCli profile env bootstrap", () => {
  const originalProfile = process.env.VORA_PROFILE;
  const originalStateDir = process.env.VORA_STATE_DIR;
  const originalConfigPath = process.env.VORA_CONFIG_PATH;
  const originalContainer = process.env.VORA_CONTAINER;
  const originalGatewayPort = process.env.VORA_GATEWAY_PORT;
  const originalGatewayUrl = process.env.VORA_GATEWAY_URL;
  const originalGatewayToken = process.env.VORA_GATEWAY_TOKEN;
  const originalGatewayPassword = process.env.VORA_GATEWAY_PASSWORD;

  beforeEach(() => {
    delete process.env.VORA_PROFILE;
    delete process.env.VORA_STATE_DIR;
    delete process.env.VORA_CONFIG_PATH;
    delete process.env.VORA_CONTAINER;
    delete process.env.VORA_GATEWAY_PORT;
    delete process.env.VORA_GATEWAY_URL;
    delete process.env.VORA_GATEWAY_TOKEN;
    delete process.env.VORA_GATEWAY_PASSWORD;
    dotenvState.state.profileAtDotenvLoad = undefined;
    dotenvState.state.containerAtDotenvLoad = undefined;
    dotenvState.loadDotEnv.mockClear();
    maybeRunCliInContainerMock.mockClear();
    fileState.hasCliDotEnv = false;
  });

  afterEach(() => {
    if (originalProfile === undefined) {
      delete process.env.VORA_PROFILE;
    } else {
      process.env.VORA_PROFILE = originalProfile;
    }
    if (originalContainer === undefined) {
      delete process.env.VORA_CONTAINER;
    } else {
      process.env.VORA_CONTAINER = originalContainer;
    }
    if (originalStateDir === undefined) {
      delete process.env.VORA_STATE_DIR;
    } else {
      process.env.VORA_STATE_DIR = originalStateDir;
    }
    if (originalConfigPath === undefined) {
      delete process.env.VORA_CONFIG_PATH;
    } else {
      process.env.VORA_CONFIG_PATH = originalConfigPath;
    }
    if (originalGatewayPort === undefined) {
      delete process.env.VORA_GATEWAY_PORT;
    } else {
      process.env.VORA_GATEWAY_PORT = originalGatewayPort;
    }
    if (originalGatewayUrl === undefined) {
      delete process.env.VORA_GATEWAY_URL;
    } else {
      process.env.VORA_GATEWAY_URL = originalGatewayUrl;
    }
    if (originalGatewayToken === undefined) {
      delete process.env.VORA_GATEWAY_TOKEN;
    } else {
      process.env.VORA_GATEWAY_TOKEN = originalGatewayToken;
    }
    if (originalGatewayPassword === undefined) {
      delete process.env.VORA_GATEWAY_PASSWORD;
    } else {
      process.env.VORA_GATEWAY_PASSWORD = originalGatewayPassword;
    }
  });

  it("applies --profile before dotenv loading", async () => {
    fileState.hasCliDotEnv = true;
    await runCli(["node", "vora", "--profile", "rawdog", "status"]);

    expect(dotenvState.loadDotEnv).toHaveBeenCalledOnce();
    expect(dotenvState.state.profileAtDotenvLoad).toBe("rawdog");
    expect(process.env.VORA_PROFILE).toBe("rawdog");
  });

  it("rejects --container combined with --profile", async () => {
    await expect(
      runCli(["node", "vora", "--container", "demo", "--profile", "rawdog", "status"]),
    ).rejects.toThrow("--container cannot be combined with --profile/--dev");

    expect(dotenvState.loadDotEnv).not.toHaveBeenCalled();
    expect(process.env.VORA_PROFILE).toBe("rawdog");
  });

  it("rejects --container combined with interleaved --profile", async () => {
    await expect(
      runCli(["node", "vora", "status", "--container", "demo", "--profile", "rawdog"]),
    ).rejects.toThrow("--container cannot be combined with --profile/--dev");
  });

  it("rejects --container combined with interleaved --dev", async () => {
    await expect(
      runCli(["node", "vora", "status", "--container", "demo", "--dev"]),
    ).rejects.toThrow("--container cannot be combined with --profile/--dev");
  });

  it("does not let dotenv change container target resolution", async () => {
    fileState.hasCliDotEnv = true;
    dotenvState.loadDotEnv.mockImplementationOnce(() => {
      process.env.VORA_CONTAINER = "demo";
      dotenvState.state.profileAtDotenvLoad = process.env.VORA_PROFILE;
      dotenvState.state.containerAtDotenvLoad = process.env.VORA_CONTAINER;
    });

    await runCli(["node", "vora", "status"]);

    expect(dotenvState.loadDotEnv).toHaveBeenCalledOnce();
    expect(process.env.VORA_CONTAINER).toBe("demo");
    expect(dotenvState.state.containerAtDotenvLoad).toBe("demo");
    expect(maybeRunCliInContainerMock).toHaveBeenCalledWith(["node", "vora", "status"]);
    expect(maybeRunCliInContainerMock).toHaveReturnedWith({
      handled: false,
      argv: ["node", "vora", "status"],
    });
  });

  it("allows container mode when VORA_PROFILE is already set in env", async () => {
    process.env.VORA_PROFILE = "work";

    await expect(
      runCli(["node", "vora", "--container", "demo", "status"]),
    ).resolves.toBeUndefined();
  });

  it.each([
    ["VORA_GATEWAY_PORT", "19001"],
    ["VORA_GATEWAY_URL", "ws://127.0.0.1:18789"],
    ["VORA_GATEWAY_TOKEN", "demo-token"],
    ["VORA_GATEWAY_PASSWORD", "demo-password"],
  ])("allows container mode when %s is set in env", async (key, value) => {
    process.env[key] = value;

    await expect(
      runCli(["node", "vora", "--container", "demo", "status"]),
    ).resolves.toBeUndefined();
  });

  it("allows container mode when only VORA_STATE_DIR is set in env", async () => {
    process.env.VORA_STATE_DIR = "/tmp/vora-host-state";

    await expect(
      runCli(["node", "vora", "--container", "demo", "status"]),
    ).resolves.toBeUndefined();
  });

  it("allows container mode when only VORA_CONFIG_PATH is set in env", async () => {
    process.env.VORA_CONFIG_PATH = "/tmp/vora-host-state/vora.json";

    await expect(
      runCli(["node", "vora", "--container", "demo", "status"]),
    ).resolves.toBeUndefined();
  });
});
