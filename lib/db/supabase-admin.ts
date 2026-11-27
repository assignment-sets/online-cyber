import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export type SupabaseAdminClient = SupabaseClient<Database>;

let cachedClient: SupabaseAdminClient | null = null;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

/**
 * Creates a fresh server-only Supabase admin client using SUPABASE_SECRET_KEY.
 * Direct PostgREST access for anon/authenticated is revoked; all DB access runs through this client.
 */
export function createSupabaseAdminClient(): SupabaseAdminClient {
  if (typeof window !== "undefined") {
    throw new Error(
      "Supabase admin client must only be instantiated on the server."
    );
  }

  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const secretKey = requireEnv("SUPABASE_SECRET_KEY");

  return createClient<Database>(supabaseUrl, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Returns a memoized server-only Supabase admin client using SUPABASE_SECRET_KEY.
 */
export function getSupabaseAdmin(): SupabaseAdminClient {
  if (!cachedClient) {
    cachedClient = createSupabaseAdminClient();
  }
  return cachedClient;
}
