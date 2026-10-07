import type { PnlV2Identity } from "@solana-tracker/data-api";
import { short } from "./format.js";

type Identity = PnlV2Identity | null | undefined;

/**
 * Human label for a wallet. Order: curated name, SNS domain, named bot/exchange, then the short address.
 * `identity` is null for unknown wallets, and a present identity can still have name: null (avatar only).
 */
export function displayName(identity: Identity, wallet: string): string {
  const name = identity?.name?.trim() || identity?.sns?.domain || identity?.bot?.name || identity?.exchange?.name;
  return name ? name.replace(/[\u0000-\u001f\u007f]/g, "") : short(wallet);
}

/** Single badge: the primary tag. Use `tags` when you need every label. */
export function badge(identity: Identity): string {
  return identity?.type ?? (identity ? "labeled" : "-");
}

/** Twitter handles can already include "@" (sometimes twice); normalize to one. */
export function twitterHandle(identity: Identity): string | null {
  const raw = identity?.twitter?.trim().replace(/^@+/, "");
  return raw ? `@${raw}` : null;
}

/** Role detail for token-scoped labels (resolved against the mint in the request). */
export function roleDetail(identity: Identity): string {
  if (!identity) return "";
  if (identity.pool) return `pool ${identity.pool.program ?? "?"}`;
  if (identity.developer) return `developer via ${(identity.developer.via ?? []).join("/") || "?"}`;
  if (identity.exchange) return `exchange ${identity.exchange.name ?? ""}`.trim();
  if (identity.hacker) return `hacker ${identity.hacker.label ?? ""}`.trim();
  if (identity.spamDusting) return "spam dusting";
  const handle = twitterHandle(identity);
  if (handle) return handle;
  if (identity.sns && identity.type !== "sns") return identity.sns.domain;
  return "";
}

export function countBy<T>(items: T[], key: (item: T) => string[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const item of items) for (const k of key(item)) counts.set(k, (counts.get(k) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}
