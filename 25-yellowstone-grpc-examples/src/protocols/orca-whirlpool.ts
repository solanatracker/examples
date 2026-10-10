import idl from "../../idl/orca-whirlpool.json" with { type: "json" };
import { big, str } from "../lib/parsed.js";
import type { ProgramInstruction } from "../lib/parsed.js";
import type { ParsedTx } from "../lib/parsed.js";
import { base, coderFor, decode, mintOf } from "./shared.js";
import type { Protocol, Trade } from "./types.js";

const coder = coderFor(idl);

/**
 * Input and output mints of one swap leg. `swapV2` names the pool's mints; `swap` and `twoHopSwap`
 * only name vaults, so the mint comes from the balance list; `twoHopSwapV2` names input,
 * intermediate and output mints. `hop` is 0 for the first pool of a two-hop swap and 1 for the second.
 */
function legMints(tx: ParsedTx, ix: ProgramInstruction, hop: number, aToB: boolean): [string, string] {
  const a = ix.accounts;
  const orient = (mintA: string | undefined, mintB: string | undefined): [string, string] =>
    aToB ? [mintA ?? "", mintB ?? ""] : [mintB ?? "", mintA ?? ""];
  if (ix.name === "swapV2") return orient(a.tokenMintA, a.tokenMintB);
  if (ix.name === "swap") return orient(mintOf(tx, a.tokenVaultA), mintOf(tx, a.tokenVaultB));
  if (ix.name === "twoHopSwapV2") {
    return hop === 0
      ? [a.tokenMintInput ?? "", a.tokenMintIntermediate ?? ""]
      : [a.tokenMintIntermediate ?? "", a.tokenMintOutput ?? ""];
  }
  const leg = hop === 0 ? "One" : "Two";
  return orient(mintOf(tx, a[`tokenVault${leg}A`]), mintOf(tx, a[`tokenVault${leg}B`]));
}

export const orcaWhirlpool: Protocol = {
  id: "orca-whirlpool",
  label: "Orca Whirlpool",
  programId: coder.programId,
  coder,

  // One Traded event per pool touched, so a two-hop swap yields two trades (one per leg).
  trades(tx) {
    const d = decode(tx, coder);
    const out: Trade[] = [];
    // Events at the same path are the legs of one instruction, in execution order.
    const legs = new Map<string, number>();
    for (const e of d.eventsNamed("Traded")) {
      const ix = d.ixAt(e.path);
      if (!ix) continue;
      const hop = legs.get(e.path) ?? 0;
      legs.set(e.path, hop + 1);
      const [inputMint, outputMint] = legMints(tx, ix, hop, e.data.aToB === true);
      out.push({
        ...base(tx, "orca-whirlpool"),
        label: ix.name,
        path: e.path,
        trader: ix.accounts.tokenAuthority ?? tx.signer,
        pool: str(e.data.whirlpool),
        inputMint,
        inputAmount: big(e.data.inputAmount),
        outputMint,
        outputAmount: big(e.data.outputAmount),
      });
    }
    return out;
  },

  pools(tx) {
    const d = decode(tx, coder);
    return d.eventsNamed("PoolInitialized").map((e) => ({
      ...base(tx, "orca-whirlpool"),
      pool: str(e.data.whirlpool),
      mintA: str(e.data.tokenMintA),
      mintB: str(e.data.tokenMintB),
      creator: d.ixAt(e.path)?.accounts.funder ?? tx.signer,
    }));
  },
};
