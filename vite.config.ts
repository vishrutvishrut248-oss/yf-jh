import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // The preview proxy serves this app from a *.e2b.app origin, and it is
    // embedded in an iframe. Vite's host check would otherwise reject the
    // proxied Host header.
    allowedHosts: true,
    cors: true,
    headers: {
      // Camera access inside a cross-origin iframe is gated behind a
      // Permissions-Policy on the *embedding* document; this keeps the
      // feature available to our own frame where the parent allows it.
      'Permissions-Policy': 'camera=*, microphone=(), geolocation=()',
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
    cors: true,
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
  optimizeDeps: {
    exclude: ['@mediapipe/tasks-vision'],
  },
});
