import { describe, expect, it } from "vitest";
import {
  ensureVoraExecMarkerOnProcess,
  markVoraExecEnv,
  VORA_CLI_ENV_VALUE,
  VORA_CLI_ENV_VAR,
} from "./vora-exec-env.js";

describe("markVoraExecEnv", () => {
  it("returns a cloned env object with the exec marker set", () => {
    const env = { PATH: "/usr/bin", VORA_CLI: "0" };
    const marked = markVoraExecEnv(env);

    expect(marked).toEqual({
      PATH: "/usr/bin",
      VORA_CLI: VORA_CLI_ENV_VALUE,
    });
    expect(marked).not.toBe(env);
    expect(env.VORA_CLI).toBe("0");
  });
});

describe("ensureVoraExecMarkerOnProcess", () => {
  it.each([
    {
      name: "mutates and returns the provided process env",
      env: { PATH: "/usr/bin" } as NodeJS.ProcessEnv,
    },
    {
      name: "overwrites an existing marker on the provided process env",
      env: { PATH: "/usr/bin", [VORA_CLI_ENV_VAR]: "0" } as NodeJS.ProcessEnv,
    },
  ])("$name", ({ env }) => {
    expect(ensureVoraExecMarkerOnProcess(env)).toBe(env);
    expect(env[VORA_CLI_ENV_VAR]).toBe(VORA_CLI_ENV_VALUE);
  });

  it("defaults to mutating process.env when no env object is provided", () => {
    const previous = process.env[VORA_CLI_ENV_VAR];
    delete process.env[VORA_CLI_ENV_VAR];

    try {
      expect(ensureVoraExecMarkerOnProcess()).toBe(process.env);
      expect(process.env[VORA_CLI_ENV_VAR]).toBe(VORA_CLI_ENV_VALUE);
    } finally {
      if (previous === undefined) {
        delete process.env[VORA_CLI_ENV_VAR];
      } else {
        process.env[VORA_CLI_ENV_VAR] = previous;
      }
    }
  });
});
