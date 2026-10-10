import bs58 from "bs58";
import type { SubscribeUpdateTransactionInfo } from "@triton-one/yellowstone-grpc";

export type TxInfo = SubscribeUpdateTransactionInfo;

export const SYSTEM_PROGRAM = "11111111111111111111111111111111";
export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
export const WSOL = "So11111111111111111111111111111111111111112";

/** One instruction with its program and accounts resolved to base58 addresses. */
export type Instruction = {
  programId: string;
  accounts: string[];
  data: Buffer;
  /**
   * Position in the call tree: "3" is top-level instruction 3, "3.1" the second CPI it makes,
   * "3.1.0" the first CPI that one makes. Descendants of X are the paths starting with `${X}.`.
   */
  path: string;
  /** 1 for top-level instructions, 2 for their direct CPIs, and so on. */
  depth: number;
  /** Path of the instruction that invoked this one (undefined at top level). */
  parent: string | undefined;
};

/** A token or SOL movement, read from SPL Token / Token-2022 / System program instructions. */
export type Transfer = {
  path: string;
  /** Path of the instruction that made the transfer: the swap, buy or sell it belongs to. */
  parent: string | undefined;
  mint: string;
  from: string;
  to: string;
  /** Wallet that signed for the transfer (the token account owner or delegate). */
  authority: string;
  amount: bigint;
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

/**
 * Every instruction in execution order, including CPIs, arranged as a call tree.
 * Nodes record `stackHeight` for inner instructions; without it (very old blocks) every CPI is treated as depth 2.
 */
export function flattenInstructions(info: TxInfo, keys: string[] = accountKeys(info)): Instruction[] {
  const outer = info.transaction?.message?.instructions ?? [];
  const innerByIndex = new Map((info.meta?.innerInstructions ?? []).map((group) => [group.index, group.instructions]));
  const result: Instruction[] = [];

  for (const [i, ix] of outer.entries()) {
    const top = resolve(ix, keys);
    if (!top) return [];
    result.push({ ...top, path: `${i}`, depth: 1, parent: undefined });

    // stack[d] = path of the most recent instruction at depth d, childCount[path] = CPIs made so far.
    const stack: string[] = [];
    stack[1] = `${i}`;
    const childCount = new Map<string, number>();
    for (const innerIx of innerByIndex.get(i) ?? []) {
      const r = resolve(innerIx, keys);
      if (!r) return [];
      const depth = Math.max(2, innerIx.stackHeight ?? 2);
      const parent = stack[depth - 1] ?? stack[1];
      const n = childCount.get(parent) ?? 0;
      childCount.set(parent, n + 1);
      const path = `${parent}.${n}`;
      stack[depth] = path;
      stack.length = depth + 1;
      result.push({ ...r, path, depth, parent });
    }
  }
  return result;
}

function resolve(
  ix: { programIdIndex: number; accounts: Uint8Array; data: Uint8Array },
  keys: string[],
): Pick<Instruction, "programId" | "accounts" | "data"> | undefined {
  const programId = keys[ix.programIdIndex];
  const accounts = Array.from(ix.accounts, (index) => keys[index]);
  if (!programId || accounts.some((a) => a === undefined)) return undefined;
  return { programId, accounts: accounts as string[], data: Buffer.from(ix.data) };
}

export const isUnder = (path: string, ancestor: string) => path.startsWith(`${ancestor}.`);

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

/**
 * Token and SOL transfers in execution order.
 * Plain `Transfer` instructions do not name the mint, so it is looked up from the token balance list.
 */
export function transfers(instructions: Instruction[], balances: Map<string, TokenBalanceChange>): Transfer[] {
  const out: Transfer[] = [];
  for (const ix of instructions) {
    const base = { path: ix.path, parent: ix.parent };
    if (ix.programId === TOKEN_PROGRAM || ix.programId === TOKEN_2022_PROGRAM) {
      const tag = ix.data[0];
      const [a0, a1, a2, a3] = ix.accounts;
      // 3 = Transfer { amount }: source, destination, authority
      if (tag === 3 && ix.data.length >= 9 && a0 && a1 && a2) {
        const mint = balances.get(a0)?.mint ?? balances.get(a1)?.mint;
        if (mint) out.push({ ...base, mint, from: a0, to: a1, authority: a2, amount: ix.data.readBigUInt64LE(1) });
      }
      // 12 = TransferChecked { amount, decimals }: source, mint, destination, authority
      if (tag === 12 && ix.data.length >= 10 && a0 && a1 && a2 && a3) {
        out.push({ ...base, mint: a1, from: a0, to: a2, authority: a3, amount: ix.data.readBigUInt64LE(1) });
      }
    } else if (ix.programId === SYSTEM_PROGRAM && ix.data.length >= 12 && ix.data.readUInt32LE(0) === 2) {
      // System Transfer { lamports }: from, to. Reported with the wrapped-SOL mint so SOL legs read like token legs.
      const [from, to] = ix.accounts;
      if (from && to) out.push({ ...base, mint: WSOL, from, to, authority: from, amount: ix.data.readBigUInt64LE(4) });
    }
  }
  return out;
}

/** A raw event payload (8-byte event discriminator + borsh body) and the instruction that emitted it. */
export type RawEvent = { programId: string; path: string; data: Buffer };

const EVENT_IX_TAG = Buffer.from("e445a52e51cb9a1d", "hex");
const INVOKE = /^Program (\w+) invoke \[(\d+)\]$/;
const EXIT = /^Program (\w+) (?:success|failed)/;

/**
 * Events from both places Anchor programs put them:
 * - `emit_cpi!`: a self-invoke whose data starts with the event-CPI tag. Reliable, never truncated.
 * - `emit!`: a "Program data: <base64>" log line. The emitting instruction is found by replaying
 *   the invoke/exit lines against the instruction list. Logs can be truncated on very large transactions.
 */
export function rawEvents(instructions: Instruction[], logs: string[]): RawEvent[] {
  const events: RawEvent[] = [];
  for (const ix of instructions) {
    const parent = ix.parent && instructions.find((p) => p.path === ix.parent);
    if (parent && parent.programId === ix.programId && ix.data.subarray(0, 8).equals(EVENT_IX_TAG)) {
      events.push({ programId: ix.programId, path: parent.path, data: ix.data.subarray(8) });
    }
  }

  let cursor = 0;
  const stack: Instruction[] = [];
  for (const line of logs) {
    const invoke = INVOKE.exec(line);
    if (invoke) {
      // Precompiles do not log, so skip ahead to the next instruction for this program.
      let next = cursor;
      while (next < instructions.length && instructions[next]?.programId !== invoke[1]) next++;
      const ix = instructions[next];
      if (!ix) break;
      cursor = next + 1;
      stack.push(ix);
      continue;
    }
    if (EXIT.test(line)) {
      stack.pop();
      continue;
    }
    if (line.startsWith("Program data: ")) {
      const top = stack.at(-1);
      if (top) events.push({ programId: top.programId, path: top.path, data: Buffer.from(line.slice(14), "base64") });
    }
  }
  return events;
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

/** Converts a raw amount to a float for display math (prices). Never use the result for further on-chain amounts. */
export const toNumber = (raw: bigint, decimals: number) => Number(raw) / 10 ** decimals;
