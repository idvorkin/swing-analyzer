import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

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
  plugins: [react()],
  server: {
    host: devHost,
    allowedHosts: tailscaleHosts.length > 0 ? tailscaleHosts : undefined,
  },
  build: {
    outDir: 'dist',
  },
});
