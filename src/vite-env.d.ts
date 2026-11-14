/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL for REST calls. Empty = same origin (recommended; nginx/Vite proxy to Django). */
  readonly VITE_API_BASE_URL?: string;
  /** Full WebSocket URL. Empty = derived from the current origin + /ws/. */
  readonly VITE_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
