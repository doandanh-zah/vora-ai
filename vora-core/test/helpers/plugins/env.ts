// VORA V1 STUB: test helpers - env utilities
export function withEnv(env: Record<string, string>, fn: () => void): void { fn(); }
export async function withEnvAsync(env: Record<string, string>, fn: () => Promise<void>): Promise<void> { await fn(); }
