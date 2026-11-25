/// <reference types="vite/client" />

declare module '*.md?raw' {
  const content: string;
  export default content;
}

// Injected by vite.config.ts from package.json (major.minor).
declare const __APP_VERSION__: string;
