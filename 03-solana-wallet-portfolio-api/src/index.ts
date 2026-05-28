import { Client, Datastream } from "@solana-tracker/data-api";

function usd(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}`;
}

const wallet = process.env.WALLET_ADDRESS;
const datastreamKey = process.env.ST_DATASTREAM_KEY;
if (!(process.env.ST_API_KEY || process.env.SOLANA_TRACKER_API_KEY) || !wallet) {
  console.error("Set ST_API_KEY and WALLET_ADDRESS in .env");
  process.exit(1);
}

const client = new Client({
  apiKey: process.env.ST_API_KEY || process.env.SOLANA_TRACKER_API_KEY,
  baseUrl: process.env.DATA_API_BASE_URL || 'https://data.solanatracker.io',
});

const portfolio = await client.getWallet(wallet);
const holdings = [...portfolio.tokens].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

console.log(`Portfolio ${usd(portfolio.total)}  (${portfolio.totalSol.toFixed(4)} SOL)`);
console.log("Holdings:");
for (const row of holdings.slice(0, 10)) {
  const label = row.token.symbol || row.token.mint.slice(0, 8);
  const market = row.pools?.[0]?.market ?? "";
  console.log(`  ${label.padEnd(10)} ${String(row.balance).padEnd(14)} ${usd(row.value).padStart(10)}  ${market}`);
}

const overview = await client.getPnlV2WalletOverview(wallet);
if ("queued" in overview && overview.queued) {
  console.log("PnL: wallet queued for indexing");
} else if ("summary" in overview) {
  const { pnl, counts, roi, timing } = overview.summary;
  console.log(
    `PnL ${usd(pnl.total)} total  ${usd(pnl.realized)} realized  ${usd(pnl.unrealized)} unrealized  ROI ${roi ?? "n/a"}%`
  );
  console.log(
    `Trades ${counts.trades} across ${counts.tokensTraded} tokens  |  win rate ${overview.analysis.winRate ?? "n/a"}%  |  holding ${overview.stats.holding} sold ${overview.stats.sold}`
  );
  if (timing.avgHoldTimeSecs) {
    console.log(`Avg hold ${Math.round(timing.avgHoldTimeSecs / 3600)}h`);
  }
}

const positions = await client.getPnlV2WalletPositions(wallet, {
  limit: 5,
  sort: "value",
});
if ("queued" in positions && positions.queued) {
  console.log("Open positions: queued for indexing");
} else if ("positions" in positions && positions.positions.length) {
  console.log("Open positions:");
  for (const p of positions.positions) {
    const label = p.meta?.symbol ?? p.token.slice(0, 8);
    console.log(
      `  ${label.padEnd(10)} value ${usd(p.current.value)}  cost ${usd(p.current.costBasis)}  pnl ${usd(p.pnl.total)}`
    );
  }
}

if (!datastreamKey) process.exit(0);

const ds = new Datastream({ wsUrl: `wss://datastream.solanatracker.io/${datastreamKey}` });
ds.on("error", (err) => console.error(err.message));
await ds.connect();

ds.subscribe.pnl.summary(wallet).on((update) => {
  console.log("Live PnL:", usd(update.pnl?.total), "open value", usd(update.openPositions?.value));
});

