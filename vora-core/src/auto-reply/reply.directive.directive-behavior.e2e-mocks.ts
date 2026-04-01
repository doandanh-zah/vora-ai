import { vi, type Mock } from "vitest";

export const runEmbeddedVoraAgentMock: Mock = vi.fn();
export const loadModelCatalogMock: Mock = vi.fn();

vi.mock("../agents/vora-embedded-runner.js", () => ({
  abortEmbeddedPiRun: vi.fn().mockReturnValue(false),
  runEmbeddedVoraAgent: (...args: unknown[]) => runEmbeddedVoraAgentMock(...args),
  queueEmbeddedPiMessage: vi.fn().mockReturnValue(false),
  resolveEmbeddedSessionLane: (key: string) => `session:${key.trim() || "main"}`,
  isEmbeddedPiRunActive: vi.fn().mockReturnValue(false),
  isEmbeddedPiRunStreaming: vi.fn().mockReturnValue(false),
}));

vi.mock("../agents/model-catalog.js", () => ({
  loadModelCatalog: loadModelCatalogMock,
}));
