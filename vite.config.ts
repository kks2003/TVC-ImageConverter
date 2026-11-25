import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig(({ mode }) => {
  const isOffline = mode === 'offline';
  
  return {
    plugins: [
      react(),
      viteSingleFile(),
      {
        name: 'transform-fonts',
        transformIndexHtml(html) {
          if (isOffline) {
            return html;
          } else {
            // Installable app (PWA) - online build only: a service worker
            // can't run from the single offline file (file://).
            html = html.replace(
              '</head>',
              '  <link rel="manifest" href="./manifest.webmanifest">\n    <meta name="theme-color" content="#2563eb">\n    <link rel="apple-touch-icon" href="./icons/apple-touch-icon.png">\n    <link rel="icon" type="image/png" href="./icons/icon-192.png">\n  </head>'
            );
            html = html.replace(
              '</head>',
              '  <style>@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;700&display=swap");</style>\n  </head>'
            );
            return html;
          }
        },
        transform(code, id) {
          if (!isOffline && id.endsWith('.css')) {
            return code.replace(/\/\* Local font declarations for offline use \*\/[\s\S]*?body \{/, 'body {');
          }
        }
      }
    ],
    base: './',
    build: {
      outDir: 'dist',
      assetsInlineLimit: isOffline ? 100000000 : 0,
      rollupOptions: {
        output: {
          manualChunks: undefined,
          entryFileNames: `[name].js`,
          chunkFileNames: `[name].js`,
          assetFileNames: `[name].[ext]`,
        },
      },
    },
  };
});