import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // Fix "504 Outdated Optimize Dep" errors with workspace dependencies
  optimizeDeps: {
    // Exclude workspace dependencies from pre-bundling
    // This forces Vite to always use the latest built version
    exclude: ['@agor/core'],
  },

  server: {
    // Watch for changes in workspace packages
    watch: {
      // Watch the @agor/core dist directory for changes
      ignored: ['!**/node_modules/@agor/core/**'],
    },
    fs: {
      // Allow serving files from the monorepo root
      allow: ['../..'],
    },
  },
});
