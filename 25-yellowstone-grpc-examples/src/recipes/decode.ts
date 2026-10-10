/**
 * Replays one historical transaction through the same decoders the streams use. The fastest way
 * to check a decoder, or to see what a recipe would have printed for a transaction you found
 * in an explorer, without waiting for a live one.
 */
import { requireEnv } from "../lib/env.js";
import { short } from "../lib/format.js";
import type { Value } from "../lib/idl.js";
import { eventsOf, instructionsOf, parseTx } from "../lib/parsed.js";
import { fetchTransaction } from "../lib/replay.js";
import { launchLine, migrationLine, poolLine, tradeLine } from "../lib/show.js";
import { PROTOCOLS } from "../protocols/index.js";

/** Compact one-line rendering of decoded fields. Bigints print as integers, byte arrays by length. */
function render(value: Value): string {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) {
    if (value.length > 8 && value.every((v) => typeof v === "number")) return `[${value.length} bytes]`;
    return `[${value.map(render).join(", ")}]`;
  }
  if (value && typeof value === "object") {
    return `{ ${Object.entries(value).map(([k, v]) => `${k}: ${render(v)}`).join(", ")} }`;
  }
  return JSON.stringify(value);
}

/** `decode <signature>`: decoded instructions, events and recipe output for one transaction. */
export async function decode(args: string[]) {
  const signature = args[0]!;
  const fetched = await fetchTransaction(requireEnv("SOLANA_RPC_URL", "any Solana JSON-RPC endpoint"), signature);
  if (!fetched) throw new Error(`Transaction ${signature} not found. It may be too recent, or older than the RPC node keeps.`);

  const tx = parseTx(fetched.info, fetched.slot);
  console.log(`${tx.signature}\nslot ${tx.slot}  signer ${tx.signer}  ${tx.failed ? "FAILED" : "succeeded"}  ${tx.instructions.length} instructions incl. CPIs`);

  const involved = PROTOCOLS.filter((p) => tx.instructions.some((ix) => ix.programId === p.programId));
  if (!involved.length) {
    console.log("\nNo supported venue in this transaction. Programs called:");
    for (const id of new Set(tx.instructions.map((ix) => ix.programId))) console.log(`  ${id}`);
    return;
  }

  for (const p of involved) {
    console.log(`\n── ${p.label} (${short(p.programId)})`);
    for (const ix of instructionsOf(tx, p.coder)) {
      console.log(`  ix ${ix.path.padEnd(6)} ${ix.name}  ${render(ix.args)}`);
    }
    for (const e of eventsOf(tx, p.coder)) {
      console.log(`  ev ${e.path.padEnd(6)} ${e.name}  ${render(e.data)}`);
    }
  }

  const lines = involved.flatMap((p) => [
    ...p.trades(tx).map((t) => tradeLine(t, tx)),
    ...(p.pools?.(tx) ?? []).map(poolLine),
    ...(p.launches?.(tx) ?? []).map(launchLine),
    ...(p.migrations?.(tx) ?? []).map(migrationLine),
  ]);
  console.log(`\n── What the stream recipes print\n${lines.length ? lines.join("\n") : "  (no trades, pools, launches or migrations)"}`);
}
