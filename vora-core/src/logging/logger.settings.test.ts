import { describe, expect, it } from "vitest";
import { __test__ } from "./logger.js";

describe("shouldSkipMutatingLoggingConfigRead", () => {
  it("matches config schema and validate invocations", () => {
    expect(
      __test__.shouldSkipMutatingLoggingConfigRead(["node", "vora", "config", "schema"]),
    ).toBe(true);
    expect(
      __test__.shouldSkipMutatingLoggingConfigRead(["node", "vora", "config", "validate"]),
    ).toBe(true);
  });

  it("handles root flags before config validate", () => {
    expect(
      __test__.shouldSkipMutatingLoggingConfigRead([
        "node",
        "vora",
        "--profile",
        "work",
        "--no-color",
        "config",
        "validate",
        "--json",
      ]),
    ).toBe(true);
  });

  it("does not match other commands", () => {
    expect(
      __test__.shouldSkipMutatingLoggingConfigRead(["node", "vora", "config", "get", "foo"]),
    ).toBe(false);
    expect(__test__.shouldSkipMutatingLoggingConfigRead(["node", "vora", "status"])).toBe(
      false,
    );
  });
});
