import { vi } from "vitest";
import { installChromeUserDataDirHooks } from "./chrome-user-data-dir.test-harness.js";

const chromeUserDataDir = { dir: "/tmp/vora" };
installChromeUserDataDirHooks(chromeUserDataDir);

vi.mock("./chrome.js", () => ({
  isChromeCdpReady: vi.fn(async () => true),
  isChromeReachable: vi.fn(async () => true),
  launchVoraChrome: vi.fn(async () => {
    throw new Error("unexpected launch");
  }),
  resolveVoraUserDataDir: vi.fn(() => chromeUserDataDir.dir),
  stopVoraChrome: vi.fn(async () => {}),
}));
