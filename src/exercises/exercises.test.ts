import { describe, expect, it } from 'vitest';
import { ExerciseType } from '../types/exercise';
import {
  exerciseRegistry,
  getAvailableExercises,
  getExerciseByName,
  getExerciseDefinition,
  isExerciseSupported,
  kettlebellSwingDefinition,
  pistolSquatDefinition,
  pullUpDefinition,
} from './index';

describe('Exercise Registry', () => {
  describe('exerciseRegistry', () => {
    it('contains all exercise types', () => {
      expect(exerciseRegistry[ExerciseType.KettlebellSwing]).toBeDefined();
      expect(exerciseRegistry[ExerciseType.PullUp]).toBeDefined();
      expect(exerciseRegistry[ExerciseType.PistolSquat]).toBeDefined();
    });

    it('has correct exercise types', () => {
      expect(exerciseRegistry[ExerciseType.KettlebellSwing].type).toBe(
        ExerciseType.KettlebellSwing
      );
      expect(exerciseRegistry[ExerciseType.PullUp].type).toBe(ExerciseType.PullUp);
      expect(exerciseRegistry[ExerciseType.PistolSquat].type).toBe(
        ExerciseType.PistolSquat
      );
    });
  });

  describe('getExerciseDefinition', () => {
    it('returns correct definition for each type', () => {
      expect(getExerciseDefinition(ExerciseType.KettlebellSwing)).toBe(
        kettlebellSwingDefinition
      );
      expect(getExerciseDefinition(ExerciseType.PullUp)).toBe(pullUpDefinition);
      expect(getExerciseDefinition(ExerciseType.PistolSquat)).toBe(
        pistolSquatDefinition
      );
    });

    it('throws for unknown exercise type', () => {
      expect(() => getExerciseDefinition('unknown' as ExerciseType)).toThrow(
        'Unknown exercise type'
      );
    });
  });

  describe('getAvailableExercises', () => {
    it('returns all exercise types', () => {
      const exercises = getAvailableExercises();
      expect(exercises).toContain(ExerciseType.KettlebellSwing);
      expect(exercises).toContain(ExerciseType.PullUp);
      expect(exercises).toContain(ExerciseType.PistolSquat);
      expect(exercises).toHaveLength(3);
    });
  });

  describe('getExerciseByName', () => {
    it('finds exercise by exact type', () => {
      expect(getExerciseByName('kettlebell_swing')).toBe(kettlebellSwingDefinition);
      expect(getExerciseByName('pull_up')).toBe(pullUpDefinition);
      expect(getExerciseByName('pistol_squat')).toBe(pistolSquatDefinition);
    });

    it('finds exercise by display name', () => {
      expect(getExerciseByName('Kettlebell Swing')).toBe(kettlebellSwingDefinition);
      expect(getExerciseByName('Pull-Up')).toBe(pullUpDefinition);
      expect(getExerciseByName('Pistol Squat')).toBe(pistolSquatDefinition);
    });

    it('is case-insensitive', () => {
      expect(getExerciseByName('KETTLEBELL_SWING')).toBe(kettlebellSwingDefinition);
      expect(getExerciseByName('pullup')).toBe(pullUpDefinition);
      expect(getExerciseByName('pistolsquat')).toBe(pistolSquatDefinition);
    });

    it('returns undefined for unknown name', () => {
      expect(getExerciseByName('unknown')).toBeUndefined();
      expect(getExerciseByName('')).toBeUndefined();
    });
  });

  describe('isExerciseSupported', () => {
    it('returns true for supported exercises', () => {
      expect(isExerciseSupported(ExerciseType.KettlebellSwing)).toBe(true);
      expect(isExerciseSupported(ExerciseType.PullUp)).toBe(true);
      expect(isExerciseSupported(ExerciseType.PistolSquat)).toBe(true);
    });

    it('returns false for unsupported exercises', () => {
      expect(isExerciseSupported('unknown' as ExerciseType)).toBe(false);
    });
  });
});

describe('Kettlebell Swing Definition', () => {
  const def = kettlebellSwingDefinition;

  it('has correct basic properties', () => {
    expect(def.type).toBe(ExerciseType.KettlebellSwing);
    expect(def.name).toBe('Kettlebell Swing');
  });

  it('has required key angles', () => {
    const angleNames = def.keyAngles.map((a) => a.angle.name);
    expect(angleNames).toContain('spine');
    expect(angleNames).toContain('hip');
  });

  it('has four positions', () => {
    expect(def.positions).toHaveLength(4);
    const positionNames = def.positions.map((p) => p.name);
    expect(positionNames).toContain('top');
    expect(positionNames).toContain('connect');
    expect(positionNames).toContain('bottom');
    expect(positionNames).toContain('release');
  });

  it('has valid phase detection config', () => {
    expect(def.phaseDetection.primaryAngle).toBe('spine');
    expect(def.phaseDetection.phaseChangeThreshold).toBeGreaterThan(0);
  });

  it('has valid rep criteria', () => {
    expect(def.repCriteria.requiredPositions).toContain('top');
    expect(def.repCriteria.requiredPositions).toContain('bottom');
    expect(def.repCriteria.completionSequence).toEqual(['release', 'top']);
  });

  it('has quality metrics', () => {
    expect(def.qualityMetrics.length).toBeGreaterThan(0);
    const metricNames = def.qualityMetrics.map((m) => m.name);
    expect(metricNames).toContain('hingeScore');
  });
});

describe('Pull-Up Definition', () => {
  const def = pullUpDefinition;

  it('has correct basic properties', () => {
    expect(def.type).toBe(ExerciseType.PullUp);
    expect(def.name).toBe('Pull-Up');
  });

  it('has elbow angle as key angle', () => {
    const elbowAngle = def.keyAngles.find((a) => a.angle.name === 'elbow');
    expect(elbowAngle).toBeDefined();
    expect(elbowAngle?.required).toBe(true);
  });

  it('has three positions', () => {
    expect(def.positions).toHaveLength(3);
    const positionNames = def.positions.map((p) => p.name);
    expect(positionNames).toContain('hang');
    expect(positionNames).toContain('pull');
    expect(positionNames).toContain('top');
  });

  it('uses elbow for phase detection', () => {
    expect(def.phaseDetection.primaryAngle).toBe('elbow');
  });

  it('has valid rep criteria', () => {
    expect(def.repCriteria.requiredPositions).toContain('hang');
    expect(def.repCriteria.requiredPositions).toContain('top');
  });
});

describe('Pistol Squat Definition', () => {
  const def = pistolSquatDefinition;

  it('has correct basic properties', () => {
    expect(def.type).toBe(ExerciseType.PistolSquat);
    expect(def.name).toBe('Pistol Squat');
  });

  it('has knee and hip angles', () => {
    const angleNames = def.keyAngles.map((a) => a.angle.name);
    expect(angleNames).toContain('knee');
    expect(angleNames).toContain('hip');
  });

  it('has four positions', () => {
    expect(def.positions).toHaveLength(4);
    const positionNames = def.positions.map((p) => p.name);
    expect(positionNames).toContain('stand');
    expect(positionNames).toContain('bottom');
  });

  it('uses knee for phase detection', () => {
    expect(def.phaseDetection.primaryAngle).toBe('knee');
    // Knee angle decreases when squatting
    expect(def.phaseDetection.increasingIsDescend).toBe(false);
  });

  it('has valid rep criteria', () => {
    expect(def.repCriteria.requiredPositions).toContain('stand');
    expect(def.repCriteria.requiredPositions).toContain('bottom');
  });
});

describe('Exercise Definition Validation', () => {
  const allDefinitions = [
    kettlebellSwingDefinition,
    pullUpDefinition,
    pistolSquatDefinition,
  ];

  it('all definitions have valid scoring weights that sum to ~1', () => {
    for (const def of allDefinitions) {
      const { angleScore, phaseScore, qualityScore } = def.defaultScoringWeights;
      const sum = angleScore + phaseScore + qualityScore;
      expect(sum).toBeCloseTo(1, 1);
    }
  });

  it('all definitions have at least one required angle', () => {
    for (const def of allDefinitions) {
      const requiredAngles = def.keyAngles.filter((a) => a.required);
      expect(requiredAngles.length).toBeGreaterThan(0);
    }
  });

  it('all definitions have at least two positions', () => {
    for (const def of allDefinitions) {
      expect(def.positions.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('all positions have valid angle targets', () => {
    for (const def of allDefinitions) {
      for (const position of def.positions) {
        expect(Object.keys(position.angleTargets).length).toBeGreaterThan(0);
        for (const target of Object.values(position.angleTargets)) {
          expect(target.ideal).toBeGreaterThanOrEqual(0);
          expect(target.tolerance).toBeGreaterThan(0);
          expect(target.weight).toBeGreaterThan(0);
          expect(target.weight).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('all quality metrics have valid weight', () => {
    for (const def of allDefinitions) {
      for (const metric of def.qualityMetrics) {
        expect(metric.weight).toBeGreaterThan(0);
        expect(metric.weight).toBeLessThanOrEqual(1);
      }
    }
  });
});
