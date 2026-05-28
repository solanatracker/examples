import * as Yellowstone from "@triton-one/yellowstone-grpc";

const Client =
  typeof Yellowstone.default === "function"
    ? Yellowstone.default
    : (Yellowstone.default as { default: typeof Yellowstone.default }).default;
const { CommitmentLevel } = Yellowstone;
import bs58 from "bs58";

const endpoint = process.env.YELLOWSTONE_GRPC_ENDPOINT;
const token = process.env.YELLOWSTONE_GRPC_TOKEN;
if (!endpoint || !token) {
  console.error("Set YELLOWSTONE_GRPC_ENDPOINT and YELLOWSTONE_GRPC_TOKEN in .env");
  process.exit(1);
}

const PUMP_FUN = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
const client = new Client(endpoint, token, undefined);
await client.connect();

const version = await client.getVersion();
console.log("Connected:", version);

const stream = await client.subscribe();

stream.on("data", (data) => {
  const sig = data.transaction?.transaction?.signature;
  if (sig) console.log("Tx:", bs58.encode(sig));
});

stream.write({
  transactions: {
    pumpfun: {
      accountInclude: [PUMP_FUN],
      accountExclude: [],
      accountRequired: [],
      failed: false,
      vote: false,
    },
  },
  accounts: {},
  slots: {},
  blocks: {},
  blocksMeta: {},
  entry: {},
  accountsDataSlice: [],
  transactionsStatus: {},
  commitment: CommitmentLevel.PROCESSED,
});

stream.on("error", (e) => console.error(e.message));

