/**
 * Shared test helpers for analyzer tests.
 *
 * Usage:
 * ```typescript
 * import {
 *   createSwingMockSkeleton,
 *   SWING_PHASE_ANGLES,
 * } from './__test-helpers__';
 *
 * const skeleton = createSwingMockSkeleton(SWING_PHASE_ANGLES.top);
 * ```
 */

// Mock skeleton factories
export {
  createBasicMockSkeleton,
  createDetectorMockSkeleton,
  createPistolSquatMockSkeleton,
  createSwingMockSkeleton,
  type PistolSquatSkeletonAngles,
  type SwingSkeletonAngles,
} from './mockSkeleton';
// Pistol squat fixtures
export { PISTOL_SQUAT_PHASE_ANGLES } from './pistolSquatFixtures';
// Swing fixtures
export {
  SWING_PHASE_ANGLES,
  SWING_PHASE_ANGLES_MIRRORED,
  SWING_PHASE_ANGLES_NORMAL,
  SWING_VIDEO_ORIENTATIONS,
} from './swingFixtures';
