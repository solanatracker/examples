import bs58 from "bs58";
import type { SubscribeUpdateTransactionInfo } from "@triton-one/yellowstone-grpc";

export type TxInfo = SubscribeUpdateTransactionInfo;

/** One instruction with its program and accounts resolved to base58 addresses. */
export type FlatInstruction = {
  programId: string;
  accounts: string[];
  data: Buffer;
  /** "3" for top-level instruction 3, "3.1" for the second inner instruction under it. */
  path: string;
  /** Program of the top-level instruction this one runs under (itself when top-level). */
  outerProgramId: string;
  inner: boolean;
};

export type TokenBalanceChange = {
  account: string;
  mint: string;
  owner: string;
  decimals: number;
  pre: bigint;
  post: bigint;
  delta: bigint;
};

export const signatureOf = (info: TxInfo): string => bs58.encode(info.signature);

/**
 * The key list instruction indexes refer to: static keys, then addresses loaded
 * from lookup tables (writable first, then readonly).
 */
export function accountKeys(info: TxInfo): string[] {
  return [
    ...(info.transaction?.message?.accountKeys ?? []),
    ...(info.meta?.loadedWritableAddresses ?? []),
    ...(info.meta?.loadedReadonlyAddresses ?? []),
  ].map((key) => bs58.encode(key));
}

/** Top-level and inner instructions in execution order. Returns [] when a key index cannot be resolved. */
export function flattenInstructions(info: TxInfo, keys: string[] = accountKeys(info)): FlatInstruction[] {
  const outer = info.transaction?.message?.instructions ?? [];
  const innerByIndex = new Map((info.meta?.innerInstructions ?? []).map((group) => [group.index, group.instructions]));
  const result: FlatInstruction[] = [];

  for (const [i, ix] of outer.entries()) {
    const outerProgramId = keys[ix.programIdIndex];
    if (!outerProgramId) return [];
    const resolved = resolve(ix, keys);
    if (!resolved) return [];
    result.push({ ...resolved, path: `${i}`, outerProgramId, inner: false });
    for (const [j, innerIx] of (innerByIndex.get(i) ?? []).entries()) {
      const r = resolve(innerIx, keys);
      if (!r) return [];
      result.push({ ...r, path: `${i}.${j}`, outerProgramId, inner: true });
    }
  }
  return result;
}

function resolve(
  ix: { programIdIndex: number; accounts: Uint8Array; data: Uint8Array },
  keys: string[],
): Pick<FlatInstruction, "programId" | "accounts" | "data"> | undefined {
  const programId = keys[ix.programIdIndex];
  const accounts = Array.from(ix.accounts, (index) => keys[index]);
  if (!programId || accounts.some((a) => a === undefined)) return undefined;
  return { programId, accounts: accounts as string[], data: Buffer.from(ix.data) };
}

/**
 * Per-account token balance changes from pre/post token balances.
 * A missing pre entry means the account was created in this transaction; a missing post entry means it was closed.
 */
export function tokenBalanceChanges(info: TxInfo, keys: string[] = accountKeys(info)): Map<string, TokenBalanceChange> {
  const changes = new Map<string, TokenBalanceChange>();
  const visit = (balances: NonNullable<TxInfo["meta"]>["preTokenBalances"], side: "pre" | "post") => {
    for (const b of balances) {
      const account = keys[b.accountIndex];
      if (!account) continue;
      const amount = BigInt(b.uiTokenAmount?.amount ?? "0");
      const entry = changes.get(account) ?? {
        account,
        mint: b.mint,
        owner: b.owner,
        decimals: b.uiTokenAmount?.decimals ?? 0,
        pre: 0n,
        post: 0n,
        delta: 0n,
      };
      entry[side] = amount;
      if (!entry.owner) entry.owner = b.owner;
      entry.delta = entry.post - entry.pre;
      changes.set(account, entry);
    }
  };
  visit(info.meta?.preTokenBalances ?? [], "pre");
  visit(info.meta?.postTokenBalances ?? [], "post");
  return changes;
}

/** Formats a raw integer amount with its mint decimals, without floating-point rounding. */
export function formatUnits(raw: bigint, decimals: number, maxFraction = 6): string {
  const negative = raw < 0n;
  const abs = negative ? -raw : raw;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const fullFraction = (abs % base).toString().padStart(decimals, "0");
  // Keep at least two significant digits for sub-unit amounts so tiny values never print as 0.
  const firstDigit = fullFraction.search(/[1-9]/);
  const keep = whole === 0n && firstDigit >= maxFraction ? firstDigit + 2 : maxFraction;
  const fraction = fullFraction.slice(0, keep).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole.toLocaleString("en-US")}${fraction ? `.${fraction}` : ""}`;
}
