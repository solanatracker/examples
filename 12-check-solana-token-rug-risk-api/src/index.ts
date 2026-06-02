import { Client } from "@solana-tracker/data-api";

if (!(process.env.ST_API_KEY || process.env.SOLANA_TRACKER_API_KEY)) {
  console.error("Set ST_API_KEY in .env");
  process.exit(1);
}

const client = new Client({
  apiKey: process.env.ST_API_KEY || process.env.SOLANA_TRACKER_API_KEY,
  baseUrl: process.env.DATA_API_BASE_URL || 'https://data.solanatracker.io',
});

const mint = process.env.TOKEN_MINT || "So11111111111111111111111111111111111111112";
const data = await client.getTokenInfo(mint);
const risk = data.risk;
const pool = data.pools?.[0];

console.log(data.token?.symbol || mint.slice(0, 8), "— risk score", risk?.score ?? "n/a", "/10");
if (risk?.rugged) console.log("Status: RUGGED (liquidity removed)");
if (pool) console.log("Liquidity USD:", pool.liquidity?.usd?.toFixed(0), "| MC USD:", pool.marketCap?.usd?.toFixed(0));

const signals = [
  ["Snipers", risk?.snipers?.totalPercentage, risk?.snipers?.count],
  ["Insiders", risk?.insiders?.totalPercentage, risk?.insiders?.count],
  ["Bundlers", risk?.bundlers?.totalPercentage, risk?.bundlers?.count],
  ["Dev holding", risk?.dev?.percentage, null],
];
for (const [label, pct, count] of signals) {
  if (pct == null) continue;
  const extra = count != null ? ` (${count} wallets)` : "";
  console.log(`  ${label}: ${Number(pct).toFixed(2)}%${extra}`);
}

if (risk?.risks?.length) {
  console.log("Flags:");
  for (const r of risk.risks.slice(0, 5)) console.log(" ", r.name || r.description || r);
}

