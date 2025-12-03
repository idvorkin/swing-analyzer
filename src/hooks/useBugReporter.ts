import { useCallback, useState } from 'react';
import { DeviceService } from '../services/DeviceService';
import type { BugReportData } from '../types/bugReport';
import {
  buildDefaultDescription,
  buildDefaultTitle,
  buildGitHubIssueUrl,
  buildIssueBody,
  getMetadata,
} from '../utils/bugReportFormatters';

const GITHUB_REPO_URL = 'https://github.com/idvorkin/swing-analyzer';
const STORAGE_KEY_SHAKE_ENABLED = 'bug-report-shake-enabled';
const STORAGE_KEY_FIRST_TIME = 'bug-report-first-time-shown';

export type { BugReportData } from '../types/bugReport';

export function useBugReporter() {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [shakeEnabled, setShakeEnabledState] = useState(() => {
    return DeviceService.getStorageItem(STORAGE_KEY_SHAKE_ENABLED) === 'true';
  });

  const [isFirstTime, setIsFirstTimeState] = useState(() => {
    return DeviceService.getStorageItem(STORAGE_KEY_FIRST_TIME) !== 'shown';
  });

  const setShakeEnabled = useCallback((enabled: boolean) => {
    setShakeEnabledState(enabled);
    DeviceService.setStorageItem(STORAGE_KEY_SHAKE_ENABLED, String(enabled));
  }, []);

  const markFirstTimeShown = useCallback(() => {
    setIsFirstTimeState(false);
    DeviceService.setStorageItem(STORAGE_KEY_FIRST_TIME, 'shown');
  }, []);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const getDefaultData = useCallback((): BugReportData => {
    return {
      title: buildDefaultTitle(),
      description: buildDefaultDescription(),
      includeMetadata: true,
    };
  }, []);

  const submit = useCallback(async (data: BugReportData) => {
    setIsSubmitting(true);
    try {
      const isMobile = DeviceService.isMobileDevice();
      const metadata = getMetadata(DeviceService);
      const body = buildIssueBody(data, metadata, {
        isMobile,
        hasScreenshot: !!data.screenshot,
      });

      const issueUrl = buildGitHubIssueUrl(GITHUB_REPO_URL, data.title, body);

      // Desktop: copy screenshot to clipboard if available
      let hasScreenshotOnClipboard = false;
      if (data.screenshot && !isMobile) {
        hasScreenshotOnClipboard = await DeviceService.copyImageToClipboard(
          data.screenshot
        );
      }

      if (!hasScreenshotOnClipboard) {
        // Fallback: copy text if no screenshot or on mobile
        const clipboardText = `Title: ${data.title}\n\n${body}`;
        await DeviceService.copyToClipboard(clipboardText);
      }

      DeviceService.openInNewTab(issueUrl);

      return { success: true, hasScreenshotOnClipboard };
    } catch (error) {
      console.error('Failed to submit bug report:', error);
      return { success: false, error };
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  return {
    isOpen,
    open,
    close,
    submit,
    isSubmitting,
    getDefaultData,
    shakeEnabled,
    setShakeEnabled,
    isFirstTime,
    markFirstTimeShown,
    githubRepoUrl: GITHUB_REPO_URL,
  };
}
