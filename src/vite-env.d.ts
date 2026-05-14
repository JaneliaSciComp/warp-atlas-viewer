/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL of the deployed documentation site. When set, the Links menu
   *  in the viewer header includes a "Documentation" entry; when unset
   *  the entry is omitted. Configured via `.env.local` (or any other
   *  Vite-loaded env file). */
  readonly VITE_WARP_DOCS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.glsl?raw' {
  const src: string;
  export default src;
}
declare module '*.vert?raw' {
  const src: string;
  export default src;
}
declare module '*.frag?raw' {
  const src: string;
  export default src;
}
