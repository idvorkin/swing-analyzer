import { useCallback, useEffect, useRef } from 'react';
import { DeviceService } from '../services/DeviceService';
import {
  calculateMagnitude,
  extractAcceleration,
  isShakeDetected,
} from '../utils/shakeDetection';

export const DEFAULT_SHAKE_THRESHOLD = 25;
export const DEFAULT_SHAKE_COOLDOWN_MS = 2000;

interface UseShakeDetectorOptions {
  enabled: boolean;
  threshold?: number;
  cooldownMs?: number;
  onShake: () => void;
}

export function useShakeDetector({
  enabled,
  threshold = DEFAULT_SHAKE_THRESHOLD,
  cooldownMs = DEFAULT_SHAKE_COOLDOWN_MS,
  onShake,
}: UseShakeDetectorOptions) {
  const lastShakeRef = useRef<number>(0);
  const permissionGrantedRef = useRef<boolean>(false);

  const handleMotion = useCallback(
    (event: DeviceMotionEvent) => {
      const accel = extractAcceleration(event);
      if (!accel) return;

      const magnitude = calculateMagnitude(accel);
      const now = Date.now();

      if (
        isShakeDetected(
          magnitude,
          threshold,
          now,
          lastShakeRef.current,
          cooldownMs
        )
      ) {
        lastShakeRef.current = now;
        onShake();
      }
    },
    [threshold, cooldownMs, onShake]
  );

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!DeviceService.hasDeviceMotion()) {
      return false;
    }
    const result = await DeviceService.requestDeviceMotionPermission();
    permissionGrantedRef.current = result === 'granted';
    return permissionGrantedRef.current;
  }, []);

  useEffect(() => {
    if (!enabled || !DeviceService.hasDeviceMotion()) {
      return;
    }

    if (!permissionGrantedRef.current) {
      DeviceService.requestDeviceMotionPermission().then((result) => {
        permissionGrantedRef.current = result === 'granted';
      });
    }

    const cleanup = DeviceService.addDeviceMotionListener(handleMotion);
    return cleanup;
  }, [enabled, handleMotion]);

  return {
    isSupported: DeviceService.hasDeviceMotion(),
    requestPermission,
  };
}
