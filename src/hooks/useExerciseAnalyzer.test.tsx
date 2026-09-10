/**
 * useExerciseAnalyzer — HUD flush on playback stop
 *
 * Regression coverage for the bug introduced in ddde777: the textual HUD
 * (angle/speed readouts) is throttled to ~10fps during playback, but pausing
 * or ending playback did not flush a final write for the displayed frame. As a
 * result the numbers could lag the frame-synchronous canvas skeleton overlay
 * by up to HUD_TEXT_INTERVAL_MS (≤3 frames at 30fps). The fix adds a final
 * unthrottled flush in handlePause / handleEnded (mirroring what handleSeeked
 * already does).
 *
 * These tests mount the real hook behind a thin harness and drive the video
 * element's media events directly. Heavy collaborators (InputSession, the
 * pipeline, SkeletonRenderer, pose-track fetch, thumbnail queue) are stubbed
 * so the hook mounts deterministically; the session's `getSkeletonAtTime` is
 * scripted so each video time yields a unique, recognizable skeleton.
 */

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useExerciseAnalyzer } from './useExerciseAnalyzer';

// vi.mock factories are hoisted above imports, so the shared stubs they hand
// out must be created via vi.hoisted to be available at factory-eval time.
const mocks = vi.hoisted(() => ({
  createPipeline: vi.fn(),
  InputSession: vi.fn(),
  SkeletonRenderer: vi.fn(),
  ThumbnailQueue: vi.fn(),
  fetchAndCacheBundledPoseTrack: vi.fn(),
  recordExtractionComplete: vi.fn(),
  recordExtractionStart: vi.fn(),
  recordPlaybackPause: vi.fn(),
  recordPlaybackStart: vi.fn(),
  recordRepDetected: vi.fn(),
  recordSkeletonProcessingComplete: vi.fn(),
  recordVideoLoad: vi.fn(),
  sessionRecorder: {
    setPipelineStateGetter: vi.fn(),
    setPoseTrackProvider: vi.fn(),
  },
}));

vi.mock('../pipeline/PipelineFactory', () => ({
  createPipeline: mocks.createPipeline,
}));
vi.mock('../pipeline/InputSession', () => ({
  InputSession: mocks.InputSession,
}));
vi.mock('../services/SessionRecorder', () => ({
  recordExtractionComplete: mocks.recordExtractionComplete,
  recordExtractionStart: mocks.recordExtractionStart,
  recordPlaybackPause: mocks.recordPlaybackPause,
  recordPlaybackStart: mocks.recordPlaybackStart,
  recordRepDetected: mocks.recordRepDetected,
  recordSkeletonProcessingComplete: mocks.recordSkeletonProcessingComplete,
  recordVideoLoad: mocks.recordVideoLoad,
  sessionRecorder: mocks.sessionRecorder,
}));
vi.mock('../services/PoseTrackService', () => ({
  fetchAndCacheBundledPoseTrack: mocks.fetchAndCacheBundledPoseTrack,
}));
vi.mock('../viewmodels/SkeletonRenderer', () => ({
  SkeletonRenderer: mocks.SkeletonRenderer,
}));
vi.mock('../services/ThumbnailGenerator', () => ({
  ThumbnailQueue: mocks.ThumbnailQueue,
}));
// These are shared utility modules (other transitively-imported modules read
// their other exports, e.g. DEFAULT_VIDEO_HEIGHT), so partial-mock them:
// spread the real module and override only the function under test.
vi.mock('../utils/depthCalculation', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../utils/depthCalculation')>();
  return { ...actual, calculateDepthFromKeypoints: vi.fn(() => 0) };
});
vi.mock('../utils/videoCrop', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/videoCrop')>();
  return { ...actual, calculateStableCropRegion: vi.fn(() => null) };
});
vi.mock('./useKeyboardNavigation', () => ({
  useKeyboardNavigation: () => ({
    isFullscreen: false,
    navigateToPreviousRep: vi.fn(),
    navigateToNextRep: vi.fn(),
  }),
}));

// Harness renders the hook and mirrors the HUD-relevant return values into the
// DOM so assertions can read them. The <video>/<canvas> are real jsdom elements
// so the hook attaches its media listeners for real and we can drive them via
// dispatchEvent.
function TestHarness() {
  const a = useExerciseAnalyzer();
  return (
    <>
      {/* biome-ignore lint/a11y/useMediaCaption: bare jsdom <video> in a unit-test harness; no audio */}
      <video ref={a.videoRef} />
      <canvas ref={a.canvasRef} />
      <div data-testid="spine">{String(a.currentAngles.spineAngle)}</div>
      <div data-testid="arm">{String(a.currentAngles.armAngle)}</div>
      <div data-testid="has-poses">
        {a.hasPosesForCurrentFrame ? 'yes' : 'no'}
      </div>
    </>
  );
}

// Build a scripted session: getSkeletonAtTime(t) yields a skeleton whose HUD
// values encode t (spine = 1000 + t, arm = 2000 + t) so a flush for the CURRENT
// frame is unambiguously distinguishable from a stale, throttled write.
const makeSession = () => ({
  state$: { subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })) },
  skeletons$: { subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })) },
  extractionProgress$: { subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })) },
  getSkeletonAtTime: vi.fn<(t: number) => unknown>(),
  getVideoFileSource: vi.fn(() => null),
  startVideoFile: vi.fn(() => Promise.resolve()),
  stop: vi.fn(),
  dispose: vi.fn(),
});
type MockSession = ReturnType<typeof makeSession>;

const makePipeline = () => ({
  getThumbnailEvents: vi.fn(() => ({
    subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
  })),
  getErrorEvents: vi.fn(() => ({
    subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
  })),
  getExerciseDetectionEvents: vi.fn(() => ({
    subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
  })),
  getFormAnalyzer: vi.fn(() => null),
  getRepCount: vi.fn(() => 0),
  getLatestSkeleton: vi.fn(() => null),
  setCropRegion: vi.fn(),
  setCropEnabled: vi.fn(),
  reset: vi.fn(),
  processSkeletonEvent: vi.fn(() => ({ ok: true as const, value: 0 })),
  setExerciseType: vi.fn(),
  isExerciseDetectionLocked: vi.fn(() => false),
});
type MockPipeline = ReturnType<typeof makePipeline>;

const skeletonAt = (t: number) => ({
  skeleton: {
    getSpineAngle: () => 1000 + t,
    getArmToVerticalAngle: () => 2000 + t,
    getKneeAngleForSide: () => 180,
    getHipAngleForSide: () => 180,
    getKeypoints: () => [],
  },
  poseEvent: { frameEvent: {} },
  precomputedAngles: { wristSpeed: 5 },
});

describe('useExerciseAnalyzer — HUD flush on playback stop', () => {
  let mockSession: MockSession;
  let mockPipeline: MockPipeline;
  let video: HTMLVideoElement;
  // Captured requestVideoFrameCallback handler (the throttled render loop).
  let rvfcCb: ((now: number, metadata: { mediaTime: number }) => void) | null =
    null;
  let rvfcId = 0;

  beforeEach(() => {
    mockSession = makeSession();
    mockPipeline = makePipeline();
    mocks.createPipeline.mockReturnValue(mockPipeline);
    // Constructors must be invoked with `new`, so use `function` (not arrow)
    // implementations — vitest rejects newable mocks whose impl isn't a
    // function/class. Returning an object from the impl makes `new` yield it.
    // biome-ignore lint/complexity/useArrowFunction: arrow impls cannot be invoked with `new`
    mocks.InputSession.mockImplementation(function () {
      return mockSession;
    });
    // biome-ignore lint/complexity/useArrowFunction: arrow impls cannot be invoked with `new`
    mocks.SkeletonRenderer.mockImplementation(function () {
      return { renderSkeleton: vi.fn() };
    });
    // biome-ignore lint/complexity/useArrowFunction: arrow impls cannot be invoked with `new`
    mocks.ThumbnailQueue.mockImplementation(function () {
      return { enqueue: vi.fn(), setVideoSource: vi.fn(), dispose: vi.fn() };
    });

    render(<TestHarness />);
    video = document.querySelector('video') as HTMLVideoElement;

    // jsdom has no requestVideoFrameCallback; install one that lets the test
    // invoke the registered render loop synchronously.
    rvfcCb = null;
    rvfcId = 0;
    video.requestVideoFrameCallback = (cb: VideoFrameRequestCallback) => {
      rvfcCb = cb as unknown as typeof rvfcCb;
      return ++rvfcId;
    };
    video.cancelVideoFrameCallback = vi.fn<(id: number) => void>();
    // Shadow the prototype's currentTime accessor with a writable data prop.
    Object.defineProperty(video, 'currentTime', {
      value: 0,
      writable: true,
      configurable: true,
    });
    video.play = vi.fn<() => Promise<void>>(() => Promise.resolve());
    video.pause = vi.fn<() => void>();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  // Drive one rVFC presentation. Wrapped in act so the queued setState flushes.
  const presentFrame = async (now: number, mediaTime: number) => {
    await act(async () => {
      rvfcCb?.(now, { mediaTime });
    });
  };

  it('flushes the paused frame to the HUD, overriding the throttled stale value', async () => {
    mockSession.getSkeletonAtTime.mockImplementation((t: number) =>
      skeletonAt(t)
    );

    // Start playback: isPlayingRef on, requestVideoFrameCallback registered.
    await act(async () => {
      video.dispatchEvent(new Event('play'));
    });

    // Frame at now=100ms (mediaTime=1): throttle window open (100-0>=100),
    // so the HUD writes frame t=1 -> spine=1001.
    await presentFrame(100, 1);
    expect(screen.getByTestId('spine')).toHaveTextContent('1001');

    // Frame at now=150ms (mediaTime=7): throttle window closed (150-100<100),
    // so the skeleton renders for t=7 but the HUD text is NOT written — the
    // displayed frame (t=7) and the HUD (t=1) now disagree (the bug condition).
    await presentFrame(150, 7);
    expect(screen.getByTestId('spine')).toHaveTextContent('1001');

    // The user pauses on the frame currently displayed (t=7). A plain pause
    // does NOT fire 'seeked', so without a flush the HUD would stay stale.
    video.currentTime = 7;
    await act(async () => {
      video.dispatchEvent(new Event('pause'));
    });

    // FIX: handlePause flushes the HUD for video.currentTime.
    expect(screen.getByTestId('spine')).toHaveTextContent('1007');
    expect(screen.getByTestId('arm')).toHaveTextContent('2007');
    expect(mocks.recordPlaybackPause).toHaveBeenCalledWith({ videoTime: 7 });
  });

  it('flushes the final frame to the HUD when the video ends', async () => {
    mockSession.getSkeletonAtTime.mockImplementation((t: number) =>
      skeletonAt(t)
    );
    video.currentTime = 9;
    await act(async () => {
      video.dispatchEvent(new Event('ended'));
    });
    expect(screen.getByTestId('spine')).toHaveTextContent('1009');
    expect(screen.getByTestId('arm')).toHaveTextContent('2009');
  });

  it('still flushes the HUD on seek (refactor preserved seek behavior)', async () => {
    mockSession.getSkeletonAtTime.mockImplementation((t: number) =>
      skeletonAt(t)
    );
    video.currentTime = 3;
    await act(async () => {
      video.dispatchEvent(new Event('seeked'));
    });
    expect(screen.getByTestId('spine')).toHaveTextContent('1003');
    expect(screen.getByTestId('arm')).toHaveTextContent('2003');
  });

  it('marks poses absent and leaves the HUD untouched when no skeleton exists at the paused frame', async () => {
    // First write a value at t=2 via seek (skeleton exists).
    mockSession.getSkeletonAtTime.mockImplementation((t: number) =>
      skeletonAt(t)
    );
    video.currentTime = 2;
    await act(async () => {
      video.dispatchEvent(new Event('seeked'));
    });
    expect(screen.getByTestId('spine')).toHaveTextContent('1002');
    expect(screen.getByTestId('has-poses')).toHaveTextContent('yes');

    // Now pause at a frame with NO skeleton: the flush must not touch the HUD
    // (mirroring handleSeeked) and must report poses absent.
    mockSession.getSkeletonAtTime.mockReturnValue({
      skeleton: null,
      poseEvent: { frameEvent: {} },
    });
    video.currentTime = 5;
    await act(async () => {
      video.dispatchEvent(new Event('pause'));
    });
    expect(screen.getByTestId('has-poses')).toHaveTextContent('no');
    // HUD value is unchanged from the last successful flush.
    expect(screen.getByTestId('spine')).toHaveTextContent('1002');
  });
});
