// VORA V1 STUB: test helpers
export function withTempHome<T>(fn: () => T): T { return fn(); }
export async function withTempHomeAsync<T>(fn: () => Promise<T>): Promise<T> { return fn(); }
