import { CommitmentLevel } from "./grpc.js";
import { fail, optionalEnv } from "./env.js";

const LEVELS: Record<string, CommitmentLevel> = {
  processed: CommitmentLevel.PROCESSED,
  confirmed: CommitmentLevel.CONFIRMED,
  finalized: CommitmentLevel.FINALIZED,
};

/** Reads COMMITMENT (processed | confirmed | finalized) and maps it to the protobuf enum. */
export function commitmentFromEnv(fallback: "processed" | "confirmed" | "finalized"): { level: CommitmentLevel; name: string } {
  const name = (optionalEnv("COMMITMENT") ?? fallback).toLowerCase();
  const level = LEVELS[name];
  if (level === undefined) fail(`COMMITMENT must be processed, confirmed or finalized, got "${name}"`);
  return { level, name };
}

/** Prints fixed-width rows for a live feed (the header is printed once). */
export function columns(spec: Array<[header: string, width: number]>) {
  const line = (cells: string[]) =>
    spec.map(([, width], i) => (cells[i] ?? "").slice(0, width).padEnd(width)).join("  ").trimEnd();
  return {
    header: () => {
      console.log(line(spec.map(([h]) => h)));
      console.log(spec.map(([, w]) => "-".repeat(w)).join("  "));
    },
    row: (cells: string[]) => console.log(line(cells)),
  };
}
