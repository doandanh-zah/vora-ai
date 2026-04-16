export const pluginSdkEntrypoints = ["index"];
export const pluginSdkSubpaths = ["./plugin-sdk", "./plugin-sdk/index"];

export function buildPluginSdkEntrySources() {
  return {
    index: "src/plugin-sdk/index.ts",
  };
}
