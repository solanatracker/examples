import { optionalEnv } from "./env.js";
import { usd } from "./format.js";
import { createDataApiClient } from "./client.js";

const client = createDataApiClient();
const mint = optionalEnv("TOKEN_MINT", "So11111111111111111111111111111111111111112")!;
const interval = optionalEnv("CHART_INTERVAL", "1h")!;

console.log("=== OHLCV chart example ===\n");

const info = await client.getTokenInfo(mint);
const symbol = info.token?.symbol || mint.slice(0, 8);
const spot = info.pools?.[0]?.price?.usd;
console.log(`Token: ${symbol}  spot ${usd(spot)}  market ${info.pools?.[0]?.market ?? "?"}`);

const now = Math.floor(Date.now() / 1000);
const weekAgo = now - 7 * 24 * 3600;

const chart = await client.getChartData({
  tokenAddress: mint,
  type: interval,
  timeFrom: weekAgo,
  timeTo: now,
  removeOutliers: true,
});

const bars = chart.oclhv ?? chart.ohlcv ?? [];
if (!bars.length) {
  console.log("No bars returned — try a token with more trade history.");
  process.exit(0);
}

const closes = bars.map((b) => b.close).filter((n): n is number => typeof n === "number");
const volumes = bars.map((b) => b.volume).filter((n): n is number => typeof n === "number");
const high = Math.max(...bars.map((b) => b.high ?? 0));
const low = Math.min(...bars.map((b) => b.low ?? Infinity));
const avgVol = volumes.length ? volumes.reduce((a, b) => a + b, 0) / volumes.length : 0;

console.log(`\nFetched ${bars.length} ${interval} bars`);
console.log(`7d range: ${usd(low)} – ${usd(high)}  |  avg volume ${avgVol.toFixed(2)}`);

console.log("\nLast 5 bars:");
for (const bar of bars.slice(-5)) {
  const t = new Date((bar.time ?? 0) * 1000).toISOString().slice(0, 16);
  console.log(
    t,
    "O", (bar.open ?? 0).toFixed(6),
    "H", (bar.high ?? 0).toFixed(6),
    "L", (bar.low ?? 0).toFixed(6),
    "C", (bar.close ?? 0).toFixed(6),
    "vol", (bar.volume ?? 0).toFixed(2)
  );
}

const tvBars = bars.slice(-3).map((b) => ({
  time: b.time,
  open: b.open,
  high: b.high,
  low: b.low,
  close: b.close,
  volume: b.volume,
}));
console.log("\nTradingView bar shape (last 3):");
console.log(JSON.stringify(tvBars, null, 2));

