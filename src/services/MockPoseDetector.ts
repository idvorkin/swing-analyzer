/**
 * MockPoseDetector
 *
 * A mock pose detector that returns pre-computed poses from a PoseTrack file.
 * Used for E2E testing without WebGL/TensorFlow dependencies.
 *
 * This enables testing the full extraction pipeline with deterministic results.
 */

import type { Pose, PoseDetector } from '@tensorflow-models/pose-detection';
import type { PoseTrackFile } from '../types/posetrack';

export interface MockPoseDetectorOptions {
  /** The PoseTrack data to use for mock poses */
  poseTrack: PoseTrackFile;
  /** Optional delay per frame to simulate real extraction (ms) */
  frameDelayMs?: number;
}

/**
 * Create a mock pose detector that returns poses from a PoseTrack file
 */
export function createMockPoseDetector(
  options: MockPoseDetectorOptions
): PoseDetector {
  const { poseTrack, frameDelayMs = 0 } = options;

  let frameIndex = 0;

  return {
    async estimatePoses(_image: unknown): Promise<Pose[]> {
      // Simulate extraction delay if configured
      if (frameDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, frameDelayMs));
      }

      // Get the frame for current index, cycling through if we run out
      const frame = poseTrack.frames[frameIndex % poseTrack.frames.length];
      frameIndex++;

      if (!frame || frame.keypoints.length === 0) {
        return [];
      }

      // Convert PoseTrackFrame keypoints to Pose format
      const pose: Pose = {
        keypoints: frame.keypoints.map((kp) => ({
          x: kp.x,
          y: kp.y,
          score: kp.score,
          name: kp.name,
        })),
        score: frame.score,
      };

      return [pose];
    },

    dispose(): void {
      // Nothing to dispose for mock
    },

    reset(): void {
      frameIndex = 0;
    },
  };
}

/**
 * Type for a factory function that creates pose detectors
 */
export type PoseDetectorFactory = () => Promise<PoseDetector>;

/**
 * Create a factory that produces mock pose detectors
 */
export function createMockPoseDetectorFactory(
  options: MockPoseDetectorOptions
): PoseDetectorFactory {
  return async () => createMockPoseDetector(options);
}
