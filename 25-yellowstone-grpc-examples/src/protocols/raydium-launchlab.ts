import idl from "../../idl/raydium-launchlab.json" with { type: "json" };
import { big, str } from "../lib/parsed.js";
import { base, coderFor, decode } from "./shared.js";
import type { Protocol } from "./types.js";

const coder = coderFor(idl);
type MintParams = { name?: string; symbol?: string; uri?: string };

export const raydiumLaunchlab: Protocol = {
  id: "raydium-launchlab",
  label: "Raydium LaunchLab",
  programId: coder.programId,
  coder,

  trades(tx) {
    const d = decode(tx, coder);
    return d.eventsNamed("TradeEvent").map((e) => {
      const ix = d.ixAt(e.path);
      const buy = e.data.tradeDirection === "buy";
      const baseMint = ix?.accounts.baseTokenMint ?? "";
      const quoteMint = ix?.accounts.quoteTokenMint ?? "";
      return {
        ...base(tx, "raydium-launchlab"),
        label: ix?.name ?? (buy ? "buy" : "sell"),
        path: e.path,
        trader: ix?.accounts.payer ?? tx.signer,
        pool: str(e.data.poolState),
        inputMint: buy ? quoteMint : baseMint,
        inputAmount: big(e.data.amountIn),
        outputMint: buy ? baseMint : quoteMint,
        outputAmount: big(e.data.amountOut),
      };
    });
  },

  launches(tx) {
    const d = decode(tx, coder);
    return d.eventsNamed("PoolCreateEvent").map((e) => {
      const meta = (e.data.baseMintParam ?? {}) as MintParams;
      return {
        ...base(tx, "raydium-launchlab"),
        mint: d.ixAt(e.path)?.accounts.baseMint ?? "",
        curve: str(e.data.poolState),
        creator: str(e.data.creator),
        name: meta.name,
        symbol: meta.symbol,
        uri: meta.uri,
      };
    });
  },

  migrations(tx) {
    return decode(tx, coder)
      .ixsNamed("migrateToAmm", "migrateToCpswap")
      .map((ix) => ({
        ...base(tx, "raydium-launchlab"),
        mint: ix.accounts.baseMint ?? "",
        curve: ix.accounts.poolState ?? "",
        pool: ix.accounts.ammPool ?? ix.accounts.cpswapPool,
      }));
  },
};
