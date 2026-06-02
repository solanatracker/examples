import { requireEnv, optionalEnv } from "./env.js";
import { usd, short } from "./format.js";
import { TradeTape, printTrade } from "./trade-tape.js";
import { createDataApiClient } from "./client.js";

const datastreamKey = requireEnv("ST_DATASTREAM_KEY", "dashboard → Datastream section");
const mint = optionalEnv("TOKEN_MINT", "So11111111111111111111111111111111111111112")!;

const client = createDataApiClient();

console.log("=== Live trade tape ===");
console.log("Mint:", mint);

const info = await client.getTokenInfo(mint);
const pool = info.pools?.[0];
console.log(
  "Token:", info.token?.symbol || short(mint),
  "| Price:", usd(pool?.price?.usd),
  "| Market:", pool?.market ?? "?"
);

try {
  const history = await client.getTokenTrades(mint);
  const trades = (history as { trades?: unknown[] })?.trades ?? (Array.isArray(history) ? history : []);
  if (trades.length) {
    console.log("\n--- REST backfill (last trades) ---");
    for (const t of trades.slice(0, 6)) printTrade(t as Record<string, unknown>);
  }
} catch (e) {
  console.warn("Backfill skipped:", (e as Error).message);
}

const tape = new TradeTape();
console.log("\n--- Live stream (Ctrl+C for summary) ---");

const { Datastream } = await import("@solana-tracker/data-api");
const ds = new Datastream({ wsUrl: `wss://datastream.solanatracker.io/${datastreamKey}` });
ds.on("error", (e) => console.error("Datastream:", e.message));
ds.on("disconnected", () => {
  console.warn("Disconnected — reconnecting in 2s…");
  setTimeout(() => void ds.connect(), 2000);
});

await ds.connect();
ds.subscribe.tx.token(mint).on((tx) => {
  tape.record(tx as Record<string, unknown>);
  printTrade(tx as Record<string, unknown>);
});

const statsTimer = setInterval(() => {
  const s = tape.summary();
  if (!s.count) return;
  console.log(`[stats] ${s.count} trades | buys ${s.buys} sells ${s.sells} | vol ${usd(s.volumeUsd)}`);
}, 30000);

process.on("SIGINT", () => {
  clearInterval(statsTimer);
  console.log("\n--- Session summary ---");
  console.log(JSON.stringify(tape.summary(), null, 2));
  process.exit(0);
});

