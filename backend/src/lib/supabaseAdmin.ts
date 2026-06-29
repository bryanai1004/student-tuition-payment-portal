import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";

let adminClient: SupabaseClient | null = null;
let anonClient: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(env.supabase.url && env.supabase.serviceRoleKey);
}

export function requireSupabaseAdminConfig(): {
  url: string;
  serviceRoleKey: string;
} {
  const url = env.supabase.url;
  const serviceRoleKey = env.supabase.serviceRoleKey;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase configuration. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  return { url, serviceRoleKey };
}

export function getSupabaseAdminClient(): SupabaseClient {
  if (adminClient) return adminClient;
  const cfg = requireSupabaseAdminConfig();
  adminClient = createClient(cfg.url, cfg.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}

/** Lightweight Postgres reachability check via the Supabase Data API. */
export async function testSupabaseConnection(): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Missing Supabase configuration. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  const client = getSupabaseAdminClient();
  const { error } = await client.from("admin_users").select("id").limit(1);
  if (error) {
    throw new Error(`Supabase connection failed: ${error.message}`);
  }
}

export function supabaseProjectHost(): string | null {
  const url = env.supabase.url;
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** Used for server-side password sign-in (anon/publishable key). */
export function getSupabaseAnonClient(): SupabaseClient | null {
  const url = env.supabase.url;
  const anonKey = env.supabase.anonKey;
  if (!url || !anonKey) return null;
  if (anonClient) return anonClient;
  anonClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return anonClient;
}
