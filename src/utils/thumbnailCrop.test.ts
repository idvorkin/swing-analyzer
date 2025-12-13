import { describe, expect, it } from 'vitest';
import {
  type CropKeypoint,
  type CropOptions,
  calculatePersonCenteredCrop,
} from './thumbnailCrop';

// Standard thumbnail dimensions (3:4 portrait aspect ratio)
const THUMB_WIDTH = 120;
const THUMB_HEIGHT = 160;

// Standard 1080p video
const VIDEO_WIDTH = 1920;
const VIDEO_HEIGHT = 1080;

function makeOptions(overrides: Partial<CropOptions> = {}): CropOptions {
  return {
    thumbWidth: THUMB_WIDTH,
    thumbHeight: THUMB_HEIGHT,
    videoWidth: VIDEO_WIDTH,
    videoHeight: VIDEO_HEIGHT,
    ...overrides,
  };
}

describe('calculatePersonCenteredCrop', () => {
  describe('with no keypoints', () => {
    it('returns center crop with fallback size', () => {
      const result = calculatePersonCenteredCrop([], makeOptions());

      // Fallback is 85% of video height
      const expectedHeight = VIDEO_HEIGHT * 0.85;
      const expectedWidth = expectedHeight * (THUMB_WIDTH / THUMB_HEIGHT);

      expect(result.cropHeight).toBeCloseTo(expectedHeight, 1);
      expect(result.cropWidth).toBeCloseTo(expectedWidth, 1);
      // Should be centered
      expect(result.cropX).toBeCloseTo((VIDEO_WIDTH - expectedWidth) / 2, 1);
      expect(result.cropY).toBeCloseTo((VIDEO_HEIGHT - expectedHeight) / 2, 1);
    });
  });

  describe('with low confidence keypoints', () => {
    it('ignores keypoints below confidence threshold', () => {
      const keypoints: CropKeypoint[] = [
        { x: 100, y: 100, score: 0.1 }, // Below threshold
        { x: 200, y: 200, score: 0.2 }, // Below threshold
      ];

      const result = calculatePersonCenteredCrop(keypoints, makeOptions());

      // Should use fallback since no confident keypoints
      const expectedHeight = VIDEO_HEIGHT * 0.85;
      expect(result.cropHeight).toBeCloseTo(expectedHeight, 1);
    });

    it('uses custom confidence threshold', () => {
      const keypoints: CropKeypoint[] = [
        { x: 500, y: 300, score: 0.5 },
        { x: 600, y: 400, score: 0.5 },
      ];

      // With high threshold, these should be ignored
      const highThreshold = calculatePersonCenteredCrop(
        keypoints,
        makeOptions({ minConfidence: 0.8 })
      );
      expect(highThreshold.cropHeight).toBeCloseTo(VIDEO_HEIGHT * 0.85, 1);

      // With low threshold, these should be used
      const lowThreshold = calculatePersonCenteredCrop(
        keypoints,
        makeOptions({ minConfidence: 0.3 })
      );
      // Person-centered crop should be smaller than fallback
      expect(lowThreshold.cropHeight).toBeLessThan(VIDEO_HEIGHT * 0.85);
    });
  });

  describe('with confident keypoints (pixel coordinates)', () => {
    it('centers crop on person bounding box', () => {
      // Person in center of frame (pixel coordinates)
      const keypoints: CropKeypoint[] = [
        { x: 900, y: 400, score: 0.9 }, // top
        { x: 900, y: 700, score: 0.9 }, // bottom
        { x: 800, y: 550, score: 0.9 }, // left
        { x: 1000, y: 550, score: 0.9 }, // right
      ];

      const result = calculatePersonCenteredCrop(keypoints, makeOptions());

      // Person center should be at (900, 550)
      const expectedCenterX = 900;
      const expectedCenterY = 550;

      // Crop should be centered on person
      const actualCenterX = result.cropX + result.cropWidth / 2;
      const actualCenterY = result.cropY + result.cropHeight / 2;

      expect(actualCenterX).toBeCloseTo(expectedCenterX, 0);
      expect(actualCenterY).toBeCloseTo(expectedCenterY, 0);
    });

    it('handles person at left edge of frame', () => {
      // Person near left edge
      const keypoints: CropKeypoint[] = [
        { x: 50, y: 400, score: 0.9 },
        { x: 150, y: 600, score: 0.9 },
      ];

      const result = calculatePersonCenteredCrop(keypoints, makeOptions());

      // Crop should be clamped to left edge
      expect(result.cropX).toBe(0);
      // Crop should still be valid
      expect(result.cropX + result.cropWidth).toBeLessThanOrEqual(VIDEO_WIDTH);
    });

    it('handles person at right edge of frame', () => {
      // Person near right edge
      const keypoints: CropKeypoint[] = [
        { x: 1800, y: 400, score: 0.9 },
        { x: 1900, y: 600, score: 0.9 },
      ];

      const result = calculatePersonCenteredCrop(keypoints, makeOptions());

      // Crop should be clamped to right edge
      expect(result.cropX + result.cropWidth).toBe(VIDEO_WIDTH);
    });

    it('handles person at top edge of frame', () => {
      // Person near top
      const keypoints: CropKeypoint[] = [
        { x: 960, y: 50, score: 0.9 },
        { x: 960, y: 150, score: 0.9 },
      ];

      const result = calculatePersonCenteredCrop(keypoints, makeOptions());

      expect(result.cropY).toBe(0);
    });

    it('handles person at bottom edge of frame', () => {
      // Person near bottom
      const keypoints: CropKeypoint[] = [
        { x: 960, y: 950, score: 0.9 },
        { x: 960, y: 1050, score: 0.9 },
      ];

      const result = calculatePersonCenteredCrop(keypoints, makeOptions());

      expect(result.cropY + result.cropHeight).toBe(VIDEO_HEIGHT);
    });
  });

  describe('aspect ratio preservation', () => {
    it('maintains target aspect ratio for tall person', () => {
      // Tall thin person
      const keypoints: CropKeypoint[] = [
        { x: 950, y: 200, score: 0.9 },
        { x: 970, y: 800, score: 0.9 },
      ];

      const result = calculatePersonCenteredCrop(keypoints, makeOptions());

      const actualAspect = result.cropWidth / result.cropHeight;
      const targetAspect = THUMB_WIDTH / THUMB_HEIGHT;
      expect(actualAspect).toBeCloseTo(targetAspect, 2);
    });

    it('maintains target aspect ratio for wide person', () => {
      // Wide pose (arms stretched)
      const keypoints: CropKeypoint[] = [
        { x: 600, y: 500, score: 0.9 },
        { x: 1300, y: 500, score: 0.9 },
        { x: 950, y: 400, score: 0.9 },
        { x: 950, y: 600, score: 0.9 },
      ];

      const result = calculatePersonCenteredCrop(keypoints, makeOptions());

      const actualAspect = result.cropWidth / result.cropHeight;
      const targetAspect = THUMB_WIDTH / THUMB_HEIGHT;
      expect(actualAspect).toBeCloseTo(targetAspect, 2);
    });
  });

  describe('minimum crop size', () => {
    it('enforces minimum crop height for small person', () => {
      // Very small person (far from camera)
      const keypoints: CropKeypoint[] = [
        { x: 960, y: 500, score: 0.9 },
        { x: 980, y: 520, score: 0.9 },
      ];

      const result = calculatePersonCenteredCrop(keypoints, makeOptions());

      // Should be at least 40% of video height
      expect(result.cropHeight).toBeGreaterThanOrEqual(VIDEO_HEIGHT * 0.4);
    });

    it('uses custom minimum crop height fraction', () => {
      const keypoints: CropKeypoint[] = [
        { x: 960, y: 500, score: 0.9 },
        { x: 980, y: 520, score: 0.9 },
      ];

      const result = calculatePersonCenteredCrop(
        keypoints,
        makeOptions({ minCropHeightFraction: 0.6 })
      );

      expect(result.cropHeight).toBeGreaterThanOrEqual(VIDEO_HEIGHT * 0.6);
    });
  });

  describe('video bounds clamping', () => {
    it('clamps crop width to video width for very wide source', () => {
      // Very wide aspect ratio video
      const options = makeOptions({
        videoWidth: 500, // Narrow video
        videoHeight: 1000,
      });

      const keypoints: CropKeypoint[] = [{ x: 250, y: 500, score: 0.9 }];

      const result = calculatePersonCenteredCrop(keypoints, options);

      expect(result.cropWidth).toBeLessThanOrEqual(500);
      expect(result.cropX).toBeGreaterThanOrEqual(0);
      expect(result.cropX + result.cropWidth).toBeLessThanOrEqual(500);
    });
  });

  describe('regression: pixel vs normalized coordinates', () => {
    it('treats keypoints as pixel coordinates (not normalized)', () => {
      // This test ensures we don't accidentally multiply by video dimensions
      // BlazePose keypoints are already in pixel coordinates
      const keypoints: CropKeypoint[] = [
        { x: 960, y: 540, score: 0.9 }, // Center of 1920x1080 video
      ];

      const result = calculatePersonCenteredCrop(keypoints, makeOptions());

      // Center should be around (960, 540), not (960*1920, 540*1080)
      const centerX = result.cropX + result.cropWidth / 2;
      const centerY = result.cropY + result.cropHeight / 2;

      // If we incorrectly multiplied by video dimensions, center would be way off
      expect(centerX).toBeCloseTo(960, 0);
      expect(centerY).toBeCloseTo(540, 0);
    });

    it('handles keypoints at exact pixel positions', () => {
      // Specific pixel positions that would be wrong if multiplied
      const keypoints: CropKeypoint[] = [
        { x: 100, y: 100, score: 0.9 },
        { x: 200, y: 200, score: 0.9 },
      ];

      const result = calculatePersonCenteredCrop(keypoints, makeOptions());

      // Person center at (150, 150) in pixel coords
      // If normalized and multiplied by 1920x1080, would be at (288000, 162000) - way outside frame
      expect(result.cropX).toBeLessThan(VIDEO_WIDTH);
      expect(result.cropY).toBeLessThan(VIDEO_HEIGHT);
    });
  });
});
