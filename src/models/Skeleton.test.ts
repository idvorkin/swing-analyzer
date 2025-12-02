import { describe, expect, it } from 'vitest';
import type { PoseKeypoint } from '../types';
import { Skeleton } from './Skeleton';

/**
 * Helper to create a Skeleton instance for testing
 */
function createSkeleton(keypoints: PoseKeypoint[]): Skeleton {
  return new Skeleton(keypoints, 0, true, Date.now());
}

/**
 * Helper to create a keypoint with default confidence
 */
function kp(x: number, y: number, score = 0.9): PoseKeypoint {
  return { x, y, score };
}

describe('Skeleton', () => {
  describe('getBoundingBox', () => {
    it('calculates bounding box from visible keypoints', () => {
      const keypoints = [
        kp(100, 50), // top-left area
        kp(200, 50), // top-right area
        kp(100, 150), // bottom-left area
        kp(200, 150), // bottom-right area
      ];

      const skeleton = createSkeleton(keypoints);
      const bbox = skeleton.getBoundingBox(0.2, 0); // No padding for easier math

      expect(bbox).not.toBeNull();
      expect(bbox!.minX).toBe(100);
      expect(bbox!.maxX).toBe(200);
      expect(bbox!.minY).toBe(50);
      expect(bbox!.maxY).toBe(150);
      expect(bbox!.width).toBe(100);
      expect(bbox!.height).toBe(100);
      expect(bbox!.centerX).toBe(150);
      expect(bbox!.centerY).toBe(100);
    });

    it('applies padding correctly', () => {
      const keypoints = [
        kp(100, 100),
        kp(200, 100),
        kp(100, 200),
        kp(200, 200),
      ];

      const skeleton = createSkeleton(keypoints);
      // Raw box is 100x100, 20% padding = 20px on each side
      const bbox = skeleton.getBoundingBox(0.2, 0.2);

      expect(bbox).not.toBeNull();
      // minX = 100 - (100 * 0.2) = 80
      expect(bbox!.minX).toBe(80);
      // maxX = 200 + (100 * 0.2) = 220
      expect(bbox!.maxX).toBe(220);
      // Width with padding = 220 - 80 = 140
      expect(bbox!.width).toBe(140);
      expect(bbox!.height).toBe(140);
    });

    it('returns null when fewer than 3 keypoints are visible', () => {
      const keypoints = [kp(100, 100), kp(200, 200)];

      const skeleton = createSkeleton(keypoints);
      const bbox = skeleton.getBoundingBox();

      expect(bbox).toBeNull();
    });

    it('filters out low confidence keypoints', () => {
      const keypoints = [
        kp(100, 100, 0.9), // High confidence - included
        kp(200, 100, 0.9), // High confidence - included
        kp(100, 200, 0.9), // High confidence - included
        kp(500, 500, 0.1), // Low confidence - excluded
      ];

      const skeleton = createSkeleton(keypoints);
      const bbox = skeleton.getBoundingBox(0.2, 0);

      expect(bbox).not.toBeNull();
      // Should not include the (500, 500) point
      expect(bbox!.maxX).toBe(200);
      expect(bbox!.maxY).toBe(200);
    });

    it('returns null when all keypoints are below confidence threshold', () => {
      const keypoints = [
        kp(100, 100, 0.1),
        kp(200, 100, 0.1),
        kp(100, 200, 0.1),
      ];

      const skeleton = createSkeleton(keypoints);
      const bbox = skeleton.getBoundingBox(0.5); // High threshold

      expect(bbox).toBeNull();
    });

    it('filters out keypoints with zero coordinates', () => {
      const keypoints = [
        kp(0, 0, 0.9), // Zero coords - excluded
        kp(100, 100, 0.9),
        kp(200, 100, 0.9),
        kp(150, 200, 0.9),
      ];

      const skeleton = createSkeleton(keypoints);
      const bbox = skeleton.getBoundingBox(0.2, 0);

      expect(bbox).not.toBeNull();
      // Should not include (0, 0)
      expect(bbox!.minX).toBe(100);
      expect(bbox!.minY).toBe(100);
    });

    it('handles visibility property instead of score', () => {
      const keypoints: PoseKeypoint[] = [
        { x: 100, y: 100, visibility: 0.9 },
        { x: 200, y: 100, visibility: 0.9 },
        { x: 150, y: 200, visibility: 0.9 },
      ];

      const skeleton = createSkeleton(keypoints);
      const bbox = skeleton.getBoundingBox(0.2, 0);

      expect(bbox).not.toBeNull();
      expect(bbox!.centerX).toBe(150);
    });

    it('calculates center correctly for asymmetric bounding box', () => {
      const keypoints = [
        kp(0, 0, 0.9), // Will be filtered (zero coords)
        kp(50, 100),
        kp(150, 100),
        kp(100, 300),
      ];

      const skeleton = createSkeleton(keypoints);
      const bbox = skeleton.getBoundingBox(0.2, 0);

      expect(bbox).not.toBeNull();
      // X: min=50, max=150, center=100
      // Y: min=100, max=300, center=200
      expect(bbox!.centerX).toBe(100);
      expect(bbox!.centerY).toBe(200);
    });
  });
});
