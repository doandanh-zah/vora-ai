import { describe, expect, it } from "vitest";
import { buildPlatformRuntimeLogHints, buildPlatformServiceStartHints } from "./runtime-hints.js";

describe("buildPlatformRuntimeLogHints", () => {
  it("renders launchd log hints on darwin", () => {
    expect(
      buildPlatformRuntimeLogHints({
        platform: "darwin",
        env: {
          VORA_STATE_DIR: "/tmp/vora-state",
          VORA_LOG_PREFIX: "gateway",
        },
        systemdServiceName: "vora-gateway",
        windowsTaskName: "Vora Gateway",
      }),
    ).toEqual([
      "Launchd stdout (if installed): /tmp/vora-state/logs/gateway.log",
      "Launchd stderr (if installed): /tmp/vora-state/logs/gateway.err.log",
    ]);
  });

  it("renders systemd and windows hints by platform", () => {
    expect(
      buildPlatformRuntimeLogHints({
        platform: "linux",
        systemdServiceName: "vora-gateway",
        windowsTaskName: "Vora Gateway",
      }),
    ).toEqual(["Logs: journalctl --user -u vora-gateway.service -n 200 --no-pager"]);
    expect(
      buildPlatformRuntimeLogHints({
        platform: "win32",
        systemdServiceName: "vora-gateway",
        windowsTaskName: "Vora Gateway",
      }),
    ).toEqual(['Logs: schtasks /Query /TN "Vora Gateway" /V /FO LIST']);
  });
});

describe("buildPlatformServiceStartHints", () => {
  it("builds platform-specific service start hints", () => {
    expect(
      buildPlatformServiceStartHints({
        platform: "darwin",
        installCommand: "vora gateway install",
        startCommand: "vora gateway",
        launchAgentPlistPath: "~/Library/LaunchAgents/com.vora.gateway.plist",
        systemdServiceName: "vora-gateway",
        windowsTaskName: "Vora Gateway",
      }),
    ).toEqual([
      "vora gateway install",
      "vora gateway",
      "launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.vora.gateway.plist",
    ]);
    expect(
      buildPlatformServiceStartHints({
        platform: "linux",
        installCommand: "vora gateway install",
        startCommand: "vora gateway",
        launchAgentPlistPath: "~/Library/LaunchAgents/com.vora.gateway.plist",
        systemdServiceName: "vora-gateway",
        windowsTaskName: "Vora Gateway",
      }),
    ).toEqual([
      "vora gateway install",
      "vora gateway",
      "systemctl --user start vora-gateway.service",
    ]);
  });
});
