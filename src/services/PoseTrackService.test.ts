import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PoseTrackFile } from '../types/posetrack';
import {
  clearAllPoseTracks,
  clearMemoryStore,
  createPoseTrackMetadata,
  estimatePoseTrackSize,
  formatFileSize,
  generatePoseTrackFilename,
  getPoseTrackStorageMode,
  POSETRACK_EXTENSION,
  parsePoseTrack,
  serializePoseTrack,
  setPoseTrackStorageMode,
  validatePoseTrack,
} from './PoseTrackService';

/**
 * Create a valid PoseTrackFile for testing
 */
function createValidPoseTrack(): PoseTrackFile {
  return {
    metadata: {
      version: '1.0',
      model: 'blazepose',
      modelVersion: '4.0.0',
      sourceVideoHash: 'a'.repeat(64), // Valid SHA-256 hash
      sourceVideoName: 'test-video.mp4',
      sourceVideoDuration: 10.5,
      extractedAt: new Date().toISOString(),
      frameCount: 315,
      fps: 30,
      videoWidth: 1920,
      videoHeight: 1080,
    },
    frames: [
      {
        frameIndex: 0,
        timestamp: 0,
        videoTime: 0,
        keypoints: [
          { x: 100, y: 50, score: 0.9 },
          { x: 110, y: 55, score: 0.85 },
        ],
        score: 0.87,
      },
      {
        frameIndex: 1,
        timestamp: 33,
        videoTime: 0.033,
        keypoints: [
          { x: 102, y: 51, score: 0.91 },
          { x: 112, y: 56, score: 0.86 },
        ],
        score: 0.88,
      },
    ],
  };
}

describe('PoseTrackService', () => {
  describe('validatePoseTrack', () => {
    it('returns true for valid pose track', () => {
      const poseTrack = createValidPoseTrack();
      expect(validatePoseTrack(poseTrack)).toBe(true);
    });

    it('returns false for null', () => {
      expect(validatePoseTrack(null)).toBe(false);
    });

    it('returns false for non-object', () => {
      expect(validatePoseTrack('string')).toBe(false);
      expect(validatePoseTrack(123)).toBe(false);
      expect(validatePoseTrack([])).toBe(false);
    });

    it('returns false for missing metadata', () => {
      const invalid = { frames: [] };
      expect(validatePoseTrack(invalid)).toBe(false);
    });

    it('returns false for wrong version', () => {
      const poseTrack = createValidPoseTrack();
      (poseTrack.metadata as unknown as Record<string, unknown>).version =
        '2.0';
      expect(validatePoseTrack(poseTrack)).toBe(false);
    });

    it('returns false for invalid model', () => {
      const poseTrack = createValidPoseTrack();
      (poseTrack.metadata as unknown as Record<string, unknown>).model =
        'invalid-model';
      expect(validatePoseTrack(poseTrack)).toBe(false);
    });

    it('returns false for invalid video hash', () => {
      const poseTrack = createValidPoseTrack();
      poseTrack.metadata.sourceVideoHash = 'invalid-hash';
      expect(validatePoseTrack(poseTrack)).toBe(false);
    });

    it('returns false for negative frame count', () => {
      const poseTrack = createValidPoseTrack();
      poseTrack.metadata.frameCount = -1;
      expect(validatePoseTrack(poseTrack)).toBe(false);
    });

    it('returns false for invalid fps', () => {
      const poseTrack = createValidPoseTrack();
      poseTrack.metadata.fps = 0;
      expect(validatePoseTrack(poseTrack)).toBe(false);
    });

    it('returns false for missing frames array', () => {
      const poseTrack = createValidPoseTrack();
      (poseTrack as unknown as Record<string, unknown>).frames = 'not-an-array';
      expect(validatePoseTrack(poseTrack)).toBe(false);
    });

    it('accepts all valid model types', () => {
      const models = [
        'blazepose',
        'blazepose',
        'blazepose',
      ] as const;
      for (const model of models) {
        const poseTrack = createValidPoseTrack();
        poseTrack.metadata.model = model;
        expect(validatePoseTrack(poseTrack)).toBe(true);
      }
    });
  });

  describe('parsePoseTrack', () => {
    it('parses valid JSON', () => {
      const poseTrack = createValidPoseTrack();
      const json = JSON.stringify(poseTrack);
      const parsed = parsePoseTrack(json);
      expect(parsed.metadata.version).toBe('1.0');
      expect(parsed.frames.length).toBe(2);
    });

    it('throws on invalid JSON', () => {
      expect(() => parsePoseTrack('{')).toThrow();
    });

    it('throws on invalid pose track structure', () => {
      const invalidJson = JSON.stringify({ invalid: true });
      expect(() => parsePoseTrack(invalidJson)).toThrow(
        'Invalid pose track file format'
      );
    });
  });

  describe('serializePoseTrack', () => {
    it('serializes to compact JSON by default', () => {
      const poseTrack = createValidPoseTrack();
      const json = serializePoseTrack(poseTrack);
      expect(json).not.toContain('\n');
      expect(JSON.parse(json)).toEqual(poseTrack);
    });

    it('serializes to pretty JSON when requested', () => {
      const poseTrack = createValidPoseTrack();
      const json = serializePoseTrack(poseTrack, true);
      expect(json).toContain('\n');
      expect(json).toContain('  '); // Indentation
      expect(JSON.parse(json)).toEqual(poseTrack);
    });
  });

  describe('generatePoseTrackFilename', () => {
    it('generates filename with video name, model, and date', () => {
      const filename = generatePoseTrackFilename(
        'my-video.mp4',
        'blazepose',
        new Date('2024-01-15')
      );
      expect(filename).toBe(
        `my-video_blazepose_2024-01-15${POSETRACK_EXTENSION}`
      );
    });

    it('removes video extension', () => {
      const filename = generatePoseTrackFilename(
        'video.mov',
        'blazepose'
      );
      expect(filename).toContain('video_');
      expect(filename).not.toContain('.mov');
    });

    it('sanitizes special characters in video name', () => {
      const filename = generatePoseTrackFilename(
        'my video (1).mp4',
        'blazepose',
        new Date('2024-01-15')
      );
      expect(filename).toBe(
        `my_video__1__blazepose_2024-01-15${POSETRACK_EXTENSION}`
      );
    });

    it('uses current date when not provided', () => {
      const filename = generatePoseTrackFilename(
        'video.mp4',
        'blazepose'
      );
      const today = new Date().toISOString().split('T')[0];
      expect(filename).toContain(today);
    });
  });

  describe('createPoseTrackMetadata', () => {
    it('creates valid metadata with all fields', () => {
      const metadata = createPoseTrackMetadata({
        model: 'blazepose',
        modelVersion: '4.0.0',
        sourceVideoHash: 'a'.repeat(64),
        sourceVideoName: 'test.mp4',
        sourceVideoDuration: 15.5,
        frameCount: 465,
        fps: 30,
        videoWidth: 1920,
        videoHeight: 1080,
      });

      expect(metadata.version).toBe('1.0');
      expect(metadata.model).toBe('blazepose');
      expect(metadata.modelVersion).toBe('4.0.0');
      expect(metadata.sourceVideoHash).toBe('a'.repeat(64));
      expect(metadata.sourceVideoName).toBe('test.mp4');
      expect(metadata.sourceVideoDuration).toBe(15.5);
      expect(metadata.frameCount).toBe(465);
      expect(metadata.fps).toBe(30);
      expect(metadata.extractedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO 8601 format
    });

    it('works without optional sourceVideoName', () => {
      const metadata = createPoseTrackMetadata({
        model: 'blazepose',
        modelVersion: '4.0.0',
        sourceVideoHash: 'b'.repeat(64),
        sourceVideoDuration: 10,
        frameCount: 300,
        fps: 30,
        videoWidth: 1280,
        videoHeight: 720,
      });

      expect(metadata.sourceVideoName).toBeUndefined();
    });
  });

  describe('estimatePoseTrackSize', () => {
    it('estimates size based on frame count', () => {
      const size100 = estimatePoseTrackSize(100);
      const size1000 = estimatePoseTrackSize(1000);

      // 1000 frames should be roughly 10x larger than 100 frames
      expect(size1000).toBeGreaterThan(size100 * 8);
      expect(size1000).toBeLessThan(size100 * 12);
    });

    it('returns reasonable size for typical video', () => {
      // 10 second video at 30fps = 300 frames
      const size = estimatePoseTrackSize(300);

      // Should be roughly 300-600KB uncompressed (33 keypoints * ~100 bytes each + overhead)
      expect(size).toBeGreaterThan(100000);
      expect(size).toBeLessThan(1000000);
    });

    it('accounts for custom keypoint count', () => {
      const size17 = estimatePoseTrackSize(100, 17); // Legacy COCO (for comparison)
      const size33 = estimatePoseTrackSize(100, 33); // BlazePose

      // More keypoints = larger file
      expect(size33).toBeGreaterThan(size17);
    });
  });

  describe('formatFileSize', () => {
    it('formats bytes', () => {
      expect(formatFileSize(500)).toBe('500 B');
    });

    it('formats kilobytes', () => {
      expect(formatFileSize(1024)).toBe('1.0 KB');
      expect(formatFileSize(1536)).toBe('1.5 KB');
    });

    it('formats megabytes', () => {
      expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
      expect(formatFileSize(2.5 * 1024 * 1024)).toBe('2.5 MB');
    });
  });

  describe('storage mode', () => {
    beforeEach(() => {
      clearMemoryStore();
      // Reset to memory mode for isolation
      setPoseTrackStorageMode('memory', false);
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it('can be set to memory mode', () => {
      setPoseTrackStorageMode('memory', false);
      expect(getPoseTrackStorageMode()).toBe('memory');
    });

    it('can be set to indexeddb mode', () => {
      setPoseTrackStorageMode('indexeddb', false);
      expect(getPoseTrackStorageMode()).toBe('indexeddb');
    });
  });

  describe('clearAllPoseTracks', () => {
    beforeEach(() => {
      clearMemoryStore();
      setPoseTrackStorageMode('memory', false);
    });

    it('clears memory store when in memory mode', async () => {
      setPoseTrackStorageMode('memory', false);
      // Should complete without error
      await clearAllPoseTracks();
      expect(getPoseTrackStorageMode()).toBe('memory');
    });
  });
});
