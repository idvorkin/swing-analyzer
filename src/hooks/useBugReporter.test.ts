/**
 * useBugReporter Hook Tests
 *
 * Verifies the bug-reporting hook, focusing on the submit() flow where a
 * pre-filled GitHub issue URL is built and a captured screenshot is placed
 * on the clipboard. The screenshot-paste note in the issue body must only
 * appear when the image actually reached the clipboard, never when the
 * clipboard write failed or was skipped.
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeviceService } from '../services/DeviceService';
import type { BugReportData } from './useBugReporter';
import { useBugReporter } from './useBugReporter';

type SubmitResult = Awaited<
  ReturnType<ReturnType<typeof useBugReporter>['submit']>
>;

const SCREENSHOT_DATA_URL = 'data:image/png;base64,aaaa';

function baseData(overrides: Partial<BugReportData> = {}): BugReportData {
  return {
    title: 'A bug title',
    description: 'A bug description',
    includeMetadata: false,
    ...overrides,
  };
}

describe('useBugReporter', () => {
  describe('submit', () => {
    let copyImageSpy: ReturnType<typeof vi.spyOn>;
    let copyTextSpy: ReturnType<typeof vi.spyOn>;
    let openSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      vi.spyOn(DeviceService, 'isMobileDevice').mockReturnValue(false);
      vi.spyOn(DeviceService, 'getCurrentRoute').mockReturnValue('/');
      vi.spyOn(DeviceService, 'getUserAgent').mockReturnValue('vitest-ua');
      copyTextSpy = vi
        .spyOn(DeviceService, 'copyToClipboard')
        .mockResolvedValue(true);
      openSpy = vi
        .spyOn(DeviceService, 'openInNewTab')
        .mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    function openedUrlParams(): URLSearchParams {
      expect(openSpy).toHaveBeenCalledTimes(1);
      return new URL(openSpy.mock.calls[0][0]).searchParams;
    }

    it('desktop + clipboard write succeeds: adds the screenshot note and skips the text fallback', async () => {
      copyImageSpy = vi
        .spyOn(DeviceService, 'copyImageToClipboard')
        .mockResolvedValue(true);

      const { result } = renderHook(() => useBugReporter());
      let res!: SubmitResult;
      await act(async () => {
        res = await result.current.submit(
          baseData({ screenshot: SCREENSHOT_DATA_URL })
        );
      });

      expect(res).toEqual({ success: true, hasScreenshotOnClipboard: true });
      expect(copyImageSpy).toHaveBeenCalledWith(SCREENSHOT_DATA_URL);
      expect(copyImageSpy).toHaveBeenCalledTimes(1);
      expect(copyTextSpy).not.toHaveBeenCalled();
      expect(openSpy).toHaveBeenCalledTimes(1);

      const body = openedUrlParams().get('body') ?? '';
      expect(body).toContain('Screenshot is on your clipboard');
      expect(body).toMatch(/paste it here with Ctrl\+V \/ Cmd\+V/);
      // The captured image must never be embedded in the issue URL.
      expect(body).not.toContain(SCREENSHOT_DATA_URL);
    });

    it('desktop + clipboard write fails: omits the screenshot note and falls back to copied text', async () => {
      copyImageSpy = vi
        .spyOn(DeviceService, 'copyImageToClipboard')
        .mockResolvedValue(false);

      const { result } = renderHook(() => useBugReporter());
      let res!: SubmitResult;
      await act(async () => {
        res = await result.current.submit(
          baseData({ screenshot: SCREENSHOT_DATA_URL })
        );
      });

      expect(res).toEqual({ success: true, hasScreenshotOnClipboard: false });
      expect(copyImageSpy).toHaveBeenCalledWith(SCREENSHOT_DATA_URL);
      expect(copyImageSpy).toHaveBeenCalledTimes(1);
      expect(copyTextSpy).toHaveBeenCalledTimes(1);

      const fallbackArg = copyTextSpy.mock.calls[0][0];
      expect(fallbackArg).toContain('Title: A bug title');
      expect(fallbackArg).toContain('A bug description');
      expect(fallbackArg).not.toContain('Screenshot is on your clipboard');

      const body = openedUrlParams().get('body') ?? '';
      expect(body).not.toContain('Screenshot is on your clipboard');
      expect(body).not.toMatch(/paste it here with Ctrl\+V \/ Cmd\+V/);
      expect(body).not.toContain(SCREENSHOT_DATA_URL);
    });

    it('desktop + no screenshot: never attempts image copy and uses text fallback', async () => {
      copyImageSpy = vi
        .spyOn(DeviceService, 'copyImageToClipboard')
        .mockResolvedValue(true);

      const { result } = renderHook(() => useBugReporter());
      let res!: SubmitResult;
      await act(async () => {
        res = await result.current.submit(baseData());
      });

      expect(res).toEqual({ success: true, hasScreenshotOnClipboard: false });
      expect(copyImageSpy).not.toHaveBeenCalled();
      expect(copyTextSpy).toHaveBeenCalledTimes(1);

      const body = openedUrlParams().get('body') ?? '';
      expect(body).not.toContain('Screenshot is on your clipboard');
      expect(body).not.toMatch(/paste it here with Ctrl\+V \/ Cmd\+V/);
    });

    it('mobile + screenshot: skips the image clipboard write and uses text fallback', async () => {
      vi.spyOn(DeviceService, 'isMobileDevice').mockReturnValue(true);
      copyImageSpy = vi
        .spyOn(DeviceService, 'copyImageToClipboard')
        .mockResolvedValue(true);

      const { result } = renderHook(() => useBugReporter());
      let res!: SubmitResult;
      await act(async () => {
        res = await result.current.submit(
          baseData({ screenshot: SCREENSHOT_DATA_URL })
        );
      });

      expect(res).toEqual({ success: true, hasScreenshotOnClipboard: false });
      expect(copyImageSpy).not.toHaveBeenCalled();
      expect(copyTextSpy).toHaveBeenCalledTimes(1);

      const body = openedUrlParams().get('body') ?? '';
      expect(body).not.toContain('Screenshot is on your clipboard');
      expect(body).not.toMatch(/paste it here with Ctrl\+V \/ Cmd\+V/);
    });

    it('mobile + no screenshot: uses text fallback only', async () => {
      vi.spyOn(DeviceService, 'isMobileDevice').mockReturnValue(true);

      const { result } = renderHook(() => useBugReporter());
      let res!: SubmitResult;
      await act(async () => {
        res = await result.current.submit(baseData());
      });

      expect(res).toEqual({ success: true, hasScreenshotOnClipboard: false });
      expect(copyTextSpy).toHaveBeenCalledTimes(1);
    });

    it('embeds metadata tables in the issue body when includeMetadata is true', async () => {
      const { result } = renderHook(() => useBugReporter());
      await act(async () => {
        await result.current.submit(baseData({ includeMetadata: true }));
      });

      const body = openedUrlParams().get('body') ?? '';
      expect(body).toContain('App Metadata');
      expect(body).toContain('Route');
      expect(body).toContain('`/`');
      expect(body).toContain('vitest-ua');
    });

    it('omits metadata tables when includeMetadata is false', async () => {
      const { result } = renderHook(() => useBugReporter());
      await act(async () => {
        await result.current.submit(baseData({ includeMetadata: false }));
      });

      const body = openedUrlParams().get('body') ?? '';
      expect(body).not.toContain('App Metadata');
      expect(body).toContain('A bug description');
    });

    it('opens the GitHub issue URL with the title and labels set', async () => {
      const { result } = renderHook(() => useBugReporter());
      await act(async () => {
        await result.current.submit(baseData({ title: 'My Custom Title' }));
      });

      const params = openedUrlParams();
      expect(openSpy.mock.calls[0][0]).toContain('/issues/new');
      expect(params.get('title')).toBe('My Custom Title');
      expect(params.get('labels')).toBe('bug,from-app');
    });

    it('returns failure and resets isSubmitting when an unexpected error is thrown', async () => {
      copyTextSpy.mockRejectedValue(new Error('clipboard denied'));

      const { result } = renderHook(() => useBugReporter());
      let res!: SubmitResult;
      await act(async () => {
        res = await result.current.submit(baseData());
      });

      expect(res).toEqual({ success: false, error: expect.any(Error) });
      expect(result.current.isSubmitting).toBe(false);
    });

    it('clears isSubmitting after a successful submit', async () => {
      const { result } = renderHook(() => useBugReporter());
      await act(async () => {
        await result.current.submit(baseData());
      });
      expect(result.current.isSubmitting).toBe(false);
    });
  });

  describe('open / close', () => {
    it('toggles isOpen', () => {
      const { result } = renderHook(() => useBugReporter());
      expect(result.current.isOpen).toBe(false);

      act(() => result.current.open());
      expect(result.current.isOpen).toBe(true);

      act(() => result.current.close());
      expect(result.current.isOpen).toBe(false);
    });
  });

  describe('getDefaultData', () => {
    it('returns default title, description, and metadata-inclusion flag', () => {
      const { result } = renderHook(() => useBugReporter());
      const data = result.current.getDefaultData();
      expect(data.title).toBe('Bug');
      expect(data.includeMetadata).toBe(true);
      expect(data.description).toContain('What were you trying to do?');
      expect(data.description).toContain('Steps to reproduce:');
    });
  });
});
