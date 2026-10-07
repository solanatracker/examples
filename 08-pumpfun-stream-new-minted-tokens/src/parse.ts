import { BorshInstructionCoder, type Idl } from "@coral-xyz/anchor";
import idl from "../idl/pumpfun.json" with { type: "json" };
import { accountKeys, flattenInstructions, signatureOf, type TxInfo } from "./tx.js";

export const PUMP_PROGRAM = idl.address;
/** PDA of the constant seed "mint-authority". Only create and create_v2 reference it in the bundled IDL. */
export const PUMP_MINT_AUTHORITY = "TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM";

const CREATE_VARIANTS = ["create", "create_v2"] as const;
type Variant = (typeof CREATE_VARIANTS)[number];

const coder = new BorshInstructionCoder(idl as Idl);

/** Discriminator and account positions come from the IDL, so an IDL update moves them with it. */
const layouts = CREATE_VARIANTS.map((name) => {
  const ix = idl.instructions.find((i) => i.name === name);
  if (!ix) throw new Error(`${name} is missing from idl/pumpfun.json`);
  const position = (account: string) => {
    const index = ix.accounts.findIndex((a) => a.name === account);
    if (index < 0) throw new Error(`${name} has no ${account} account in idl/pumpfun.json`);
    return index;
  };
  return {
    name,
    discriminator: Buffer.from(ix.discriminator),
    mint: position("mint"),
    bondingCurve: position("bondingCurve"),
    user: position("user"),
  };
});

export type NewMint = {
  signature: string;
  slot: string;
  variant: Variant;
  mint: string;
  bondingCurve: string;
  name: string;
  symbol: string;
  uri: string;
  creator: string;
  /** Fee payer / signer that submitted the create. Can differ from creator. */
  user: string;
  /** "0" for a top-level create, "2.1" when another program created the coin through CPI. */
  path: string;
  viaProgram: string | null;
};

type CreateArgs = { name: string; symbol: string; uri: string; creator: { toBase58(): string } };

function isCreateArgs(data: unknown): data is CreateArgs {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  const creator = d.creator as { toBase58?: unknown } | undefined;
  return (
    typeof d.name === "string" &&
    typeof d.symbol === "string" &&
    typeof d.uri === "string" &&
    typeof creator?.toBase58 === "function"
  );
}

/** Returns every Pump.fun create in a transaction (top-level and CPI). Failed transactions yield nothing. */
export function parseCreates(info: TxInfo, slot: string): NewMint[] {
  if (info.meta?.err) return [];
  const keys = accountKeys(info);
  const found: NewMint[] = [];

  for (const ix of flattenInstructions(info, keys)) {
    if (ix.programId !== PUMP_PROGRAM || ix.data.length < 8) continue;
    const layout = layouts.find((l) => ix.data.subarray(0, 8).equals(l.discriminator));
    if (!layout) continue; // buy, sell and other instructions

    const decoded = coder.decode(ix.data);
    if (!decoded || decoded.name !== layout.name || !isCreateArgs(decoded.data)) {
      console.warn(`[parse] ${layout.name} at ${ix.path} did not decode; check idl/pumpfun.json against the live program`);
      continue;
    }
    const { name, symbol, uri, creator } = decoded.data;
    found.push({
      signature: signatureOf(info),
      slot,
      variant: layout.name,
      mint: ix.accounts[layout.mint] ?? "?",
      bondingCurve: ix.accounts[layout.bondingCurve] ?? "?",
      user: ix.accounts[layout.user] ?? "?",
      name,
      symbol,
      uri,
      creator: creator.toBase58(),
      path: ix.path,
      viaProgram: ix.inner ? ix.outerProgramId : null,
    });
  }
  return found;
}

/** Token text is user-supplied: strip control characters and cap the length before printing or storing. */
export function cleanText(value: string, max = 32): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e]/g, "").trim();
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned;
}
