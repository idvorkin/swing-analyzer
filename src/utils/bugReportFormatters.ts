import { GIT_COMMIT_URL, GIT_SHA_SHORT } from '../generated_version';
import type { BugReportData, BugReportMetadata } from '../types/bugReport';

interface DeviceDetails {
  screen: string;
  memory: string;
  cpuCores: string;
  online: string;
  connectionType: string;
  displayMode: string;
  touchDevice: string;
}

/**
 * Collect device/environment details for bug reports.
 * Uses browser APIs that may not be available in all browsers.
 */
export function getDeviceDetails(): DeviceDetails {
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  const win = typeof window !== 'undefined' ? window : null;

  // Screen dimensions and pixel ratio
  let screen = 'Unknown';
  if (win) {
    const w = win.innerWidth;
    const h = win.innerHeight;
    const dpr = win.devicePixelRatio || 1;
    screen = `${w}x${h} @${dpr}x`;
  }

  // Device memory (Chrome/Edge only)
  let memory = 'Unknown';
  if (nav && 'deviceMemory' in nav) {
    memory = `${(nav as { deviceMemory?: number }).deviceMemory}GB`;
  }

  // CPU cores
  let cpuCores = 'Unknown';
  if (nav?.hardwareConcurrency) {
    cpuCores = `${nav.hardwareConcurrency}`;
  }

  // Online status
  const online = nav?.onLine ? 'Online' : 'Offline';

  // Connection type (Chrome/Edge only)
  let connectionType = 'Unknown';
  if (nav && 'connection' in nav) {
    const conn = nav.connection as { effectiveType?: string } | undefined;
    if (conn?.effectiveType) {
      connectionType = conn.effectiveType;
    }
  }

  // Display mode (PWA vs browser)
  let displayMode = 'browser';
  if (win?.matchMedia?.('(display-mode: standalone)')?.matches) {
    displayMode = 'standalone (PWA)';
  } else if (win?.matchMedia?.('(display-mode: fullscreen)')?.matches) {
    displayMode = 'fullscreen';
  }

  // Touch capability
  let touchDevice = 'No';
  if (win && ('ontouchstart' in win || (nav && nav.maxTouchPoints > 0))) {
    touchDevice = 'Yes';
  }

  return {
    screen,
    memory,
    cpuCores,
    online,
    connectionType,
    displayMode,
    touchDevice,
  };
}

export function formatBuildLink(): string {
  return `[${GIT_SHA_SHORT}](${GIT_COMMIT_URL})`;
}

export function formatDate(date: Date = new Date()): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function buildDefaultTitle(): string {
  return 'Bug';
}

export function buildDefaultDescription(
  currentDate: Date = new Date()
): string {
  const date = formatDate(currentDate);

  return `**Date:** ${date}

**Build:** ${formatBuildLink()}

**What were you trying to do?**


**What happened instead?**


**Steps to reproduce:**
1.
`;
}

export function buildIssueBody(
  data: BugReportData,
  metadata: BugReportMetadata,
  options: { isMobile: boolean; hasScreenshot: boolean }
): string {
  let body = data.description;

  if (data.includeMetadata) {
    const device = getDeviceDetails();
    body += `

---

**App Metadata**
| Field | Value |
|-------|-------|
| Route | \`${metadata.route}\` |
| App Version | \`${metadata.appVersion}\` |
| Browser | \`${metadata.userAgent}\` |
| Timestamp | \`${metadata.timestamp}\` |

**Device Details**
| Field | Value |
|-------|-------|
| Screen | \`${device.screen}\` |
| CPU Cores | \`${device.cpuCores}\` |
| Memory | \`${device.memory}\` |
| Connection | \`${device.connectionType}\` |
| Online | \`${device.online}\` |
| Display Mode | \`${device.displayMode}\` |
| Touch Device | \`${device.touchDevice}\` |
`;
  }

  if (options.hasScreenshot && !options.isMobile) {
    body += `
**Screenshot**
_(Screenshot is on your clipboard - paste it here with Ctrl+V / Cmd+V)_
`;
  }

  return body;
}

export function buildGitHubIssueUrl(
  repoUrl: string,
  title: string,
  body: string,
  labels: string[] = ['bug', 'from-app']
): string {
  const issueUrl = new URL(`${repoUrl}/issues/new`);
  issueUrl.searchParams.set('title', title);
  issueUrl.searchParams.set('body', body);
  issueUrl.searchParams.set('labels', labels.join(','));
  return issueUrl.toString();
}

export function getMetadata(
  getCurrentRoute: () => string,
  getUserAgent: () => string,
  currentDate: Date = new Date()
): BugReportMetadata {
  return {
    route: getCurrentRoute(),
    userAgent: getUserAgent(),
    timestamp: currentDate.toISOString(),
    appVersion: GIT_SHA_SHORT,
  };
}

export function buildCrashReportBody(
  error: Error,
  metadata: BugReportMetadata
): string {
  return `**Error:** ${error.message}

**Build:** ${formatBuildLink()}

**Stack Trace:**
\`\`\`
${error.stack || 'No stack trace available'}
\`\`\`

---

**App Metadata**
| Field | Value |
|-------|-------|
| Route | \`${metadata.route}\` |
| App Version | ${formatBuildLink()} |
| Browser | \`${metadata.userAgent}\` |
| Timestamp | \`${metadata.timestamp}\` |
`;
}
