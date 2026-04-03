// VORA V1 STUB: speech-core extension removed — all exports are no-op stubs
export function buildTtsSystemPromptHint(): string { return ""; }
export function getLastTtsAttempt(): null { return null; }
export function getResolvedSpeechProviderConfig(): null { return null; }
export function getTtsMaxLength(): number { return 0; }
export function getTtsProvider(): null { return null; }
export function isSummarizationEnabled(): boolean { return false; }
export function isTtsEnabled(): boolean { return false; }
export function isTtsProviderConfigured(): boolean { return false; }
export function listSpeechVoices(): string[] { return []; }
export async function maybeApplyTtsToPayload<T extends { payload?: unknown }>(
  params?: T,
): Promise<unknown> {
  if (!params || typeof params !== "object") {
    return {};
  }
  const payload = (params as { payload?: unknown }).payload;
  if (payload && typeof payload === "object") {
    return payload;
  }
  return {};
}
export function resolveTtsAutoMode(): string { return "off"; }
export function resolveTtsConfig(): null { return null; }
export function resolveTtsPrefsPath(): string { return ""; }
export function resolveTtsProviderOrder(): string[] { return []; }
export function setLastTtsAttempt(): void {}
export function setSummarizationEnabled(): void {}
export function setTtsAutoMode(): void {}
export function setTtsEnabled(): void {}
export function setTtsMaxLength(): void {}
export function setTtsProvider(): void {}
export function synthesizeSpeech(): null { return null; }
export function textToSpeech(): null { return null; }
export function textToSpeechTelephony(): null { return null; }
export function createTtsProvider(): null { return null; }
export const _test = {};
