import os from "node:os";

const DEFAULT_RESERVED_CPUS = 1;
const DEFAULT_MAX_WORKERS = 6;
const MIN_WORKERS = 1;

function parsePositiveInteger(rawValue) {
  const parsed = Number.parseInt(String(rawValue ?? "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

export function resolveLocalVitestMaxWorkers(
  env = process.env,
  cpuCount = os.cpus()?.length ?? MIN_WORKERS,
) {
  const explicitWorkers = parsePositiveInteger(env.VORA_VITEST_MAX_WORKERS);
  if (explicitWorkers !== null) {
    return Math.max(MIN_WORKERS, explicitWorkers);
  }

  const reservedCpus = parsePositiveInteger(env.VORA_VITEST_RESERVED_CPUS) ?? DEFAULT_RESERVED_CPUS;
  const computedWorkers = Math.max(MIN_WORKERS, cpuCount - reservedCpus);
  return Math.min(DEFAULT_MAX_WORKERS, computedWorkers);
}

