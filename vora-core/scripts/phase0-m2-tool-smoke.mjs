#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const tmpDir = path.join(repoRoot, ".tmp", "phase0");
const runId = randomUUID().slice(0, 8);
const markerPath = path.join(tmpDir, `m2-tool-marker-${runId}.txt`);
const markerValue = `M2_TOOL_EXECUTED_${randomUUID()}`;
const sessionId = `phase0-m2-${runId}`;
const expectedReply = "PHASE0_M2_OK";
const smokeStateDir = process.env.VORA_STATE_DIR?.trim() || path.join(tmpDir, "m2-state");
const smokeConfigPath =
  process.env.VORA_CONFIG_PATH?.trim() || path.join(tmpDir, `m2-config-${runId}.json`);
const smokeModel = process.env.VORA_PHASE0_M2_MODEL?.trim() || "openai-codex/gpt-5.4";

function singleQuote(value) {
  return `'${String(value).replaceAll("'", `'\"'\"'`)}'`;
}

function fail(message) {
  console.error(`[phase0:m2] FAIL: ${message}`);
  process.exit(1);
}

function hasExpectedAssistantReplyInSession(params) {
  const sessionPath = params.sessionPath;
  const expectedToken = params.expectedToken;
  if (!fs.existsSync(sessionPath)) {
    return false;
  }
  try {
    const raw = fs.readFileSync(sessionPath, "utf8");
    const lines = raw.split(/\r?\n/u).filter(Boolean);
    for (const line of lines) {
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      const message = parsed?.message;
      if (parsed?.type !== "message" || message?.role !== "assistant") {
        continue;
      }
      const content = Array.isArray(message?.content) ? message.content : [];
      const hasToken = content.some(
        (entry) =>
          entry &&
          typeof entry === "object" &&
          entry.type === "text" &&
          typeof entry.text === "string" &&
          entry.text.includes(expectedToken),
      );
      if (hasToken) {
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

fs.mkdirSync(tmpDir, { recursive: true });
fs.mkdirSync(smokeStateDir, { recursive: true });
try {
  fs.rmSync(markerPath, { force: true });
} catch {
  // ignore cleanup errors before run
}

// Prefer an explicit model for this smoke so it does not depend on a user's
// default profile (which may point to an unavailable provider).
const smokeConfig = {
  agents: {
    defaults: {
      model: {
        primary: smokeModel,
      },
    },
  },
  tools: {
    exec: {
      // Keep smoke deterministic in headless/local CI-style runs:
      // bypass interactive/gateway approval routing for this one command check.
      security: "full",
      ask: "off",
    },
  },
};
fs.writeFileSync(smokeConfigPath, `${JSON.stringify(smokeConfig, null, 2)}\n`, "utf8");

const execCommand = `printf %s ${singleQuote(markerValue)} > ${singleQuote(markerPath)}`;
const message = [
  "You must use the exec tool exactly once.",
  `Run this command: ${execCommand}`,
  `After the tool runs, reply with exactly: ${expectedReply}`,
  "Do not add any extra text.",
].join(" ");

const cliArgs = [
  "vora.mjs",
  "agent",
  "--local",
  "--session-id",
  sessionId,
  "--thinking",
  "low",
  "--timeout",
  "120",
  "--json",
  "--message",
  message,
];

console.log("[phase0:m2] running local smoke...");
console.log(`[phase0:m2] marker file: ${markerPath}`);
console.log(`[phase0:m2] state dir: ${smokeStateDir}`);
console.log(`[phase0:m2] config path: ${smokeConfigPath}`);
console.log(`[phase0:m2] model: ${smokeModel}`);

const run = spawnSync(process.execPath, cliArgs, {
  cwd: repoRoot,
  encoding: "utf8",
  env: {
    ...process.env,
    VORA_STATE_DIR: smokeStateDir,
    VORA_CONFIG_PATH: smokeConfigPath,
  },
  timeout: 5 * 60_000,
});

if (run.error) {
  fail(`could not start agent command: ${run.error.message}`);
}

if (run.status !== 0) {
  const stderr = (run.stderr ?? "").trim();
  const stdout = (run.stdout ?? "").trim();
  fail(
    [
      `agent command exited with code ${String(run.status)}`,
      stderr ? `stderr: ${stderr}` : "",
      stdout ? `stdout: ${stdout}` : "",
      "Tip: ensure provider auth is available for the smoke model.",
      "Set VORA_PHASE0_M2_MODEL=<provider/model> if you need to override the default.",
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

if (!fs.existsSync(markerPath)) {
  fail(
    [
      "marker file was not created, tool execution is not confirmed.",
      `expected: ${markerPath}`,
      "stdout:",
      (run.stdout ?? "").trim() || "<empty>",
    ].join("\n"),
  );
}

const markerOut = fs.readFileSync(markerPath, "utf8");
if (markerOut !== markerValue) {
  fail(
    [
      "marker content mismatch, exec tool did not write expected value.",
      `expected: ${markerValue}`,
      `actual: ${markerOut}`,
    ].join("\n"),
  );
}

const stdout = run.stdout ?? "";
if (!stdout.includes(expectedReply)) {
  const sessionPath = path.join(
    smokeStateDir,
    "agents",
    "main",
    "sessions",
    `${sessionId}.jsonl`,
  );
  if (hasExpectedAssistantReplyInSession({ sessionPath, expectedToken: expectedReply })) {
    console.log(
      `[phase0:m2] note: stdout was empty; verified expected token from session log: ${sessionPath}`,
    );
  } else {
    fail(
      [
        `agent reply did not contain expected token "${expectedReply}".`,
        "stdout:",
        stdout.trim() || "<empty>",
        `session log: ${sessionPath}`,
      ].join("\n"),
    );
  }
}

console.log("[phase0:m2] PASS: tool execution confirmed and agent reply matched expected token.");
console.log(`[phase0:m2] session: ${sessionId}`);
