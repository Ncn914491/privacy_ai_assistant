import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],
  esbuild: {
    // Disable TypeScript checking in development
    tsconfigRaw: {
      compilerOptions: {
        skipLibCheck: true,
        noEmit: true,
      }
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@/components': resolve(__dirname, './src/components'),
      '@/stores': resolve(__dirname, './src/stores'),
      '@/types': resolve(__dirname, './src/types'),
      '@/styles': resolve(__dirname, './src/styles'),
    },
  },
  
  // Tauri expects a fixed port, fail if that port is not available
  server: {
    port: 5174,
    strictPort: true,
  },
  
  // to make use of `TAURI_DEBUG` and other env variables
  // https://tauri.studio/v1/api/config#buildconfig.beforedevcommand
  envPrefix: ['VITE_', 'TAURI_'],

  define: {
    // Fix for "process is not defined" error
    'process.env': {},
    'process': {},
    'global': 'globalThis',
  },
  
  build: {
    // Tauri supports es2021
    target: 'chrome105', // Default to chrome105 for compatibility
    minify: 'esbuild',
    sourcemap: true,
  },
}))
