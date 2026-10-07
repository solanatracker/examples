import bs58 from "bs58";

export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
/** Size of a classic SPL token account. Token-2022 accounts are this size plus extensions. */
export const TOKEN_ACCOUNT_SIZE = 165;
/** Byte offset of the owner field in a token account, used by the memcmp filter. */
export const OWNER_OFFSET = 32;

export type TokenAccount = { mint: string; owner: string; amount: bigint };

/** SPL Token and Token-2022 share the base layout: mint (0..32), owner (32..64), amount u64 little-endian (64..72). */
export function decodeTokenAccount(data: Uint8Array): TokenAccount | undefined {
  if (data.length < TOKEN_ACCOUNT_SIZE) return undefined;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return {
    mint: bs58.encode(data.subarray(0, 32)),
    owner: bs58.encode(data.subarray(32, 64)),
    amount: view.getBigUint64(64, true),
  };
}

/** Formats a raw base-unit amount. Without decimals it prints the raw integer. */
export function formatAmount(raw: bigint, decimals: number | undefined, signed = false): string {
  const sign = raw < 0n ? "-" : signed && raw > 0n ? "+" : "";
  const abs = raw < 0n ? -raw : raw;
  if (decimals === undefined) return `${sign}${abs} raw`;
  const base = 10n ** BigInt(decimals);
  const whole = (abs / base).toLocaleString("en-US");
  const fraction = (abs % base).toString().padStart(decimals, "0").slice(0, 6).replace(/0+$/, "");
  return `${sign}${whole}${fraction ? `.${fraction}` : ""}`;
}
