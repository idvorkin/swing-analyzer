import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

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
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico'],
      manifest: {
        name: 'Swing Analyzer',
        short_name: 'SwingAI',
        description:
          'AI-powered kettlebell swing form analysis and rep counting',
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
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm,bin,json}'],
        maximumFileSizeToCacheInBytes: 15 * 1024 * 1024, // 15MB for TF.js models
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
});
