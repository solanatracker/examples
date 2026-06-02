import { Client } from "@solana-tracker/data-api";

if (!(process.env.ST_API_KEY || process.env.SOLANA_TRACKER_API_KEY)) {
  console.error("Set ST_API_KEY in .env");
  process.exit(1);
}

const client = new Client({
  apiKey: process.env.ST_API_KEY || process.env.SOLANA_TRACKER_API_KEY,
  baseUrl: process.env.DATA_API_BASE_URL || 'https://data.solanatracker.io',
});

const graduating = await client.searchTokens({
  market: "pumpfun",
  minCurvePercentage: 85,
  maxCurvePercentage: 99,
  minLiquidity: 5000,
  sortBy: "curvePercentage",
  sortOrder: "desc",
  limit: 10,
});

console.log("Near-graduation Pump.fun tokens:");
for (const row of graduating.data ?? []) {
  const sym = row.symbol || row.mint?.slice(0, 6);
  const liq = row.liquidityUsd ?? row.liquidity?.usd;
  const curve = row.curvePercentage ?? row.pools?.[0]?.curvePercentage;
  console.log(sym, `curve ${curve ?? "?"}%`, liq != null ? `liq $${Math.round(liq)}` : "");
}

const safe = await client.searchTokens({
  minLiquidity: 50000,
  minHolders: 500,
  maxSnipers: 10,
  maxTop10: 30,
  sortBy: "volume_24h",
  sortOrder: "desc",
  limit: 5,
});

console.log("\nHigh-volume tokens with tighter holder distribution:");
for (const row of safe.data ?? []) {
  console.log(row.symbol || row.mint?.slice(0, 8), "vol24h", row.volume_24h ?? row.volume24h ?? "—");
}

