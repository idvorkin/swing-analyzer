/**
 * Pistol Squat Exercise Definition
 *
 * Single-leg squat with non-working leg extended forward.
 * Key positions: Stand (top), Descent, Bottom (full depth), Ascent
 * Primary angles: Working leg knee and hip
 */

import {
  ExerciseType,
  type ExerciseDefinition,
} from '../types/exercise';

/**
 * Pistol squat exercise definition
 *
 * Key angles tracked:
 * - knee: Hip-knee-ankle angle of working leg (~180° standing, ~45° bottom)
 * - hip: Knee-hip-shoulder angle of working leg (~180° standing, ~60° bottom)
 *
 * Note: This tracks the working leg. In practice, you'd want to detect
 * which leg is the working leg based on the extended leg position.
 */
export const pistolSquatDefinition: ExerciseDefinition = {
  type: ExerciseType.PistolSquat,
  name: 'Pistol Squat',
  description:
    'Single-leg squat to full depth with non-working leg extended. Requires strength, balance, and mobility.',

  keyAngles: [
    {
      angle: {
        name: 'knee',
        point1: 'rightHip',
        vertex: 'rightKnee',
        point2: 'rightAnkle',
        description: 'Working leg knee flexion angle',
      },
      targets: {
        stand: { ideal: 175, tolerance: 10, weight: 0.5 },
        descent: { ideal: 120, tolerance: 20, weight: 0.4 },
        bottom: { ideal: 50, tolerance: 15, weight: 0.6 },
        ascent: { ideal: 120, tolerance: 20, weight: 0.4 },
      },
      required: true,
    },
    {
      angle: {
        name: 'hip',
        point1: 'rightKnee',
        vertex: 'rightHip',
        point2: 'rightShoulder',
        description: 'Working leg hip flexion angle',
      },
      targets: {
        stand: { ideal: 170, tolerance: 15, weight: 0.5 },
        descent: { ideal: 130, tolerance: 20, weight: 0.3 },
        bottom: { ideal: 70, tolerance: 20, weight: 0.4 },
        ascent: { ideal: 130, tolerance: 20, weight: 0.3 },
      },
      required: true,
    },
  ],

  positions: [
    {
      name: 'stand',
      displayName: 'Stand',
      description: 'Standing tall on one leg, other leg may be slightly raised',
      phase: 'ascend',
      angleTargets: {
        knee: { ideal: 175, tolerance: 10, weight: 0.5 },
        hip: { ideal: 170, tolerance: 15, weight: 0.5 },
      },
      captureThumbnail: true,
    },
    {
      name: 'descent',
      displayName: 'Descent',
      description: 'Controlled lowering, extending non-working leg forward',
      phase: 'descend',
      angleTargets: {
        knee: { ideal: 120, tolerance: 20, weight: 0.6 },
        hip: { ideal: 130, tolerance: 20, weight: 0.4 },
      },
      captureThumbnail: false,
    },
    {
      name: 'bottom',
      displayName: 'Bottom',
      description: 'Full depth, hamstring on calf, non-working leg extended',
      phase: 'descend',
      angleTargets: {
        knee: { ideal: 50, tolerance: 15, weight: 0.6 },
        hip: { ideal: 70, tolerance: 20, weight: 0.4 },
      },
      captureThumbnail: true,
    },
    {
      name: 'ascent',
      displayName: 'Ascent',
      description: 'Driving up from bottom position',
      phase: 'ascend',
      angleTargets: {
        knee: { ideal: 120, tolerance: 20, weight: 0.6 },
        hip: { ideal: 130, tolerance: 20, weight: 0.4 },
      },
      captureThumbnail: false,
    },
  ],

  phaseDetection: {
    primaryAngle: 'knee',
    phaseChangeThreshold: 5,
    increasingIsDescend: false, // Knee angle decreases when squatting down
  },

  cycleDetection: {
    primaryAngle: 'knee',
    resetThreshold: 160, // Back to near-standing
    minCycleAngle: 80, // Must get knee below 80° for valid rep
  },

  repCriteria: {
    requiredPositions: ['stand', 'bottom'],
    completionSequence: ['bottom', 'stand'],
    minRepDuration: 1500,
    maxRepDuration: 15000,
  },

  qualityMetrics: [
    {
      name: 'depthScore',
      displayName: 'Depth',
      description: 'How deep the squat goes (0-100)',
      range: [0, 100],
      higherIsBetter: true,
      weight: 0.4,
    },
    {
      name: 'balanceScore',
      displayName: 'Balance',
      description: 'Stability throughout movement (0-100)',
      range: [0, 100],
      higherIsBetter: true,
      weight: 0.3,
    },
    {
      name: 'controlScore',
      displayName: 'Control',
      description: 'Smooth, controlled descent and ascent (0-100)',
      range: [0, 100],
      higherIsBetter: true,
      weight: 0.3,
    },
  ],

  defaultScoringWeights: {
    angleScore: 0.5,
    phaseScore: 0.2,
    qualityScore: 0.3,
  },
};
