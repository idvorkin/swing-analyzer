import { describe, expect, it, vi } from 'vitest';
import type { PoseKeypoint } from '../types';
import type { PoseTrackFile, PoseTrackFrame } from '../types/posetrack';
import {
  analyzePoseTrack,
  createPoseTrackPipeline,
  PoseTrackPipeline,
} from './PoseTrackPipeline';

/**
 * Create a set of keypoints representing a standing pose
 */
function createStandingKeypoints(): PoseKeypoint[] {
  // COCO format: 17 keypoints
  // Standing upright with arms at sides
  return [
    { x: 100, y: 20, score: 0.9 }, // 0: nose
    { x: 95, y: 15, score: 0.9 }, // 1: left_eye
    { x: 105, y: 15, score: 0.9 }, // 2: right_eye
    { x: 90, y: 20, score: 0.9 }, // 3: left_ear
    { x: 110, y: 20, score: 0.9 }, // 4: right_ear
    { x: 80, y: 50, score: 0.9 }, // 5: left_shoulder
    { x: 120, y: 50, score: 0.9 }, // 6: right_shoulder
    { x: 70, y: 80, score: 0.9 }, // 7: left_elbow
    { x: 130, y: 80, score: 0.9 }, // 8: right_elbow
    { x: 65, y: 110, score: 0.9 }, // 9: left_wrist
    { x: 135, y: 110, score: 0.9 }, // 10: right_wrist
    { x: 85, y: 120, score: 0.9 }, // 11: left_hip
    { x: 115, y: 120, score: 0.9 }, // 12: right_hip
    { x: 85, y: 170, score: 0.9 }, // 13: left_knee
    { x: 115, y: 170, score: 0.9 }, // 14: right_knee
    { x: 85, y: 220, score: 0.9 }, // 15: left_ankle
    { x: 115, y: 220, score: 0.9 }, // 16: right_ankle
  ];
}

/**
 * Create a valid PoseTrackFile for testing
 */
function createTestPoseTrack(frameCount: number = 30): PoseTrackFile {
  const frames: PoseTrackFrame[] = [];
  const fps = 30;

  for (let i = 0; i < frameCount; i++) {
    frames.push({
      frameIndex: i,
      timestamp: Math.round((i / fps) * 1000),
      videoTime: i / fps,
      keypoints: createStandingKeypoints(),
      score: 0.9,
    });
  }

  return {
    metadata: {
      version: '1.0',
      model: 'movenet-lightning',
      modelVersion: '4.0.0',
      sourceVideoHash: 'a'.repeat(64),
      sourceVideoName: 'test-video.mp4',
      sourceVideoDuration: frameCount / fps,
      extractedAt: new Date().toISOString(),
      frameCount,
      fps,
      videoWidth: 1920,
      videoHeight: 1080,
    },
    frames,
  };
}

describe('PoseTrackPipeline', () => {
  describe('constructor and basic getters', () => {
    it('creates pipeline from pose track', () => {
      const poseTrack = createTestPoseTrack(60);
      const pipeline = new PoseTrackPipeline(poseTrack);

      expect(pipeline.getFrameCount()).toBe(60);
      expect(pipeline.getRepCount()).toBe(0);
      expect(pipeline.getCurrentFrameIndex()).toBe(0);
    });

    it('returns correct metadata', () => {
      const poseTrack = createTestPoseTrack();
      const pipeline = new PoseTrackPipeline(poseTrack);

      const metadata = pipeline.getMetadata();
      expect(metadata.model).toBe('movenet-lightning');
      expect(metadata.fps).toBe(30);
    });
  });

  describe('processFrame', () => {
    it('processes a single frame and returns result', () => {
      const poseTrack = createTestPoseTrack();
      const pipeline = new PoseTrackPipeline(poseTrack);

      const result = pipeline.processFrame(0);

      expect(result.frameIndex).toBe(0);
      expect(result.videoTime).toBe(0);
      expect(result.skeleton).not.toBeNull();
      expect(result.repCount).toBe(0);
    });

    it('throws for out of bounds frame index', () => {
      const poseTrack = createTestPoseTrack(10);
      const pipeline = new PoseTrackPipeline(poseTrack);

      expect(() => pipeline.processFrame(-1)).toThrow('out of bounds');
      expect(() => pipeline.processFrame(10)).toThrow('out of bounds');
    });

    it('updates current frame index', () => {
      const poseTrack = createTestPoseTrack(30);
      const pipeline = new PoseTrackPipeline(poseTrack);

      pipeline.processFrame(15);
      expect(pipeline.getCurrentFrameIndex()).toBe(15);

      pipeline.processFrame(5);
      expect(pipeline.getCurrentFrameIndex()).toBe(5);
    });

    it('returns null skeleton for empty keypoints', () => {
      const poseTrack = createTestPoseTrack(10);
      poseTrack.frames[5].keypoints = [];

      const pipeline = new PoseTrackPipeline(poseTrack);
      const result = pipeline.processFrame(5);

      expect(result.skeleton).toBeNull();
    });
  });

  describe('processAllFrames', () => {
    it('processes all frames in sequence', () => {
      const poseTrack = createTestPoseTrack(10);
      const pipeline = new PoseTrackPipeline(poseTrack);

      const results = pipeline.processAllFrames();

      expect(results.length).toBe(10);
      expect(results[0].frameIndex).toBe(0);
      expect(results[9].frameIndex).toBe(9);
    });

    it('calls callback for each frame', () => {
      const poseTrack = createTestPoseTrack(5);
      const pipeline = new PoseTrackPipeline(poseTrack);
      const callback = vi.fn();

      pipeline.processAllFrames(callback);

      expect(callback).toHaveBeenCalledTimes(5);
      expect(callback).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ frameIndex: 0 })
      );
      expect(callback).toHaveBeenNthCalledWith(
        5,
        expect.objectContaining({ frameIndex: 4 })
      );
    });
  });

  describe('seekToFrame', () => {
    it('seeks to specific frame', () => {
      const poseTrack = createTestPoseTrack(30);
      const pipeline = new PoseTrackPipeline(poseTrack);

      const result = pipeline.seekToFrame(20);

      expect(result.frameIndex).toBe(20);
      expect(pipeline.getCurrentFrameIndex()).toBe(20);
    });
  });

  describe('seekToTime', () => {
    it('seeks to closest frame for given time', () => {
      const poseTrack = createTestPoseTrack(30); // 1 second at 30fps
      const pipeline = new PoseTrackPipeline(poseTrack);

      // Seek to 0.5 seconds (should be around frame 15)
      const result = pipeline.seekToTime(0.5);

      expect(result.frameIndex).toBeGreaterThanOrEqual(14);
      expect(result.frameIndex).toBeLessThanOrEqual(16);
    });

    it('handles seek to beginning', () => {
      const poseTrack = createTestPoseTrack(30);
      const pipeline = new PoseTrackPipeline(poseTrack);

      const result = pipeline.seekToTime(0);
      expect(result.frameIndex).toBe(0);
    });

    it('handles seek to end', () => {
      const poseTrack = createTestPoseTrack(30);
      const pipeline = new PoseTrackPipeline(poseTrack);

      const result = pipeline.seekToTime(1.0); // Full duration
      expect(result.frameIndex).toBe(29);
    });
  });

  describe('reset', () => {
    it('resets pipeline state', () => {
      const poseTrack = createTestPoseTrack(30);
      const pipeline = new PoseTrackPipeline(poseTrack);

      // Process some frames
      pipeline.processAllFrames();

      // Reset
      pipeline.reset();

      expect(pipeline.getCurrentFrameIndex()).toBe(0);
      expect(pipeline.getRepCount()).toBe(0);
    });
  });

  describe('getFrame', () => {
    it('returns frame data at index', () => {
      const poseTrack = createTestPoseTrack(10);
      const pipeline = new PoseTrackPipeline(poseTrack);

      const frame = pipeline.getFrame(5);

      expect(frame).not.toBeNull();
      expect(frame?.frameIndex).toBe(5);
      expect(frame?.keypoints.length).toBe(17);
    });

    it('returns null for out of bounds index', () => {
      const poseTrack = createTestPoseTrack(10);
      const pipeline = new PoseTrackPipeline(poseTrack);

      expect(pipeline.getFrame(-1)).toBeNull();
      expect(pipeline.getFrame(100)).toBeNull();
    });
  });

  describe('getSkeletonAtFrame', () => {
    it('returns skeleton without updating pipeline state', () => {
      const poseTrack = createTestPoseTrack(10);
      const pipeline = new PoseTrackPipeline(poseTrack);

      const initialIndex = pipeline.getCurrentFrameIndex();
      const skeleton = pipeline.getSkeletonAtFrame(5);

      expect(skeleton).not.toBeNull();
      expect(pipeline.getCurrentFrameIndex()).toBe(initialIndex);
    });

    it('returns null for frame with no keypoints', () => {
      const poseTrack = createTestPoseTrack(10);
      poseTrack.frames[5].keypoints = [];

      const pipeline = new PoseTrackPipeline(poseTrack);
      expect(pipeline.getSkeletonAtFrame(5)).toBeNull();
    });
  });

  describe('RxJS observables', () => {
    it('emits skeleton events when processing frames', () => {
      const poseTrack = createTestPoseTrack(3);
      const pipeline = new PoseTrackPipeline(poseTrack);
      const events: unknown[] = [];

      const subscription = pipeline.skeletons$.subscribe((event) => {
        events.push(event);
      });

      pipeline.processAllFrames();
      subscription.unsubscribe();

      expect(events.length).toBe(3);
    });

    it('emits form events when processing frames', () => {
      const poseTrack = createTestPoseTrack(3);
      const pipeline = new PoseTrackPipeline(poseTrack);
      const events: unknown[] = [];

      const subscription = pipeline.forms$.subscribe((event) => {
        events.push(event);
      });

      pipeline.processAllFrames();
      subscription.unsubscribe();

      expect(events.length).toBe(3);
    });

    it('emits rep events when processing frames', () => {
      const poseTrack = createTestPoseTrack(3);
      const pipeline = new PoseTrackPipeline(poseTrack);
      const events: unknown[] = [];

      const subscription = pipeline.reps$.subscribe((event) => {
        events.push(event);
      });

      pipeline.processAllFrames();
      subscription.unsubscribe();

      expect(events.length).toBe(3);
    });
  });

  describe('dispose', () => {
    it('stops playback and completes observables', () => {
      const poseTrack = createTestPoseTrack(10);
      const pipeline = new PoseTrackPipeline(poseTrack);
      let completed = false;

      pipeline.skeletons$.subscribe({
        complete: () => {
          completed = true;
        },
      });

      pipeline.dispose();

      expect(completed).toBe(true);
    });
  });
});

describe('createPoseTrackPipeline', () => {
  it('creates a new PoseTrackPipeline instance', () => {
    const poseTrack = createTestPoseTrack();
    const pipeline = createPoseTrackPipeline(poseTrack);

    expect(pipeline).toBeInstanceOf(PoseTrackPipeline);
  });
});

describe('analyzePoseTrack', () => {
  it('returns analysis statistics', () => {
    const poseTrack = createTestPoseTrack(30);
    const analysis = analyzePoseTrack(poseTrack);

    expect(analysis.totalFrames).toBe(30);
    expect(analysis.framesWithPose).toBe(30);
    expect(analysis.detectionRate).toBe(1);
    expect(analysis.duration).toBe(1); // 30 frames at 30fps = 1 second
  });

  it('calculates correct detection rate with missing poses', () => {
    const poseTrack = createTestPoseTrack(10);
    // Remove keypoints from some frames
    poseTrack.frames[2].keypoints = [];
    poseTrack.frames[5].keypoints = [];

    const analysis = analyzePoseTrack(poseTrack);

    expect(analysis.totalFrames).toBe(10);
    expect(analysis.framesWithPose).toBe(8);
    expect(analysis.detectionRate).toBe(0.8);
  });

  it('calculates average confidence', () => {
    const poseTrack = createTestPoseTrack(3);
    poseTrack.frames[0].score = 0.8;
    poseTrack.frames[1].score = 0.9;
    poseTrack.frames[2].score = 1.0;

    const analysis = analyzePoseTrack(poseTrack);

    expect(analysis.averageConfidence).toBeCloseTo(0.9, 2);
  });
});
