import chalk, { Chalk } from "chalk";
import { VORA_PALETTE } from "./palette.js";

const hasForceColor =
  typeof process.env.FORCE_COLOR === "string" &&
  process.env.FORCE_COLOR.trim().length > 0 &&
  process.env.FORCE_COLOR.trim() !== "0";

const baseChalk = process.env.NO_COLOR && !hasForceColor ? new Chalk({ level: 0 }) : chalk;

const hex = (value: string) => baseChalk.hex(value);

export const theme = {
  accent: hex(VORA_PALETTE.accent),
  accentBright: hex(VORA_PALETTE.accentBright),
  accentDim: hex(VORA_PALETTE.accentDim),
  info: hex(VORA_PALETTE.info),
  success: hex(VORA_PALETTE.success),
  warn: hex(VORA_PALETTE.warn),
  error: hex(VORA_PALETTE.error),
  muted: hex(VORA_PALETTE.muted),
  heading: baseChalk.bold.hex(VORA_PALETTE.accent),
  command: hex(VORA_PALETTE.accentBright),
  option: hex(VORA_PALETTE.warn),
} as const;

export const isRich = () => Boolean(baseChalk.level > 0);

export const colorize = (rich: boolean, color: (value: string) => string, value: string) =>
  rich ? color(value) : value;
