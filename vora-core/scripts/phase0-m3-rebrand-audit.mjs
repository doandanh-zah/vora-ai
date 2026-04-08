#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");

const filesToAudit = [
  "vora.mjs",
  "src/agents/system-prompt.ts",
  "src/cli/banner.ts",
  "src/cli/program/help.ts",
  "src/cli/tagline.ts",
  "src/terminal/palette.ts",
  "src/terminal/theme.ts",
  "src/tui/theme/theme.ts",
  "scripts/install.sh",
  "apps/macos/Sources/Vora/Resources/Info.plist",
];

const forbiddenMatchers = [
  /openclaw/giu,
  /open[ -]claw/giu,
  /discord\.gg\/clawd/giu,
  /discord\.com\/invite\/clawd/giu,
  /clawhub\.ai/giu,
  /whatsapp automation without/giu,
  /green bubble/giu,
  /fruit tree company/giu,
  /claw-sistant/giu,
  /lobster/giu,
];

function indexToLine(text, index) {
  return text.slice(0, index).split("\n").length;
}

const findings = [];

for (const relativePath of filesToAudit) {
  const absolutePath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(absolutePath)) {
    findings.push({
      file: relativePath,
      line: 1,
      token: "<missing-file>",
      snippet: "Required audit file does not exist.",
    });
    continue;
  }

  const content = fs.readFileSync(absolutePath, "utf8");
  for (const matcher of forbiddenMatchers) {
    for (const match of content.matchAll(matcher)) {
      const index = match.index ?? 0;
      const token = match[0];
      const line = indexToLine(content, index);
      const lineText = content.split("\n")[line - 1] ?? "";
      findings.push({
        file: relativePath,
        line,
        token,
        snippet: lineText.trim(),
      });
    }
  }
}

if (findings.length > 0) {
  console.error("[phase0:m3] FAIL: found legacy-brand tokens in user-facing files.");
  for (const finding of findings) {
    console.error(
      `- ${finding.file}:${finding.line} token="${finding.token}" line="${finding.snippet}"`,
    );
  }
  process.exit(1);
}

console.log("[phase0:m3] PASS: user-facing rebrand audit clean.");
