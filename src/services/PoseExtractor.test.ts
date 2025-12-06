/**
 * PoseExtractor Service Tests
 *
 * Tests for utility functions in PoseExtractor.
 * Note: Full integration tests for extractPosesFromVideo require mocking
 * TensorFlow, Web Crypto API, and the DOM.
 */

import { describe, expect, it } from 'vitest';
import type { PoseKeypoint } from '../types';
import type { PoseModel } from '../types/posetrack';
import {
  calculateSpineAngle,
  computeAngles,
  getModelDisplayName,
} from './PoseExtractor';

describe('PoseExtractor', () => {
  describe('getModelDisplayName', () => {
    it('returns correct display name for blazepose', () => {
      expect(getModelDisplayName('blazepose')).toBe('BlazePose');
    });

    it('returns BlazePose for the only supported model', () => {
      const displayName = getModelDisplayName('blazepose');
      expect(displayName).toBe('BlazePose');
      expect(typeof displayName).toBe('string');
    });
  });

  describe('calculateSpineAngle', () => {
    // Helper to create COCO-17 keypoints array with specific positions
    function createKeypoints(positions: {
      leftShoulder?: { x: number; y: number };
      rightShoulder?: { x: number; y: number };
      leftHip?: { x: number; y: number };
      rightHip?: { x: number; y: number };
    }): PoseKeypoint[] {
      // COCO-17 keypoint indices: shoulders at 5,6 and hips at 11,12
      const keypoints: PoseKeypoint[] = Array(17)
        .fill(null)
        .map(() => ({ x: 0, y: 0, score: 0.9 }));

      if (positions.leftShoulder) {
        keypoints[5] = { ...positions.leftShoulder, score: 0.9 };
      }
      if (positions.rightShoulder) {
        keypoints[6] = { ...positions.rightShoulder, score: 0.9 };
      }
      if (positions.leftHip) {
        keypoints[11] = { ...positions.leftHip, score: 0.9 };
      }
      if (positions.rightHip) {
        keypoints[12] = { ...positions.rightHip, score: 0.9 };
      }

      return keypoints;
    }

    it('returns 0 when keypoints are missing', () => {
      expect(calculateSpineAngle([])).toBe(0);
    });

    it('returns 0 when shoulder keypoints are missing', () => {
      const keypoints = createKeypoints({
        leftHip: { x: 100, y: 200 },
        rightHip: { x: 150, y: 200 },
      });
      // Clear shoulder positions
      keypoints[5] = undefined as unknown as PoseKeypoint;
      keypoints[6] = undefined as unknown as PoseKeypoint;

      expect(calculateSpineAngle(keypoints)).toBe(0);
    });

    it('returns 0 degrees for vertical spine (standing upright)', () => {
      // Shoulders directly above hips
      const keypoints = createKeypoints({
        leftShoulder: { x: 100, y: 100 },
        rightShoulder: { x: 150, y: 100 },
        leftHip: { x: 100, y: 200 },
        rightHip: { x: 150, y: 200 },
      });

      const angle = calculateSpineAngle(keypoints);
      expect(angle).toBeCloseTo(0, 1);
    });

    it('returns ~45 degrees for diagonal spine', () => {
      // Shoulders offset to the right of hips
      const keypoints = createKeypoints({
        leftShoulder: { x: 200, y: 100 },
        rightShoulder: { x: 250, y: 100 },
        leftHip: { x: 100, y: 200 },
        rightHip: { x: 150, y: 200 },
      });

      const angle = calculateSpineAngle(keypoints);
      expect(angle).toBeCloseTo(45, 1);
    });

    it('returns ~90 degrees for horizontal spine', () => {
      // Shoulders at same height as hips but offset horizontally
      const keypoints = createKeypoints({
        leftShoulder: { x: 300, y: 200 },
        rightShoulder: { x: 350, y: 200 },
        leftHip: { x: 100, y: 200 },
        rightHip: { x: 150, y: 200 },
      });

      const angle = calculateSpineAngle(keypoints);
      expect(angle).toBeCloseTo(90, 1);
    });

    it('returns positive angle regardless of lean direction', () => {
      // Leaning left vs leaning right should give same magnitude
      const leanRight = createKeypoints({
        leftShoulder: { x: 200, y: 100 },
        rightShoulder: { x: 250, y: 100 },
        leftHip: { x: 100, y: 200 },
        rightHip: { x: 150, y: 200 },
      });

      const leanLeft = createKeypoints({
        leftShoulder: { x: 0, y: 100 },
        rightShoulder: { x: 50, y: 100 },
        leftHip: { x: 100, y: 200 },
        rightHip: { x: 150, y: 200 },
      });

      const angleRight = calculateSpineAngle(leanRight);
      const angleLeft = calculateSpineAngle(leanLeft);

      expect(angleRight).toBeGreaterThan(0);
      expect(angleLeft).toBeGreaterThan(0);
      expect(angleRight).toBeCloseTo(angleLeft, 1);
    });
  });

  describe('computeAngles', () => {
    it('computes non-zero spine angle for tilted pose', () => {
      // Create keypoints with tilted spine
      const keypoints: PoseKeypoint[] = Array(17)
        .fill(null)
        .map(() => ({ x: 0, y: 0, score: 0.9 }));

      // Set up a tilted pose
      keypoints[5] = { x: 200, y: 100, score: 0.9 }; // left shoulder
      keypoints[6] = { x: 250, y: 100, score: 0.9 }; // right shoulder
      keypoints[7] = { x: 180, y: 150, score: 0.9 }; // left elbow
      keypoints[8] = { x: 270, y: 150, score: 0.9 }; // right elbow
      keypoints[11] = { x: 100, y: 200, score: 0.9 }; // left hip
      keypoints[12] = { x: 150, y: 200, score: 0.9 }; // right hip
      keypoints[13] = { x: 100, y: 300, score: 0.9 }; // left knee
      keypoints[14] = { x: 150, y: 300, score: 0.9 }; // right knee
      keypoints[15] = { x: 100, y: 400, score: 0.9 }; // left ankle
      keypoints[16] = { x: 150, y: 400, score: 0.9 }; // right ankle

      const angles = computeAngles(keypoints);

      // Spine should be tilted ~45 degrees
      expect(angles.spineAngle).toBeGreaterThan(40);
      expect(angles.spineAngle).toBeLessThan(50);

      // Other angles should also be computed
      expect(typeof angles.hipAngle).toBe('number');
      expect(typeof angles.kneeAngle).toBe('number');
      expect(typeof angles.armToVerticalAngle).toBe('number');
    });

    it('computes ~0 spine angle for upright pose', () => {
      const keypoints: PoseKeypoint[] = Array(17)
        .fill(null)
        .map(() => ({ x: 0, y: 0, score: 0.9 }));

      // Upright pose - shoulders directly above hips
      keypoints[5] = { x: 100, y: 100, score: 0.9 }; // left shoulder
      keypoints[6] = { x: 150, y: 100, score: 0.9 }; // right shoulder
      keypoints[11] = { x: 100, y: 200, score: 0.9 }; // left hip
      keypoints[12] = { x: 150, y: 200, score: 0.9 }; // right hip

      const angles = computeAngles(keypoints);

      expect(angles.spineAngle).toBeCloseTo(0, 1);
    });
  });
});
