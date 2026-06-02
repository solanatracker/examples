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
const now = Math.floor(Date.now() / 1000);
const weekAgo = now - 7 * 24 * 3600;

const chart = await client.getChartData({
  tokenAddress: mint,
  type: "1h",
  timeFrom: weekAgo,
  timeTo: now,
  removeOutliers: true,
});

const bars = chart.oclhv ?? chart.ohlcv ?? [];
console.log(`Loaded ${bars.length} hourly bars for ${mint.slice(0, 8)}…`);

for (const bar of bars.slice(-5)) {
  const t = new Date((bar.time ?? 0) * 1000).toISOString().slice(0, 16);
  console.log(t, "O", bar.open?.toFixed(6), "H", bar.high?.toFixed(6), "L", bar.low?.toFixed(6), "C", bar.close?.toFixed(6), "vol", bar.volume?.toFixed(2));
}

