import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function normalizeFailurePolicy(value) {
  return value === "collect-all" ? "collect-all" : "fail-fast";
}

export function createExecutionArtifacts() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vora-test-plan-"));
  const createdFiles = [];

  return {
    writeTempJsonArtifact(label, value) {
      const safeLabel = String(label ?? "artifact").replace(/[^a-zA-Z0-9._-]/g, "-");
      const filePath = path.join(tempDir, `${safeLabel}.json`);
      fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
      createdFiles.push(filePath);
      return filePath;
    },
    cleanupTempArtifacts() {
      for (const filePath of createdFiles) {
        try {
          fs.rmSync(filePath, { force: true });
        } catch {
          // best-effort cleanup only
        }
      }
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // best-effort cleanup only
      }
    },
  };
}

export function formatPlanOutput(plan) {
  const lines = [
    `[test-parallel] mode=${plan.mode} profile=${plan.profile} failurePolicy=${plan.failurePolicy}`,
    `[test-parallel] surfaces=${plan.surfaces.join(", ") || "(none)"}`,
    `[test-parallel] lanes=${plan.lanes.length}`,
  ];
  for (const lane of plan.lanes) {
    const envEntries = Object.entries(lane.env ?? {});
    const envSuffix =
      envEntries.length > 0
        ? ` env=${envEntries.map(([key, value]) => `${key}=${value}`).join(",")}`
        : "";
    lines.push(
      `  - ${lane.id}: ${lane.command} ${lane.args.join(" ")}${envSuffix}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

export function formatExplanation(explanation) {
  const lines = [
    `[test-parallel] target=${explanation.target || "(empty)"}`,
    `[test-parallel] inferredSurface=${explanation.inferredSurface}`,
    `[test-parallel] selectedSurfaces=${(explanation.selectedSurfaces ?? []).join(", ") || "(none)"}`,
    `[test-parallel] laneCount=${explanation.laneCount ?? 0}`,
    `[test-parallel] laneConfigs=${(explanation.laneConfigs ?? []).join(", ") || "(none)"}`,
  ];
  return `${lines.join("\n")}\n`;
}

function executeLane(lane, env) {
  const mergedEnv = {
    ...process.env,
    ...env,
    ...(lane.env ?? {}),
  };
  const result = spawnSync(lane.command, lane.args, {
    stdio: "inherit",
    env: mergedEnv,
  });
  if (result.error) {
    return { exitCode: 1, error: result.error };
  }
  return { exitCode: result.status ?? 1, signal: result.signal ?? null };
}

export async function executePlan(plan, options = {}) {
  const failurePolicy = normalizeFailurePolicy(plan.failurePolicy);
  const sharedEnv = options.env ?? process.env;
  const failures = [];

  for (let index = 0; index < plan.lanes.length; index += 1) {
    const lane = plan.lanes[index];
    console.log(
      `[test-parallel] lane ${index + 1}/${plan.lanes.length}: ${lane.id} (${lane.config})`,
    );
    const result = executeLane(lane, sharedEnv);
    if (result.exitCode !== 0) {
      failures.push({ lane: lane.id, exitCode: result.exitCode, signal: result.signal ?? null });
      if (failurePolicy !== "collect-all") {
        return { exitCode: result.exitCode, failures };
      }
    }
  }

  return {
    exitCode: failures.length > 0 ? 1 : 0,
    failures,
  };
}

