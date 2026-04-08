export const VORA_CLI_ENV_VAR = "VORA_CLI";
export const VORA_CLI_ENV_VALUE = "1";

export function markVoraExecEnv<T extends Record<string, string | undefined>>(env: T): T {
  return {
    ...env,
    [VORA_CLI_ENV_VAR]: VORA_CLI_ENV_VALUE,
  };
}

export function ensureVoraExecMarkerOnProcess(
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  env[VORA_CLI_ENV_VAR] = VORA_CLI_ENV_VALUE;
  return env;
}
