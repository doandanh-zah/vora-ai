import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatCliCommand } from "./command-format.js";
import { applyCliProfileEnv, parseCliProfileArgs } from "./profile.js";

describe("parseCliProfileArgs", () => {
  it("leaves gateway --dev for subcommands", () => {
    const res = parseCliProfileArgs([
      "node",
      "vora",
      "gateway",
      "--dev",
      "--allow-unconfigured",
    ]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBeNull();
    expect(res.argv).toEqual(["node", "vora", "gateway", "--dev", "--allow-unconfigured"]);
  });

  it("leaves gateway --dev for subcommands after leading root options", () => {
    const res = parseCliProfileArgs([
      "node",
      "vora",
      "--no-color",
      "gateway",
      "--dev",
      "--allow-unconfigured",
    ]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBeNull();
    expect(res.argv).toEqual([
      "node",
      "vora",
      "--no-color",
      "gateway",
      "--dev",
      "--allow-unconfigured",
    ]);
  });

  it("still accepts global --dev before subcommand", () => {
    const res = parseCliProfileArgs(["node", "vora", "--dev", "gateway"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("dev");
    expect(res.argv).toEqual(["node", "vora", "gateway"]);
  });

  it("parses --profile value and strips it", () => {
    const res = parseCliProfileArgs(["node", "vora", "--profile", "work", "status"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("work");
    expect(res.argv).toEqual(["node", "vora", "status"]);
  });

  it("parses interleaved --profile after the command token", () => {
    const res = parseCliProfileArgs(["node", "vora", "status", "--profile", "work", "--deep"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("work");
    expect(res.argv).toEqual(["node", "vora", "status", "--deep"]);
  });

  it("parses interleaved --dev after the command token", () => {
    const res = parseCliProfileArgs(["node", "vora", "status", "--dev"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("dev");
    expect(res.argv).toEqual(["node", "vora", "status"]);
  });

  it("rejects missing profile value", () => {
    const res = parseCliProfileArgs(["node", "vora", "--profile"]);
    expect(res.ok).toBe(false);
  });

  it.each([
    ["--dev first", ["node", "vora", "--dev", "--profile", "work", "status"]],
    ["--profile first", ["node", "vora", "--profile", "work", "--dev", "status"]],
    ["interleaved after command", ["node", "vora", "status", "--profile", "work", "--dev"]],
  ])("rejects combining --dev with --profile (%s)", (_name, argv) => {
    const res = parseCliProfileArgs(argv);
    expect(res.ok).toBe(false);
  });
});

describe("applyCliProfileEnv", () => {
  it("fills env defaults for dev profile", () => {
    const env: Record<string, string | undefined> = {};
    applyCliProfileEnv({
      profile: "dev",
      env,
      homedir: () => "/home/peter",
    });
    const expectedStateDir = path.join(path.resolve("/home/peter"), ".vora-dev");
    expect(env.VORA_PROFILE).toBe("dev");
    expect(env.VORA_STATE_DIR).toBe(expectedStateDir);
    expect(env.VORA_CONFIG_PATH).toBe(path.join(expectedStateDir, "vora.json"));
    expect(env.VORA_GATEWAY_PORT).toBe("19001");
  });

  it("does not override explicit env values", () => {
    const env: Record<string, string | undefined> = {
      VORA_STATE_DIR: "/custom",
      VORA_GATEWAY_PORT: "19099",
    };
    applyCliProfileEnv({
      profile: "dev",
      env,
      homedir: () => "/home/peter",
    });
    expect(env.VORA_STATE_DIR).toBe("/custom");
    expect(env.VORA_GATEWAY_PORT).toBe("19099");
    expect(env.VORA_CONFIG_PATH).toBe(path.join("/custom", "vora.json"));
  });

  it("uses VORA_HOME when deriving profile state dir", () => {
    const env: Record<string, string | undefined> = {
      VORA_HOME: "/srv/vora-home",
      HOME: "/home/other",
    };
    applyCliProfileEnv({
      profile: "work",
      env,
      homedir: () => "/home/fallback",
    });

    const resolvedHome = path.resolve("/srv/vora-home");
    expect(env.VORA_STATE_DIR).toBe(path.join(resolvedHome, ".vora-work"));
    expect(env.VORA_CONFIG_PATH).toBe(
      path.join(resolvedHome, ".vora-work", "vora.json"),
    );
  });
});

describe("formatCliCommand", () => {
  it.each([
    {
      name: "no profile is set",
      cmd: "vora doctor --fix",
      env: {},
      expected: "vora doctor --fix",
    },
    {
      name: "profile is default",
      cmd: "vora doctor --fix",
      env: { VORA_PROFILE: "default" },
      expected: "vora doctor --fix",
    },
    {
      name: "profile is Default (case-insensitive)",
      cmd: "vora doctor --fix",
      env: { VORA_PROFILE: "Default" },
      expected: "vora doctor --fix",
    },
    {
      name: "profile is invalid",
      cmd: "vora doctor --fix",
      env: { VORA_PROFILE: "bad profile" },
      expected: "vora doctor --fix",
    },
    {
      name: "--profile is already present",
      cmd: "vora --profile work doctor --fix",
      env: { VORA_PROFILE: "work" },
      expected: "vora --profile work doctor --fix",
    },
    {
      name: "--dev is already present",
      cmd: "vora --dev doctor",
      env: { VORA_PROFILE: "dev" },
      expected: "vora --dev doctor",
    },
  ])("returns command unchanged when $name", ({ cmd, env, expected }) => {
    expect(formatCliCommand(cmd, env)).toBe(expected);
  });

  it("inserts --profile flag when profile is set", () => {
    expect(formatCliCommand("vora doctor --fix", { VORA_PROFILE: "work" })).toBe(
      "vora --profile work doctor --fix",
    );
  });

  it("trims whitespace from profile", () => {
    expect(formatCliCommand("vora doctor --fix", { VORA_PROFILE: "  jbvora  " })).toBe(
      "vora --profile jbvora doctor --fix",
    );
  });

  it("handles command with no args after vora", () => {
    expect(formatCliCommand("vora", { VORA_PROFILE: "test" })).toBe(
      "vora --profile test",
    );
  });

  it("handles pnpm wrapper", () => {
    expect(formatCliCommand("pnpm vora doctor", { VORA_PROFILE: "work" })).toBe(
      "pnpm vora --profile work doctor",
    );
  });

  it("inserts --container when a container hint is set", () => {
    expect(
      formatCliCommand("vora gateway status --deep", { VORA_CONTAINER_HINT: "demo" }),
    ).toBe("vora --container demo gateway status --deep");
  });

  it("preserves both --container and --profile hints", () => {
    expect(
      formatCliCommand("vora doctor", {
        VORA_CONTAINER_HINT: "demo",
        VORA_PROFILE: "work",
      }),
    ).toBe("vora --container demo doctor");
  });

  it("does not prepend --container for update commands", () => {
    expect(formatCliCommand("vora update", { VORA_CONTAINER_HINT: "demo" })).toBe(
      "vora update",
    );
    expect(
      formatCliCommand("pnpm vora update --channel beta", { VORA_CONTAINER_HINT: "demo" }),
    ).toBe("pnpm vora update --channel beta");
  });
});
