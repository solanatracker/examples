import { Datastream } from "@solana-tracker/data-api";

const datastreamKey = process.env.ST_DATASTREAM_KEY;
if (!datastreamKey) {
  console.error("Set ST_DATASTREAM_KEY in .env");
  process.exit(1);
}

const ds = new Datastream({ wsUrl: `wss://datastream.solanatracker.io/${datastreamKey}` });
ds.on("error", (err) => console.error(err.message));

await ds.connect();
console.log("Connected");

ds.subscribe.latest().on((token) => {
  const pool = token.pools?.[0];
  if (pool?.market !== "pumpfun") return;
  console.log(
    "Launch:",
    token.token.symbol || token.token.name,
    token.token.mint,
    `$${(pool.liquidity?.usd ?? 0).toFixed(0)} liq`,
    `risk ${token.risk?.score ?? "?"}`
  );
});

