/**
 * Environment helpers shared by every example.
 * Loads .env from the project root (Node 20.12+) and fails fast with a clear message.
 */
try {
  process.loadEnvFile();
} catch {
  // No .env file: fall back to the shell environment.
}

export function fail(message: string): never {
  console.error(`\n${message}\n`);
  process.exit(1);
}

export function requireEnv(name: string, hint?: string): string {
  const value = process.env[name]?.trim();
  if (!value) fail(`Missing ${name} in .env${hint ? ` (${hint})` : ""}. Copy .env.example to .env and fill it in.`);
  return value;
}

export function optionalEnv(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

export function numberEnv(name: string, fallback: number): number {
  const raw = optionalEnv(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) fail(`${name} must be a number, got "${raw}"`);
  return value;
}

export function requireApiKey(): string {
  return requireEnv("ST_API_KEY", "create a key at https://www.solanatracker.io/account/data-api");
}

/** Accepts the Datastream key or the full wss:// URL shown in the dashboard. */
export function datastreamUrl(): string {
  const value = requireEnv("ST_DATASTREAM_KEY", "Data API dashboard, Datastream section");
  return value.startsWith("wss://") ? value : `wss://datastream.solanatracker.io/${value}`;
}
