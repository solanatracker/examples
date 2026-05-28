import { Client } from "@solana-tracker/data-api";

if (!(process.env.ST_API_KEY || process.env.SOLANA_TRACKER_API_KEY)) {
  console.error("Set ST_API_KEY in .env");
  process.exit(1);
}

const client = new Client({
  apiKey: process.env.ST_API_KEY || process.env.SOLANA_TRACKER_API_KEY,
  baseUrl: process.env.DATA_API_BASE_URL || 'https://data.solanatracker.io',
});

const SOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const sol = await client.getTokenInfo(SOL);
const pool = sol.pools?.[0];
console.log("SOL price USD:", pool?.price?.usd?.toFixed(4), "liquidity USD:", pool?.liquidity?.usd?.toFixed(0));

const prices = await client.getMultiplePrices([SOL, USDC]);
for (const [mint, row] of Object.entries(prices)) {
  console.log(mint.slice(0, 6) + "…", "USD", row.price.toFixed(4));
}

