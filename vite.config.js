const { defineConfig } = require('vite');
const path = require('path');

module.exports = defineConfig({
  // Base for GitHub Pages (project site). Change if your repo name differs.
  base: '/tahigami-musicbox/',
  server: {
    host: true,
    port: 5173,
    open: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
