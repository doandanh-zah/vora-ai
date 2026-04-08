import {
  buildChannelConfigSchema,
  DiscordConfigSchema,
} from "vora/plugin-sdk/channel-config-schema";
import { discordChannelConfigUiHints } from "./config-ui-hints.js";

export const DiscordChannelConfigSchema = buildChannelConfigSchema(DiscordConfigSchema, {
  uiHints: discordChannelConfigUiHints,
});
