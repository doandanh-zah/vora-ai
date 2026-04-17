import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "../wizard/prompts.js";

export type OAuthPrompt = { message: string; placeholder?: string };

const validateRequiredInput = (value: string) => (value.trim().length > 0 ? undefined : "Required");

export function createVpsAwareOAuthHandlers(params: {
  isRemote: boolean;
  prompter: WizardPrompter;
  runtime: RuntimeEnv;
  spin: ReturnType<WizardPrompter["progress"]>;
  openUrl: (url: string) => Promise<unknown>;
  localBrowserMessage: string;
  manualPromptMessage?: string;
}): {
  onAuth: (event: { url: string }) => Promise<void>;
  onPrompt: (prompt: OAuthPrompt) => Promise<string>;
} {
  const manualPromptMessage = params.manualPromptMessage ?? "Paste the redirect URL";
  let manualCodePromise: Promise<string> | undefined;

  return {
    onAuth: async ({ url }) => {
      if (params.isRemote) {
        params.spin.stop("OAuth URL ready");
        params.runtime.log(`\nOpen this URL in your LOCAL browser:\n\n${url}\n`);
        manualCodePromise = params.prompter
          .text({
            message: manualPromptMessage,
            validate: validateRequiredInput,
          })
          .then((value) => String(value));
        return;
      }

      params.spin.update(params.localBrowserMessage);
      params.runtime.log(`\nOpen this URL if your browser did not open:\n\n${url}\n`);
      void Promise.resolve(params.openUrl(url))
        .then((opened) => {
          if (opened === false) {
            params.runtime.log("Browser auto-open failed. Copy/paste the URL above into your browser.");
          }
        })
        .catch((error) => {
          params.runtime.log(
            `Browser auto-open failed. Copy/paste the URL above into your browser. (${String(error)})`,
          );
        });
    },
    onPrompt: async (prompt) => {
      if (manualCodePromise) {
        return manualCodePromise;
      }
      const code = await params.prompter.text({
        message: prompt.message,
        placeholder: prompt.placeholder,
        validate: validateRequiredInput,
      });
      return String(code);
    },
  };
}
