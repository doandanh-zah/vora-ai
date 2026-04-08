import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { bundledDistPluginFile } from "../../test/helpers/bundled-plugin-paths.js";
import { BUNDLED_RUNTIME_SIDECAR_PATHS } from "../plugins/public-artifacts.js";
import { captureEnv } from "../test-utils/env.js";
import {
  canResolveRegistryVersionForPackageTarget,
  collectInstalledGlobalPackageErrors,
  cleanupGlobalRenameDirs,
  detectGlobalInstallManagerByPresence,
  detectGlobalInstallManagerForRoot,
  globalInstallArgs,
  globalInstallFallbackArgs,
  isExplicitPackageInstallSpec,
  isMainPackageTarget,
  VORA_MAIN_PACKAGE_SPEC,
  resolveGlobalPackageRoot,
  resolveGlobalInstallSpec,
  resolveGlobalRoot,
  type CommandRunner,
} from "./update-global.js";

const MATRIX_HELPER_API = bundledDistPluginFile("matrix", "helper-api.js");

describe("update global helpers", () => {
  let envSnapshot: ReturnType<typeof captureEnv> | undefined;

  afterEach(() => {
    envSnapshot?.restore();
    envSnapshot = undefined;
  });

  it("prefers explicit package spec overrides", () => {
    envSnapshot = captureEnv(["VORA_UPDATE_PACKAGE_SPEC"]);
    process.env.VORA_UPDATE_PACKAGE_SPEC = "file:/tmp/vora.tgz";

    expect(resolveGlobalInstallSpec({ packageName: "vora", tag: "latest" })).toBe(
      "file:/tmp/vora.tgz",
    );
    expect(
      resolveGlobalInstallSpec({
        packageName: "vora",
        tag: "beta",
        env: { VORA_UPDATE_PACKAGE_SPEC: "vora@next" },
      }),
    ).toBe("vora@next");
  });

  it("resolves global roots and package roots from runner output", async () => {
    const runCommand: CommandRunner = async (argv) => {
      if (argv[0] === "npm") {
        return { stdout: "/tmp/npm-root\n", stderr: "", code: 0 };
      }
      if (argv[0] === "pnpm") {
        return { stdout: "", stderr: "", code: 1 };
      }
      throw new Error(`unexpected command: ${argv.join(" ")}`);
    };

    await expect(resolveGlobalRoot("npm", runCommand, 1000)).resolves.toBe("/tmp/npm-root");
    await expect(resolveGlobalRoot("pnpm", runCommand, 1000)).resolves.toBeNull();
    await expect(resolveGlobalRoot("bun", runCommand, 1000)).resolves.toContain(
      path.join(".bun", "install", "global", "node_modules"),
    );
    await expect(resolveGlobalPackageRoot("npm", runCommand, 1000)).resolves.toBe(
      path.join("/tmp/npm-root", "vora"),
    );
  });

  it("maps main and explicit install specs for global installs", () => {
    expect(resolveGlobalInstallSpec({ packageName: "vora", tag: "main" })).toBe(
      VORA_MAIN_PACKAGE_SPEC,
    );
    expect(
      resolveGlobalInstallSpec({
        packageName: "vora",
        tag: "github:vora/vora#feature/my-branch",
      }),
    ).toBe("github:vora/vora#feature/my-branch");
    expect(
      resolveGlobalInstallSpec({
        packageName: "vora",
        tag: "https://example.com/vora-main.tgz",
      }),
    ).toBe("https://example.com/vora-main.tgz");
  });

  it("classifies main and raw install specs separately from registry selectors", () => {
    expect(isMainPackageTarget("main")).toBe(true);
    expect(isMainPackageTarget(" MAIN ")).toBe(true);
    expect(isMainPackageTarget("beta")).toBe(false);

    expect(isExplicitPackageInstallSpec("github:vora/vora#main")).toBe(true);
    expect(isExplicitPackageInstallSpec("https://example.com/vora-main.tgz")).toBe(true);
    expect(isExplicitPackageInstallSpec("file:/tmp/vora-main.tgz")).toBe(true);
    expect(isExplicitPackageInstallSpec("beta")).toBe(false);

    expect(canResolveRegistryVersionForPackageTarget("latest")).toBe(true);
    expect(canResolveRegistryVersionForPackageTarget("2026.3.22")).toBe(true);
    expect(canResolveRegistryVersionForPackageTarget("main")).toBe(false);
    expect(canResolveRegistryVersionForPackageTarget("github:vora/vora#main")).toBe(false);
  });

  it("detects install managers from resolved roots and on-disk presence", async () => {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), "vora-update-global-"));
    const npmRoot = path.join(base, "npm-root");
    const pnpmRoot = path.join(base, "pnpm-root");
    const bunRoot = path.join(base, ".bun", "install", "global", "node_modules");
    const pkgRoot = path.join(pnpmRoot, "vora");
    await fs.mkdir(pkgRoot, { recursive: true });
    await fs.mkdir(path.join(npmRoot, "vora"), { recursive: true });
    await fs.mkdir(path.join(bunRoot, "vora"), { recursive: true });

    envSnapshot = captureEnv(["BUN_INSTALL"]);
    process.env.BUN_INSTALL = path.join(base, ".bun");

    const runCommand: CommandRunner = async (argv) => {
      if (argv[0] === "npm") {
        return { stdout: `${npmRoot}\n`, stderr: "", code: 0 };
      }
      if (argv[0] === "pnpm") {
        return { stdout: `${pnpmRoot}\n`, stderr: "", code: 0 };
      }
      throw new Error(`unexpected command: ${argv.join(" ")}`);
    };

    await expect(detectGlobalInstallManagerForRoot(runCommand, pkgRoot, 1000)).resolves.toBe(
      "pnpm",
    );
    await expect(detectGlobalInstallManagerByPresence(runCommand, 1000)).resolves.toBe("npm");

    await fs.rm(path.join(npmRoot, "vora"), { recursive: true, force: true });
    await fs.rm(path.join(pnpmRoot, "vora"), { recursive: true, force: true });
    await expect(detectGlobalInstallManagerByPresence(runCommand, 1000)).resolves.toBe("bun");
  });

  it("builds install argv and npm fallback argv", () => {
    expect(globalInstallArgs("npm", "vora@latest")).toEqual([
      "npm",
      "i",
      "-g",
      "vora@latest",
      "--no-fund",
      "--no-audit",
      "--loglevel=error",
    ]);
    expect(globalInstallArgs("pnpm", "vora@latest")).toEqual([
      "pnpm",
      "add",
      "-g",
      "vora@latest",
    ]);
    expect(globalInstallArgs("bun", "vora@latest")).toEqual([
      "bun",
      "add",
      "-g",
      "vora@latest",
    ]);

    expect(globalInstallFallbackArgs("npm", "vora@latest")).toEqual([
      "npm",
      "i",
      "-g",
      "vora@latest",
      "--omit=optional",
      "--no-fund",
      "--no-audit",
      "--loglevel=error",
    ]);
    expect(globalInstallFallbackArgs("pnpm", "vora@latest")).toBeNull();
  });

  it("cleans only renamed package directories", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "vora-update-cleanup-"));
    await fs.mkdir(path.join(root, ".vora-123"), { recursive: true });
    await fs.mkdir(path.join(root, ".vora-456"), { recursive: true });
    await fs.writeFile(path.join(root, ".vora-file"), "nope", "utf8");
    await fs.mkdir(path.join(root, "vora"), { recursive: true });

    await expect(
      cleanupGlobalRenameDirs({
        globalRoot: root,
        packageName: "vora",
      }),
    ).resolves.toEqual({
      removed: [".vora-123", ".vora-456"],
    });
    await expect(fs.stat(path.join(root, "vora"))).resolves.toBeDefined();
    await expect(fs.stat(path.join(root, ".vora-file"))).resolves.toBeDefined();
  });

  it("checks bundled runtime sidecars, including Matrix helper-api", async () => {
    const packageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "vora-update-global-pkg-"));
    await fs.writeFile(
      path.join(packageRoot, "package.json"),
      JSON.stringify({ name: "vora", version: "1.0.0" }),
      "utf-8",
    );
    for (const relativePath of BUNDLED_RUNTIME_SIDECAR_PATHS) {
      const absolutePath = path.join(packageRoot, relativePath);
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(absolutePath, "export {};\n", "utf-8");
    }

    await expect(collectInstalledGlobalPackageErrors({ packageRoot })).resolves.toEqual([]);

    await fs.rm(path.join(packageRoot, MATRIX_HELPER_API));
    await expect(collectInstalledGlobalPackageErrors({ packageRoot })).resolves.toContain(
      `missing bundled runtime sidecar ${MATRIX_HELPER_API}`,
    );
  });
});
