import type { Coder } from "../lib/idl.js";
import type { ParsedTx } from "../lib/parsed.js";

type Base = { venue: string; signature: string; slot: string };

/** One swap leg: what left the trader and what came back, in raw integer units. */
export type Trade = Base & {
  /** Venue-specific action name: "buy", "sell", "swap", "swapV2"... */
  label: string;
  /** Call-tree path of the swap instruction. Several trades in one transaction have different paths. */
  path: string;
  trader: string;
  pool: string;
  inputMint: string;
  inputAmount: bigint;
  outputMint: string;
  outputAmount: bigint;
};

export type NewPool = Base & { pool: string; mintA: string; mintB: string; creator: string };

/** A token created on a launchpad bonding curve. */
export type Launch = Base & {
  mint: string;
  /** Bonding curve / launch pool account. */
  curve: string;
  creator: string;
  name?: string;
  symbol?: string;
  uri?: string;
};

/** A launchpad token leaving its curve for an AMM pool. */
export type Migration = Base & { mint: string; curve: string; pool?: string };

export type Protocol = {
  /** Short id used on the command line, e.g. `pump-amm`. */
  id: string;
  label: string;
  programId: string;
  coder: Coder;
  trades(tx: ParsedTx): Trade[];
  pools?(tx: ParsedTx): NewPool[];
  launches?(tx: ParsedTx): Launch[];
  migrations?(tx: ParsedTx): Migration[];
};
