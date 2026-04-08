export const SURFACE_CATALOG = {
  unit: {
    id: "unit",
    label: "Unit",
    config: "vitest.unit.config.ts",
    supportsPatternFile: true,
  },
  extensions: {
    id: "extensions",
    label: "Extensions",
    config: "vitest.extensions.config.ts",
    supportsPatternFile: true,
  },
  channels: {
    id: "channels",
    label: "Channels",
    config: "vitest.channels.config.ts",
    supportsPatternFile: true,
  },
  contracts: {
    id: "contracts",
    label: "Contracts",
    config: "vitest.contracts.config.ts",
    supportsPatternFile: false,
  },
  gateway: {
    id: "gateway",
    label: "Gateway",
    config: "vitest.gateway.config.ts",
    supportsPatternFile: false,
  },
};

export const DEFAULT_SURFACE_ORDER = Object.freeze(Object.keys(SURFACE_CATALOG));
export const VALID_SURFACE_SET = new Set(DEFAULT_SURFACE_ORDER);

