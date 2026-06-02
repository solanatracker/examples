import { Datastream } from "@solana-tracker/data-api";

const datastreamKey = process.env.ST_DATASTREAM_KEY;
const mint = process.env.TOKEN_MINT || "So11111111111111111111111111111111111111112";
if (!datastreamKey) {
  console.error("Set ST_DATASTREAM_KEY in .env");
  process.exit(1);
}

const ds = new Datastream({ wsUrl: `wss://datastream.solanatracker.io/${datastreamKey}` });
ds.on("error", (err) => console.error(err.message));
await ds.connect();
console.log("Streaming trades for", mint.slice(0, 8) + "…");

ds.subscribe.tx.token(mint).on((tx) => {
  const side = tx.type || tx.side || "?";
  const usd = tx.volumeUsd ?? tx.amountUsd ?? tx.priceUsd;
  const wallet = tx.wallet || tx.owner || tx.trader;
  console.log(
    side.toString().padEnd(4),
    usd != null ? `$${Number(usd).toFixed(2)}`.padStart(10) : "",
    wallet ? wallet.slice(0, 8) + "…" : "",
    tx.tx?.slice(0, 8) ?? ""
  );
});

