// VORA V1 compatibility shim for builds without WhatsApp runtime.
// Keep named exports so CLI bundles compile while WhatsApp is disabled.

export const WA_WEB_AUTH_DIR = "";

const notEnabled = () => {
  throw new Error("WhatsApp runtime is disabled in this VORA build");
};

export function createWaSocket() {
  return notEnabled();
}
export function formatError(err: unknown) {
  return err instanceof Error ? err.message : String(err ?? "Unknown error");
}
export function loginWeb() {
  return notEnabled();
}
export function logWebSelfId() {
  return null;
}
export function logoutWeb() {
  return notEnabled();
}
export function monitorWebChannel() {
  return notEnabled();
}
export function pickWebChannel() {
  return null;
}
export function resolveHeartbeatRecipients() {
  return [] as string[];
}
export function runWebHeartbeatOnce() {
  return { ok: false, reason: "whatsapp-disabled" };
}
export function sendMessageWhatsApp() {
  return notEnabled();
}
export function sendReactionWhatsApp() {
  return notEnabled();
}
export function waitForWaConnection() {
  return notEnabled();
}
export function webAuthExists() {
  return false;
}
export function extractMediaPlaceholder() {
  return null;
}
export function extractText() {
  return "";
}
export function getActiveWebListener() {
  return null;
}
export function getWebAuthAgeMs() {
  return null;
}
export function monitorWebInbox() {
  return notEnabled();
}
export function readWebSelfId() {
  return null;
}
export function sendPollWhatsApp() {
  return notEnabled();
}
export function startWebLoginWithQr() {
  return notEnabled();
}
export function waitForWebLogin() {
  return notEnabled();
}
export function getStatusCode() {
  return null;
}
export function createRuntimeWhatsAppLoginTool() {
  return notEnabled();
}
export function handleWhatsAppAction() {
  return notEnabled();
}
export function resolveWaWebAuthDir() {
  return WA_WEB_AUTH_DIR;
}

// legacy export kept for compatibility
export function createWhatsAppBoundary() {
  return null;
}

export function createWhatsAppLoginTool() {
  return notEnabled();
}
