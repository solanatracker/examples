import { Datastream } from "@solana-tracker/data-api";

const datastreamKey = process.env.ST_DATASTREAM_KEY;
if (!datastreamKey) {
  console.error("Set ST_DATASTREAM_KEY in .env");
  process.exit(1);
}

const MINT = "So11111111111111111111111111111111111111112";
const ds = new Datastream({ wsUrl: `wss://datastream.solanatracker.io/${datastreamKey}` });
ds.on("error", (err) => console.error(err.message));

await ds.connect();
console.log("Streaming SOL price");

ds.subscribe.price.aggregated(MINT).on((u) => {
  const { median, poolCount } = u.aggregated;
  console.log("SOL median USD:", median?.toFixed(4), `(${poolCount} pools)`);
});

