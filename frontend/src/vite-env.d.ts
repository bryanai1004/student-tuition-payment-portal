/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Backend origin without a trailing slash and without `/api` (see `.env.development` / `.env.production`).
   * Required at build time; requests use `${VITE_API_BASE_URL}/api/...`.
   */
  readonly VITE_API_BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
