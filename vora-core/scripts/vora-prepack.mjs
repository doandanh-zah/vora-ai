#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const REQUIRED_FILES = ["dist/index.js", "dist/build-info.json"];
const ENTRY_CANDIDATES = ["dist/entry.js", "dist/entry.mjs"];
const PACKAGE_JSON_PATH = "package.json";

const fileExists = (relativePath) => {
  try {
    const absolutePath = path.resolve(process.cwd(), relativePath);
    return fs.statSync(absolutePath).isFile();
  } catch {
    return false;
  }
};

const readJsonFile = (relativePath) => {
  try {
    const absolutePath = path.resolve(process.cwd(), relativePath);
    return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  } catch {
    return null;
  }
};

const readTrimmedVersion = (value) => (typeof value === "string" ? value.trim() : "");

const autoGenerateBuildInfo = () => {
  if (!fileExists("dist/index.js")) {
    return null;
  }
  const hasEntry = ENTRY_CANDIDATES.some((relativePath) => fileExists(relativePath));
  if (!hasEntry || fileExists("dist/build-info.json")) {
    return null;
  }
  const run = spawnSync("node", ["--import", "tsx", "scripts/write-build-info.ts"], {
    cwd: process.cwd(),
    stdio: "inherit",
  });
  if (run.status === 0) {
    return null;
  }
  return "Failed auto-generating dist/build-info.json via scripts/write-build-info.ts.";
};

const buildInfoGenerationIssue = autoGenerateBuildInfo();
const missingRequired = REQUIRED_FILES.filter((relativePath) => !fileExists(relativePath));
const hasEntry = ENTRY_CANDIDATES.some((relativePath) => fileExists(relativePath));
const packageJson = readJsonFile(PACKAGE_JSON_PATH);
const packageVersion = readTrimmedVersion(packageJson?.version);
const buildInfo = readJsonFile("dist/build-info.json");
const buildInfoVersion = readTrimmedVersion(buildInfo?.version);

const metadataIssues = [];
if (buildInfoGenerationIssue) {
  metadataIssues.push(buildInfoGenerationIssue);
}
if (missingRequired.length === 0) {
  if (!buildInfoVersion) {
    metadataIssues.push("dist/build-info.json is missing a non-empty \"version\" field.");
  }
  if (packageVersion && buildInfoVersion && packageVersion !== buildInfoVersion) {
    metadataIssues.push(
      `dist/build-info.json version (${buildInfoVersion}) does not match package.json version (${packageVersion}).`,
    );
  }
}

if (missingRequired.length === 0 && hasEntry && metadataIssues.length === 0) {
  process.exit(0);
}

const lines = ["[vora-prepack] Missing build output required for npm package:"];
for (const relativePath of missingRequired) {
  lines.push(`  - ${relativePath}`);
}
if (!hasEntry) {
  lines.push(`  - one of: ${ENTRY_CANDIDATES.join(", ")}`);
}
for (const issue of metadataIssues) {
  lines.push(`  - ${issue}`);
}
lines.push("[vora-prepack] Build first, then repack from vora-core:");
lines.push("  pnpm build");
lines.push("  npm pack");
lines.push("[vora-prepack] Do not use --ignore-scripts when creating the tarball.");

process.stderr.write(`${lines.join("\n")}\n`);
process.exit(1);
