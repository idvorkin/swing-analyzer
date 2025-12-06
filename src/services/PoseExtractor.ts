/**
 * PoseExtractor Service
 *
 * Extracts pose data from video files and creates PoseTrack files.
 * Runs pose detection on each frame and stores results for later analysis.
 */

import * as poseDetection from '@tensorflow-models/pose-detection';
import '@tensorflow/tfjs-backend-webgl';
import * as tf from '@tensorflow/tfjs-core';
import { Skeleton } from '../models/Skeleton';
import { normalizeToCocoFormat } from '../pipeline/KeypointAdapter';
import type { PoseKeypoint } from '../types';
import type {
  PoseExtractionOptions,
  PoseExtractionProgress,
  PoseExtractionResult,
  PoseModel,
  PoseTrackFile,
  PoseTrackFrame,
  PrecomputedAngles,
} from '../types/posetrack';
import { computeQuickVideoHash } from '../utils/videoHash';
import { createPoseTrackMetadata } from './PoseTrackService';

/**
 * Model version strings for metadata
 */
const MODEL_VERSIONS: Record<PoseModel, string> = {
  'movenet-lightning': '4.0.0',
  'movenet-thunder': '4.0.0',
  blazepose: '0.5.0',
};

/**
 * Extract poses from a video file
 */
export async function extractPosesFromVideo(
  videoFile: File,
  options: PoseExtractionOptions
): Promise<PoseExtractionResult> {
  const startTime = performance.now();

  // Compute video hash for matching
  const videoHash = await computeQuickVideoHash(videoFile);

  // Create video element to read frames
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.style.display = 'none'; // Hidden but in DOM for proper loading

  // Load video
  const videoUrl = URL.createObjectURL(videoFile);
  video.src = videoUrl;

  // Add to DOM - required for video to load in many browsers
  document.body.appendChild(video);

  // Track detector for cleanup
  let detector: poseDetection.PoseDetector | null = null;

  try {
    // Wait for video metadata to load with timeout
    await new Promise<void>((resolve, reject) => {
      const METADATA_TIMEOUT_MS = 30000; // 30 second timeout
      let settled = false;
      let abortHandler: (() => void) | null = null;

      const cleanup = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        video.onloadedmetadata = null;
        video.onerror = null;
        // Remove abort handler if it was added
        if (abortHandler) {
          options.signal?.removeEventListener('abort', abortHandler);
        }
      };

      const timeoutId = setTimeout(() => {
        if (!settled) {
          cleanup();
          reject(new Error('Timeout waiting for video metadata to load'));
        }
      }, METADATA_TIMEOUT_MS);

      video.onloadedmetadata = () => {
        if (!settled) {
          cleanup();
          resolve();
        }
      };

      video.onerror = () => {
        if (!settled) {
          cleanup();
          const errorCode = video.error?.code;
          const errorMessages: Record<number, string> = {
            1: 'Video loading aborted',
            2: 'Network error while loading video',
            3: 'Video decoding error - unsupported codec or corrupted file',
            4: 'Video format not supported by this browser',
          };
          const errorMessage = errorCode
            ? errorMessages[errorCode] ||
              `Unknown video error (code ${errorCode})`
            : 'Failed to load video';
          reject(new Error(errorMessage));
        }
      };

      // Handle abort signal
      if (options.signal?.aborted) {
        cleanup();
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }

      abortHandler = () => {
        if (!settled) {
          cleanup();
          reject(new DOMException('Aborted', 'AbortError'));
        }
      };
      options.signal?.addEventListener('abort', abortHandler);
    });

    // Get video properties
    const duration = video.duration;
    const fps = await estimateVideoFps(video);
    const totalFrames = Math.ceil(duration * fps);
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;

    // Initialize pose detector
    detector = await createPoseDetector(options.model);

    // Create canvas for frame extraction
    const canvas = document.createElement('canvas');
    canvas.width = videoWidth;
    canvas.height = videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get canvas 2d context');
    }

    // Create thumbnail canvas for filmstrip (downsampled to save memory)
    // ~160x90 = ~57KB per frame in RGBA, manageable for typical videos
    const THUMBNAIL_WIDTH = 160;
    const thumbnailHeight = Math.round((videoHeight / videoWidth) * THUMBNAIL_WIDTH);
    const thumbnailCanvas = document.createElement('canvas');
    thumbnailCanvas.width = THUMBNAIL_WIDTH;
    thumbnailCanvas.height = thumbnailHeight;
    const thumbnailCtx = thumbnailCanvas.getContext('2d');
    if (!thumbnailCtx) {
      throw new Error('Failed to get thumbnail canvas 2d context');
    }

    // Extract frames
    const frames: PoseTrackFrame[] = [];
    let frameIndex = 0;
    const frameInterval = 1 / fps;

    // Check if we're in mock mode - skip video seeking if so
    const useMockDetector = isMockDetectorEnabled();

    // Seek to start
    video.currentTime = 0;

    while (frameIndex < totalFrames) {
      // Check for cancellation
      if (options.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      // In mock mode, skip video seeking - poses come from fixture data
      // In real mode, seek video and draw frame
      let frameImage: ImageData | undefined;
      if (!useMockDetector) {
        // Wait for seek to complete
        await seekToTime(video, frameIndex * frameInterval);

        // Draw frame to canvas
        ctx.drawImage(video, 0, 0, videoWidth, videoHeight);

        // Capture downsampled thumbnail for filmstrip
        // Drawing from main canvas preserves aspect ratio and current frame
        thumbnailCtx.drawImage(canvas, 0, 0, THUMBNAIL_WIDTH, thumbnailHeight);
        frameImage = thumbnailCtx.getImageData(0, 0, THUMBNAIL_WIDTH, thumbnailHeight);
      }

      // Detect pose (mock detector ignores canvas and returns fixture data)
      const poses = await detector.estimatePoses(canvas);

      // Get keypoints and normalize to COCO format if using BlazePose
      let keypoints: PoseKeypoint[] = [];
      if (poses.length > 0) {
        const rawKeypoints = poses[0].keypoints as PoseKeypoint[];
        // BlazePose returns 33 keypoints, normalize to COCO 17-keypoint format
        keypoints = normalizeToCocoFormat(rawKeypoints);
      }

      // Calculate video time (in mock mode, video.currentTime doesn't update)
      const videoTime = useMockDetector
        ? frameIndex * frameInterval
        : video.currentTime;

      // Create frame data
      const frame: PoseTrackFrame = {
        frameIndex,
        timestamp: Math.round(videoTime * 1000),
        videoTime,
        keypoints,
        score: poses.length > 0 ? poses[0].score : undefined,
        // Include thumbnail for filmstrip (runtime only, not persisted)
        frameImage,
      };

      // Pre-compute angles if requested
      if (options.precomputeAngles && frame.keypoints.length > 0) {
        frame.angles = computeAngles(frame.keypoints);
      }

      frames.push(frame);

      // Notify listener of extracted frame (for streaming to LivePoseCache)
      if (options.onFrameExtracted) {
        options.onFrameExtracted(frame);
      }

      // Report progress
      if (options.onProgress) {
        const progress: PoseExtractionProgress = {
          currentFrame: frameIndex + 1,
          totalFrames,
          percentage: Math.round(((frameIndex + 1) / totalFrames) * 100),
          currentTime: videoTime,
          totalDuration: duration,
          currentKeypoints: frame.keypoints,
        };

        // Timing stats
        const elapsed = performance.now() - startTime;
        const framesRemaining = totalFrames - frameIndex - 1;
        const msPerFrame = elapsed / (frameIndex + 1);
        progress.estimatedTimeRemaining = (framesRemaining * msPerFrame) / 1000;
        progress.elapsedTime = elapsed / 1000;
        progress.fps = (frameIndex + 1) / (elapsed / 1000);

        options.onProgress(progress);
      }

      frameIndex++;

      // In real mode, also check video.currentTime for early exit
      if (!useMockDetector && video.currentTime + frameInterval >= duration) {
        break;
      }
    }

    // Create pose track metadata
    const metadata = createPoseTrackMetadata({
      model: options.model,
      modelVersion: MODEL_VERSIONS[options.model],
      sourceVideoHash: videoHash,
      sourceVideoName: videoFile.name,
      sourceVideoDuration: duration,
      frameCount: frames.length,
      fps,
      videoWidth,
      videoHeight,
    });

    // Build pose track file
    const poseTrack: PoseTrackFile = {
      metadata,
      frames,
    };

    const extractionTimeMs = performance.now() - startTime;

    return {
      poseTrack,
      extractionTimeMs,
      extractionFps: frames.length / (extractionTimeMs / 1000),
    };
  } finally {
    // Cleanup
    URL.revokeObjectURL(videoUrl);
    video.remove();
    // Dispose the TensorFlow detector to free GPU memory
    if (detector) {
      detector.dispose();
    }
  }
}

/**
 * Check if we're using a mock pose detector (for tests)
 */
function isMockDetectorEnabled(): boolean {
  const mockFactory = (
    window as unknown as {
      __testSetup?: { getMockDetectorFactory?: () => (() => Promise<poseDetection.PoseDetector>) | undefined };
    }
  ).__testSetup?.getMockDetectorFactory?.();
  return !!mockFactory;
}

/**
 * Create a pose detector for the specified model
 * In test mode, uses mock detector if configured via testSetup
 */
async function createPoseDetector(
  model: PoseModel
): Promise<poseDetection.PoseDetector> {
  // Check for mock detector factory (set via E2E tests)
  const mockFactory = (
    window as unknown as {
      __testSetup?: { getMockDetectorFactory?: () => (() => Promise<poseDetection.PoseDetector>) | undefined };
    }
  ).__testSetup?.getMockDetectorFactory?.();

  if (mockFactory) {
    console.log('[Test] Using mock pose detector');
    return mockFactory();
  }

  await tf.setBackend('webgl');

  switch (model) {
    case 'movenet-lightning':
      return poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet,
        {
          modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
          modelUrl: '/models/movenet-lightning/model.json',
          enableSmoothing: false, // No smoothing for offline extraction
        }
      );

    case 'movenet-thunder':
      return poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet,
        {
          modelType: poseDetection.movenet.modelType.SINGLEPOSE_THUNDER,
          enableSmoothing: false,
        }
      );

    case 'blazepose':
      return poseDetection.createDetector(
        poseDetection.SupportedModels.BlazePose,
        {
          runtime: 'tfjs',
          modelType: 'lite',
          enableSmoothing: false,
        }
      );

    default:
      throw new Error(`Unsupported model: ${model}`);
  }
}

/**
 * Seek video to a specific time and wait for it to be ready
 */
function seekToTime(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (Math.abs(video.currentTime - time) < 0.001) {
      resolve();
      return;
    }

    const SEEK_TIMEOUT_MS = 5000;
    let settled = false;

    const cleanup = () => {
      settled = true;
      clearTimeout(timeoutId);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
    };

    const timeoutId = setTimeout(() => {
      if (!settled) {
        cleanup();
        reject(
          new Error(
            `Video seek timed out at ${time.toFixed(2)}s - possible video corruption`
          )
        );
      }
    }, SEEK_TIMEOUT_MS);

    const onSeeked = () => {
      if (!settled) {
        cleanup();
        resolve();
      }
    };

    const onError = () => {
      if (!settled) {
        cleanup();
        reject(new Error(`Video error while seeking to ${time.toFixed(2)}s`));
      }
    };

    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    video.currentTime = time;
  });
}

/**
 * Estimate video FPS by checking frame timestamps
 */
async function estimateVideoFps(_video: HTMLVideoElement): Promise<number> {
  // Try to get FPS from video metadata (not always available)
  // Default to 30fps which is common for most videos
  const defaultFps = 30;

  // For now, use a reasonable default
  // In a production app, you might want to analyze frame timing
  // or use a library that can read video metadata
  return defaultFps;
}

/**
 * Calculate spine angle from keypoints (angle from vertical)
 * Returns 0 if required keypoints are missing
 * @internal Exported for testing
 */
export function calculateSpineAngle(keypoints: PoseKeypoint[]): number {
  // COCO keypoint indices
  const LEFT_SHOULDER = 5;
  const RIGHT_SHOULDER = 6;
  const LEFT_HIP = 11;
  const RIGHT_HIP = 12;

  const leftShoulder = keypoints[LEFT_SHOULDER];
  const rightShoulder = keypoints[RIGHT_SHOULDER];
  const leftHip = keypoints[LEFT_HIP];
  const rightHip = keypoints[RIGHT_HIP];

  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) {
    return 0;
  }

  // Calculate midpoints
  const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2;
  const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;
  const hipMidX = (leftHip.x + rightHip.x) / 2;
  const hipMidY = (leftHip.y + rightHip.y) / 2;

  // Calculate angle from vertical
  const deltaX = shoulderMidX - hipMidX;
  const deltaY = hipMidY - shoulderMidY; // Inverted for screen coordinates

  return Math.abs((Math.atan2(deltaX, deltaY) * 180) / Math.PI);
}

/**
 * Compute angles from keypoints for a single frame
 * @internal Exported for testing
 */
export function computeAngles(keypoints: PoseKeypoint[]): PrecomputedAngles {
  // Calculate spine angle first
  const spineAngle = calculateSpineAngle(keypoints);

  // Create skeleton with calculated spine angle for other angles
  const skeleton = new Skeleton(keypoints, spineAngle, true);

  return {
    spineAngle,
    armToSpineAngle: skeleton.getArmToSpineAngle(),
    armToVerticalAngle: skeleton.getArmToVerticalAngle(),
    hipAngle: skeleton.getHipAngle(),
    kneeAngle: skeleton.getKneeAngle(),
  };
}

/**
 * Get model display name
 */
export function getModelDisplayName(model: PoseModel): string {
  switch (model) {
    case 'movenet-lightning':
      return 'MoveNet Lightning';
    case 'movenet-thunder':
      return 'MoveNet Thunder';
    case 'blazepose':
      return 'BlazePose';
    default:
      return model;
  }
}

/**
 * Check if a model is supported in the current environment
 */
export async function isModelSupported(model: PoseModel): Promise<boolean> {
  try {
    await tf.setBackend('webgl');
    // BlazePose requires WebGL 2
    if (model === 'blazepose') {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2');
      return gl !== null;
    }
    return true;
  } catch (error) {
    console.error(`Model support check failed for ${model}:`, error);
    return false;
  }
}
