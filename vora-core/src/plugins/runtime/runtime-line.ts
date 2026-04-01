// VORA V1 STUB: LINE extension removed
export function createRuntimeLine(): Record<string, (...args) => any> {
  const stub = () => { throw new Error("LINE extension is disabled in VORA V1"); };
  return new Proxy({} as Record<string, (...args) => any>, {
    get: () => stub,
  });
}
