import { Client } from "@solana-tracker/data-api";

function usd(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}`;
}
if (!(process.env.ST_API_KEY || process.env.SOLANA_TRACKER_API_KEY)) {
  console.error("Set ST_API_KEY in .env");
  process.exit(1);
}

const client = new Client({
  apiKey: process.env.ST_API_KEY || process.env.SOLANA_TRACKER_API_KEY,
  baseUrl: process.env.DATA_API_BASE_URL || 'https://data.solanatracker.io',
});

const top = await client.getPnlV2TopTraders({ days: 30, limit: 10, pnlMode: "adjusted" });
console.log("Top traders (30d, adjusted PnL):");
for (const row of top.traders ?? []) {
  const w = row.wallet?.slice(0, 8) + "…";
  const name = row.identity?.name || row.identity?.twitter || "";
  const pnl = row.period?.realized ?? row.pnl?.total;
  const roi = row.period?.roi ?? row.roi;
  console.log(w, name.padEnd(16), usd(pnl), roi != null ? `ROI ${roi.toFixed(1)}%` : "");
}

const kols = await client.getPnlV2KOLLeaderboard({ sort: "total", direction: "desc", limit: 5 });
console.log("\nKOL leaderboard:");
for (const row of kols.traders ?? []) {
  const label = row.identity?.name || row.identity?.twitter || row.wallet?.slice(0, 8);
  console.log(label, usd(row.summary?.pnl?.total ?? row.pnl?.total));
}

