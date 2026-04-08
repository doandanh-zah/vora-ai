import { normalizeTrackedRepoPath } from "../test-report-utils.mjs";
import { DEFAULT_SURFACE_ORDER, SURFACE_CATALOG, VALID_SURFACE_SET } from "./catalog.mjs";

const KNOWN_FAILURE_POLICIES = new Set(["fail-fast", "collect-all"]);
const KNOWN_MODES = new Set(["ci", "local"]);
const KNOWN_PROFILES = new Set(["normal", "max", "serial"]);

function normalizeStringList(values) {
  if (!Array.isArray(values)) {
    return [];
  }
  return values.map((value) => String(value ?? "").trim()).filter((value) => value.length > 0);
}

function normalizeFailurePolicy(value) {
  if (KNOWN_FAILURE_POLICIES.has(value)) {
    return value;
  }
  return "fail-fast";
}

function normalizeMode(value, env = process.env) {
  if (KNOWN_MODES.has(value)) {
    return value;
  }
  return env.CI === "true" || env.GITHUB_ACTIONS === "true" ? "ci" : "local";
}

function normalizeProfile(value) {
  if (KNOWN_PROFILES.has(value)) {
    return value;
  }
  return "normal";
}

function normalizeSurfaces(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return [];
  }
  const deduped = [];
  const seen = new Set();
  for (const rawValue of values) {
    const surface = String(rawValue ?? "").trim();
    if (!surface) {
      continue;
    }
    if (!VALID_SURFACE_SET.has(surface)) {
      throw new Error(
        `Unknown surface "${surface}". Expected one of: ${DEFAULT_SURFACE_ORDER.join(", ")}`,
      );
    }
    if (!seen.has(surface)) {
      seen.add(surface);
      deduped.push(surface);
    }
  }
  return deduped;
}

function normalizeFileFilters(values) {
  return normalizeStringList(values).map((value) => normalizeTrackedRepoPath(value));
}

function normalizePassthroughArgs(values) {
  return normalizeStringList(values);
}

function hasExplicitMaxWorkersArg(args) {
  return args.some((arg) => arg.startsWith("--maxWorkers"));
}

function buildLane(surface, options) {
  const catalogEntry = SURFACE_CATALOG[surface];
  const args = ["vitest", "run", "--config", catalogEntry.config, ...options.passthroughArgs];
  const env = {};

  if (
    options.fileFilters.length > 0 &&
    catalogEntry.supportsPatternFile &&
    typeof options.writeTempJsonArtifact === "function"
  ) {
    env.VORA_VITEST_INCLUDE_FILE = options.writeTempJsonArtifact(
      `${surface}-include`,
      options.fileFilters,
    );
  } else if (options.fileFilters.length > 0) {
    args.push(...options.fileFilters);
  }

  if (options.profile === "serial" && !hasExplicitMaxWorkersArg(args)) {
    args.push("--maxWorkers=1");
  }

  return {
    id: surface,
    label: catalogEntry.label,
    command: "pnpm",
    args,
    env,
    surface,
    config: catalogEntry.config,
  };
}

function inferSurfaceForFile(filePath) {
  if (!filePath) {
    return "unit";
  }
  if (filePath.startsWith("src/gateway/")) {
    return "gateway";
  }
  if (
    filePath.startsWith("src/channels/plugins/contracts/") ||
    filePath.startsWith("src/plugins/contracts/")
  ) {
    return "contracts";
  }
  if (filePath.startsWith("extensions/")) {
    return "extensions";
  }
  if (filePath.startsWith("src/browser/") || filePath.startsWith("src/line/")) {
    return "channels";
  }
  return "unit";
}

function isDocsPath(filePath) {
  return filePath.startsWith("docs/") || filePath.endsWith(".md") || filePath.endsWith(".mdx");
}

function buildChangedExtensionMatrix(changedPaths) {
  const extensionIds = new Set();
  for (const changedPath of changedPaths) {
    if (!changedPath.startsWith("extensions/")) {
      continue;
    }
    const [, extensionId] = changedPath.split("/", 3);
    if (extensionId) {
      extensionIds.add(extensionId);
    }
  }
  if (extensionIds.size === 0) {
    return [{ extension: "all" }];
  }
  return [...extensionIds].sort().map((extension) => ({ extension }));
}

function parseChangedPathList(env = process.env) {
  const raw = env.VORA_CHANGED_PATHS ?? "";
  return raw
    .split(",")
    .map((value) => normalizeTrackedRepoPath(value))
    .filter((value) => value.length > 0);
}

export function buildExecutionPlan(request = {}, options = {}) {
  const env = options.env ?? process.env;
  const fileFilters = normalizeFileFilters(request.fileFilters);
  const passthroughArgs = normalizePassthroughArgs(request.passthroughArgs);
  const requestedSurfaces = normalizeSurfaces(request.surfaces);
  const surfaces =
    requestedSurfaces.length > 0
      ? requestedSurfaces
      : fileFilters.length > 0
        ? [inferSurfaceForFile(fileFilters[0])]
        : [...DEFAULT_SURFACE_ORDER];
  const profile = normalizeProfile(request.profile);

  const lanes = surfaces.map((surface) =>
    buildLane(surface, {
      fileFilters,
      passthroughArgs,
      profile,
      writeTempJsonArtifact: options.writeTempJsonArtifact,
    }),
  );

  return {
    mode: normalizeMode(request.mode, env),
    profile,
    failurePolicy: normalizeFailurePolicy(request.failurePolicy),
    surfaces,
    fileFilters,
    passthroughArgs,
    lanes,
  };
}

export function explainExecutionTarget(request = {}, options = {}) {
  const fileFilters = normalizeFileFilters(request.fileFilters);
  const target = fileFilters[0] ?? "";
  const inferredSurface = inferSurfaceForFile(target);
  const plan = buildExecutionPlan(
    { ...request, surfaces: [inferredSurface], fileFilters: target ? [target] : [] },
    options,
  );
  return {
    target,
    inferredSurface,
    selectedSurfaces: plan.surfaces,
    laneCount: plan.lanes.length,
    laneConfigs: plan.lanes.map((lane) => lane.config),
  };
}

export function buildCIExecutionManifest(_request = undefined, options = {}) {
  const env = options.env ?? process.env;
  const changedPaths = parseChangedPathList(env);
  const docsChanged = changedPaths.some((filePath) => isDocsPath(filePath));
  const hasNonDocsChange = changedPaths.some((filePath) => !isDocsPath(filePath));
  const docsOnly = changedPaths.length > 0 && docsChanged && !hasNonDocsChange;
  const runNode = !docsOnly;
  const runWindows = !docsOnly;
  const runMacos = !docsOnly;
  const runAndroid = !docsOnly;
  const runSkillsPython = !docsOnly;
  const changedExtensionsMatrix = buildChangedExtensionMatrix(changedPaths);
  const hasChangedExtensions = changedExtensionsMatrix.some((entry) => entry.extension !== "all");
  const requiredCheckNames = [];

  if (runNode) {
    requiredCheckNames.push("checks", "check", "build-smoke");
  }
  if (docsChanged || docsOnly) {
    requiredCheckNames.push("check-docs");
  }
  if (runWindows) {
    requiredCheckNames.push("checks-windows");
  }
  if (runMacos) {
    requiredCheckNames.push("macos-node");
  }
  if (runAndroid) {
    requiredCheckNames.push("android");
  }

  return {
    scope: {
      docsOnly,
      docsChanged,
      runNode,
      runMacos,
      runAndroid,
      runSkillsPython,
      runWindows,
      hasChangedExtensions,
      changedExtensionsMatrix,
    },
    jobs: {
      buildArtifacts: { enabled: runNode },
      checksFast: { enabled: runNode, matrix: [{ shard: "core" }] },
      checks: { enabled: runNode, matrix: [{ profile: "normal" }] },
      extensionFast: { enabled: runNode, matrix: changedExtensionsMatrix },
      check: { enabled: runNode },
      checkAdditional: { enabled: runNode },
      buildSmoke: { enabled: runNode },
      checkDocs: { enabled: docsChanged || docsOnly },
      skillsPython: { enabled: runSkillsPython },
      checksWindows: { enabled: runWindows, matrix: [{ os: "windows-latest" }] },
      macosNode: { enabled: runMacos, matrix: [{ os: "macos-latest" }] },
      macosSwift: { enabled: runMacos },
      android: { enabled: runAndroid, matrix: [{ os: "ubuntu-latest" }] },
      installSmoke: { enabled: runNode },
      bunChecks: { enabled: runNode, matrix: [{ runtime: "bun" }] },
    },
    requiredCheckNames,
  };
}

