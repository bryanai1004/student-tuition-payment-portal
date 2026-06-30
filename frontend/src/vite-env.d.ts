/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /**
   * Backend origin without a trailing slash and without `/api` (see `.env.development` / `.env.production`).
   * Required at build time; requests use `${VITE_API_BASE_URL}/api/...`.
   */
  readonly VITE_API_BASE_URL: string
  /** Supabase project URL — enables Realtime enrollment updates in production (Workers). */
  readonly VITE_SUPABASE_URL?: string
  /** Supabase publishable/anon key — safe for browser Realtime subscriptions. */
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_AUTHORIZE_API_LOGIN_ID?: string
  readonly VITE_AUTHORIZE_CLIENT_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
