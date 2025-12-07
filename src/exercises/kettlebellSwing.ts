/**
 * Kettlebell Swing Exercise Definition
 *
 * Ported from existing SwingAnalyzer configuration.
 * Four key positions: Top, Connect, Bottom, Release
 */

import {
  ExerciseType,
  type ExerciseDefinition,
} from '../types/exercise';

/**
 * Kettlebell swing exercise definition
 *
 * Key angles tracked:
 * - spine: Hip-to-shoulder angle from vertical (0° = upright, 85° = deep hinge)
 * - hip: Knee-hip-shoulder angle (~180° standing, ~100° bottom)
 * - knee: Hip-knee-ankle angle (~180° straight, should stay relatively constant)
 * - armToVertical: Arm angle from vertical (for arm position tracking)
 */
export const kettlebellSwingDefinition: ExerciseDefinition = {
  type: ExerciseType.KettlebellSwing,
  name: 'Kettlebell Swing',
  description:
    'Hip-hinge movement with explosive hip extension. Focus on hinge pattern (not squat).',

  keyAngles: [
    {
      angle: {
        name: 'spine',
        point1: 'rightHip',
        vertex: 'midSpine',
        point2: 'rightShoulder',
        description: 'Spine angle from vertical',
      },
      targets: {
        top: { ideal: 0, tolerance: 15, weight: 0.5 },
        connect: { ideal: 45, tolerance: 15, weight: 0.4 },
        bottom: { ideal: 85, tolerance: 10, weight: 0.5 },
        release: { ideal: 35, tolerance: 15, weight: 0.4 },
      },
      required: true,
    },
    {
      angle: {
        name: 'hip',
        point1: 'rightKnee',
        vertex: 'rightHip',
        point2: 'rightShoulder',
        description: 'Hip flexion angle (knee-hip-shoulder)',
      },
      targets: {
        top: { ideal: 165, tolerance: 15, weight: 0.5 },
        connect: { ideal: 140, tolerance: 15, weight: 0.3 },
        bottom: { ideal: 100, tolerance: 15, weight: 0.5 },
        release: { ideal: 130, tolerance: 15, weight: 0.3 },
      },
      required: true,
    },
    {
      angle: {
        name: 'knee',
        point1: 'rightHip',
        vertex: 'rightKnee',
        point2: 'rightAnkle',
        description: 'Knee flexion angle (should stay relatively straight)',
      },
      targets: {
        top: { ideal: 175, tolerance: 10, weight: 0.3 },
        connect: { ideal: 160, tolerance: 15, weight: 0.2 },
        bottom: { ideal: 150, tolerance: 15, weight: 0.3 },
        release: { ideal: 160, tolerance: 15, weight: 0.2 },
      },
      required: false,
    },
    {
      angle: {
        name: 'wristHeight',
        point1: 'leftShoulder',
        vertex: 'midShoulder', // Virtual point
        point2: 'leftWrist',
        description: 'Wrist height relative to shoulder (positive = above)',
      },
      targets: {
        top: { ideal: 0, tolerance: 80, weight: 0.8 }, // Near or above shoulder
        connect: { ideal: -150, tolerance: 100, weight: 0.3 },
        bottom: { ideal: -250, tolerance: 100, weight: 0.3 },
        release: { ideal: -100, tolerance: 100, weight: 0.3 },
      },
      required: false,
    },
  ],

  positions: [
    {
      name: 'top',
      displayName: 'Top',
      description: 'Standing tall with arms extended, glutes squeezed',
      phase: 'any', // Can be at top during start, end of ascend, or ready to descend
      angleTargets: {
        spine: { ideal: 10, tolerance: 20, weight: 1.0 },
      },
      captureThumbnail: true,
    },
    {
      name: 'connect',
      displayName: 'Connect',
      description: 'Arms connecting with body during downswing',
      phase: 'descend',
      angleTargets: {
        spine: { ideal: 45, tolerance: 20, weight: 1.0 },
      },
      captureThumbnail: true,
    },
    {
      name: 'bottom',
      displayName: 'Bottom',
      description: 'Deepest hinge position, hips back, chest forward',
      phase: 'any', // Bottom is a transition point between descend and ascend
      angleTargets: {
        spine: { ideal: 75, tolerance: 25, weight: 1.0 },
      },
      captureThumbnail: true,
    },
    {
      name: 'release',
      displayName: 'Release',
      description: 'Arms releasing during upswing, explosive hip extension',
      phase: 'ascend',
      angleTargets: {
        spine: { ideal: 37, tolerance: 20, weight: 1.0 },
      },
      captureThumbnail: true,
    },
  ],

  phaseDetection: {
    primaryAngle: 'spine',
    phaseChangeThreshold: 3,
    increasingIsDescend: true,
  },

  cycleDetection: {
    primaryAngle: 'spine',
    resetThreshold: 35,
    minCycleAngle: 35,
  },

  repCriteria: {
    requiredPositions: ['top', 'bottom'],
    completionSequence: ['release', 'top'],
    minRepDuration: 500,
    maxRepDuration: 5000,
  },

  qualityMetrics: [
    {
      name: 'hingeScore',
      displayName: 'Hinge Quality',
      description: 'Hip hinge vs squat pattern (-1 squat to +1 hinge)',
      range: [-1, 1],
      higherIsBetter: true,
      weight: 0.4,
    },
    {
      name: 'depthScore',
      displayName: 'Depth',
      description: 'Quality of bottom position (0-100)',
      range: [0, 100],
      higherIsBetter: true,
      weight: 0.3,
    },
    {
      name: 'lockoutScore',
      displayName: 'Lockout',
      description: 'Quality of top position (0-100)',
      range: [0, 100],
      higherIsBetter: true,
      weight: 0.3,
    },
  ],

  defaultScoringWeights: {
    angleScore: 0.5,
    phaseScore: 0.3,
    qualityScore: 0.2,
  },
};
