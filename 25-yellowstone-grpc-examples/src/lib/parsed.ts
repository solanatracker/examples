import bs58 from "bs58";
import type { Coder, DecodedInstruction, DecodedRecord } from "./idl.js";
import {
  accountKeys,
  flattenInstructions,
  rawEvents,
  signatureOf,
  tokenBalanceChanges,
  transfers,
  WSOL,
  type Instruction,
  type RawEvent,
  type TokenBalanceChange,
  type Transfer,
  type TxInfo,
} from "./tx.js";

/** Everything recipes need from one transaction, computed once and shared by every protocol decoder. */
export type ParsedTx = {
  signature: string;
  slot: string;
  /** Fee payer: the first signer. */
  signer: string;
  failed: boolean;
  instructions: Instruction[];
  balances: Map<string, TokenBalanceChange>;
  transfers: Transfer[];
  events: RawEvent[];
  logs: string[];
  decimals(mint: string): number | undefined;
};

export function parseTx(info: TxInfo, slot: string): ParsedTx {
  const keys = accountKeys(info);
  const instructions = flattenInstructions(info, keys);
  const balances = tokenBalanceChanges(info, keys);
  const logs = info.meta?.logMessages ?? [];
  const decimalsByMint = new Map([...balances.values()].map((b) => [b.mint, b.decimals]));
  decimalsByMint.set(WSOL, 9);
  return {
    signature: signatureOf(info),
    slot,
    signer: keys[0] ?? "",
    failed: info.meta?.err !== undefined,
    instructions,
    balances,
    transfers: transfers(instructions, balances),
    events: rawEvents(instructions, logs),
    logs,
    decimals: (mint) => decimalsByMint.get(mint),
  };
}

export type ProgramInstruction = DecodedInstruction & { path: string; depth: number };
export type ProgramEvent = DecodedRecord & { path: string };

/** Decoded instructions for one program, top-level and CPI. Unknown discriminators are skipped. */
export function instructionsOf(tx: ParsedTx, coder: Coder): ProgramInstruction[] {
  const out: ProgramInstruction[] = [];
  for (const ix of tx.instructions) {
    if (ix.programId !== coder.programId) continue;
    const decoded = coder.instruction(ix.data, ix.accounts);
    if (decoded) out.push({ ...decoded, path: ix.path, depth: ix.depth });
  }
  return out;
}

/** Decoded events for one program. An event emitted both ways is reported once. */
export function eventsOf(tx: ParsedTx, coder: Coder): ProgramEvent[] {
  const seen = new Set<string>();
  const out: ProgramEvent[] = [];
  for (const e of tx.events) {
    if (e.programId !== coder.programId) continue;
    const id = `${e.path}:${e.data.toString("base64")}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const decoded = coder.event(e.data);
    if (decoded) out.push({ ...decoded, path: e.path });
  }
  return out;
}

/** Narrow helpers for reading decoded values without casts at every call site. */
export const big = (v: unknown): bigint => (typeof v === "bigint" ? v : typeof v === "number" ? BigInt(v) : 0n);
export const str = (v: unknown): string => (typeof v === "string" ? v : "");
export const num = (v: unknown): number => (typeof v === "number" ? v : typeof v === "bigint" ? Number(v) : 0);

export const isPubkey = (v: string) => {
  try {
    return bs58.decode(v).length === 32;
  } catch {
    return false;
  }
};
