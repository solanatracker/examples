import { Connection } from "@solana/web3.js";

const rpc = process.env.DEDICATED_RPC_URL || process.env.RPC_URL;
if (!rpc) {
  console.error("Set DEDICATED_RPC_URL in .env");
  process.exit(1);
}

const connection = new Connection(rpc, "processed");
const slot = await connection.getSlot("processed");
console.log("Processed slot:", slot);

