import type { Client } from "@solana-tracker/data-api";
import { optionalEnv } from "./env.js";

export async function resolvePumpMint(client: Client): Promise<string> {
  const fromEnv = optionalEnv("TOKEN_MINT");
  if (fromEnv) return fromEnv;

  const attempts: Array<() => Promise<{ mint?: string; symbol?: string } | undefined>> = [
    async () => {
      const found = await client.searchTokens({
        market: "pumpfun",
        limit: 1,
        sortBy: "volume_24h",
        sortOrder: "desc",
      });
      return found.data?.[0];
    },
    async () => {
      const found = await client.searchTokens({ market: "pumpfun", limit: 1 });
      return found.data?.[0];
    },
    async () => {
      const graduated = await client.getGraduatedTokens({ limit: 5, reduceSpam: true });
      const row = graduated?.[0];
      return row ? { mint: row.token?.mint, symbol: row.token?.symbol } : undefined;
    },
  ];

  for (const attempt of attempts) {
    const row = await attempt();
    if (row?.mint) {
      console.log(`Auto-selected ${row.symbol || row.mint.slice(0, 8)} (${row.mint})`);
      return row.mint;
    }
  }

  console.error("Set TOKEN_MINT in .env to a Pump.fun token mint");
  process.exit(1);
}

