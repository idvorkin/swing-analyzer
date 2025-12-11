import { describe, expect, it } from 'vitest';
import {
  createAnalyzerForExercise,
  EXERCISE_REGISTRY,
  getAvailableExercises,
  getDefaultSampleVideo,
  getExerciseDefinition,
  getExerciseDisplayName,
  getExerciseIcon,
  getSampleVideos,
} from './ExerciseRegistry';
import { KettlebellSwingFormAnalyzer } from './KettlebellSwingFormAnalyzer';
import { PistolSquatFormAnalyzer } from './PistolSquatFormAnalyzer';

describe('ExerciseRegistry', () => {
  describe('EXERCISE_REGISTRY', () => {
    it('contains kettlebell-swing definition', () => {
      expect(EXERCISE_REGISTRY['kettlebell-swing']).toBeDefined();
      expect(EXERCISE_REGISTRY['kettlebell-swing'].displayName).toBe(
        'Kettlebell Swing'
      );
    });

    it('contains pistol-squat definition', () => {
      expect(EXERCISE_REGISTRY['pistol-squat']).toBeDefined();
      expect(EXERCISE_REGISTRY['pistol-squat'].displayName).toBe(
        'Pistol Squat'
      );
    });

    it('each exercise has required fields', () => {
      for (const [id, def] of Object.entries(EXERCISE_REGISTRY)) {
        expect(def.id).toBe(id);
        expect(def.displayName).toBeTruthy();
        expect(def.icon).toBeTruthy();
        expect(typeof def.createAnalyzer).toBe('function');
        expect(def.sampleVideos.length).toBeGreaterThan(0);
      }
    });
  });

  describe('getExerciseDefinition', () => {
    it('returns definition for kettlebell-swing', () => {
      const def = getExerciseDefinition('kettlebell-swing');
      expect(def).toBeDefined();
      expect(def?.displayName).toBe('Kettlebell Swing');
    });

    it('returns definition for pistol-squat', () => {
      const def = getExerciseDefinition('pistol-squat');
      expect(def).toBeDefined();
      expect(def?.displayName).toBe('Pistol Squat');
    });

    it('returns undefined for unknown exercise', () => {
      const def = getExerciseDefinition('unknown');
      expect(def).toBeUndefined();
    });
  });

  describe('createAnalyzerForExercise', () => {
    it('creates KettlebellSwingFormAnalyzer for kettlebell-swing', () => {
      const analyzer = createAnalyzerForExercise('kettlebell-swing');
      expect(analyzer).toBeInstanceOf(KettlebellSwingFormAnalyzer);
    });

    it('creates PistolSquatFormAnalyzer for pistol-squat', () => {
      const analyzer = createAnalyzerForExercise('pistol-squat');
      expect(analyzer).toBeInstanceOf(PistolSquatFormAnalyzer);
    });

    it('defaults to KettlebellSwingFormAnalyzer for unknown exercise', () => {
      const analyzer = createAnalyzerForExercise('unknown');
      expect(analyzer).toBeInstanceOf(KettlebellSwingFormAnalyzer);
    });
  });

  describe('getExerciseDisplayName', () => {
    it('returns "Kettlebell Swing" for kettlebell-swing', () => {
      expect(getExerciseDisplayName('kettlebell-swing')).toBe(
        'Kettlebell Swing'
      );
    });

    it('returns "Pistol Squat" for pistol-squat', () => {
      expect(getExerciseDisplayName('pistol-squat')).toBe('Pistol Squat');
    });

    it('returns "Detecting..." for unknown', () => {
      expect(getExerciseDisplayName('unknown')).toBe('Detecting...');
    });
  });

  describe('getExerciseIcon', () => {
    it('returns weight lifter emoji for kettlebell-swing', () => {
      expect(getExerciseIcon('kettlebell-swing')).toBe('\u{1F3CB}');
    });

    it('returns kneeling person emoji for pistol-squat', () => {
      expect(getExerciseIcon('pistol-squat')).toBe('\u{1F9CE}');
    });

    it('returns magnifying glass emoji for unknown', () => {
      expect(getExerciseIcon('unknown')).toBe('\u{1F50D}');
    });
  });

  describe('getAvailableExercises', () => {
    it('returns array of exercise IDs', () => {
      const exercises = getAvailableExercises();
      expect(Array.isArray(exercises)).toBe(true);
      expect(exercises).toContain('kettlebell-swing');
      expect(exercises).toContain('pistol-squat');
    });

    it('does not include unknown', () => {
      const exercises = getAvailableExercises();
      expect(exercises).not.toContain('unknown');
    });
  });

  describe('getDefaultSampleVideo', () => {
    it('returns URL for kettlebell-swing', () => {
      const url = getDefaultSampleVideo('kettlebell-swing');
      expect(url).toBeDefined();
      expect(url).toContain('kettlebell-swing');
    });

    it('returns URL for pistol-squat', () => {
      const url = getDefaultSampleVideo('pistol-squat');
      expect(url).toBeDefined();
      expect(url).toContain('pistols'); // URL uses 'pistols' folder name
    });

    it('returns undefined for unknown', () => {
      const url = getDefaultSampleVideo('unknown');
      expect(url).toBeUndefined();
    });
  });

  describe('getSampleVideos', () => {
    it('returns sample videos for kettlebell-swing', () => {
      const videos = getSampleVideos('kettlebell-swing');
      expect(videos.length).toBeGreaterThan(0);
      expect(videos[0].name).toBeTruthy();
      expect(videos[0].url).toBeTruthy();
    });

    it('returns sample videos for pistol-squat', () => {
      const videos = getSampleVideos('pistol-squat');
      expect(videos.length).toBeGreaterThan(0);
    });

    it('returns empty array for unknown', () => {
      const videos = getSampleVideos('unknown');
      expect(videos).toEqual([]);
    });
  });
});
