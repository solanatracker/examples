import * as Yellowstone from "@triton-one/yellowstone-grpc";

const Client =
  typeof Yellowstone.default === "function"
    ? Yellowstone.default
    : (Yellowstone.default as { default: typeof Yellowstone.default }).default;
const { CommitmentLevel } = Yellowstone;
import { createHash } from "crypto";
import bs58 from "bs58";
import meteoraIdl from "../idl/meteora-dlmm.json" with { type: "json" };

const METEORA_DLMM = "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo";
const swapIx = meteoraIdl.instructions.find((i) => i.name === "swap");
if (!swapIx) throw new Error("swap instruction missing from idl/meteora-dlmm.json");

/** Anchor legacy IDL — 8-byte sighash prefix (global:swap). */
function anchorDisc(name: string) {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

const SWAP_DISC = anchorDisc("swap");

function parseSwap(data: Buffer) {
  if (data.length < 24 || !data.subarray(0, 8).equals(SWAP_DISC)) return null;
  return {
    amountIn: data.readBigUInt64LE(8).toString(),
    minAmountOut: data.readBigUInt64LE(16).toString(),
  };
}

const endpoint = process.env.YELLOWSTONE_GRPC_ENDPOINT!;
const token = process.env.YELLOWSTONE_GRPC_TOKEN!;
if (!endpoint || !token) {
  console.error("Set YELLOWSTONE_GRPC_ENDPOINT and YELLOWSTONE_GRPC_TOKEN in .env");
  process.exit(1);
}

const client = new Client(endpoint, token, undefined);
await client.connect();
console.log("Meteora DLMM swaps");
const stream = await client.subscribe();

stream.on("data", (update) => {
  const message = update.transaction?.transaction?.transaction?.message;
  const keys = message?.accountKeys ?? [];

  for (const ix of message?.instructions ?? []) {
    const swap = parseSwap(Buffer.from(ix.data));
    if (!swap) continue;
    const lbPair = keys[ix.accounts?.[0] ?? 0];
    const sig = update.transaction?.transaction?.signature;
    const pairKey =
      lbPair == null ? "?" : typeof lbPair === "string" ? lbPair : bs58.encode(Buffer.from(lbPair as Uint8Array));
    console.log("DLMM swap:", swap, "pair", pairKey, sig ? bs58.encode(sig) : "");
  }
});

stream.write({
  transactions: {
    meteora: {
      accountInclude: [METEORA_DLMM],
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

