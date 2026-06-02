import { Client, Datastream } from "@solana-tracker/data-api";

if (!(process.env.ST_API_KEY || process.env.SOLANA_TRACKER_API_KEY)) {
  console.error("Set ST_API_KEY in .env");
  process.exit(1);
}

const client = new Client({
  apiKey: process.env.ST_API_KEY || process.env.SOLANA_TRACKER_API_KEY,
  baseUrl: process.env.DATA_API_BASE_URL || 'https://data.solanatracker.io',
});

const mint = process.env.TOKEN_MINT || "So11111111111111111111111111111111111111112";
const buyers = await client.getFirstBuyers(mint);
console.log(`First ${buyers.length} buyers for ${mint.slice(0, 8)}…`);
for (const row of buyers.slice(0, 10)) {
  const wallet = row.wallet || row.address || "?";
  const pnl = row.total != null ? ` PnL $${row.total.toFixed(0)}` : "";
  console.log(wallet.slice(0, 8) + "…", row.first_buy_time || row.firstBuyTime || "", pnl);
}

const datastreamKey = process.env.ST_DATASTREAM_KEY;
if (datastreamKey) {
  const ds = new Datastream({ wsUrl: `wss://datastream.solanatracker.io/${datastreamKey}` });
  await ds.connect();
  console.log("Watching sniper updates (Ctrl+C to exit)…");
  ds.subscribe.snipers(mint).on((update) => {
    const pct = update.totalPercentage ?? update.percentage;
    console.log("Snipers:", pct != null ? `${pct.toFixed(2)}%` : update);
  });
} else {
  console.log("Tip: set ST_DATASTREAM_KEY to stream live sniper % updates");
}

