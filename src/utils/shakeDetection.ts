export interface Acceleration {
  x: number;
  y: number;
  z: number;
}

export function calculateMagnitude(accel: Acceleration): number {
  return Math.sqrt(accel.x ** 2 + accel.y ** 2 + accel.z ** 2);
}

export function isShakeDetected(
  magnitude: number,
  threshold: number,
  currentTime: number,
  lastShakeTime: number,
  cooldownMs: number
): boolean {
  if (magnitude <= threshold) return false;
  return currentTime - lastShakeTime > cooldownMs;
}

export function extractAcceleration(
  event: DeviceMotionEvent
): Acceleration | null {
  const accel = event.acceleration ?? event.accelerationIncludingGravity;
  const { x, y, z } = accel || {};
  if (x == null || y == null || z == null) return null;
  return { x, y, z };
}
