import { describe, expect, it } from 'vitest';
import { extractAcceleration, isShakeDetected } from './shakeDetection';

// Cooldown fully elapsed (currentTime >> lastShakeTime) so the threshold
// guard is the only thing under test in those cases.
const NOW = 100000;
const LAST = 0;
const COOLDOWN = 2000;
const THRESHOLD = 25;

describe('isShakeDetected', () => {
  it('detects a shake when a finite magnitude strictly exceeds the threshold and cooldown has elapsed', () => {
    expect(isShakeDetected(30, THRESHOLD, NOW, LAST, COOLDOWN)).toBe(true);
  });

  it('rejects a magnitude equal to the threshold (strictly-greater comparison)', () => {
    expect(isShakeDetected(THRESHOLD, THRESHOLD, NOW, LAST, COOLDOWN)).toBe(
      false
    );
  });

  it.each([NaN, Infinity, -Infinity])(
    'rejects magnitude %p even when the cooldown has fully elapsed',
    (magnitude) => {
      expect(isShakeDetected(magnitude, THRESHOLD, NOW, LAST, COOLDOWN)).toBe(
        false
      );
    }
  );

  it('does not shake when the cooldown delta exactly equals cooldownMs (strictly-greater)', () => {
    expect(
      isShakeDetected(30, THRESHOLD, LAST + COOLDOWN, LAST, COOLDOWN)
    ).toBe(false);
  });
});

describe('extractAcceleration', () => {
  it('returns the axes when all are finite', () => {
    expect(
      extractAcceleration({
        acceleration: { x: 1, y: 2, z: 3 },
        accelerationIncludingGravity: null,
      } as DeviceMotionEvent)
    ).toEqual({ x: 1, y: 2, z: 3 });
  });

  it.each([
    ['x=NaN', { x: NaN, y: 0, z: 0 }],
    ['y=NaN', { x: 0, y: NaN, z: 0 }],
    ['z=NaN', { x: 0, y: 0, z: NaN }],
    ['x=Infinity', { x: Infinity, y: 0, z: 0 }],
    ['y=-Infinity', { x: 0, y: -Infinity, z: 0 }],
    ['z=Infinity', { x: 0, y: 0, z: Infinity }],
  ] as const)(
    'returns null when an axis is non-finite (%s)',
    (_label, axes) => {
      expect(
        extractAcceleration({
          acceleration: axes,
          accelerationIncludingGravity: null,
        } as DeviceMotionEvent)
      ).toBeNull();
    }
  );

  it('does not fall through to accelerationIncludingGravity when the primary acceleration has a non-finite axis', () => {
    // `??` resolves once at the top, so a truthy primary bearing a non-finite
    // axis short-circuits to null rather than retrying the fallback.
    expect(
      extractAcceleration({
        acceleration: { x: NaN, y: 0, z: 0 },
        accelerationIncludingGravity: { x: 1, y: 2, z: 3 },
      } as DeviceMotionEvent)
    ).toBeNull();
  });
});
