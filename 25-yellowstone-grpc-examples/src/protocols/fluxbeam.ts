import idl from "../../idl/fluxbeam.json" with { type: "json" };
import { base, coderFor, decode, mintOf, moved } from "./shared.js";
import type { Protocol } from "./types.js";

const coder = coderFor(idl);

export const fluxbeam: Protocol = {
  id: "fluxbeam",
  label: "FluxBeam",
  programId: coder.programId,
  coder,

  // A token-swap style program without events: the trader's deposit lands in `swapSource`
  // and the payout leaves `swapDestination`. Token-2022 transfer fees make these differ from the args.
  trades(tx) {
    return decode(tx, coder)
      .ixsNamed("swap")
      .map((ix) => {
        const a = ix.accounts;
        const paid = moved(tx, ix.path, { to: a.swapSource });
        const got = moved(tx, ix.path, { from: a.swapDestination });
        return {
          ...base(tx, "fluxbeam"),
          label: ix.name,
          path: ix.path,
          trader: a.userTransferAuthority ?? tx.signer,
          pool: a.swap ?? "",
          inputMint: a.sourceMint ?? paid.mint ?? "",
          inputAmount: paid.amount,
          outputMint: a.destinationMint ?? got.mint ?? "",
          outputAmount: got.amount,
        };
      })
      .filter((t) => t.inputAmount > 0n && t.outputAmount > 0n);
  },

  pools(tx) {
    return decode(tx, coder)
      .ixsNamed("initialize")
      .map((ix) => ({
        ...base(tx, "fluxbeam"),
        pool: ix.accounts.swap ?? "",
        mintA: mintOf(tx, ix.accounts.tokenA) ?? "",
        mintB: mintOf(tx, ix.accounts.tokenB) ?? "",
        creator: tx.signer,
      }));
  },
};
