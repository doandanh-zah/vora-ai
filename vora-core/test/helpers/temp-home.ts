import { createTempHomeEnv } from "../../src/test-utils/temp-home.js";

type TempHomeEnvOverrides = Record<string, string | undefined>;

type TempHomeOptions = {
  env?: TempHomeEnvOverrides;
  prefix?: string;
};

type TempHomeRun<T> = (home: string) => Promise<T> | T;

function normalizeArgs<T>(
  prefixOrRun: string | TempHomeRun<T>,
  runOrOptions?: TempHomeRun<T> | TempHomeOptions,
  maybeOptions?: TempHomeOptions,
): { prefix: string; run: TempHomeRun<T>; options: TempHomeOptions } {
  if (typeof prefixOrRun === "function") {
    return {
      prefix: runOrOptions && typeof runOrOptions !== "function" ? runOrOptions.prefix ?? "vora-test-" : "vora-test-",
      run: prefixOrRun,
      options: (runOrOptions && typeof runOrOptions !== "function" ? runOrOptions : {}) ?? {},
    };
  }
  return {
    prefix: prefixOrRun,
    run: runOrOptions as TempHomeRun<T>,
    options: maybeOptions ?? {},
  };
}

function applyEnvOverrides(overrides: TempHomeEnvOverrides | undefined): () => void {
  if (!overrides || Object.keys(overrides).length === 0) {
    return () => {};
  }
  const snapshot = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(overrides)) {
    snapshot.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  return () => {
    for (const [key, value] of snapshot.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}

export async function withTempHome<T>(
  prefixOrRun: string | TempHomeRun<T>,
  runOrOptions?: TempHomeRun<T> | TempHomeOptions,
  maybeOptions?: TempHomeOptions,
): Promise<T> {
  const { prefix, run, options } = normalizeArgs(prefixOrRun, runOrOptions, maybeOptions);
  const tempHome = await createTempHomeEnv(options.prefix ?? prefix);
  const restoreEnv = applyEnvOverrides(options.env);
  try {
    return await run(tempHome.home);
  } finally {
    restoreEnv();
    await tempHome.restore();
  }
}

export async function withTempHomeAsync<T>(
  prefixOrRun: string | TempHomeRun<T>,
  runOrOptions?: TempHomeRun<T> | TempHomeOptions,
  maybeOptions?: TempHomeOptions,
): Promise<T> {
  return await withTempHome(prefixOrRun, runOrOptions, maybeOptions);
}
