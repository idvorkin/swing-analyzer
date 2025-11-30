/**
 * Humble Object for device/browser detection APIs.
 * Isolates navigator and window calls for testability.
 */
export const DeviceService = {
  getScreenWidth(): number {
    return window.innerWidth;
  },

  getDeviceMemoryGB(): number | null {
    if ('deviceMemory' in navigator) {
      return (navigator as { deviceMemory?: number }).deviceMemory ?? null;
    }
    return null;
  },

  isTouchDevice(): boolean {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  },

  addResizeListener(callback: () => void): () => void {
    window.addEventListener('resize', callback);
    return () => window.removeEventListener('resize', callback);
  },

  getStorageItem(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },

  setStorageItem(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // localStorage not available (private browsing, quota exceeded)
    }
  },

  hasDeviceMotion(): boolean {
    return 'DeviceMotionEvent' in window;
  },

  async requestDeviceMotionPermission(): Promise<'granted' | 'denied'> {
    // iOS 13+ requires explicit permission request
    const DeviceMotionEventWithPermission = DeviceMotionEvent as unknown as {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };
    if (
      typeof DeviceMotionEventWithPermission.requestPermission === 'function'
    ) {
      try {
        return await DeviceMotionEventWithPermission.requestPermission();
      } catch {
        return 'denied';
      }
    }
    // Non-iOS devices don't need permission
    return 'granted';
  },

  addDeviceMotionListener(
    callback: (event: DeviceMotionEvent) => void
  ): () => void {
    window.addEventListener('devicemotion', callback);
    return () => window.removeEventListener('devicemotion', callback);
  },

  async copyToClipboard(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  },

  async copyImageToClipboard(dataUrl: string): Promise<boolean> {
    try {
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ]);
      return true;
    } catch {
      return false;
    }
  },

  openInNewTab(url: string): void {
    window.open(url, '_blank', 'noopener,noreferrer');
  },

  isMobileDevice(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );
  },

  getUserAgent(): string {
    return navigator.userAgent;
  },

  getCurrentRoute(): string {
    return window.location.pathname;
  },

  reloadPage(): void {
    window.location.reload();
  },

  async captureScreenshot(): Promise<string | null> {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'browser' } as MediaTrackConstraints,
      });

      const video = document.createElement('video');
      video.srcObject = stream;
      await video.play();

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
        return null;
      }

      ctx.drawImage(video, 0, 0);
      for (const track of stream.getTracks()) {
        track.stop();
      }

      return canvas.toDataURL('image/png');
    } catch {
      return null;
    }
  },
};

export type DeviceServiceType = typeof DeviceService;
