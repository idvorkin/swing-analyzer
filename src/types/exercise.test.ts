import { describe, expect, it } from 'vitest';
import {
  ExerciseType,
  isValidExerciseType,
  type AngleDefinition,
  type AngleTarget,
  type ExerciseDefinition,
  type PositionDefinition,
} from './exercise';

describe('exercise types', () => {
  describe('ExerciseType enum', () => {
    it('has expected exercise types', () => {
      expect(ExerciseType.KettlebellSwing).toBe('kettlebell_swing');
      expect(ExerciseType.PullUp).toBe('pull_up');
      expect(ExerciseType.PistolSquat).toBe('pistol_squat');
    });
  });

  describe('isValidExerciseType', () => {
    it('returns true for valid exercise types', () => {
      expect(isValidExerciseType('kettlebell_swing')).toBe(true);
      expect(isValidExerciseType('pull_up')).toBe(true);
      expect(isValidExerciseType('pistol_squat')).toBe(true);
    });

    it('returns false for invalid exercise types', () => {
      expect(isValidExerciseType('invalid')).toBe(false);
      expect(isValidExerciseType('')).toBe(false);
      expect(isValidExerciseType('pushup')).toBe(false);
    });
  });

  describe('AngleDefinition', () => {
    it('can define elbow angle', () => {
      const elbowAngle: AngleDefinition = {
        name: 'elbow',
        point1: 'rightShoulder',
        vertex: 'rightElbow',
        point2: 'rightWrist',
        description: 'Elbow flexion angle',
      };

      expect(elbowAngle.name).toBe('elbow');
      expect(elbowAngle.vertex).toBe('rightElbow');
    });

    it('can define hip angle', () => {
      const hipAngle: AngleDefinition = {
        name: 'hip',
        point1: 'rightKnee',
        vertex: 'rightHip',
        point2: 'rightShoulder',
      };

      expect(hipAngle.name).toBe('hip');
      expect(hipAngle.point1).toBe('rightKnee');
    });
  });

  describe('AngleTarget', () => {
    it('defines ideal angle with tolerance', () => {
      const target: AngleTarget = {
        ideal: 90,
        tolerance: 15,
        weight: 0.5,
      };

      expect(target.ideal).toBe(90);
      expect(target.tolerance).toBe(15);
      expect(target.weight).toBe(0.5);
    });
  });

  describe('PositionDefinition', () => {
    it('defines a position with all required fields', () => {
      const topPosition: PositionDefinition = {
        name: 'top',
        displayName: 'Top',
        description: 'Standing tall with arms extended',
        phase: 'ascend',
        angleTargets: {
          spine: { ideal: 0, tolerance: 15, weight: 0.6 },
          hip: { ideal: 170, tolerance: 10, weight: 0.4 },
        },
        captureThumbnail: true,
      };

      expect(topPosition.name).toBe('top');
      expect(topPosition.phase).toBe('ascend');
      expect(topPosition.angleTargets.spine.ideal).toBe(0);
      expect(topPosition.captureThumbnail).toBe(true);
    });
  });

  describe('ExerciseDefinition', () => {
    it('can define a complete exercise', () => {
      const swingDefinition: ExerciseDefinition = {
        type: ExerciseType.KettlebellSwing,
        name: 'Kettlebell Swing',
        description: 'Hip-hinge movement with kettlebell',
        keyAngles: [
          {
            angle: {
              name: 'spine',
              point1: 'rightHip',
              vertex: 'midSpine',
              point2: 'rightShoulder',
            },
            targets: {
              top: { ideal: 0, tolerance: 15, weight: 0.5 },
              bottom: { ideal: 85, tolerance: 10, weight: 0.5 },
            },
            required: true,
          },
        ],
        positions: [
          {
            name: 'top',
            displayName: 'Top',
            description: 'Standing tall',
            phase: 'ascend',
            angleTargets: { spine: { ideal: 0, tolerance: 15, weight: 1 } },
            captureThumbnail: true,
          },
          {
            name: 'bottom',
            displayName: 'Bottom',
            description: 'Deep hinge',
            phase: 'descend',
            angleTargets: { spine: { ideal: 85, tolerance: 10, weight: 1 } },
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
          completionSequence: ['bottom', 'top'],
          minRepDuration: 500,
          maxRepDuration: 5000,
        },
        qualityMetrics: [
          {
            name: 'hingeScore',
            displayName: 'Hinge Quality',
            description: 'Hip hinge vs squat pattern',
            range: [-1, 1],
            higherIsBetter: true,
            weight: 0.4,
          },
        ],
        defaultScoringWeights: {
          angleScore: 0.5,
          phaseScore: 0.3,
          qualityScore: 0.2,
        },
      };

      expect(swingDefinition.type).toBe(ExerciseType.KettlebellSwing);
      expect(swingDefinition.keyAngles).toHaveLength(1);
      expect(swingDefinition.positions).toHaveLength(2);
      expect(swingDefinition.repCriteria.requiredPositions).toContain('top');
    });
  });
});
