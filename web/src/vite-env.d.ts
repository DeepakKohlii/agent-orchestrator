/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend base URL in production (e.g. https://your-app.up.railway.app).
   *  Leave unset locally — requests stay relative and use the Vite proxy. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
