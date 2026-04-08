import { describe, expect, it } from "vitest";
import { resolveAuthProfileOrder } from "./order.js";
import type { AuthProfileStore } from "./types.js";

describe("resolveAuthProfileOrder", () => {
  it("accepts base-provider credentials for volcengine-plan auth lookup", () => {
    const store: AuthProfileStore = {
      version: 1,
      profiles: {
        "volcengine:default": {
          type: "api_key",
          provider: "volcengine",
          key: "sk-test",
        },
      },
    };

    const order = resolveAuthProfileOrder({
      store,
      provider: "volcengine-plan",
    });

    expect(order).toEqual(["volcengine:default"]);
  });

  it("prefers named openai-codex oauth profiles over :default", () => {
    const now = Date.now();
    const store: AuthProfileStore = {
      version: 1,
      profiles: {
        "openai-codex:default": {
          type: "oauth",
          provider: "openai-codex",
          access: "default-access",
          refresh: "default-refresh",
          expires: now + 60_000,
        },
        "openai-codex:doanzah": {
          type: "oauth",
          provider: "openai-codex",
          access: "email-access",
          refresh: "email-refresh",
          expires: now + 60_000,
        },
      },
      usageStats: {
        "openai-codex:default": { lastUsed: 1 },
        "openai-codex:doanzah": { lastUsed: 2 },
      },
    };

    const order = resolveAuthProfileOrder({
      store,
      provider: "openai-codex",
    });

    expect(order).toEqual(["openai-codex:doanzah", "openai-codex:default"]);
  });
});
