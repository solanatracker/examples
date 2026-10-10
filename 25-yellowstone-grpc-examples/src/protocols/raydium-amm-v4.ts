import idl from "../../idl/raydium-amm-v4.json" with { type: "json" };
import { base, coderFor, decode } from "./shared.js";
import type { Protocol, Trade } from "./types.js";

const coder = coderFor(idl);
/** PDA that signs every transfer out of an AMM v4 pool vault. */
const AMM_AUTHORITY = "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1";
const SWAPS = ["swapBaseIn", "swapBaseOut", "swapBaseInV2", "swapBaseOutV2"];

export const raydiumAmmV4: Protocol = {
  id: "raydium-amm-v4",
  label: "Raydium AMM v4",
  programId: coder.programId,
  coder,

  // AMM v4 emits no events. Each swap makes exactly two token transfers: the trader's leg into the
  // pool, signed by the trader, and the pool's leg out, signed by the AMM authority. Reading those is
  // independent of the account-list variant (17 or 18 accounts) the caller used.
  trades(tx) {
    const out: Trade[] = [];
    for (const ix of decode(tx, coder).ixsNamed(...SWAPS)) {
      const legs = tx.transfers.filter((t) => t.parent === ix.path);
      const paid = legs.find((t) => t.authority !== AMM_AUTHORITY);
      const got = legs.find((t) => t.authority === AMM_AUTHORITY);
      if (!paid || !got) continue;
      out.push({
        ...base(tx, "raydium-amm-v4"),
        label: ix.name,
        path: ix.path,
        trader: paid.authority,
        pool: ix.accounts.amm ?? "",
        inputMint: paid.mint,
        inputAmount: paid.amount,
        outputMint: got.mint,
        outputAmount: got.amount,
      });
    }
    return out;
  },

  pools(tx) {
    return decode(tx, coder)
      .ixsNamed("initialize2")
      .map((ix) => ({
        ...base(tx, "raydium-amm-v4"),
        pool: ix.accounts.amm ?? "",
        mintA: ix.accounts.coinMint ?? "",
        mintB: ix.accounts.pcMint ?? "",
        creator: ix.accounts.userWallet ?? tx.signer,
      }));
  },
};
