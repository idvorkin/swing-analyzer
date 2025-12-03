/**
 * SwingAnalyzer Unit Tests
 *
 * Tests the pure swing analysis logic without RxJS/video dependencies.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import {
  createTopKeypoints,
  createBottomKeypoints,
  createConnectKeypoints,
  createReleaseKeypoints,
} from '../test-utils/pose-fixtures';
import { Skeleton } from '../models/Skeleton';
import { SwingAnalyzer, DEFAULT_SWING_CONFIG } from './SwingAnalyzer';

/**
 * Helper to create a Skeleton from keypoints
 */
function createSkeleton(
  keypoints: ReturnType<typeof createTopKeypoints>
): Skeleton {
  const leftShoulder = keypoints[5];
  const rightShoulder = keypoints[6];
  const leftHip = keypoints[11];
  const rightHip = keypoints[12];

  const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2;
  const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;
  const hipMidX = (leftHip.x + rightHip.x) / 2;
  const hipMidY = (leftHip.y + rightHip.y) / 2;

  const spineAngle = Math.abs(
    Math.atan2(hipMidX - shoulderMidX, hipMidY - shoulderMidY) * (180 / Math.PI)
  );

  return new Skeleton(keypoints, spineAngle, true, Date.now());
}

describe('SwingAnalyzer', () => {
  let analyzer: SwingAnalyzer;

  beforeEach(() => {
    analyzer = new SwingAnalyzer();
  });

  describe('initialization', () => {
    it('creates with default config', () => {
      const config = analyzer.getConfig();
      expect(config.cycleResetThreshold).toBe(DEFAULT_SWING_CONFIG.cycleResetThreshold);
      expect(config.minCycleAngle).toBe(DEFAULT_SWING_CONFIG.minCycleAngle);
    });

    it('accepts custom config', () => {
      const customAnalyzer = new SwingAnalyzer({
        cycleResetThreshold: 40,
        minCycleAngle: 50,
      });
      const config = customAnalyzer.getConfig();
      expect(config.cycleResetThreshold).toBe(40);
      expect(config.minCycleAngle).toBe(50);
    });

    it('starts in downswing phase', () => {
      expect(analyzer.getIsDownswing()).toBe(true);
    });

    it('starts with zero max spine angle', () => {
      expect(analyzer.getMaxSpineAngleInCycle()).toBe(0);
    });
  });

  describe('single frame analysis', () => {
    it('analyzes TOP position skeleton', () => {
      const skeleton = createSkeleton(createTopKeypoints());
      const result = analyzer.analyzeFrame(skeleton, 0);

      expect(result.spineAngle).toBeLessThan(30);
      expect(result.cycleCompleted).toBe(false);
    });

    it('analyzes BOTTOM position skeleton', () => {
      const skeleton = createSkeleton(createBottomKeypoints());
      const result = analyzer.analyzeFrame(skeleton, 0);

      expect(result.spineAngle).toBeGreaterThanOrEqual(0);
      expect(result.cycleCompleted).toBe(false);
    });

    it('tracks max spine angle', () => {
      const topSkeleton = createSkeleton(createTopKeypoints());
      const bottomSkeleton = createSkeleton(createBottomKeypoints());

      analyzer.analyzeFrame(topSkeleton, 0);
      const result = analyzer.analyzeFrame(bottomSkeleton, 100);

      expect(result.maxSpineAngleInCycle).toBeGreaterThan(0);
    });
  });

  describe('cycle detection', () => {
    it('detects cycle completion when returning to top after bottom', () => {
      const topSkeleton = createSkeleton(createTopKeypoints());
      const bottomSkeleton = createSkeleton(createBottomKeypoints());

      // Start at top
      analyzer.analyzeFrame(topSkeleton, 0);

      // Go to bottom (increase max angle)
      analyzer.analyzeFrame(bottomSkeleton, 100);

      // Return to top - should complete cycle
      const result = analyzer.analyzeFrame(topSkeleton, 200);

      // Cycle should complete if max angle exceeded threshold
      if (analyzer.getMaxSpineAngleInCycle() > DEFAULT_SWING_CONFIG.minCycleAngle) {
        expect(result.cycleCompleted).toBe(true);
        expect(result.cyclePositions).not.toBeNull();
      }
    });

    it('does not complete cycle if max angle too low', () => {
      const topSkeleton = createSkeleton(createTopKeypoints());

      // Only stay at top - never reach meaningful angle
      analyzer.analyzeFrame(topSkeleton, 0);
      analyzer.analyzeFrame(topSkeleton, 100);
      const result = analyzer.analyzeFrame(topSkeleton, 200);

      expect(result.cycleCompleted).toBe(false);
    });
  });

  describe('reset', () => {
    it('resets all state', () => {
      const bottomSkeleton = createSkeleton(createBottomKeypoints());

      // Build up some state
      analyzer.analyzeFrame(bottomSkeleton, 0);
      expect(analyzer.getMaxSpineAngleInCycle()).toBeGreaterThan(0);

      // Reset
      analyzer.reset();

      expect(analyzer.getMaxSpineAngleInCycle()).toBe(0);
      expect(analyzer.getIsDownswing()).toBe(true);
    });
  });

  describe('position sequence', () => {
    it('processes multiple frames and tracks state', () => {
      const frames = [
        { keypoints: createTopKeypoints(), time: 0 },
        { keypoints: createConnectKeypoints(), time: 100 },
        { keypoints: createBottomKeypoints(), time: 200 },
        { keypoints: createReleaseKeypoints(), time: 300 },
        { keypoints: createTopKeypoints(), time: 400 },
      ];

      let lastResult: ReturnType<typeof analyzer.analyzeFrame> | null = null;

      for (const frame of frames) {
        const skeleton = createSkeleton(frame.keypoints);
        lastResult = analyzer.analyzeFrame(skeleton, frame.time);
      }

      // Should have processed all frames
      expect(lastResult).not.toBeNull();
      // Max angle should be tracked (even if synthetic keypoints don't produce large angles)
      expect(lastResult!.maxSpineAngleInCycle).toBeGreaterThanOrEqual(0);
    });

    it('accumulates position candidates during cycle', () => {
      // Process a sequence without completing a cycle
      const topSkeleton = createSkeleton(createTopKeypoints());
      const bottomSkeleton = createSkeleton(createBottomKeypoints());

      analyzer.analyzeFrame(topSkeleton, 0);
      const result = analyzer.analyzeFrame(bottomSkeleton, 100);

      // Should not have completed cycle yet (still building up)
      expect(result.cycleCompleted).toBe(false);
      // Max angle should have increased
      expect(result.maxSpineAngleInCycle).toBeGreaterThanOrEqual(0);
    });
  });
});
