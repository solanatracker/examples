import { Client } from "@solana-tracker/data-api";
import { requireApiKey, dataApiBaseUrl } from "./env.js";

export function createDataApiClient() {
  return new Client({ apiKey: requireApiKey(), baseUrl: dataApiBaseUrl() });
}

