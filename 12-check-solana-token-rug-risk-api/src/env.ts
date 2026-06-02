/** Shared env helpers — every example uses these for consistent setup errors. */
export function requireEnv(name: string, hint?: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing ${name} in .env${hint ? ` — ${hint}` : ""}`);
    process.exit(1);
  }
  return value;
}

export function optionalEnv(name: string, fallback?: string): string | undefined {
  const v = process.env[name]?.trim();
  return v || fallback;
}

export function requireApiKey(): string {
  const key = process.env.ST_API_KEY?.trim() || process.env.SOLANA_TRACKER_API_KEY?.trim();
  if (!key) {
    console.error("Missing ST_API_KEY in .env — get one at https://www.solanatracker.io/account/data-api");
    process.exit(1);
  }
  return key;
}

/** Public Data API — override with DATA_API_BASE_URL for local smoke tests. */
export function dataApiBaseUrl(): string {
  const override = process.env.DATA_API_BASE_URL?.trim();
  return override || "https://data.solanatracker.io";
}

