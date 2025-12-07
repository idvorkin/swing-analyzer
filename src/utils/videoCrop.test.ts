/**
 * Unit tests for videoCrop utilities
 */

import { describe, expect, it } from 'vitest';
import type { PoseKeypoint } from '../types';
import type { PoseTrackFrame } from '../types/posetrack';
import {
  calculateBoundingBox,
  calculateStableCropRegion,
  isLandscapeVideo,
  mergeBoundingBoxes,
  transformKeypointsToCropped,
  transformPointToCropped,
} from './videoCrop';

describe('calculateBoundingBox', () => {
  it('returns null for empty keypoints array', () => {
    expect(calculateBoundingBox([])).toBeNull();
  });

  it('returns null when all keypoints are below confidence threshold', () => {
    const lowConfidence: PoseKeypoint[] = [
      { x: 100, y: 100, score: 0.1, name: 'nose' },
      { x: 200, y: 200, score: 0.2, name: 'leftEye' },
    ];
    expect(calculateBoundingBox(lowConfidence, 0.3)).toBeNull();
  });

  it('calculates correct bounding box from confident keypoints', () => {
    const keypoints: PoseKeypoint[] = [
      { x: 100, y: 50, score: 0.9, name: 'nose' },
      { x: 200, y: 150, score: 0.8, name: 'leftShoulder' },
      { x: 50, y: 100, score: 0.5, name: 'rightShoulder' },
      { x: 150, y: 200, score: 0.1, name: 'leftHip' }, // Below threshold, ignored
    ];
    const box = calculateBoundingBox(keypoints, 0.3);
    expect(box).toEqual({ minX: 50, minY: 50, maxX: 200, maxY: 150 });
  });

  it('uses default confidence threshold of 0.3', () => {
    const keypoints: PoseKeypoint[] = [
      { x: 100, y: 100, score: 0.35, name: 'nose' },
      { x: 200, y: 200, score: 0.25, name: 'leftEye' }, // Below default, ignored
    ];
    const box = calculateBoundingBox(keypoints);
    expect(box).toEqual({ minX: 100, minY: 100, maxX: 100, maxY: 100 });
  });

  it('handles single confident keypoint', () => {
    const keypoints: PoseKeypoint[] = [
      { x: 150, y: 250, score: 0.9, name: 'nose' },
    ];
    const box = calculateBoundingBox(keypoints);
    expect(box).toEqual({ minX: 150, minY: 250, maxX: 150, maxY: 250 });
  });
});

describe('mergeBoundingBoxes', () => {
  it('returns null for empty array', () => {
    expect(mergeBoundingBoxes([])).toBeNull();
  });

  it('returns the same box for single element', () => {
    const box = { minX: 10, minY: 20, maxX: 100, maxY: 200 };
    expect(mergeBoundingBoxes([box])).toEqual(box);
  });

  it('calculates union of multiple boxes', () => {
    const boxes = [
      { minX: 100, minY: 100, maxX: 200, maxY: 200 },
      { minX: 50, minY: 150, maxX: 150, maxY: 250 },
      { minX: 180, minY: 80, maxX: 220, maxY: 180 },
    ];
    const merged = mergeBoundingBoxes(boxes);
    expect(merged).toEqual({ minX: 50, minY: 80, maxX: 220, maxY: 250 });
  });
});

describe('isLandscapeVideo', () => {
  it('returns true when width > height', () => {
    expect(isLandscapeVideo(1920, 1080)).toBe(true);
    expect(isLandscapeVideo(1280, 720)).toBe(true);
  });

  it('returns false when height > width (portrait)', () => {
    expect(isLandscapeVideo(1080, 1920)).toBe(false);
    expect(isLandscapeVideo(720, 1280)).toBe(false);
  });

  it('returns false when width equals height (square)', () => {
    expect(isLandscapeVideo(1080, 1080)).toBe(false);
  });
});

describe('calculateStableCropRegion', () => {
  const createFrame = (keypoints: PoseKeypoint[]): PoseTrackFrame => ({
    frameIndex: 0,
    timestamp: 0,
    videoTime: 0,
    keypoints,
  });

  it('returns null for empty frames array', () => {
    expect(calculateStableCropRegion([], 1920, 1080)).toBeNull();
  });

  it('returns null when no keypoints detected in any frame', () => {
    const frames = [createFrame([]), createFrame([])];
    expect(calculateStableCropRegion(frames, 1920, 1080)).toBeNull();
  });

  it('returns null when all keypoints are low confidence', () => {
    const lowConfidence: PoseKeypoint[] = [
      { x: 100, y: 100, score: 0.1, name: 'nose' },
    ];
    const frames = [createFrame(lowConfidence)];
    expect(calculateStableCropRegion(frames, 1920, 1080)).toBeNull();
  });

  it('calculates square crop region centered on person', () => {
    // Person at center of 1920x1080 video
    const keypoints: PoseKeypoint[] = [
      { x: 860, y: 340, score: 0.9, name: 'nose' },
      { x: 1060, y: 740, score: 0.9, name: 'leftAnkle' },
    ];
    const frames = [createFrame(keypoints)];
    const crop = calculateStableCropRegion(frames, 1920, 1080);

    expect(crop).not.toBeNull();
    // Should be square
    expect(crop!.width).toBe(crop!.height);
    // Should be within video bounds
    expect(crop!.x).toBeGreaterThanOrEqual(0);
    expect(crop!.y).toBeGreaterThanOrEqual(0);
    expect(crop!.x + crop!.width).toBeLessThanOrEqual(1920);
    expect(crop!.y + crop!.height).toBeLessThanOrEqual(1080);
  });

  it('clamps crop region to video bounds when person is near edge', () => {
    // Person in top-left corner
    const keypoints: PoseKeypoint[] = [
      { x: 50, y: 50, score: 0.9, name: 'nose' },
      { x: 150, y: 300, score: 0.9, name: 'leftAnkle' },
    ];
    const frames = [createFrame(keypoints)];
    const crop = calculateStableCropRegion(frames, 1920, 1080);

    expect(crop).not.toBeNull();
    expect(crop!.x).toBeGreaterThanOrEqual(0);
    expect(crop!.y).toBeGreaterThanOrEqual(0);
  });

  it('uses union of bounding boxes across multiple frames', () => {
    // Person moves between frames
    const frame1Keypoints: PoseKeypoint[] = [
      { x: 400, y: 300, score: 0.9, name: 'nose' },
      { x: 500, y: 600, score: 0.9, name: 'leftAnkle' },
    ];
    const frame2Keypoints: PoseKeypoint[] = [
      { x: 600, y: 300, score: 0.9, name: 'nose' },
      { x: 700, y: 600, score: 0.9, name: 'leftAnkle' },
    ];
    const frames = [createFrame(frame1Keypoints), createFrame(frame2Keypoints)];
    const crop = calculateStableCropRegion(frames, 1920, 1080);

    expect(crop).not.toBeNull();
    // Crop should be large enough to cover both positions
    expect(crop!.width).toBeGreaterThan(300); // At least covers the movement range
  });

  it('applies padding for movement', () => {
    // Small person bounding box
    const keypoints: PoseKeypoint[] = [
      { x: 500, y: 300, score: 0.9, name: 'nose' },
      { x: 520, y: 350, score: 0.9, name: 'leftAnkle' },
    ];
    const frames = [createFrame(keypoints)];
    const crop = calculateStableCropRegion(frames, 1920, 1080, 0.3);

    expect(crop).not.toBeNull();
    // With 30% padding, crop should be larger than raw bounding box
    const rawWidth = 520 - 500; // 20px
    expect(crop!.width).toBeGreaterThan(rawWidth * 1.6); // At least padded size
  });
});

describe('transformPointToCropped', () => {
  it('transforms point correctly for center crop', () => {
    const crop = { x: 400, y: 200, width: 800, height: 800 };
    const canvasWidth = 400;
    const canvasHeight = 400;

    // Point at crop center should map to canvas center
    const cropCenterX = crop.x + crop.width / 2; // 800
    const cropCenterY = crop.y + crop.height / 2; // 600
    const result = transformPointToCropped(
      cropCenterX,
      cropCenterY,
      crop,
      canvasWidth,
      canvasHeight
    );

    expect(result.x).toBe(200); // Canvas center
    expect(result.y).toBe(200);
  });

  it('transforms top-left corner correctly', () => {
    const crop = { x: 100, y: 50, width: 400, height: 400 };
    const canvasWidth = 200;
    const canvasHeight = 200;

    // Point at crop origin should map to canvas origin
    const result = transformPointToCropped(100, 50, crop, canvasWidth, canvasHeight);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
  });

  it('handles points outside crop region', () => {
    const crop = { x: 100, y: 100, width: 200, height: 200 };
    const canvasWidth = 100;
    const canvasHeight = 100;

    // Point before crop region
    const result = transformPointToCropped(50, 50, crop, canvasWidth, canvasHeight);
    expect(result.x).toBe(-25); // Negative, outside canvas
    expect(result.y).toBe(-25);
  });
});

describe('transformKeypointsToCropped', () => {
  it('transforms all keypoints in array', () => {
    const crop = { x: 0, y: 0, width: 200, height: 200 };
    const canvasWidth = 100;
    const canvasHeight = 100;

    const keypoints: PoseKeypoint[] = [
      { x: 0, y: 0, score: 0.9, name: 'nose' },
      { x: 100, y: 100, score: 0.8, name: 'leftShoulder' },
      { x: 200, y: 200, score: 0.7, name: 'rightShoulder' },
    ];

    const transformed = transformKeypointsToCropped(
      keypoints,
      crop,
      canvasWidth,
      canvasHeight
    );

    expect(transformed).toHaveLength(3);
    expect(transformed[0].x).toBe(0);
    expect(transformed[0].y).toBe(0);
    expect(transformed[1].x).toBe(50);
    expect(transformed[1].y).toBe(50);
    expect(transformed[2].x).toBe(100);
    expect(transformed[2].y).toBe(100);
  });

  it('preserves other keypoint properties', () => {
    const crop = { x: 0, y: 0, width: 100, height: 100 };
    const keypoints: PoseKeypoint[] = [
      { x: 50, y: 50, score: 0.95, name: 'nose', visibility: 0.9 },
    ];

    const transformed = transformKeypointsToCropped(keypoints, crop, 100, 100);

    expect(transformed[0].score).toBe(0.95);
    expect(transformed[0].name).toBe('nose');
    expect(transformed[0].visibility).toBe(0.9);
  });
});
