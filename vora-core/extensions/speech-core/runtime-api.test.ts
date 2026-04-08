import { describe, expect, it } from "vitest";
import { maybeApplyTtsToPayload } from "./runtime-api.js";

describe("speech-core runtime-api stub", () => {
  it("passes through payload objects for non-TTS builds", async () => {
    const payload = { text: "hello", mediaUrl: "https://example.com/audio.mp3" };
    const result = await maybeApplyTtsToPayload({ payload });
    expect(result).toBe(payload);
  });

  it("returns an empty payload object when called without params", async () => {
    const result = await maybeApplyTtsToPayload();
    expect(result).toEqual({});
  });
});

