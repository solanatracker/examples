import type { Client } from "@solana-tracker/data-api";
import { optionalEnv } from "./env.js";

/** Pick a token to demo — env mint, or first trending token with risk data. */
export async function resolveTokenMint(client: Client): Promise<string> {
  const fromEnv = optionalEnv("TOKEN_MINT");
  if (fromEnv) return fromEnv;

  const trending = await client.getTrendingTokens("24h");
  const row = Array.isArray(trending) ? trending[0] : undefined;
  const mint = row?.token?.mint ?? row?.mint;
  if (mint) {
    const sym = row?.token?.symbol ?? mint.slice(0, 8);
    console.log(`No TOKEN_MINT set — using trending token ${sym} (${mint})`);
    return mint;
  }

  console.error("Set TOKEN_MINT in .env to any Solana token mint");
  process.exit(1);
}

