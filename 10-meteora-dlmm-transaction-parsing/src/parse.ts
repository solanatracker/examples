import { createHash } from "node:crypto";
import bs58 from "bs58";
import idl from "../idl/meteora-dlmm.json" with { type: "json" };
import { accountKeys, flattenInstructions, signatureOf, tokenBalanceChanges, type FlatInstruction, type TxInfo } from "./tx.js";

export const METEORA_DLMM = "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo";

/**
 * The bundled IDL uses the legacy Anchor format (no discriminator fields), so derive them the way Anchor does:
 * sha256("global:<snake_case_name>")[0..8] for instructions, sha256("event:<Name>")[0..8] for events.
 */
const sighash = (preimage: string) => createHash("sha256").update(preimage).digest().subarray(0, 8);
const snake = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
/** Normalizes "lbPair" and "lb_pair" (the IDL mixes both) so account lookups survive either spelling. */
const norm = (name: string) => name.replace(/_/g, "").toLowerCase();

const SWAP_NAMES = ["swap", "swap2", "swapExactOut", "swapWithPriceImpact"] as const;
type SwapName = (typeof SWAP_NAMES)[number];

const variants = SWAP_NAMES.map((name) => {
  const ix = idl.instructions.find((i) => i.name === name);
  if (!ix) throw new Error(`${name} is missing from idl/meteora-dlmm.json`);
  const position = (account: string) => {
    const index = ix.accounts.findIndex((a) => norm(a.name) === norm(account));
    if (index < 0) throw new Error(`${name} has no ${account} account in idl/meteora-dlmm.json`);
    return index;
  };
  return {
    name,
    discriminator: sighash(`global:${snake(name)}`),
    lbPair: position("lbPair"),
    reserveX: position("reserveX"),
    reserveY: position("reserveY"),
    tokenXMint: position("tokenXMint"),
    tokenYMint: position("tokenYMint"),
    user: position("user"),
  };
});

/** Anchor's event-CPI marker (EVENT_IX_TAG, little-endian), then the Swap event discriminator. */
const EVENT_IX_TAG = Buffer.from("e445a52e51cb9a1d", "hex");
const SWAP_EVENT = sighash("event:Swap");
const SWAP_EVENT_LENGTH = 16 + 129; // prefix + borsh body of the Swap event fields in the IDL

export type SwapEvent = {
  lbPair: string;
  from: string;
  startBinId: number;
  endBinId: number;
  amountIn: bigint;
  amountOut: bigint;
  swapForY: boolean;
  fee: bigint;
  protocolFee: bigint;
  hostFee: bigint;
};

export type DlmmSwap = {
  signature: string;
  slot: string;
  path: string;
  viaProgram: string | null;
  /** IDL instruction name, or "unlisted" when only the Swap event identified it (a variant newer than the IDL). */
  kind: SwapName | "unlisted";
  lbPair: string;
  user: string;
  inputMint?: string;
  outputMint?: string;
  inputDecimals?: number;
  outputDecimals?: number;
  /** Executed amounts (raw integers). From the Swap event when present, else from reserve deltas. */
  amountIn?: bigint;
  amountOut?: bigint;
  /** Requested amount from the instruction arguments (amount in, or exact amount out for swapExactOut). */
  requested: bigint;
  fillSource: "event" | "reserves" | "none";
  event?: SwapEvent;
};

function decodeSwapEvent(data: Buffer): SwapEvent | undefined {
  if (data.length < SWAP_EVENT_LENGTH) return undefined;
  if (!data.subarray(0, 8).equals(EVENT_IX_TAG) || !data.subarray(8, 16).equals(SWAP_EVENT)) return undefined;
  const body = data.subarray(16);
  return {
    lbPair: bs58.encode(body.subarray(0, 32)),
    from: bs58.encode(body.subarray(32, 64)),
    startBinId: body.readInt32LE(64),
    endBinId: body.readInt32LE(68),
    amountIn: body.readBigUInt64LE(72),
    amountOut: body.readBigUInt64LE(80),
    swapForY: body[88] === 1,
    fee: body.readBigUInt64LE(89),
    protocolFee: body.readBigUInt64LE(97),
    // feeBps is a u128 at 105..121; skipped here.
    hostFee: body.readBigUInt64LE(121),
  };
}

/** Returns every DLMM swap in a transaction, top-level or routed through another program. */
export function parseDlmmSwaps(info: TxInfo, slot: string): DlmmSwap[] {
  if (info.meta?.err) return [];
  const keys = accountKeys(info);
  const changes = tokenBalanceChanges(info, keys);
  const decimalsOf = (mint: string) => [...changes.values()].find((c) => c.mint === mint)?.decimals;
  const instructions = flattenInstructions(info, keys);

  const events = instructions
    .map((ix, position) => ({ position, ix, event: ix.programId === METEORA_DLMM ? decodeSwapEvent(ix.data) : undefined }))
    .filter((e): e is { position: number; ix: FlatInstruction; event: SwapEvent } => e.event !== undefined);
  const used = new Set<number>();
  const swaps: DlmmSwap[] = [];

  instructions.forEach((ix, position) => {
    if (ix.programId !== METEORA_DLMM || ix.data.length < 16) return;
    const variant = variants.find((v) => ix.data.subarray(0, 8).equals(v.discriminator));
    if (!variant) return;

    const lbPair = ix.accounts[variant.lbPair] ?? "?";
    const mintX = ix.accounts[variant.tokenXMint];
    const mintY = ix.accounts[variant.tokenYMint];
    // The event is emitted as a self-CPI after the swap instruction: take the first unused one for this pair.
    const match = events.find((e) => e.position > position && !used.has(e.position) && e.event.lbPair === lbPair);
    if (match) used.add(match.position);

    const swap: DlmmSwap = {
      signature: signatureOf(info),
      slot,
      path: ix.path,
      viaProgram: ix.inner ? ix.outerProgramId : null,
      kind: variant.name,
      lbPair,
      user: ix.accounts[variant.user] ?? "?",
      requested: ix.data.readBigUInt64LE(variant.name === "swapExactOut" ? 16 : 8),
      fillSource: "none",
    };

    if (match && mintX && mintY) {
      const e = match.event;
      Object.assign(swap, {
        event: e,
        fillSource: "event",
        amountIn: e.amountIn,
        amountOut: e.amountOut,
        inputMint: e.swapForY ? mintX : mintY,
        outputMint: e.swapForY ? mintY : mintX,
      });
    } else {
      // Fallback: the pair's reserve vaults gain the input token and lose the output token.
      const rx = changes.get(ix.accounts[variant.reserveX] ?? "");
      const ry = changes.get(ix.accounts[variant.reserveY] ?? "");
      const into = [rx, ry].find((c) => c && c.delta > 0n);
      const outOf = [rx, ry].find((c) => c && c.delta < 0n);
      if (into && outOf) {
        Object.assign(swap, {
          fillSource: "reserves",
          amountIn: into.delta,
          amountOut: -outOf.delta,
          inputMint: into.mint,
          outputMint: outOf.mint,
        });
      }
    }
    if (swap.inputMint) swap.inputDecimals = decimalsOf(swap.inputMint);
    if (swap.outputMint) swap.outputDecimals = decimalsOf(swap.outputMint);
    swaps.push(swap);
  });

  // Swap events with no matching instruction come from swap variants the bundled IDL does not list.
  for (const { position, ix, event } of events) {
    if (used.has(position)) continue;
    swaps.push({
      signature: signatureOf(info),
      slot,
      path: ix.path,
      viaProgram: ix.outerProgramId === METEORA_DLMM ? null : ix.outerProgramId,
      kind: "unlisted",
      lbPair: event.lbPair,
      user: event.from,
      amountIn: event.amountIn,
      amountOut: event.amountOut,
      requested: event.amountIn,
      fillSource: "event",
      event,
    });
  }
  return swaps;
}

/**
 * Raw bin price (token Y atoms per token X atom) for a bin: (1 + binStep / 10_000) ^ binId.
 * Multiply by 10^(decimalsX - decimalsY) for a human-unit price. binStep lives in the LbPair account.
 */
export function binPrice(binId: number, binStep: number, decimalsX: number, decimalsY: number): number {
  return (1 + binStep / 10_000) ** binId * 10 ** (decimalsX - decimalsY);
}
