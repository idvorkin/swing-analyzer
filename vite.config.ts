import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

// Container and Tailscale detection for dev server configuration
function isRunningInContainer(): boolean {
  return existsSync('/.dockerenv');
}

function getTailscaleHostnames(): string[] {
  try {
    const output = execSync('tailscale status --json', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const status = JSON.parse(output);
    const dnsName = status.Self?.DNSName;
    if (!dnsName) return [];

    // DNSName is like "c-5002.squeaker-teeth.ts.net."
    const fullName = dnsName.replace(/\.$/, ''); // Remove trailing dot
    const shortName = fullName.split('.')[0];
    return [shortName, fullName];
  } catch {
    return [];
  }
}

// Configure dev server host based on environment
const inContainer = isRunningInContainer();
const tailscaleHosts = getTailscaleHostnames();
const devHost =
  inContainer && tailscaleHosts.length > 0 ? '0.0.0.0' : 'localhost';

// Enable HTTPS for Tailscale (camera APIs require secure context)
const useSsl = inContainer && tailscaleHosts.length > 0;

if (useSsl) {
  console.log(`\n🔗 Tailscale detected in container`);
  console.log(`   Access via: https://${tailscaleHosts[1]}:5173\n`);
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    ...(useSsl ? [basicSsl()] : []),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['pwa-192x192.png', 'pwa-512x512.png'],
      manifest: {
        name: 'Swing Analyzer',
        short_name: 'SwingAI',
        description:
          'AI-powered kettlebell swing form analysis and rep counting',
        start_url: '/',
        scope: '/',
        theme_color: '#000000',
        background_color: '#f5f5f7',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm,bin,json}'],
        maximumFileSizeToCacheInBytes: 15 * 1024 * 1024, // 15MB for TF.js models
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
  server: {
    host: devHost,
    allowedHosts: tailscaleHosts.length > 0 ? tailscaleHosts : undefined,
  },
  build: {
    outDir: 'dist',
  },
  test: {
    environment: 'jsdom',
    globals: true,
    exclude: ['e2e-tests/**', 'node_modules/**'],
  },
});
