import * as Yellowstone from "@triton-one/yellowstone-grpc";

const Client =
  typeof Yellowstone.default === "function"
    ? Yellowstone.default
    : (Yellowstone.default as { default: typeof Yellowstone.default }).default;
const { CommitmentLevel } = Yellowstone;
import bs58 from "bs58";
import raydiumIdl from "../idl/raydium-amm.json" with { type: "json" };

const RAYDIUM_AMM = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8";
const swapIx = raydiumIdl.instructions.find((i) => i.name === "swapBaseIn");
if (!swapIx) throw new Error("swapBaseIn missing from idl/raydium-amm.json");

const endpoint = process.env.YELLOWSTONE_GRPC_ENDPOINT!;
const token = process.env.YELLOWSTONE_GRPC_TOKEN!;
if (!endpoint || !token) {
  console.error("Set YELLOWSTONE_GRPC_ENDPOINT and YELLOWSTONE_GRPC_TOKEN in .env");
  process.exit(1);
}

const client = new Client(endpoint, token, undefined);
await client.connect();
const stream = await client.subscribe();

/** Raydium legacy AMM uses single-byte tags — swapBaseIn is tag 9 (see idl/raydium-amm.json). */
function parseSwap(data: Buffer) {
  if (data.length < 17) return null;
  if (data.readUInt8(0) !== 9) return null;
  return {
    amountIn: data.readBigUInt64LE(1).toString(),
    minAmountOut: data.readBigUInt64LE(9).toString(),
  };
}

stream.on("data", (update) => {
  const message = update.transaction?.transaction?.transaction?.message;
  const keys = message?.accountKeys ?? [];
  for (const ix of message?.instructions ?? []) {
    const swap = parseSwap(Buffer.from(ix.data));
    if (!swap) continue;
    const pool = keys[ix.accounts?.[1] ?? 0];
    const sig = update.transaction?.transaction?.signature;
    const poolKey =
      pool == null ? "?" : typeof pool === "string" ? pool : bs58.encode(Buffer.from(pool as Uint8Array));
    console.log("Swap", swap, "pool", poolKey, sig ? bs58.encode(sig) : "");
  }
});

stream.write({
  transactions: {
    raydium: {
      accountInclude: [RAYDIUM_AMM],
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

