import { useRegisterSW } from 'virtual:pwa-register/react';
import { useCallback, useRef, useState } from 'react';
import {
  DeviceService,
  type DeviceServiceType,
} from '../services/DeviceService';

const LAST_UPDATE_CHECK_KEY = 'swing-analyzer-last-update-check';

export function useVersionCheck(service: DeviceServiceType = DeviceService) {
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [lastCheckTime, setLastCheckTime] = useState<Date | null>(() => {
    const stored = service.getStorageItem(LAST_UPDATE_CHECK_KEY);
    return stored ? new Date(stored) : null;
  });

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      registrationRef.current = registration ?? null;
      // Check for updates periodically (every 30 minutes)
      if (registration) {
        setInterval(
          () => {
            registration.update();
            const now = new Date();
            setLastCheckTime(now);
            service.setStorageItem(LAST_UPDATE_CHECK_KEY, now.toISOString());
          },
          30 * 60 * 1000
        );
      }
      console.log(`Service worker registered: ${swUrl}`);
    },
    onRegisterError(error) {
      console.error('Service worker registration error:', error);
    },
  });

  const reload = () => {
    updateServiceWorker(true);
  };

  const checkForUpdate = useCallback(async () => {
    if (isChecking) return;

    setIsChecking(true);
    try {
      if (registrationRef.current) {
        await registrationRef.current.update();
      }
      // Always update the check time (even in dev mode without SW)
      const now = new Date();
      setLastCheckTime(now);
      service.setStorageItem(LAST_UPDATE_CHECK_KEY, now.toISOString());
    } catch (error) {
      console.error('Failed to check for updates:', error);
    } finally {
      setIsChecking(false);
    }
  }, [isChecking, service]);

  return {
    updateAvailable: needRefresh,
    reload,
    checkForUpdate,
    isChecking,
    lastCheckTime,
    // Expose whether service worker is available (for UI feedback)
    serviceWorkerAvailable: registrationRef.current !== null,
  };
}
