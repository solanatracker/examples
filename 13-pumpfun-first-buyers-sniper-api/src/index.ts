import { optionalEnv } from "./env.js";
import { usd, short } from "./format.js";
import { resolvePumpMint } from "./resolve-mint.js";
import { createDataApiClient } from "./client.js";

const datastreamKey = optionalEnv("ST_DATASTREAM_KEY");
const client = createDataApiClient();

console.log("=== Pump.fun first buyers ===\n");

const mint = await resolvePumpMint(client);
const info = await client.getTokenInfo(mint);
console.log(`Token: ${info.token?.symbol || "?"}  risk ${info.risk?.score ?? "?"}/10`);
console.log(`Snipers at check: ${info.risk?.snipers?.totalPercentage?.toFixed(2) ?? "?"}%\n`);

const raw = await client.getFirstBuyers(mint);
const buyers = Array.isArray(raw) ? raw : (raw as { data?: unknown[] })?.data ?? [];
console.log(`First ${buyers.length} buyers:\n`);
console.log("  #  wallet      bought        invested    PnL        holding");

let inProfit = 0;
let soldOut = 0;

buyers.slice(0, 15).forEach((row: Record<string, unknown>, i: number) => {
  const wallet = String(row.wallet || row.address || "?");
  const invested = Number(row.totalInvested ?? row.invested ?? 0);
  const pnl = Number(row.total ?? row.realized ?? 0);
  const holding = Number(row.holding ?? 0);
  const t = row.firstBuyTime ?? row.first_buy_time;
  const when = typeof t === "number" ? new Date(t * 1000).toISOString().slice(11, 16) : "?";

  if (pnl > 0) inProfit++;
  if (holding <= 0 && Number(row.sold ?? 0) > 0) soldOut++;

  console.log(
    `  ${String(i + 1).padStart(2)}  ${short(wallet, 10).padEnd(11)} ${when.padEnd(12)} ${usd(invested).padStart(10)}  ${usd(pnl).padStart(10)}  ${holding > 0 ? "yes" : "no"}`
  );
});

console.log(`\nSummary: ${inProfit} in profit, ${soldOut} fully sold (of top 15 shown)`);

if (!datastreamKey) {
  console.log("\nSet ST_DATASTREAM_KEY + STREAM_SNIPERS=1 to watch live sniper %.");
  process.exit(0);
}

const streamSnipers = optionalEnv("STREAM_SNIPERS");
if (streamSnipers !== "1" && streamSnipers !== "true") {
  console.log("\nREST report complete. Set STREAM_SNIPERS=1 to stream live sniper %.");
  process.exit(0);
}

const { Datastream } = await import("@solana-tracker/data-api");
const ds = new Datastream({ wsUrl: `wss://datastream.solanatracker.io/${datastreamKey}` });
ds.on("error", (e) => console.error("Datastream:", e.message));
await ds.connect();

console.log("\nLive sniper updates:");
ds.subscribe.snipers(mint).on((update: Record<string, unknown>) => {
  const pct = update.totalPercentage ?? update.percentage;
  console.log(new Date().toISOString().slice(11, 19), "sniper %", pct != null ? Number(pct).toFixed(2) : update);
});

