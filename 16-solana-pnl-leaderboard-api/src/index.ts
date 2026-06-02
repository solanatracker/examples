import { optionalEnv } from "./env.js";
import { usd, short, pad } from "./format.js";
import { createDataApiClient } from "./client.js";

const days = Number(optionalEnv("LEADERBOARD_DAYS", "30"));
const client = createDataApiClient();

console.log(`=== PnL v2 leaderboard (last ${days} days) ===\n`);

const top = await client.getPnlV2TopTraders({ days, limit: 15, pnlMode: "adjusted" });
console.log("Top traders:");
console.log("  rank  wallet       name             PnL        ROI     win%");

top.traders?.forEach((row, i) => {
  const name = row.identity?.name || row.identity?.twitter || "";
  const pnl = row.period?.realized ?? row.pnl?.total;
  const roi = row.period?.roi ?? row.roi;
  const win = row.period?.days?.winRate ?? row.analysis?.winRate;
  console.log(
    `  ${String(i + 1).padStart(4)}  ${short(row.wallet ?? "?", 10).padEnd(11)} ${pad(name.slice(0, 16), 16)} ${usd(pnl).padStart(10)}  ${roi != null ? (roi.toFixed(1) + "%").padStart(6) : "    —"}  ${win != null ? win.toFixed(0) + "%" : "—"}`
  );
});

if (top.pagination?.nextCursor) {
  console.log("\nNext page cursor:", top.pagination.nextCursor);
}

console.log("\nKOL leaderboard:");
const kols = await client.getPnlV2KOLLeaderboard({ sort: "total", direction: "desc", limit: 8 });
for (const row of kols.traders ?? []) {
  const label = row.identity?.name || row.identity?.twitter || short(row.wallet ?? "?");
  console.log(`  ${pad(label.slice(0, 20), 20)} ${usd(row.summary?.pnl?.total ?? row.pnl?.total)}`);
}

