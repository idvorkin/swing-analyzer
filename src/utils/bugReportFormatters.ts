import { GIT_COMMIT_URL, GIT_SHA_SHORT } from '../generated_version';
import type { BugReportData, BugReportMetadata } from '../types/bugReport';

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
    body += `

---

**App Metadata**
| Field | Value |
|-------|-------|
| Route | \`${metadata.route}\` |
| App Version | \`${metadata.appVersion}\` |
| Browser | \`${metadata.userAgent}\` |
| Timestamp | \`${metadata.timestamp}\` |
| Screen | \`${metadata.screen}\` |
| Device Memory | \`${metadata.deviceMemory}\` |
| CPU Cores | \`${metadata.cpuCores}\` |
| Online Status | \`${metadata.onlineStatus}\` |
| Connection Type | \`${metadata.connectionType}\` |
| Display Mode | \`${metadata.displayMode}\` |
| Touch Device | \`${metadata.touchDevice}\` |
| Mobile | \`${metadata.mobile}\` |
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

export interface DeviceInfoProvider {
  getCurrentRoute: () => string;
  getUserAgent: () => string;
  getScreenDimensions: () => string;
  getDeviceMemoryGB: () => number | null;
  getCpuCores: () => number | null;
  getOnlineStatus: () => boolean;
  getConnectionType: () => string | null;
  getDisplayMode: () => string;
  isTouchDevice: () => boolean;
  isMobileDevice: () => boolean;
}

function formatNullable<T>(
  value: T | null | undefined,
  formatter?: (v: T) => string
): string {
  if (value === null || value === undefined) {
    return 'Unknown';
  }
  return formatter ? formatter(value) : String(value);
}

export function getMetadata(
  provider: DeviceInfoProvider,
  currentDate: Date = new Date()
): BugReportMetadata {
  const memory = provider.getDeviceMemoryGB();
  const cpuCores = provider.getCpuCores();
  const connectionType = provider.getConnectionType();

  return {
    route: provider.getCurrentRoute(),
    userAgent: provider.getUserAgent(),
    timestamp: currentDate.toISOString(),
    appVersion: GIT_SHA_SHORT,
    screen: provider.getScreenDimensions(),
    deviceMemory: formatNullable(memory, (v) => `${v} GB`),
    cpuCores: formatNullable(cpuCores),
    onlineStatus: provider.getOnlineStatus() ? 'Online' : 'Offline',
    connectionType: formatNullable(connectionType),
    displayMode: provider.getDisplayMode(),
    touchDevice: provider.isTouchDevice() ? 'Yes' : 'No',
    mobile: provider.isMobileDevice() ? 'Yes' : 'No',
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
| Screen | \`${metadata.screen}\` |
| Device Memory | \`${metadata.deviceMemory}\` |
| CPU Cores | \`${metadata.cpuCores}\` |
| Online Status | \`${metadata.onlineStatus}\` |
| Connection Type | \`${metadata.connectionType}\` |
| Display Mode | \`${metadata.displayMode}\` |
| Touch Device | \`${metadata.touchDevice}\` |
| Mobile | \`${metadata.mobile}\` |
`;
}
