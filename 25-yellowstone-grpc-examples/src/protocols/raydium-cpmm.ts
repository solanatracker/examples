import idl from "../../idl/raydium-cpmm.json" with { type: "json" };
import { big, str } from "../lib/parsed.js";
import { base, coderFor, decode } from "./shared.js";
import type { Protocol } from "./types.js";

const coder = coderFor(idl);

export const raydiumCpmm: Protocol = {
  id: "raydium-cpmm",
  label: "Raydium CPMM",
  programId: coder.programId,
  coder,

  trades(tx) {
    const d = decode(tx, coder);
    return d.eventsNamed("SwapEvent").map((e) => {
      const ix = d.ixAt(e.path);
      return {
        ...base(tx, "raydium-cpmm"),
        label: ix?.name ?? "swap",
        path: e.path,
        trader: ix?.accounts.payer ?? tx.signer,
        pool: str(e.data.poolId),
        inputMint: str(e.data.inputMint) || (ix?.accounts.inputTokenMint ?? ""),
        inputAmount: big(e.data.inputAmount),
        outputMint: str(e.data.outputMint) || (ix?.accounts.outputTokenMint ?? ""),
        outputAmount: big(e.data.outputAmount),
      };
    });
  },

  // CPMM has no pool-created event; the initialize instruction names everything.
  pools(tx) {
    return decode(tx, coder)
      .ixsNamed("initialize", "initializeWithPermission")
      .map((ix) => ({
        ...base(tx, "raydium-cpmm"),
        pool: ix.accounts.poolState ?? "",
        mintA: ix.accounts.token0Mint ?? "",
        mintB: ix.accounts.token1Mint ?? "",
        creator: ix.accounts.creator ?? ix.accounts.payer ?? tx.signer,
      }));
  },
};
