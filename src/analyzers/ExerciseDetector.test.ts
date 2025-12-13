import { beforeEach, describe, expect, it } from 'vitest';
import { createDetectorMockSkeleton } from './__test-helpers__';
import { ExerciseDetector } from './ExerciseDetector';

// Alias for backwards compatibility in test code
const createMockSkeleton = createDetectorMockSkeleton;

// Fast config for unit tests - production uses minFrames: 60, maxFrames: 120
const TEST_CONFIG = {
  minFrames: 10,
  maxFrames: 30,
  asymmetryThreshold: 35,
  confidenceThreshold: 70,
};

describe('ExerciseDetector', () => {
  let detector: ExerciseDetector;

  beforeEach(() => {
    detector = new ExerciseDetector(TEST_CONFIG);
  });

  describe('initial state', () => {
    it('starts with unknown exercise', () => {
      const result = detector.getResult();
      expect(result.exercise).toBe('unknown');
      expect(result.confidence).toBe(0);
    });

    it('is not locked initially', () => {
      expect(detector.isLocked()).toBe(false);
    });
  });

  describe('kettlebell swing detection', () => {
    it('detects kettlebell swing with symmetric leg movement', () => {
      // Simulate swing: both knees similar angles throughout
      const swingFrames = [
        { left: 170, right: 172 }, // Standing
        { left: 165, right: 167 }, // Starting hinge
        { left: 155, right: 158 }, // Mid hinge
        { left: 140, right: 143 }, // Bottom of hinge
        { left: 145, right: 147 }, // Rising
        { left: 160, right: 162 }, // Top
        { left: 170, right: 172 }, // Standing
        { left: 168, right: 170 }, // Starting next rep
        { left: 155, right: 157 }, // Mid hinge
        { left: 142, right: 144 }, // Bottom
        { left: 150, right: 152 }, // Rising
        { left: 165, right: 167 }, // Top
      ];

      let result: ReturnType<typeof detector.processFrame> | undefined;
      for (const frame of swingFrames) {
        result = detector.processFrame(
          createMockSkeleton(frame.left, frame.right)
        );
      }

      expect(result?.exercise).toBe('kettlebell-swing');
      expect(result?.confidence).toBeGreaterThan(50);
    });

    it('has high confidence for consistent symmetric movement', () => {
      // 20 frames of symmetric movement
      for (let i = 0; i < 20; i++) {
        const angle = 150 + Math.sin(i * 0.5) * 20;
        detector.processFrame(createMockSkeleton(angle, angle + 2));
      }

      const result = detector.getResult();
      expect(result.exercise).toBe('kettlebell-swing');
      expect(result.confidence).toBeGreaterThan(70);
    });
  });

  describe('pistol squat detection', () => {
    it('detects pistol squat with asymmetric leg movement', () => {
      // Simulate pistol squat: one leg bends deeply, other stays straight
      const pistolFrames = [
        { left: 170, right: 175 }, // Standing
        { left: 150, right: 175 }, // Starting descent (working leg: left)
        { left: 120, right: 175 }, // Mid descent
        { left: 90, right: 175 }, // Deep squat
        { left: 60, right: 172 }, // Bottom
        { left: 70, right: 173 }, // Starting ascent
        { left: 100, right: 174 }, // Mid ascent
        { left: 130, right: 175 }, // Rising
        { left: 160, right: 175 }, // Near top
        { left: 170, right: 175 }, // Standing
        { left: 145, right: 175 }, // Second rep starting
        { left: 100, right: 174 }, // Descending
      ];

      let result: ReturnType<typeof detector.processFrame> | undefined;
      for (const frame of pistolFrames) {
        result = detector.processFrame(
          createMockSkeleton(frame.left, frame.right)
        );
      }

      expect(result?.exercise).toBe('pistol-squat');
      expect(result?.confidence).toBeGreaterThan(50);
    });

    it('detects right-leg pistol squat', () => {
      // Working leg is RIGHT (bends), extended leg is LEFT
      const pistolFrames = [
        { left: 175, right: 170 }, // Standing
        { left: 175, right: 140 }, // Starting descent
        { left: 173, right: 100 }, // Mid descent
        { left: 172, right: 60 }, // Bottom
        { left: 173, right: 80 }, // Ascending
        { left: 174, right: 120 }, // Rising
        { left: 175, right: 160 }, // Near top
        { left: 175, right: 170 }, // Standing
        { left: 174, right: 130 }, // Second rep
        { left: 173, right: 80 }, // Bottom again
      ];

      let result: ReturnType<typeof detector.processFrame> | undefined;
      for (const frame of pistolFrames) {
        result = detector.processFrame(
          createMockSkeleton(frame.left, frame.right)
        );
      }

      expect(result?.exercise).toBe('pistol-squat');
      expect(result?.confidence).toBeGreaterThan(50);
    });

    it('has high confidence for deep single-leg squat', () => {
      // Simulate clear pistol squat with max asymmetry
      for (let i = 0; i < 15; i++) {
        // Left leg goes from 170 down to 50 and back
        const leftKnee = 170 - Math.abs(Math.sin(i * 0.3)) * 120;
        // Right leg stays straight
        const rightKnee = 175;
        detector.processFrame(createMockSkeleton(leftKnee, rightKnee));
      }

      const result = detector.getResult();
      expect(result.exercise).toBe('pistol-squat');
      expect(result.confidence).toBeGreaterThan(70);
    });
  });

  describe('locking behavior', () => {
    it('locks detection after confidence threshold', () => {
      // Process enough asymmetric frames to lock pistol squat
      for (let i = 0; i < 20; i++) {
        detector.processFrame(createMockSkeleton(60 + i * 5, 175));
      }

      expect(detector.isLocked()).toBe(true);
      const result = detector.getResult();
      expect(result.exercise).toBe('pistol-squat');
    });

    it('returns cached result after locking', () => {
      // Lock as pistol squat
      for (let i = 0; i < 20; i++) {
        detector.processFrame(createMockSkeleton(60, 175));
      }
      expect(detector.isLocked()).toBe(true);

      // Process symmetric frames (would be swing)
      const result = detector.processFrame(createMockSkeleton(170, 172));

      // Should still return pistol squat (locked)
      expect(result.exercise).toBe('pistol-squat');
    });
  });

  describe('reset', () => {
    it('resets all state', () => {
      // Build up some state
      for (let i = 0; i < 15; i++) {
        detector.processFrame(createMockSkeleton(60, 175));
      }
      expect(detector.isLocked()).toBe(true);

      // Reset
      detector.reset();

      expect(detector.isLocked()).toBe(false);
      expect(detector.getResult().exercise).toBe('unknown');
      expect(detector.getStats().frameCount).toBe(0);
    });
  });

  describe('statistics', () => {
    it('tracks frame count and asymmetry', () => {
      detector.processFrame(createMockSkeleton(100, 170)); // 70° asymmetry
      detector.processFrame(createMockSkeleton(110, 170)); // 60° asymmetry
      detector.processFrame(createMockSkeleton(120, 170)); // 50° asymmetry

      const stats = detector.getStats();
      expect(stats.frameCount).toBe(3);
      expect(stats.maxKneeAsymmetry).toBe(70);
      expect(stats.avgKneeAsymmetry).toBe(60);
    });
  });
});
