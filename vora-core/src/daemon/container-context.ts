export function resolveDaemonContainerContext(
  env: Record<string, string | undefined> = process.env,
): string | null {
  return env.VORA_CONTAINER_HINT?.trim() || env.VORA_CONTAINER?.trim() || null;
}
