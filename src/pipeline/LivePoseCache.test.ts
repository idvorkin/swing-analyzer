import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PoseTrackFile, PoseTrackFrame } from '../types/posetrack';
import { LivePoseCache } from './LivePoseCache';

/**
 * Create a mock PoseTrackFrame for testing
 */
function createMockFrame(
  frameIndex: number,
  videoTime: number
): PoseTrackFrame {
  return {
    frameIndex,
    videoTime,
    timestamp: Date.now(),
    keypoints: [{ x: 0.5, y: 0.5, score: 0.9, name: 'nose' }],
    angles: {
      spineAngle: 45,
      armToSpineAngle: 30,
      armToVerticalAngle: 60,
      hipAngle: 90,
      kneeAngle: 120,
    },
  };
}

describe('LivePoseCache', () => {
  let cache: LivePoseCache;

  beforeEach(() => {
    cache = new LivePoseCache('test-hash');
  });

  describe('constructor', () => {
    it('should initialize with video hash', () => {
      expect(cache.getVideoHash()).toBe('test-hash');
    });

    it('should initialize with null hash if not provided', () => {
      const noHashCache = new LivePoseCache();
      expect(noHashCache.getVideoHash()).toBeNull();
    });

    it('should start empty', () => {
      expect(cache.getFrameCount()).toBe(0);
      expect(cache.isExtractionComplete()).toBe(false);
    });
  });

  describe('addFrame', () => {
    it('should add a frame and retrieve it', () => {
      const frame = createMockFrame(0, 1.0);
      cache.addFrame(frame);

      expect(cache.getFrameCount()).toBe(1);
      expect(cache.getFrame(1.0)).toEqual(frame);
    });

    it('should handle multiple frames', () => {
      cache.addFrame(createMockFrame(0, 0.0));
      cache.addFrame(createMockFrame(1, 0.5));
      cache.addFrame(createMockFrame(2, 1.0));

      expect(cache.getFrameCount()).toBe(3);
      expect(cache.getFrame(0.5)?.frameIndex).toBe(1);
    });

    it('should round video times to 3 decimal places', () => {
      const frame = createMockFrame(0, 1.2345);
      cache.addFrame(frame);

      // Should find frame at rounded time
      expect(cache.getFrame(1.235)).not.toBeNull();
    });
  });

  describe('getFrame', () => {
    beforeEach(() => {
      cache.addFrame(createMockFrame(0, 0.0));
      cache.addFrame(createMockFrame(1, 0.5));
      cache.addFrame(createMockFrame(2, 1.0));
      cache.addFrame(createMockFrame(3, 1.5));
    });

    it('should return exact match', () => {
      const frame = cache.getFrame(0.5);
      expect(frame?.frameIndex).toBe(1);
    });

    it('should return closest frame when no exact match', () => {
      const frame = cache.getFrame(0.52);
      expect(frame?.frameIndex).toBe(1); // Closest to 0.5
    });

    it('should return null when cache is empty', () => {
      const emptyCache = new LivePoseCache();
      expect(emptyCache.getFrame(1.0)).toBeNull();
    });

    it('should respect tolerance parameter', () => {
      // Should find frame within tolerance
      expect(cache.getFrame(0.55, 0.1)).not.toBeNull();

      // Should not find frame outside tolerance
      expect(cache.getFrame(0.7, 0.1)).toBeNull();
    });

    it('should return first frame for time before all frames', () => {
      const frame = cache.getFrame(-0.5);
      expect(frame?.frameIndex).toBe(0);
    });

    it('should return last frame for time after all frames', () => {
      const frame = cache.getFrame(2.0);
      expect(frame?.frameIndex).toBe(3);
    });
  });

  describe('hasFrame', () => {
    it('should return true when frame exists', () => {
      cache.addFrame(createMockFrame(0, 1.0));
      expect(cache.hasFrame(1.0)).toBe(true);
    });

    it('should return false when frame does not exist', () => {
      expect(cache.hasFrame(1.0)).toBe(false);
    });
  });

  describe('waitForFrame', () => {
    it('should return immediately if frame already exists', async () => {
      const frame = createMockFrame(0, 1.0);
      cache.addFrame(frame);

      const result = await cache.waitForFrame(1.0);
      expect(result).toEqual(frame);
    });

    it('should wait for frame to be added', async () => {
      const frame = createMockFrame(0, 1.0);

      // Add frame after a delay
      setTimeout(() => cache.addFrame(frame), 50);

      const result = await cache.waitForFrame(1.0, { timeoutMs: 1000 });
      expect(result.frameIndex).toBe(0);
    });

    it('should throw error on timeout', async () => {
      await expect(cache.waitForFrame(1.0, { timeoutMs: 50 })).rejects.toThrow(
        'Timeout waiting for frame'
      );
    });

    it('should throw error if extraction complete and frame not found', async () => {
      cache.markComplete();

      await expect(cache.waitForFrame(1.0)).rejects.toThrow(
        'Frame at 1s not found and extraction is complete'
      );
    });
  });

  describe('markComplete', () => {
    it('should mark extraction as complete', () => {
      expect(cache.isExtractionComplete()).toBe(false);
      cache.markComplete();
      expect(cache.isExtractionComplete()).toBe(true);
    });

    it('should update metadata when provided', () => {
      cache.markComplete({ fps: 30, videoWidth: 1920 });
      const metadata = cache.getMetadata();
      expect(metadata.fps).toBe(30);
      expect(metadata.videoWidth).toBe(1920);
    });
  });

  describe('getAllFrames', () => {
    it('should return frames sorted by frame index', () => {
      // Add frames out of order
      cache.addFrame(createMockFrame(2, 1.0));
      cache.addFrame(createMockFrame(0, 0.0));
      cache.addFrame(createMockFrame(1, 0.5));

      const frames = cache.getAllFrames();
      expect(frames.map((f) => f.frameIndex)).toEqual([0, 1, 2]);
    });

    it('should return empty array when no frames', () => {
      expect(cache.getAllFrames()).toEqual([]);
    });
  });

  describe('metadata', () => {
    it('should set and get metadata', () => {
      cache.setMetadata({ fps: 60, model: 'blazepose' });
      const metadata = cache.getMetadata();
      expect(metadata.fps).toBe(60);
      expect(metadata.model).toBe('blazepose');
    });

    it('should merge metadata on multiple calls', () => {
      cache.setMetadata({ fps: 60 });
      cache.setMetadata({ videoWidth: 1920 });

      const metadata = cache.getMetadata();
      expect(metadata.fps).toBe(60);
      expect(metadata.videoWidth).toBe(1920);
    });
  });

  describe('toPoseTrackFile', () => {
    it('should convert to PoseTrackFile format', () => {
      cache.addFrame(createMockFrame(0, 0.0));
      cache.addFrame(createMockFrame(1, 0.5));
      cache.setMetadata({ fps: 30, model: 'movenet-lightning' });

      const file = cache.toPoseTrackFile();

      expect(file).not.toBeNull();
      expect(file?.frames.length).toBe(2);
      expect(file?.metadata.sourceVideoHash).toBe('test-hash');
      expect(file?.metadata.frameCount).toBe(2);
    });

    it('should return null when empty', () => {
      expect(cache.toPoseTrackFile()).toBeNull();
    });

    it('should sort frames by frame index', () => {
      cache.addFrame(createMockFrame(2, 1.0));
      cache.addFrame(createMockFrame(0, 0.0));

      const file = cache.toPoseTrackFile();
      expect(file?.frames[0].frameIndex).toBe(0);
      expect(file?.frames[1].frameIndex).toBe(2);
    });
  });

  describe('fromPoseTrackFile', () => {
    it('should create cache from PoseTrackFile', () => {
      const file: PoseTrackFile = {
        metadata: {
          version: '1.0',
          model: 'movenet-lightning',
          modelVersion: '1.0.0',
          sourceVideoHash: 'file-hash',
          sourceVideoDuration: 10,
          extractedAt: new Date().toISOString(),
          frameCount: 2,
          fps: 30,
          videoWidth: 1920,
          videoHeight: 1080,
        },
        frames: [createMockFrame(0, 0.0), createMockFrame(1, 0.5)],
      };

      const newCache = LivePoseCache.fromPoseTrackFile(file);

      expect(newCache.getVideoHash()).toBe('file-hash');
      expect(newCache.getFrameCount()).toBe(2);
      expect(newCache.isExtractionComplete()).toBe(true);
      expect(newCache.getFrame(0.5)?.frameIndex).toBe(1);
    });
  });

  describe('clear', () => {
    it('should clear all frames', () => {
      cache.addFrame(createMockFrame(0, 0.0));
      cache.addFrame(createMockFrame(1, 0.5));
      cache.markComplete();

      cache.clear();

      expect(cache.getFrameCount()).toBe(0);
      expect(cache.isExtractionComplete()).toBe(false);
    });
  });

  describe('onFrameAdded', () => {
    it('should notify when frame is added', () => {
      const callback = vi.fn();
      cache.onFrameAdded(callback);

      cache.addFrame(createMockFrame(0, 1.5));

      expect(callback).toHaveBeenCalledWith({
        frameIndex: 0,
        videoTime: 1.5,
      });
    });

    it('should allow unsubscribing', () => {
      const callback = vi.fn();
      const unsubscribe = cache.onFrameAdded(callback);

      unsubscribe();
      cache.addFrame(createMockFrame(0, 1.0));

      expect(callback).not.toHaveBeenCalled();
    });
  });
});
