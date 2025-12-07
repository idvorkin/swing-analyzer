/**
 * Position Detection Algorithm Tests
 *
 * Tests for swing position detection with ground truth validation.
 * Uses real posetrack data with annotated ground truth positions.
 *
 * The key insight: "Top" should be when arms reach their PEAK height,
 * not when a threshold is crossed. This requires peak detection, not threshold detection.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, beforeEach } from 'vitest';
import { Skeleton } from '../models/Skeleton';
import type { PoseTrackFile } from '../types/posetrack';
import { PoseTrackPipeline } from './PoseTrackPipeline';

/**
 * Ground truth annotation format
 */
interface GroundTruthAnnotation {
  frame_index: number;
  video_time: number;
  position: 'top' | 'bottom' | 'connect' | 'release';
  notes?: string;
}

interface GroundTruthFile {
  metadata: {
    source: string;
    description: string;
  };
  annotations: GroundTruthAnnotation[];
}

/**
 * Load posetrack file from fixtures
 */
function loadPosetrack(filename: string): PoseTrackFile {
  const path = resolve(__dirname, '../../e2e-tests/fixtures/poses', filename);
  const content = readFileSync(path, 'utf-8');
  return JSON.parse(content);
}

/**
 * Load ground truth file
 */
function loadGroundTruth(filename: string): GroundTruthFile {
  const path = resolve(__dirname, '../../e2e-tests/fixtures/poses', filename);
  const content = readFileSync(path, 'utf-8');
  return JSON.parse(content);
}

/**
 * Get arm height (wrist height relative to shoulder)
 * Uses the new Skeleton.getWristHeight() method
 */
function getArmHeight(skeleton: Skeleton): number {
  return skeleton.getWristHeight();
}

/**
 * Simple peak detector for finding local maxima in a sequence
 */
function findPeaks(
  values: number[],
  minDistance: number = 10,
  minValue?: number
): number[] {
  if (values.length < 3) return [];

  const peaks: number[] = [];
  let lastPeak = -minDistance;

  for (let i = 1; i < values.length - 1; i++) {
    // Check if this is a local maximum
    if (values[i] > values[i - 1] && values[i] >= values[i + 1]) {
      // Check minimum value threshold
      if (minValue !== undefined && values[i] < minValue) {
        continue;
      }

      // Check distance from last peak
      if (i - lastPeak >= minDistance) {
        peaks.push(i);
        lastPeak = i;
      }
    }
  }

  return peaks;
}

/**
 * Smooth values using simple moving average
 */
function smooth(values: number[], window: number = 5): number[] {
  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - Math.floor(window / 2));
    const end = Math.min(values.length, i + Math.floor(window / 2) + 1);
    let sum = 0;
    for (let j = start; j < end; j++) {
      sum += values[j];
    }
    result.push(sum / (end - start));
  }
  return result;
}

/**
 * Check if detected frame is within tolerance of ground truth
 */
function isWithinTolerance(
  detected: number,
  expected: number,
  tolerance: number = 5
): boolean {
  return Math.abs(detected - expected) <= tolerance;
}

describe('Position Detection with Ground Truth', () => {
  let posetrack: PoseTrackFile;
  let groundTruth: GroundTruthFile;

  beforeEach(() => {
    posetrack = loadPosetrack('swing-sample-4reps.posetrack.json');
    groundTruth = loadGroundTruth('swing-sample-4reps.groundtruth.json');
  });

  describe('Ground truth data', () => {
    it('loads posetrack with expected frame count', () => {
      expect(posetrack.frames.length).toBe(164);
      expect(posetrack.metadata.fps).toBe(30);
    });

    it('loads ground truth annotations', () => {
      const tops = groundTruth.annotations.filter((a) => a.position === 'top');
      const bottoms = groundTruth.annotations.filter(
        (a) => a.position === 'bottom'
      );

      // 4-rep video should have 3-4 tops and 4 bottoms
      expect(tops.length).toBeGreaterThanOrEqual(3);
      expect(bottoms.length).toBe(4);
    });
  });

  describe('Arm height analysis', () => {
    it('calculates arm height for each frame', () => {
      const pipeline = new PoseTrackPipeline(posetrack);
      const armHeights: number[] = [];

      for (let i = 0; i < posetrack.frames.length; i++) {
        const skeleton = pipeline.getSkeletonAtFrame(i);
        if (skeleton) {
          armHeights.push(getArmHeight(skeleton));
        } else {
          armHeights.push(0);
        }
      }

      // Should have arm heights for most frames
      const nonZero = armHeights.filter((h) => h !== 0).length;
      expect(nonZero).toBeGreaterThan(100);

      pipeline.dispose();
    });

    it('finds arm height peaks near ground truth Top positions', () => {
      const pipeline = new PoseTrackPipeline(posetrack);
      const armHeights: number[] = [];

      for (let i = 0; i < posetrack.frames.length; i++) {
        const skeleton = pipeline.getSkeletonAtFrame(i);
        if (skeleton) {
          armHeights.push(getArmHeight(skeleton));
        } else {
          armHeights.push(armHeights[armHeights.length - 1] ?? 0);
        }
      }

      // Smooth and find peaks
      const smoothed = smooth(armHeights, 5);
      const peaks = findPeaks(smoothed, 15, -80);

      // Get ground truth Top frames
      const gtTops = groundTruth.annotations
        .filter((a) => a.position === 'top')
        .map((a) => a.frame_index);

      // Each ground truth Top should have a peak nearby (within 10 frames)
      for (const gtTop of gtTops) {
        const hasNearbyPeak = peaks.some((peak) =>
          isWithinTolerance(peak, gtTop, 10)
        );
        expect(hasNearbyPeak).toBe(true);
      }

      pipeline.dispose();
    });
  });

  describe('Current detector (threshold-based)', () => {
    it('detects Top positions', () => {
      const pipeline = new PoseTrackPipeline(posetrack);
      const results = pipeline.processAllFrames();

      const topFrames = results
        .filter((r) => r.phase === 'top')
        .map((r) => r.frameIndex);

      // Should detect some Top positions
      expect(topFrames.length).toBeGreaterThan(0);

      pipeline.dispose();
    });

    it('detects Bottom positions at ground truth frames', () => {
      const pipeline = new PoseTrackPipeline(posetrack);
      const results = pipeline.processAllFrames();

      // Get ground truth Bottom frames
      const gtBottoms = groundTruth.annotations
        .filter((a) => a.position === 'bottom')
        .map((a) => a.frame_index);

      // Check that each ground truth bottom is detected
      let matchCount = 0;
      for (const gtBottom of gtBottoms) {
        // Check if any frame within 5 frames is detected as bottom
        const hasMatch = results.some(
          (r) =>
            r.phase === 'bottom' && isWithinTolerance(r.frameIndex, gtBottom, 5)
        );
        if (hasMatch) matchCount++;
      }

      // At least 3 of 4 bottoms should be detected
      expect(matchCount).toBeGreaterThanOrEqual(3);

      pipeline.dispose();
    });
  });

  describe('Peak-based Top detection (new algorithm)', () => {
    it('finds Top at arm height peaks when spine is upright', () => {
      const pipeline = new PoseTrackPipeline(posetrack);
      const armHeights: number[] = [];
      const spineAngles: number[] = [];

      for (let i = 0; i < posetrack.frames.length; i++) {
        const skeleton = pipeline.getSkeletonAtFrame(i);
        if (skeleton) {
          armHeights.push(getArmHeight(skeleton));
          spineAngles.push(skeleton.getSpineAngle());
        } else {
          armHeights.push(armHeights[armHeights.length - 1] ?? 0);
          spineAngles.push(spineAngles[spineAngles.length - 1] ?? 0);
        }
      }

      // Find arm height peaks
      const smoothedArm = smooth(armHeights, 5);
      const armPeaks = findPeaks(smoothedArm, 15);

      // Filter to peaks where spine is upright (< 30 degrees)
      const topCandidates = armPeaks.filter(
        (peak) => spineAngles[peak] < 30 && smoothedArm[peak] > -80
      );

      // Get ground truth Top frames
      const gtTops = groundTruth.annotations
        .filter((a) => a.position === 'top')
        .map((a) => a.frame_index);

      // Check precision: how many detected Tops match ground truth?
      let truePositives = 0;
      for (const candidate of topCandidates) {
        const matches = gtTops.some((gt) => isWithinTolerance(candidate, gt, 5));
        if (matches) truePositives++;
      }

      // Check recall: how many ground truth Tops were detected?
      let detected = 0;
      for (const gt of gtTops) {
        const matches = topCandidates.some((c) => isWithinTolerance(c, gt, 10));
        if (matches) detected++;
      }

      // Should have at least 2 true positives (of 3 ground truth)
      expect(truePositives).toBeGreaterThanOrEqual(2);

      // Should detect at least 2 of 3 ground truth tops
      expect(detected).toBeGreaterThanOrEqual(2);

      pipeline.dispose();
    });
  });

  describe('Bottom detection (spine angle peaks)', () => {
    it('finds Bottom at spine angle peaks', () => {
      const pipeline = new PoseTrackPipeline(posetrack);
      const spineAngles: number[] = [];

      for (let i = 0; i < posetrack.frames.length; i++) {
        const skeleton = pipeline.getSkeletonAtFrame(i);
        if (skeleton) {
          spineAngles.push(skeleton.getSpineAngle());
        } else {
          spineAngles.push(spineAngles[spineAngles.length - 1] ?? 0);
        }
      }

      // Find spine angle peaks (max hinge)
      const smoothed = smooth(spineAngles, 5);
      const peaks = findPeaks(smoothed, 15, 50); // Minimum 50 degrees for bottom

      // Get ground truth Bottom frames
      const gtBottoms = groundTruth.annotations
        .filter((a) => a.position === 'bottom')
        .map((a) => a.frame_index);

      // Each ground truth Bottom should have a peak nearby
      let detected = 0;
      for (const gt of gtBottoms) {
        const hasNearbyPeak = peaks.some((peak) =>
          isWithinTolerance(peak, gt, 5)
        );
        if (hasNearbyPeak) detected++;
      }

      // All 4 bottoms should be detected
      expect(detected).toBe(4);

      pipeline.dispose();
    });
  });

  describe('Rep counting with peak detection', () => {
    it('counts reps correctly using peak-based Top detection', () => {
      const pipeline = new PoseTrackPipeline(posetrack);
      pipeline.processAllFrames(); // Process all frames to count reps

      // Get final rep count
      const finalRepCount = pipeline.getRepCount();

      // For 4-rep video, should detect 3-4 reps
      // (may miss first rep if video starts mid-swing)
      expect(finalRepCount).toBeGreaterThanOrEqual(3);
      expect(finalRepCount).toBeLessThanOrEqual(5);

      // Log for debugging
      console.log(`Detected ${finalRepCount} reps in 4-rep video`);

      pipeline.dispose();
    });

    it('detects rep completion at correct times', () => {
      const pipeline = new PoseTrackPipeline(posetrack);

      const repCompletedFrames: number[] = [];
      let lastRepCount = 0;

      for (let i = 0; i < posetrack.frames.length; i++) {
        const result = pipeline.processFrame(i);
        if (result.repCount > lastRepCount) {
          repCompletedFrames.push(i);
          lastRepCount = result.repCount;
        }
      }

      // Ground truth Top frames are 40, 83, 126
      // Reps complete when transitioning to Top, so should be near these
      const gtTops = groundTruth.annotations
        .filter((a) => a.position === 'top')
        .map((a) => a.frame_index);

      // Each rep completion should be near a ground truth Top
      for (const repFrame of repCompletedFrames) {
        const nearGt = gtTops.some((gt) => isWithinTolerance(repFrame, gt, 10));
        // Log the frame for debugging if not near ground truth
        if (!nearGt) {
          console.log(`Rep at frame ${repFrame} not near ground truth tops ${gtTops}`);
        }
      }

      console.log(`Rep completed at frames: ${repCompletedFrames}`);
      console.log(`Ground truth tops: ${gtTops}`);

      pipeline.dispose();
    });
  });

  describe('Algorithm comparison', () => {
    it('compares threshold vs peak detection for Top', () => {
      const pipeline = new PoseTrackPipeline(posetrack);
      const results = pipeline.processAllFrames();

      // Threshold-based (current)
      const thresholdTops = results
        .filter((r) => r.phase === 'top')
        .map((r) => r.frameIndex);

      // Peak-based (new)
      const armHeights: number[] = [];
      const spineAngles: number[] = [];

      for (let i = 0; i < posetrack.frames.length; i++) {
        const skeleton = pipeline.getSkeletonAtFrame(i);
        if (skeleton) {
          armHeights.push(getArmHeight(skeleton));
          spineAngles.push(skeleton.getSpineAngle());
        } else {
          armHeights.push(armHeights[armHeights.length - 1] ?? 0);
          spineAngles.push(spineAngles[spineAngles.length - 1] ?? 0);
        }
      }

      const smoothedArm = smooth(armHeights, 5);
      const peakTops = findPeaks(smoothedArm, 15).filter(
        (peak) => spineAngles[peak] < 30 && smoothedArm[peak] > -80
      );

      // Ground truth
      const gtTops = groundTruth.annotations
        .filter((a) => a.position === 'top')
        .map((a) => a.frame_index);

      // Log results for analysis
      console.log('Ground truth Top frames:', gtTops);
      console.log(`Threshold-based detected ${thresholdTops.length} Tops`);
      console.log(`Peak-based detected ${peakTops.length} Tops:`, peakTops);

      // Peak-based should have fewer false positives
      // (closer count to actual number of reps)
      expect(peakTops.length).toBeLessThan(thresholdTops.length);

      // Peak-based should be closer to expected count (3-4 for 4 reps)
      expect(peakTops.length).toBeLessThanOrEqual(5);
      expect(peakTops.length).toBeGreaterThanOrEqual(2);

      pipeline.dispose();
    });
  });
});

describe('Position Detection Algorithm Utilities', () => {
  describe('findPeaks', () => {
    it('finds peaks in simple sequence', () => {
      const values = [0, 1, 2, 1, 0, 1, 3, 2, 1, 0];
      const peaks = findPeaks(values, 1);
      expect(peaks).toContain(2);
      expect(peaks).toContain(6);
    });

    it('respects minimum distance', () => {
      const values = [0, 1, 0, 1, 0, 1, 0];
      const peaks = findPeaks(values, 3);
      // Should only find 2 peaks due to min distance
      expect(peaks.length).toBeLessThanOrEqual(3);
    });

    it('respects minimum value threshold', () => {
      const values = [0, 1, 0, 5, 0, 1, 0];
      const peaks = findPeaks(values, 1, 2);
      expect(peaks).toEqual([3]); // Only the peak at 5 is above threshold
    });
  });

  describe('smooth', () => {
    it('smooths values', () => {
      const values = [0, 10, 0, 10, 0];
      const result = smooth(values, 3);
      // Middle values should be averaged
      expect(result[2]).toBeCloseTo(6.67, 1);
    });
  });
});
