import { VitestTestRunner } from "vitest/runners";

// Keep the custom runner hook-point alive even when we do not override behavior.
// The config expects this path to exist for non-isolated execution profiles.
export default VitestTestRunner;

