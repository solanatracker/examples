import { short } from "./format.js";

/** Labels for a few common quote mints; everything else prints as a shortened address. */
const KNOWN: Record<string, string> = {
  So11111111111111111111111111111111111111112: "SOL",
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "USDC",
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: "USDT",
};

export const mintLabel = (mint: string | undefined): string => (mint ? (KNOWN[mint] ?? short(mint)) : "?");
