import * as Yellowstone from "@triton-one/yellowstone-grpc";

const Client =
  typeof Yellowstone.default === "function"
    ? Yellowstone.default
    : (Yellowstone.default as { default: typeof Yellowstone.default }).default;
const { CommitmentLevel } = Yellowstone;
import { BorshInstructionCoder, type Idl } from "@coral-xyz/anchor";
import bs58 from "bs58";
import pumpfunIdl from "../idl/pumpfun.json" with { type: "json" };

const PUMP_FUN = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
const ixCoder = new BorshInstructionCoder(pumpfunIdl as Idl);
const createIx = pumpfunIdl.instructions.find((i) => i.name === "create");
const createV2Ix = pumpfunIdl.instructions.find((i) => i.name === "create_v2");
if (!createIx?.discriminator || !createV2Ix?.discriminator) {
  throw new Error("create/create_v2 missing from idl/pumpfun.json");
}
const CREATE_DISCS = [
  Buffer.from(createIx.discriminator),
  Buffer.from(createV2Ix.discriminator),
];

function matchesCreateDisc(data: Buffer) {
  return data.length >= 8 && CREATE_DISCS.some((disc) => data.subarray(0, 8).equals(disc));
}

function accountKey(keys: unknown[], index: number) {
  const key = keys[index];
  if (!key) return "unknown";
  if (typeof key === "string") return key;
  return bs58.encode(Buffer.from(key as Uint8Array));
}

const endpoint = process.env.YELLOWSTONE_GRPC_ENDPOINT!;
const token = process.env.YELLOWSTONE_GRPC_TOKEN!;
if (!endpoint || !token) {
  console.error("Set YELLOWSTONE_GRPC_ENDPOINT and YELLOWSTONE_GRPC_TOKEN in .env");
  process.exit(1);
}

const client = new Client(endpoint, token, undefined);
await client.connect();
console.log("Pump.fun creates");
const stream = await client.subscribe();

stream.on("data", (update) => {
  const tx = update.transaction?.transaction;
  const message = tx?.transaction?.message;
  if (!message) return;
  const keys = message.accountKeys ?? [];
  const allIxs = [
    ...(message.instructions ?? []),
    ...(tx?.meta?.innerInstructions ?? []).flatMap((group) => group.instructions ?? []),
  ];

  for (const ix of allIxs) {
    const data = Buffer.from(ix.data);
    if (!matchesCreateDisc(data)) continue;

    const decoded = ixCoder.decode(data);
    if (decoded?.name !== "create" && decoded?.name !== "create_v2") continue;

    const mint = accountKey(keys, ix.accounts?.[0] ?? 0);
    const sig = tx?.signature;
    console.log(
      "New mint:",
      decoded.data.name,
      decoded.data.symbol,
      mint,
      sig ? bs58.encode(sig) : ""
    );
  }
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

