# Required Changes: swing-analyzer Modernization

This document outlines the changes needed to bring swing-analyzer up to par with magic-monitor, organized into independent work units that can be executed by separate agents.

---

## Source Material

### Reference Repositories

- **magic-monitor**: `~/gits/magic-monitor` - Reference implementation
- **chop-conventions**: `~/gits/chop-conventions` - Specs and patterns

### Key Reference Files

| Purpose                   | Location                                                      |
| ------------------------- | ------------------------------------------------------------- |
| Vite + PWA Config         | `~/gits/magic-monitor/vite.config.ts`                         |
| PWA Spec                  | `~/gits/chop-conventions/pwa/PWA_ENABLEMENT_SPEC.md`          |
| GitHub Integration Spec   | `~/gits/chop-conventions/pwa/github_integration.md`           |
| Tailscale Dev Server      | `~/gits/chop-conventions/dev-setup/tailscale-dev-server.md`   |
| DeviceService             | `~/gits/magic-monitor/src/services/DeviceService.ts`          |
| useVersionCheck           | `~/gits/magic-monitor/src/hooks/useVersionCheck.ts`           |
| VersionNotification       | `~/gits/magic-monitor/src/components/VersionNotification.tsx` |
| useShakeDetector          | `~/gits/magic-monitor/src/hooks/useShakeDetector.ts`          |
| useBugReporter            | `~/gits/magic-monitor/src/hooks/useBugReporter.ts`            |
| BugReportModal            | `~/gits/magic-monitor/src/components/BugReportModal.tsx`      |
| CrashFallback             | `~/gits/magic-monitor/src/components/CrashFallback.tsx`       |
| SettingsModal             | `~/gits/magic-monitor/src/components/SettingsModal.tsx`       |
| shakeDetection utils      | `~/gits/magic-monitor/src/utils/shakeDetection.ts`            |
| bugReportFormatters       | `~/gits/magic-monitor/src/utils/bugReportFormatters.ts`       |
| Version generation script | `~/gits/magic-monitor/scripts/generate-version.sh`            |

---

## Change 1: Vite Migration

**Goal:** Replace Parcel with Vite for faster builds and PWA plugin support.

**Reference:**

- `~/gits/magic-monitor/vite.config.ts`
- `~/gits/chop-conventions/dev-setup/tailscale-dev-server.md`

**Files to Create:**

- `vite.config.ts` - Vite configuration with:
  - Container detection (`/.dockerenv`)
  - Tailscale hostname detection (`tailscale status --json`)
  - Dynamic host binding (`0.0.0.0` in container, `localhost` otherwise)
  - `allowedHosts` for Tailscale DNS names
  - HTTPS via `@vitejs/plugin-basic-ssl` when in container
  - Vitest configuration

**Files to Modify:**

- `package.json` - Update scripts and dependencies:
  - Remove: `parcel`, `@parcel/transformer-typescript-tsc`
  - Add: `vite`, `@vitejs/plugin-react`, `@vitejs/plugin-basic-ssl`, `vitest`
  - Update scripts: `dev`, `build`, `preview`, `test:unit`
- `public/index.html` → `index.html` - Move to root (Vite convention)
- `tsconfig.json` - Update for Vite compatibility

**Files to Delete:**

- `.parcelrc` (if exists)
- `.parcel-cache/` directory

**Verification:**

- `npm run dev` starts dev server
- `npm run build` produces `dist/` output
- App loads and pose detection works

---

## Change 2: PWA Enablement

**Goal:** Make app installable and work offline.

**Reference:**

- `~/gits/chop-conventions/pwa/PWA_ENABLEMENT_SPEC.md`
- `~/gits/magic-monitor/vite.config.ts` (VitePWA section)

**Dependencies:** Requires Change 1 (Vite Migration)

**Files to Create:**

- `public/pwa-192x192.png` - App icon (192x192)
- `public/pwa-512x512.png` - App icon (512x512, maskable)

**Files to Modify:**

- `vite.config.ts` - Add VitePWA plugin:
  ```typescript
  VitePWA({
    registerType: "autoUpdate",
    manifest: {
      name: "Swing Analyzer",
      short_name: "SwingAI",
      description: "AI-powered kettlebell swing form analysis",
      theme_color: "#000000",
      background_color: "#000000",
      display: "standalone",
      orientation: "landscape",
      icons: [...]
    },
    workbox: {
      globPatterns: ["**/*.{js,css,html,ico,png,svg,wasm,bin,json}"],
      maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,  // 15MB for TF.js models
    }
  })
  ```
- `package.json` - Add: `vite-plugin-pwa`

**Verification:**

- Chrome DevTools > Application > Manifest shows valid manifest
- "Install" prompt appears in browser
- App works after going offline (disable network in DevTools)

---

## Change 3: DeviceService (Humble Object Pattern)

**Goal:** Extract browser API calls for testability.

**Reference:**

- `~/gits/magic-monitor/src/services/DeviceService.ts`
- `~/gits/chop-conventions/pwa/PWA_ENABLEMENT_SPEC.md` (Humble Object section)

**Files to Create:**

- `src/services/DeviceService.ts`:
  ```typescript
  export const DeviceService = {
    getStorageItem(key: string): string | null,
    setStorageItem(key: string, value: string): void,
    getDeviceMemoryGB(): number | null,
    isTouchDevice(): boolean,
    getUserAgent(): string,
    getCurrentRoute(): string,
    // ... other browser API wrappers
  };
  export type DeviceServiceType = typeof DeviceService;
  ```

**Verification:**

- Service can be imported and used
- All methods handle errors gracefully (try/catch for localStorage)

---

## Change 4: Version Check & Update Notification

**Goal:** Detect and notify users of app updates.

**Reference:**

- `~/gits/magic-monitor/src/hooks/useVersionCheck.ts`
- `~/gits/magic-monitor/src/components/VersionNotification.tsx`
- `~/gits/chop-conventions/pwa/PWA_ENABLEMENT_SPEC.md`

**Dependencies:** Requires Change 2 (PWA) and Change 3 (DeviceService)

**Files to Create:**

- `src/hooks/useVersionCheck.ts` - Hook for update detection:
  - Auto-check every 30 minutes
  - Manual "Check for Update" support
  - Persists last check timestamp via DeviceService
  - Returns `{ updateAvailable, lastCheckTime, checkForUpdate, isChecking }`
- `src/hooks/useVersionCheck.test.ts` - Unit tests (see spec for test cases)
- `src/components/VersionNotification.tsx` - Update popup:
  - Shows when update available (delayed 5-10 seconds)
  - "Reload" and "Dismiss" buttons
  - Accessible (`role="alert"`, `aria-live="polite"`)

**Files to Modify:**

- `src/components/App.tsx` - Add VersionNotification component

**Verification:**

- Update notification appears when SW detects new version
- "Reload" button refreshes the app
- Last check time persists across sessions

---

## Change 5: Build-Time Version Generation

**Goal:** Embed Git metadata at build time for About dialog and bug reports.

**Reference:**

- `~/gits/chop-conventions/pwa/github_integration.md` (Build-Time Version Generation section)
- `~/gits/magic-monitor/scripts/generate-version.sh`

**Files to Create:**

- `scripts/generate-version.sh`:
  ```bash
  #!/bin/bash
  SHA=$(git rev-parse HEAD)
  BRANCH=$(git rev-parse --abbrev-ref HEAD)
  REPO_URL=$(git remote get-url origin | sed 's/\.git$//' | sed 's|git@github.com:|https://github.com/|')
  # ... generate src/generated_version.ts
  ```
- `src/generated_version.ts` - Generated file (must be in .gitignore):
  ```typescript
  export const GIT_SHA = 'abc1234...';
  export const GIT_SHA_SHORT = 'abc1234';
  export const GIT_COMMIT_URL = 'https://github.com/.../commit/abc1234';
  export const GIT_BRANCH = 'main';
  export const BUILD_TIMESTAMP = '2025-11-30T...';
  ```

**Files to Modify:**

- `.gitignore` - Add `src/generated_version.ts`
- `package.json` - Add prebuild script: `"prebuild": "./scripts/generate-version.sh"`

**Verification:**

- `npm run build` generates version file before bundling
- Version info accessible in app

---

## Change 6: Settings Modal with About Section

**Goal:** Centralized settings UI with version info and GitHub link.

**Reference:**

- `~/gits/magic-monitor/src/components/SettingsModal.tsx`
- `~/gits/chop-conventions/pwa/github_integration.md` (GitHub Repo Link section)

**Dependencies:** Requires Change 5 (Version Generation)

**Files to Create:**

- `src/components/SettingsModal.tsx`:
  - About section with build info (SHA, timestamp)
  - Link to GitHub repo
  - "Check for Update" button
  - "Report a Bug" button
  - App-specific settings (if any)

**Files to Modify:**

- `src/components/App.tsx` - Add settings button and modal

**Verification:**

- Settings modal opens/closes
- Shows correct build SHA linked to GitHub commit
- "View on GitHub" link works

---

## Change 7: Bug Reporting System

**Goal:** Allow users to report bugs via GitHub issues.

**Reference:**

- `~/gits/chop-conventions/pwa/github_integration.md` (Bug Reporting section)
- `~/gits/magic-monitor/src/hooks/useShakeDetector.ts`
- `~/gits/magic-monitor/src/hooks/useBugReporter.ts`
- `~/gits/magic-monitor/src/components/BugReportModal.tsx`
- `~/gits/magic-monitor/src/utils/shakeDetection.ts`
- `~/gits/magic-monitor/src/utils/bugReportFormatters.ts`

**Dependencies:** Requires Change 5 (Version Generation) and Change 3 (DeviceService)

**Files to Create:**

- `src/utils/shakeDetection.ts` - Pure functions:
  - `calculateMagnitude(accel)`
  - `isShakeDetected(magnitude, threshold, currentTime, lastShakeTime, cooldownMs)`
  - `extractAcceleration(event)`
- `src/utils/shakeDetection.test.ts` - Unit tests
- `src/utils/bugReportFormatters.ts` - Pure functions:
  - `formatBuildLink()`
  - `formatDate(date)`
  - `buildDefaultDescription()`
  - `buildIssueBody(data, metadata, options)`
  - `buildGitHubIssueUrl(repoUrl, title, body, labels)`
  - `getMetadata(getCurrentRoute, getUserAgent)`
- `src/utils/bugReportFormatters.test.ts` - Unit tests
- `src/types/bugReport.ts` - Type definitions
- `src/hooks/useShakeDetector.ts` - Shake detection hook
- `src/hooks/useBugReporter.ts` - Bug report state management
- `src/components/BugReportModal.tsx` - Bug report form UI

**Files to Modify:**

- `src/components/App.tsx`:
  - Add `Ctrl+I` / `Cmd+I` keyboard shortcut
  - Integrate shake detector (mobile)
  - Add BugReportModal

**Verification:**

- `Ctrl+I` opens bug report modal
- Shake device opens modal (mobile, when enabled)
- "Copy & Open GitHub" copies text and opens pre-filled issue URL
- Screenshot capture works on desktop

---

## Change 8: Error Boundary with Crash Reporting

**Goal:** Graceful error recovery with automatic crash reports.

**Reference:**

- `~/gits/chop-conventions/pwa/github_integration.md` (Error Boundary section)
- `~/gits/magic-monitor/src/components/CrashFallback.tsx`

**Dependencies:** Requires Change 5 (Version Generation) and Change 7 (bugReportFormatters)

**Files to Create:**

- `src/components/CrashFallback.tsx`:
  - Shows error message and stack trace
  - "Reload Page" button
  - "Report on GitHub" link (pre-filled with crash details)
  - Build info footer

**Files to Modify:**

- `package.json` - Add: `react-error-boundary`
- `src/components/App.tsx` - Wrap app in ErrorBoundary:

  ```tsx
  import { ErrorBoundary } from 'react-error-boundary';
  import { CrashFallback } from './CrashFallback';

  <ErrorBoundary FallbackComponent={CrashFallback}>{/* app content */}</ErrorBoundary>;
  ```

**Verification:**

- Throwing an error shows CrashFallback instead of blank screen
- "Reload Page" recovers the app
- "Report on GitHub" opens pre-filled issue with stack trace

---

## Change 9: Unit Testing Infrastructure

**Goal:** Add Vitest for unit testing hooks and utilities.

**Reference:**

- `~/gits/magic-monitor/vite.config.ts` (test section)
- `~/gits/magic-monitor/src/hooks/*.test.ts`

**Dependencies:** Requires Change 1 (Vite Migration)

**Files to Modify:**

- `vite.config.ts` - Add test configuration:
  ```typescript
  test: {
    environment: "jsdom",
    globals: true,
    exclude: ["e2e-tests/**", "node_modules/**"],
  }
  ```
- `package.json`:
  - Add: `vitest`, `jsdom`, `@testing-library/react`
  - Add script: `"test:unit": "vitest"`

**Files to Create:**

- `src/setupTests.ts` - Test setup (if needed)

**Verification:**

- `npm run test:unit` runs Vitest
- Can write and run tests for hooks/utils

---

## Execution Order

**Recommended sequence (dependencies shown):**

```
Change 1: Vite Migration
    ↓
Change 9: Unit Testing Infrastructure
    ↓
Change 2: PWA Enablement
    ↓
Change 3: DeviceService
    ↓
Change 5: Version Generation
    ↓
Change 4: Version Check & Update Notification
    ↓
Change 6: Settings Modal
    ↓
Change 7: Bug Reporting
    ↓
Change 8: Error Boundary
```

**Parallel execution possible:**

- Changes 3, 5 can run in parallel after Change 1
- Changes 4, 6, 7 can run in parallel after their dependencies

---

## Agent Commands Template

For each change, use:

```
Implement Change N: [Title] for swing-analyzer.

Reference files:
- [list from above]

Requirements:
- [copy from Files to Create/Modify sections]

Verification:
- [copy verification steps]

Do not modify files unrelated to this change.
Commit when complete with message: "feat: [description]"
```
