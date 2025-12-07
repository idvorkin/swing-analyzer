/**
 * PoseExtractor Service
 *
 * Extracts pose data from video files and creates PoseTrack files.
 * Runs pose detection on each frame and stores results for later analysis.
 */

import * as poseDetection from '@tensorflow-models/pose-detection';
import '@tensorflow/tfjs-backend-webgl';
import * as tf from '@tensorflow/tfjs-core';
import { BUILD_TIMESTAMP, GIT_SHA_SHORT } from '../generated_version';
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
import {
  calculateStableCropRegion,
  isLandscapeVideo,
} from '../utils/videoCrop';
import { createPoseTrackMetadata } from './PoseTrackService';

/**
 * Model version strings for metadata
 */
const MODEL_VERSIONS: Record<PoseModel, string> = {
  blazepose: '1.0.0',
};

/**
 * Capture a person-centered portrait thumbnail from video frame
 *
 * Uses keypoints to find the person's bounding box, then crops a portrait
 * region centered on them. Falls back to center crop if no keypoints.
 */
function capturePersonCenteredThumbnail(
  sourceCanvas: HTMLCanvasElement,
  thumbnailCtx: CanvasRenderingContext2D,
  keypoints: Array<{ x: number; y: number; score?: number }>,
  videoWidth: number,
  videoHeight: number,
  thumbWidth: number,
  thumbHeight: number
): ImageData {
  // Calculate the source crop region (portrait aspect ratio)
  const targetAspect = thumbWidth / thumbHeight; // 3:4 = 0.75
  let cropWidth: number;
  let cropHeight: number;
  let cropX: number;
  let cropY: number;

  // Find person center from keypoints
  let personCenterX = videoWidth / 2;
  let personCenterY = videoHeight / 2;

  // Filter to confident keypoints (score > 0.3)
  const confidentKeypoints = keypoints.filter((kp) => (kp.score ?? 0) > 0.3);

  if (confidentKeypoints.length > 0) {
    // Calculate bounding box of confident keypoints
    let minX = Infinity,
      maxX = -Infinity;
    let minY = Infinity,
      maxY = -Infinity;

    for (const kp of confidentKeypoints) {
      minX = Math.min(minX, kp.x);
      maxX = Math.max(maxX, kp.x);
      minY = Math.min(minY, kp.y);
      maxY = Math.max(maxY, kp.y);
    }

    // Center of person
    personCenterX = (minX + maxX) / 2;
    personCenterY = (minY + maxY) / 2;

    // Person dimensions with padding (ensure minimum of 1px to avoid division by zero)
    const personWidth = Math.max((maxX - minX) * 1.4, 1); // 40% padding
    const personHeight = Math.max((maxY - minY) * 1.3, 1); // 30% padding

    // Determine crop size to fit person while maintaining aspect ratio
    if (personWidth / personHeight > targetAspect) {
      // Person is wider than target aspect - fit width
      cropWidth = personWidth;
      cropHeight = cropWidth / targetAspect;
    } else {
      // Person is taller than target aspect - fit height
      cropHeight = personHeight;
      cropWidth = cropHeight * targetAspect;
    }

    // Ensure minimum crop size (at least 40% of frame)
    const minCropHeight = videoHeight * 0.4;
    if (cropHeight < minCropHeight) {
      cropHeight = minCropHeight;
      cropWidth = cropHeight * targetAspect;
    }
  } else {
    // No keypoints - use center crop with portrait aspect
    cropHeight = videoHeight * 0.85;
    cropWidth = cropHeight * targetAspect;
  }

  // Ensure crop doesn't exceed video bounds while maintaining aspect ratio
  if (cropWidth > videoWidth) {
    cropWidth = videoWidth;
    cropHeight = cropWidth / targetAspect;
  }
  if (cropHeight > videoHeight) {
    cropHeight = videoHeight;
    cropWidth = cropHeight * targetAspect;
  }

  // Center crop on person, but clamp to video bounds
  cropX = Math.max(0, Math.min(personCenterX - cropWidth / 2, videoWidth - cropWidth));
  cropY = Math.max(0, Math.min(personCenterY - cropHeight / 2, videoHeight - cropHeight));

  // Draw cropped region to thumbnail
  thumbnailCtx.drawImage(
    sourceCanvas,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    thumbWidth,
    thumbHeight
  );

  return thumbnailCtx.getImageData(0, 0, thumbWidth, thumbHeight);
}

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

    // Create thumbnail canvas for filmstrip (portrait orientation, person-centered)
    // Portrait aspect ratio 3:4 for better person framing
    const THUMBNAIL_WIDTH = 120;
    const THUMBNAIL_HEIGHT = 160;
    const thumbnailCanvas = document.createElement('canvas');
    thumbnailCanvas.width = THUMBNAIL_WIDTH;
    thumbnailCanvas.height = THUMBNAIL_HEIGHT;
    const thumbnailCtx = thumbnailCanvas.getContext('2d', { willReadFrequently: true });
    if (!thumbnailCtx) {
      throw new Error('Failed to get thumbnail canvas 2d context');
    }

    // Extract frames
    const frames: PoseTrackFrame[] = [];
    let frameIndex = 0;
    const frameInterval = 1 / fps;

    // Seek to start
    video.currentTime = 0;

    while (frameIndex < totalFrames) {
      // Check for cancellation
      if (options.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      // Always seek and capture video frames (even in mock mode)
      // Only the ML detector is mocked - video frame capture must run for filmstrip thumbnails
      await seekToTime(video, frameIndex * frameInterval);
      ctx.drawImage(video, 0, 0, videoWidth, videoHeight);

      // Detect pose (mock detector returns fixture data, real detector runs ML inference)
      const poses = await detector.estimatePoses(canvas);

      // Capture person-centered portrait thumbnail for filmstrip
      const frameImage = capturePersonCenteredThumbnail(
        canvas,
        thumbnailCtx,
        poses.length > 0 ? poses[0].keypoints : [],
        videoWidth,
        videoHeight,
        THUMBNAIL_WIDTH,
        THUMBNAIL_HEIGHT
      );

      // Get keypoints and normalize to COCO format if using BlazePose
      let keypoints: PoseKeypoint[] = [];
      if (poses.length > 0) {
        const rawKeypoints = poses[0].keypoints as PoseKeypoint[];
        // BlazePose returns 33 keypoints, normalize to COCO 17-keypoint format
        keypoints = normalizeToCocoFormat(rawKeypoints);
      }

      // Get video time from actual video position (works in both mock and real modes)
      const videoTime = video.currentTime;

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

      // Check video.currentTime for early exit (works in both mock and real modes)
      if (video.currentTime + frameInterval >= duration) {
        break;
      }
    }

    // Calculate crop region for landscape videos
    let cropRegion = undefined;
    if (isLandscapeVideo(videoWidth, videoHeight)) {
      // Use first 5 seconds of frames for crop detection
      const detectionDuration = Math.min(5, duration);
      const detectionFrameCount = Math.ceil(detectionDuration * fps);
      const detectionFrames = frames.slice(0, detectionFrameCount);

      cropRegion = calculateStableCropRegion(
        detectionFrames,
        videoWidth,
        videoHeight
      ) ?? undefined;

      if (cropRegion) {
        console.log(
          `[PoseExtractor] Auto-crop detected for landscape video: ${cropRegion.width}x${cropRegion.height} at (${cropRegion.x}, ${cropRegion.y})`
        );
      }
    }

    // Create pose track metadata
    const metadata = createPoseTrackMetadata({
      model: options.model,
      modelVersion: MODEL_VERSIONS[options.model],
      modelVariant: options.modelVariant,
      buildSha: GIT_SHA_SHORT,
      buildTimestamp: BUILD_TIMESTAMP,
      sourceVideoHash: videoHash,
      sourceVideoName: videoFile.name,
      sourceVideoDuration: duration,
      frameCount: frames.length,
      fps,
      videoWidth,
      videoHeight,
      cropRegion,
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
 * Create a pose detector for the specified model
 * In test mode, uses mock detector if configured via testSetup
 */
async function createPoseDetector(
  _model: PoseModel
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

  // BlazePose is the only supported model
  return poseDetection.createDetector(
    poseDetection.SupportedModels.BlazePose,
    {
      runtime: 'tfjs',
      modelType: 'lite',
      enableSmoothing: false,
    }
  );
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
export function getModelDisplayName(_model: PoseModel): string {
  return 'BlazePose';
}

/**
 * Check if a model is supported in the current environment
 */
export async function isModelSupported(_model: PoseModel): Promise<boolean> {
  try {
    await tf.setBackend('webgl');
    // BlazePose requires WebGL 2
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    return gl !== null;
  } catch (error) {
    console.error('Model support check failed:', error);
    return false;
  }
}
