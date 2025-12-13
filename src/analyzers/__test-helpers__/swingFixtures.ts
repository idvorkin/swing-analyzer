/**
 * Phase angle fixtures for kettlebell swing tests.
 *
 * Based on default thresholds:
 * - topSpineMax: 25, topHipMin: 150
 * - bottomArmMax: 10, bottomSpineMin: 35, bottomHipMax: 140
 * - connectArmMax: 25, connectSpineMax: 25 (arms crossing vertical on way down)
 * - releaseArmMax: 25, releaseSpineMax: 25 (arms crossing vertical on way up)
 */

import type { SwingSkeletonAngles } from './mockSkeleton';

/**
 * Normal video orientation angles
 */
export const SWING_PHASE_ANGLES_NORMAL: Record<string, SwingSkeletonAngles> = {
  top: { arm: 80, spine: 10, hip: 170, knee: 170, wristHeight: 50 },
  // CONNECT: arms approaching vertical, spine still upright (before hinge)
  connect: { arm: 20, spine: 20, hip: 155, knee: 165, wristHeight: 0 },
  bottom: { arm: -10, spine: 50, hip: 120, knee: 160, wristHeight: -100 },
  release: { arm: 20, spine: 15, hip: 155, knee: 165, wristHeight: 0 },
};

/**
 * Mirrored video version - arm angles have opposite sign
 * but same magnitude. Tests that algorithm uses Math.abs().
 */
export const SWING_PHASE_ANGLES_MIRRORED: Record<string, SwingSkeletonAngles> =
  {
    top: { arm: -80, spine: 10, hip: 170, knee: 170, wristHeight: 50 },
    // CONNECT: arms approaching vertical, spine still upright (before hinge)
    connect: { arm: -20, spine: 20, hip: 155, knee: 165, wristHeight: 0 },
    bottom: { arm: 10, spine: 50, hip: 120, knee: 160, wristHeight: -100 },
    release: { arm: -20, spine: 15, hip: 155, knee: 165, wristHeight: 0 },
  };

/**
 * Default to normal angles for backwards compatibility
 */
export const SWING_PHASE_ANGLES = SWING_PHASE_ANGLES_NORMAL;

/**
 * Test configurations for normal and mirrored video
 */
export const SWING_VIDEO_ORIENTATIONS = [
  { name: 'normal video', angles: SWING_PHASE_ANGLES_NORMAL },
  { name: 'mirrored video', angles: SWING_PHASE_ANGLES_MIRRORED },
] as const;
