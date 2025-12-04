/**
 * Pull-Up Exercise Definition
 *
 * Key positions: Hang (arms extended), Pull (mid-pull), Top (chin over bar)
 * Primary angle: Elbow flexion
 */

import {
  ExerciseType,
  type ExerciseDefinition,
} from '../types/exercise';

/**
 * Pull-up exercise definition
 *
 * Key angles tracked:
 * - elbow: Shoulder-elbow-wrist angle (~180° hang, ~45-70° top)
 * - shoulder: Vertical arm angle (arm position relative to torso)
 */
export const pullUpDefinition: ExerciseDefinition = {
  type: ExerciseType.PullUp,
  name: 'Pull-Up',
  description:
    'Vertical pulling movement. Full range of motion from dead hang to chin over bar.',

  keyAngles: [
    {
      angle: {
        name: 'elbow',
        point1: 'rightShoulder',
        vertex: 'rightElbow',
        point2: 'rightWrist',
        description: 'Elbow flexion angle',
      },
      targets: {
        hang: { ideal: 175, tolerance: 10, weight: 0.7 },
        pull: { ideal: 110, tolerance: 20, weight: 0.5 },
        top: { ideal: 55, tolerance: 15, weight: 0.7 },
      },
      required: true,
    },
    {
      angle: {
        name: 'shoulder',
        point1: 'rightElbow',
        vertex: 'rightShoulder',
        point2: 'rightHip',
        description: 'Shoulder angle (arm to torso)',
      },
      targets: {
        hang: { ideal: 180, tolerance: 15, weight: 0.3 },
        pull: { ideal: 135, tolerance: 20, weight: 0.3 },
        top: { ideal: 90, tolerance: 20, weight: 0.3 },
      },
      required: false,
    },
  ],

  positions: [
    {
      name: 'hang',
      displayName: 'Hang',
      description: 'Dead hang with arms fully extended',
      phase: 'descend',
      angleTargets: {
        elbow: { ideal: 175, tolerance: 10, weight: 0.8 },
        shoulder: { ideal: 180, tolerance: 15, weight: 0.2 },
      },
      captureThumbnail: true,
    },
    {
      name: 'pull',
      displayName: 'Pull',
      description: 'Mid-pull position, elbows driving down',
      phase: 'ascend',
      angleTargets: {
        elbow: { ideal: 110, tolerance: 20, weight: 0.7 },
        shoulder: { ideal: 135, tolerance: 20, weight: 0.3 },
      },
      captureThumbnail: false,
    },
    {
      name: 'top',
      displayName: 'Top',
      description: 'Chin over bar, elbows fully flexed',
      phase: 'ascend',
      angleTargets: {
        elbow: { ideal: 55, tolerance: 15, weight: 0.8 },
        shoulder: { ideal: 90, tolerance: 20, weight: 0.2 },
      },
      captureThumbnail: true,
    },
  ],

  phaseDetection: {
    primaryAngle: 'elbow',
    phaseChangeThreshold: 5,
    increasingIsDescend: true, // Elbow angle increases when lowering (extending)
  },

  cycleDetection: {
    primaryAngle: 'elbow',
    resetThreshold: 160, // Back to near-full extension
    minCycleAngle: 90, // Must bend elbow past 90° for valid rep
  },

  repCriteria: {
    requiredPositions: ['hang', 'top'],
    completionSequence: ['top', 'hang'],
    minRepDuration: 1000,
    maxRepDuration: 10000,
  },

  qualityMetrics: [
    {
      name: 'rangeOfMotion',
      displayName: 'Range of Motion',
      description: 'Full extension to full flexion (0-100)',
      range: [0, 100],
      higherIsBetter: true,
      weight: 0.5,
    },
    {
      name: 'controlScore',
      displayName: 'Control',
      description: 'Smooth movement without kipping (0-100)',
      range: [0, 100],
      higherIsBetter: true,
      weight: 0.3,
    },
    {
      name: 'symmetryScore',
      displayName: 'Symmetry',
      description: 'Left/right arm balance (0-100)',
      range: [0, 100],
      higherIsBetter: true,
      weight: 0.2,
    },
  ],

  defaultScoringWeights: {
    angleScore: 0.6,
    phaseScore: 0.2,
    qualityScore: 0.2,
  },
};
