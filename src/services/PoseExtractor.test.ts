/**
 * PoseExtractor Service Tests
 *
 * Tests for utility functions in PoseExtractor.
 * Note: Full integration tests for extractPosesFromVideo require mocking
 * TensorFlow, Web Crypto API, and the DOM.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from 'vitest';
import type { PoseKeypoint } from '../types';
import {
  calculateSpineAngle,
  computeAngles,
  estimateVideoFps,
  extractPosesFromVideo,
  getModelDisplayName,
} from './PoseExtractor';

// The extractPosesFromVideo non-finite-duration path fires before TensorFlow,
// canvas, or the pose detector are touched, so it only needs computeQuickVideoHash
// (Web Crypto) mocked. Spy setup lives inside the extractPosesFromVideo describe.
vi.mock('../utils/videoHash', () => ({
  computeQuickVideoHash: vi.fn().mockResolvedValue('test-hash'),
}));

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
    // Helper to create MediaPipe BlazePose-33 keypoints array with specific positions
    function createKeypoints(positions: {
      leftShoulder?: { x: number; y: number };
      rightShoulder?: { x: number; y: number };
      leftHip?: { x: number; y: number };
      rightHip?: { x: number; y: number };
    }): PoseKeypoint[] {
      // MediaPipe BlazePose-33 keypoint indices: shoulders at 11,12 and hips at 23,24
      const keypoints: PoseKeypoint[] = Array(33)
        .fill(null)
        .map(() => ({ x: 0, y: 0, score: 0.9 }));

      if (positions.leftShoulder) {
        keypoints[11] = { ...positions.leftShoulder, score: 0.9 };
      }
      if (positions.rightShoulder) {
        keypoints[12] = { ...positions.rightShoulder, score: 0.9 };
      }
      if (positions.leftHip) {
        keypoints[23] = { ...positions.leftHip, score: 0.9 };
      }
      if (positions.rightHip) {
        keypoints[24] = { ...positions.rightHip, score: 0.9 };
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
      // Clear shoulder positions (MediaPipe indices 11,12)
      keypoints[11] = undefined as unknown as PoseKeypoint;
      keypoints[12] = undefined as unknown as PoseKeypoint;

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
      // Create keypoints with tilted spine (MediaPipe BlazePose-33)
      const keypoints: PoseKeypoint[] = Array(33)
        .fill(null)
        .map(() => ({ x: 0, y: 0, score: 0.9 }));

      // Set up a tilted pose (MediaPipe indices)
      keypoints[11] = { x: 200, y: 100, score: 0.9 }; // left shoulder
      keypoints[12] = { x: 250, y: 100, score: 0.9 }; // right shoulder
      keypoints[13] = { x: 180, y: 150, score: 0.9 }; // left elbow
      keypoints[14] = { x: 270, y: 150, score: 0.9 }; // right elbow
      keypoints[15] = { x: 160, y: 200, score: 0.9 }; // left wrist
      keypoints[16] = { x: 290, y: 200, score: 0.9 }; // right wrist
      keypoints[23] = { x: 100, y: 200, score: 0.9 }; // left hip
      keypoints[24] = { x: 150, y: 200, score: 0.9 }; // right hip
      keypoints[25] = { x: 100, y: 300, score: 0.9 }; // left knee
      keypoints[26] = { x: 150, y: 300, score: 0.9 }; // right knee
      keypoints[27] = { x: 100, y: 400, score: 0.9 }; // left ankle
      keypoints[28] = { x: 150, y: 400, score: 0.9 }; // right ankle

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
      const keypoints: PoseKeypoint[] = Array(33)
        .fill(null)
        .map(() => ({ x: 0, y: 0, score: 0.9 }));

      // Upright pose - shoulders directly above hips (MediaPipe indices)
      keypoints[11] = { x: 100, y: 100, score: 0.9 }; // left shoulder
      keypoints[12] = { x: 150, y: 100, score: 0.9 }; // right shoulder
      keypoints[23] = { x: 100, y: 200, score: 0.9 }; // left hip
      keypoints[24] = { x: 150, y: 200, score: 0.9 }; // right hip

      const angles = computeAngles(keypoints);

      expect(angles.spineAngle).toBeCloseTo(0, 1);
    });
  });

  describe('estimateVideoFps', () => {
    function makeRvfcVideo(frameIntervalSec: number): HTMLVideoElement {
      let mediaTime = 0;
      const video = {
        muted: false,
        paused: true,
        currentTime: 0,
        play: vi.fn().mockResolvedValue(undefined),
        pause: vi.fn(),
        requestVideoFrameCallback(
          cb: (now: number, meta: { mediaTime: number }) => void
        ) {
          mediaTime += frameIntervalSec;
          queueMicrotask(() => cb(performance.now(), { mediaTime }));
          return 1;
        },
      };
      return video as unknown as HTMLVideoElement;
    }

    it('measures 60fps from mediaTime deltas', async () => {
      expect(await estimateVideoFps(makeRvfcVideo(1 / 60))).toBe(60);
    });

    it('measures 30fps from mediaTime deltas', async () => {
      expect(await estimateVideoFps(makeRvfcVideo(1 / 30))).toBe(30);
    });

    it('measures 24fps from mediaTime deltas', async () => {
      expect(await estimateVideoFps(makeRvfcVideo(1 / 24))).toBe(24);
    });

    it('falls back to 30 when requestVideoFrameCallback is unavailable', async () => {
      const video = {
        muted: false,
        paused: true,
        play: vi.fn().mockResolvedValue(undefined),
        pause: vi.fn(),
      } as unknown as HTMLVideoElement;
      expect(await estimateVideoFps(video)).toBe(30);
    });

    it('falls back to 30 when play() is rejected (autoplay policy)', async () => {
      const video = makeRvfcVideo(1 / 60);
      (video.play as ReturnType<typeof vi.fn>).mockRejectedValue(
        new DOMException('Autoplay blocked', 'NotAllowedError')
      );
      expect(await estimateVideoFps(video)).toBe(30);
    });

    it('clamps a sparse-frame measurement (timelapse) to the fallback instead of fps 0', async () => {
      // 2s between presented frames → naive Math.round(1/2) = 1 (or 0 for
      // longer gaps) → totalFrames = 0 downstream → empty extraction with
      // no error. Must fall back instead.
      expect(await estimateVideoFps(makeRvfcVideo(2.0))).toBe(30);
    });

    it('clamps a jittery sub-ms measurement to the fallback instead of fps 1000', async () => {
      // A 1ms median delta would claim fps=1000 and balloon totalFrames
      // ~33x, grinding extraction through per-millisecond seeks.
      expect(await estimateVideoFps(makeRvfcVideo(0.001))).toBe(30);
    });

    it('logs when a fallback replaces a measurement', async () => {
      const warnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      await estimateVideoFps(makeRvfcVideo(2.0));
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('fps'),
        expect.anything()
      );
      warnSpy.mockRestore();
    });

    it('resolves with the fallback on sampling timeout and stops re-registering', async () => {
      vi.useFakeTimers();
      try {
        // Fires only 3 frames (fewer than the 12 samples needed), then
        // goes silent — models a decode stall mid-sampling.
        let fires = 0;
        const cbs: Array<(now: number, meta: { mediaTime: number }) => void> =
          [];
        const rvfc = vi.fn(
          (cb: (now: number, meta: { mediaTime: number }) => void) => {
            cbs.push(cb);
            fires++;
            if (fires <= 3) {
              queueMicrotask(() =>
                cb(performance.now(), { mediaTime: fires / 30 })
              );
            }
            return 1;
          }
        );
        const video = {
          muted: false,
          paused: true,
          currentTime: 0,
          play: vi.fn().mockResolvedValue(undefined),
          pause: vi.fn(),
          requestVideoFrameCallback: rvfc,
        } as unknown as HTMLVideoElement;

        const fpsPromise = estimateVideoFps(video);
        await vi.advanceTimersByTimeAsync(2000);
        expect(await fpsPromise).toBe(30);

        // A frame arriving AFTER the timeout must not re-register the
        // callback — the sampler is done with this video element.
        const registrationsAtTimeout = rvfc.mock.calls.length;
        cbs[cbs.length - 1]?.(performance.now(), { mediaTime: 99 });
        expect(rvfc.mock.calls.length).toBe(registrationsAtTimeout);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('extractPosesFromVideo', () => {
    // The duration-validation guard fires right after loadedmetadata, before
    // estimateVideoFps, the pose detector, or any canvas work. So the
    // non-finite-duration path can be unit-tested with a small mock surface: a
    // real jsdom <video> (so appendChild/remove work) with `duration` forced
    // via Object.defineProperty, plus the module-level computeQuickVideoHash
    // mock at the top of this file. TensorFlow is never reached on this path.
    let capturedVideo: HTMLVideoElement | null = null;
    let playSpy: MockInstance<() => Promise<void>> | undefined;
    let realCreateElement: (tag: string) => HTMLElement;

    beforeEach(() => {
      realCreateElement = document.createElement.bind(document) as (
        tag: string
      ) => HTMLElement;
      capturedVideo = null;
      playSpy = undefined;
      vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
        const el = realCreateElement(tag);
        if (tag.toLowerCase() === 'video') {
          const v = el as HTMLVideoElement;
          capturedVideo = v;
          playSpy = vi.spyOn(v, 'play').mockResolvedValue(undefined as never);
        }
        return el;
      }) as typeof document.createElement);
    });

    afterEach(() => {
      vi.restoreAllMocks();
      capturedVideo = null;
      playSpy = undefined;
    });

    // Drive extraction past the loadedmetadata gate with a forced duration.
    // Microtask ordering: the mock computeQuickVideoHash resolves first (the
    // function continues, creates the video via our spy, and registers
    // onloadedmetadata), then our queued microtask forces duration and fires
    // the handler to unblock the metadata wait.
    async function driveWithDuration(duration: number): Promise<unknown> {
      const file = new File(['x'], 'test.webm', { type: 'video/webm' });
      const promise = extractPosesFromVideo(file, { model: 'blazepose' });
      queueMicrotask(() => {
        if (!capturedVideo) return;
        Object.defineProperty(capturedVideo, 'duration', {
          value: duration,
          configurable: true,
          writable: true,
        });
        const handler = capturedVideo.onloadedmetadata;
        if (handler) {
          handler.call(capturedVideo, new Event('loadedmetadata'));
        } else {
          capturedVideo.dispatchEvent(new Event('loadedmetadata'));
        }
      });
      return promise;
    }

    it('rejects when video.duration is Infinity instead of hanging the loop', async () => {
      await expect(driveWithDuration(Infinity)).rejects.toThrow(
        'Cannot extract poses: video duration is Infinity'
      );
    });

    it('rejects when video.duration is NaN', async () => {
      await expect(driveWithDuration(NaN)).rejects.toThrow(
        'Cannot extract poses: video duration is NaN'
      );
    });

    it('fails fast before running fps estimation (play is never called)', async () => {
      await expect(driveWithDuration(Infinity)).rejects.toThrow();
      // estimateVideoFps is the only caller of video.play() in the extraction
      // path; if it were reached, the guard did not fire first.
      if (!playSpy) {
        throw new Error('play spy was not installed on the video element');
      }
      expect(playSpy).not.toHaveBeenCalled();
    });
  });
});
