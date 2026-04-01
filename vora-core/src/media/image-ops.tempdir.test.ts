import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolvePreferredVoraTmpDir } from "../infra/tmp-vora-dir.js";

describe("image-ops temp dir", () => {
  let createdTempDir = "";

  beforeEach(() => {
    process.env.VORA_IMAGE_BACKEND = "sips";
    const originalMkdtemp = fs.mkdtemp.bind(fs);
    vi.spyOn(fs, "mkdtemp").mockImplementation(async (prefix) => {
      createdTempDir = await originalMkdtemp(prefix);
      return createdTempDir;
    });
  });

  afterEach(() => {
    delete process.env.VORA_IMAGE_BACKEND;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("creates sips temp dirs under the secured Vora tmp root", async () => {
    const { getImageMetadata } = await import("./image-ops.js");
    const secureRoot = resolvePreferredVoraTmpDir();

    await getImageMetadata(Buffer.from("image"));

    expect(fs.mkdtemp).toHaveBeenCalledTimes(1);
    expect(fs.mkdtemp).toHaveBeenCalledWith(path.join(secureRoot, "vora-img-"));
    expect(createdTempDir.startsWith(path.join(secureRoot, "vora-img-"))).toBe(true);
    await expect(fs.access(createdTempDir)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
