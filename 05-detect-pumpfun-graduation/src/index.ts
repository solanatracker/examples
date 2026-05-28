import { Client, Datastream } from "@solana-tracker/data-api";

const datastreamKey = process.env.ST_DATASTREAM_KEY;
if (!(process.env.ST_API_KEY || process.env.SOLANA_TRACKER_API_KEY) || !datastreamKey) {
  console.error("Set ST_DATASTREAM_KEY and ST_API_KEY in .env");
  process.exit(1);
}

const client = new Client({
  apiKey: process.env.ST_API_KEY || process.env.SOLANA_TRACKER_API_KEY,
  baseUrl: process.env.DATA_API_BASE_URL || 'https://data.solanatracker.io',
});

const watching = new Set<string>();
const ds = new Datastream({ wsUrl: `wss://datastream.solanatracker.io/${datastreamKey}` });
ds.on("error", (err) => console.error(err.message));

await ds.connect();
console.log("Watching graduations");

ds.subscribe.curvePercentage("pumpfun", 85).on((t) => {
  watching.add(t.token.mint);
  const pct = t.pools?.[0]?.curvePercentage ?? "?";
  console.log("Near grad:", t.token.symbol || t.token.mint, `${pct}%`);
});

ds.subscribe.graduated().on((t) => {
  if (!watching.has(t.token.mint)) return;
  console.log("Graduated:", t.token.symbol || t.token.name, t.pools?.[0]?.poolId ?? "");
  watching.delete(t.token.mint);
});

const recent = await client.getGraduatedTokens({ limit: 20, reduceSpam: true });
console.log("Recent graduations:", recent.length);

