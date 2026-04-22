/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /**
   * Backend origin without a trailing slash and without `/api` (see `.env.development` / `.env.production`).
   * Required at build time; requests use `${VITE_API_BASE_URL}/api/...`.
   */
  readonly VITE_API_BASE_URL: string
  readonly VITE_AUTHORIZE_API_LOGIN_ID?: string
  readonly VITE_AUTHORIZE_CLIENT_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
