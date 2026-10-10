/**
 * Raw transaction feeds: no protocol knowledge, just filters and balance changes.
 */
import { short, time } from "../lib/format.js";
import { amount } from "../lib/show.js";
import { watchTransactions } from "../lib/watch.js";
import { PROTOCOLS, protocolForProgram } from "../protocols/index.js";

const KNOWN: Record<string, string> = {
  ComputeBudget111111111111111111111111111111: "compute-budget",
  "11111111111111111111111111111111": "system",
  TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA: "token",
  TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb: "token-2022",
  ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL: "associated-token",
};
const programName = (id: string) => protocolForProgram(id)?.id ?? KNOWN[id] ?? short(id);

/**
 * `transactions <address,...>`: every successful transaction that touches any of the addresses,
 * as a wallet, program, pool or mint. Prints the signer and the programs it called at the top level.
 */
export async function transactions(args: string[]) {
  const addresses = (args[0] ?? "").split(",").filter(Boolean);
  watchTransactions({ accountInclude: addresses }, (tx) => {
    const programs = [...new Set(tx.instructions.filter((ix) => ix.depth === 1).map((ix) => programName(ix.programId)))];
    console.log(`${time()}  slot ${tx.slot}  ${short(tx.signature, 8)}  signer ${short(tx.signer)}  ${programs.join(" → ")}`);
  });
  console.log(`Watching transactions that touch ${addresses.map((a) => short(a)).join(", ")}`);
}

/**
 * `token <mint>`: every transaction that moves a token, with the net change per owner and the
 * supported venues it called (or "transfer" when it called none).
 */
export async function token(args: string[]) {
  const mint = args[0] ?? "";
  watchTransactions({ accountInclude: [mint] }, (tx) => {
    const byOwner = new Map<string, bigint>();
    for (const b of tx.balances.values()) {
      if (b.mint !== mint || b.delta === 0n) continue;
      byOwner.set(b.owner, (byOwner.get(b.owner) ?? 0n) + b.delta);
    }
    if (byOwner.size === 0) return;
    const venues = PROTOCOLS.filter((p) => tx.instructions.some((ix) => ix.programId === p.programId)).map((p) => p.id);
    console.log(`${time()}  ${short(tx.signature, 8)}  ${venues.join(",") || "transfer"}`);
    for (const [owner, delta] of byOwner) {
      console.log(`          ${short(owner).padEnd(10)} ${delta > 0n ? "+" : ""}${amount(tx, mint, delta)}`);
    }
  });
  console.log(`Watching balance changes of ${mint}`);
}
