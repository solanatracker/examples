import idl from "../idl/raydium-amm.json" with { type: "json" };
import { accountKeys, flattenInstructions, signatureOf, tokenBalanceChanges, type TxInfo } from "./tx.js";

export const RAYDIUM_AMM_V4 = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8";
export const WSOL_MINT = "So11111111111111111111111111111111111111112";

/**
 * AMM v4 is not an Anchor program: the first data byte is the instruction tag, and the bundled IDL
 * lists instructions in tag order. swapBaseIn resolves to 9 and swapBaseOut to 11.
 */
const tagOf = (name: string): number => {
  const index = idl.instructions.findIndex((ix) => ix.name === name);
  if (index < 0) throw new Error(`${name} is missing from idl/raydium-amm.json`);
  return index;
};
const SWAP_BASE_IN = tagOf("swapBaseIn");
const SWAP_BASE_OUT = tagOf("swapBaseOut");
/**
 * Tags 16 and 17 (SwapBaseInV2 / SwapBaseOutV2 in the Raydium AMM source) are newer than the bundled IDL.
 * They take the same arguments as tags 9 and 11 with an 8-account list that drops the OpenBook accounts.
 */
const SWAP_BASE_IN_V2 = 16;
const SWAP_BASE_OUT_V2 = 17;
const KINDS: Record<number, RaydiumSwap["kind"]> = {
  [SWAP_BASE_IN]: "swapBaseIn",
  [SWAP_BASE_OUT]: "swapBaseOut",
  [SWAP_BASE_IN_V2]: "swapBaseInV2",
  [SWAP_BASE_OUT_V2]: "swapBaseOutV2",
};
/** tag (1 byte) + two u64 arguments */
const SWAP_DATA_LENGTH = 17;
/** Positions shared by the 18-, 17- and 8-account swap forms: tokenProgram, amm, ammAuthority. */
const AMM_INDEX = 1;
const AUTHORITY_INDEX = 2;

export type Leg = { mint: string; raw: bigint; decimals: number };

export type RaydiumSwap = {
  signature: string;
  slot: string;
  path: string;
  /** null for a top-level call; otherwise the program that invoked Raydium (an aggregator or bot). */
  viaProgram: string | null;
  pool: string;
  kind: "swapBaseIn" | "swapBaseOut" | "swapBaseInV2" | "swapBaseOutV2";
  /** Instruction arguments: limits the user signed, not the fill. */
  args: { amountIn: bigint; minimumAmountOut: bigint } | { maxAmountIn: bigint; amountOut: bigint };
  /** Fill from the pool vault balance deltas; undefined when they cannot be attributed. */
  input?: Leg;
  output?: Leg;
  /** Number of swaps against this pool in the same transaction. Vault deltas are their net when > 1. */
  poolSwapsInTx: number;
  feePayer: string;
};

export function parseRaydiumSwaps(info: TxInfo, slot: string): RaydiumSwap[] {
  if (info.meta?.err) return []; // a failed swap moved nothing except the fee
  const keys = accountKeys(info);
  const changes = tokenBalanceChanges(info, keys);
  const swaps: RaydiumSwap[] = [];

  for (const ix of flattenInstructions(info, keys)) {
    if (ix.programId !== RAYDIUM_AMM_V4 || ix.data.length !== SWAP_DATA_LENGTH) continue;
    const tag = ix.data[0];
    const kind = tag === undefined ? undefined : KINDS[tag];
    if (!kind) continue; // deposits, withdrawals, admin instructions

    const pool = ix.accounts[AMM_INDEX];
    const authority = ix.accounts[AUTHORITY_INDEX];
    if (!pool || !authority) continue;
    const a = ix.data.readBigUInt64LE(1);
    const b = ix.data.readBigUInt64LE(9);

    // Pool vaults are the token accounts in this instruction that the AMM authority owns.
    const vaults = ix.accounts
      .map((account) => changes.get(account))
      .filter((c) => c !== undefined && c.owner === authority && c.delta !== 0n);
    const into = vaults.find((v) => v!.delta > 0n);
    const outOf = vaults.find((v) => v!.delta < 0n);

    swaps.push({
      signature: signatureOf(info),
      slot,
      path: ix.path,
      viaProgram: ix.inner ? ix.outerProgramId : null,
      pool,
      kind,
      args:
        tag === SWAP_BASE_IN || tag === SWAP_BASE_IN_V2
          ? { amountIn: a, minimumAmountOut: b }
          : { maxAmountIn: a, amountOut: b },
      input: into ? { mint: into.mint, raw: into.delta, decimals: into.decimals } : undefined,
      output: outOf ? { mint: outOf.mint, raw: -outOf.delta, decimals: outOf.decimals } : undefined,
      poolSwapsInTx: 0,
      feePayer: keys[0] ?? "?",
    });
  }

  for (const swap of swaps) swap.poolSwapsInTx = swaps.filter((s) => s.pool === swap.pool).length;
  return swaps;
}
