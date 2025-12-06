/**
 * useVideoControls Hook Tests
 *
 * Tests for video control logic extracted from useSwingAnalyzer.
 * Note: Full integration tests require mocking HTMLVideoElement, Canvas API,
 * and TensorFlow. These tests cover the core control flow.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVideoControls } from './useVideoControls';
import type { AppState } from '../types';
import type { VideoFrameAcquisition } from '../pipeline/VideoFrameAcquisition';
import type { SkeletonRenderer } from '../viewmodels/SkeletonRenderer';

// Mock the session recorder
vi.mock('../services/SessionRecorder', () => ({
  recordPlaybackStart: vi.fn(),
  recordPlaybackPause: vi.fn(),
  recordPlaybackStop: vi.fn(),
  recordVideoLoad: vi.fn(),
}));

// Mock the pipeline factory
vi.mock('../pipeline/PipelineFactory', () => ({
  createSkeletonTransformer: vi.fn(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    transformToSkeleton: vi.fn(() => ({
      subscribe: vi.fn(),
    })),
  })),
}));

// Mock the settings
vi.mock('../components/settings/SettingsTab', () => ({
  getSavedModelPreference: vi.fn(() => 'movenet-lightning'),
  getSavedBlazePoseVariant: vi.fn(() => 'lite'),
}));

// Mock fetch for video loading
global.fetch = vi.fn();

// Mock URL.createObjectURL which is not available in Node
global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = vi.fn();

describe('useVideoControls', () => {
  let mockVideoElement: Partial<HTMLVideoElement>;
  let mockCanvasElement: Partial<HTMLCanvasElement>;
  let mockFrameAcquisition: Partial<VideoFrameAcquisition>;
  let mockSkeletonRenderer: Partial<SkeletonRenderer>;
  let mockAppState: AppState;
  let setStatus: ReturnType<typeof vi.fn>;
  let setSpineAngle: ReturnType<typeof vi.fn>;
  let setArmToSpineAngle: ReturnType<typeof vi.fn>;
  let setAppState: ReturnType<typeof vi.fn>;
  let setDisplayMode: ReturnType<typeof vi.fn>;
  let resetPipeline: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Create mock video element
    mockVideoElement = {
      paused: true,
      currentTime: 0,
      duration: 10,
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      style: {} as CSSStyleDeclaration,
    };

    // Create mock canvas element
    mockCanvasElement = {
      style: { display: 'block' } as CSSStyleDeclaration,
    };

    // Create mock frame acquisition
    mockFrameAcquisition = {
      loadVideoFromURL: vi.fn().mockResolvedValue(undefined),
      stopCamera: vi.fn().mockResolvedValue(undefined),
      startCamera: vi.fn().mockResolvedValue(undefined),
    };

    // Create mock skeleton renderer
    mockSkeletonRenderer = {
      renderSkeleton: vi.fn(),
      setBodyPartDisplay: vi.fn(),
      setDebugMode: vi.fn(),
    };

    // Create mock app state
    mockAppState = {
      isModelLoaded: true,
      isProcessing: false,
      usingCamera: false,
      cameraMode: 'environment',
      displayMode: 'both',
      repCounter: {
        count: 0,
        isConnect: false,
        lastConnectState: false,
        connectThreshold: 45,
      },
      showBodyParts: true,
      bodyPartDisplayTime: 0.5,
      currentRepIndex: 0,
    };

    // Create mock setters
    setStatus = vi.fn();
    setSpineAngle = vi.fn();
    setArmToSpineAngle = vi.fn();
    setAppState = vi.fn();
    setDisplayMode = vi.fn();
    resetPipeline = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('togglePlayPause', () => {
    it('plays video when paused', async () => {
      const { result } = renderHook(() =>
        useVideoControls({
          videoRef: { current: mockVideoElement as HTMLVideoElement },
          canvasRef: { current: mockCanvasElement as HTMLCanvasElement },
          frameAcquisitionRef: {
            current: mockFrameAcquisition as VideoFrameAcquisition,
          },
          skeletonRendererRef: {
            current: mockSkeletonRenderer as SkeletonRenderer,
          },
          appState: mockAppState,
          setStatus,
          setSpineAngle,
          setArmToSpineAngle,
          setAppState,
          setDisplayMode,
          resetPipeline,
        })
      );

      await act(async () => {
        result.current.togglePlayPause();
      });

      expect(mockVideoElement.play).toHaveBeenCalled();
    });

    it('pauses video when playing', async () => {
      (mockVideoElement as { paused: boolean }).paused = false;

      const { result } = renderHook(() =>
        useVideoControls({
          videoRef: { current: mockVideoElement as HTMLVideoElement },
          canvasRef: { current: mockCanvasElement as HTMLCanvasElement },
          frameAcquisitionRef: {
            current: mockFrameAcquisition as VideoFrameAcquisition,
          },
          skeletonRendererRef: {
            current: mockSkeletonRenderer as SkeletonRenderer,
          },
          appState: mockAppState,
          setStatus,
          setSpineAngle,
          setArmToSpineAngle,
          setAppState,
          setDisplayMode,
          resetPipeline,
        })
      );

      await act(async () => {
        result.current.togglePlayPause();
      });

      expect(mockVideoElement.pause).toHaveBeenCalled();
    });

    it('handles play errors gracefully', async () => {
      const playError = new Error('Play failed');
      mockVideoElement.play = vi.fn().mockRejectedValue(playError);

      const { result } = renderHook(() =>
        useVideoControls({
          videoRef: { current: mockVideoElement as HTMLVideoElement },
          canvasRef: { current: mockCanvasElement as HTMLCanvasElement },
          frameAcquisitionRef: {
            current: mockFrameAcquisition as VideoFrameAcquisition,
          },
          skeletonRendererRef: {
            current: mockSkeletonRenderer as SkeletonRenderer,
          },
          appState: mockAppState,
          setStatus,
          setSpineAngle,
          setArmToSpineAngle,
          setAppState,
          setDisplayMode,
          resetPipeline,
        })
      );

      await act(async () => {
        result.current.togglePlayPause();
      });

      expect(setStatus).toHaveBeenCalledWith('Error: Could not play video. Please try again.');
    });

    it('does nothing when video ref is null', async () => {
      const { result } = renderHook(() =>
        useVideoControls({
          videoRef: { current: null },
          canvasRef: { current: mockCanvasElement as HTMLCanvasElement },
          frameAcquisitionRef: {
            current: mockFrameAcquisition as VideoFrameAcquisition,
          },
          skeletonRendererRef: {
            current: mockSkeletonRenderer as SkeletonRenderer,
          },
          appState: mockAppState,
          setStatus,
          setSpineAngle,
          setArmToSpineAngle,
          setAppState,
          setDisplayMode,
          resetPipeline,
        })
      );

      await act(async () => {
        result.current.togglePlayPause();
      });

      expect(mockVideoElement.play).not.toHaveBeenCalled();
      expect(mockVideoElement.pause).not.toHaveBeenCalled();
    });
  });

  describe('nextFrame', () => {
    it('advances video by one frame and pauses', () => {
      mockVideoElement.currentTime = 5;

      const { result } = renderHook(() =>
        useVideoControls({
          videoRef: { current: mockVideoElement as HTMLVideoElement },
          canvasRef: { current: mockCanvasElement as HTMLCanvasElement },
          frameAcquisitionRef: {
            current: mockFrameAcquisition as VideoFrameAcquisition,
          },
          skeletonRendererRef: {
            current: mockSkeletonRenderer as SkeletonRenderer,
          },
          appState: mockAppState,
          setStatus,
          setSpineAngle,
          setArmToSpineAngle,
          setAppState,
          setDisplayMode,
          resetPipeline,
        })
      );

      act(() => {
        result.current.nextFrame();
      });

      expect(mockVideoElement.pause).toHaveBeenCalled();
      expect(mockVideoElement.currentTime).toBeCloseTo(5 + 1 / 30, 5);
    });

    it('does not exceed video duration', () => {
      mockVideoElement.currentTime = 9.98; // Close to end
      (mockVideoElement as { duration: number }).duration = 10;

      const { result } = renderHook(() =>
        useVideoControls({
          videoRef: { current: mockVideoElement as HTMLVideoElement },
          canvasRef: { current: mockCanvasElement as HTMLCanvasElement },
          frameAcquisitionRef: {
            current: mockFrameAcquisition as VideoFrameAcquisition,
          },
          skeletonRendererRef: {
            current: mockSkeletonRenderer as SkeletonRenderer,
          },
          appState: mockAppState,
          setStatus,
          setSpineAngle,
          setArmToSpineAngle,
          setAppState,
          setDisplayMode,
          resetPipeline,
        })
      );

      act(() => {
        result.current.nextFrame();
      });

      expect(mockVideoElement.currentTime).toBeLessThanOrEqual(10);
    });

    it('adds seeked event listener for frame processing', () => {
      const { result } = renderHook(() =>
        useVideoControls({
          videoRef: { current: mockVideoElement as HTMLVideoElement },
          canvasRef: { current: mockCanvasElement as HTMLCanvasElement },
          frameAcquisitionRef: {
            current: mockFrameAcquisition as VideoFrameAcquisition,
          },
          skeletonRendererRef: {
            current: mockSkeletonRenderer as SkeletonRenderer,
          },
          appState: mockAppState,
          setStatus,
          setSpineAngle,
          setArmToSpineAngle,
          setAppState,
          setDisplayMode,
          resetPipeline,
        })
      );

      act(() => {
        result.current.nextFrame();
      });

      expect(mockVideoElement.addEventListener).toHaveBeenCalledWith(
        'seeked',
        expect.any(Function),
        { once: true }
      );
    });
  });

  describe('previousFrame', () => {
    it('rewinds video by one frame and pauses', () => {
      mockVideoElement.currentTime = 5;

      const { result } = renderHook(() =>
        useVideoControls({
          videoRef: { current: mockVideoElement as HTMLVideoElement },
          canvasRef: { current: mockCanvasElement as HTMLCanvasElement },
          frameAcquisitionRef: {
            current: mockFrameAcquisition as VideoFrameAcquisition,
          },
          skeletonRendererRef: {
            current: mockSkeletonRenderer as SkeletonRenderer,
          },
          appState: mockAppState,
          setStatus,
          setSpineAngle,
          setArmToSpineAngle,
          setAppState,
          setDisplayMode,
          resetPipeline,
        })
      );

      act(() => {
        result.current.previousFrame();
      });

      expect(mockVideoElement.pause).toHaveBeenCalled();
      expect(mockVideoElement.currentTime).toBeCloseTo(5 - 1 / 30, 5);
    });

    it('does not go below zero', () => {
      mockVideoElement.currentTime = 0.01; // Very close to start

      const { result } = renderHook(() =>
        useVideoControls({
          videoRef: { current: mockVideoElement as HTMLVideoElement },
          canvasRef: { current: mockCanvasElement as HTMLCanvasElement },
          frameAcquisitionRef: {
            current: mockFrameAcquisition as VideoFrameAcquisition,
          },
          skeletonRendererRef: {
            current: mockSkeletonRenderer as SkeletonRenderer,
          },
          appState: mockAppState,
          setStatus,
          setSpineAngle,
          setArmToSpineAngle,
          setAppState,
          setDisplayMode,
          resetPipeline,
        })
      );

      act(() => {
        result.current.previousFrame();
      });

      expect(mockVideoElement.currentTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('resetVideoAndState', () => {
    it('pauses and rewinds video', () => {
      mockVideoElement.currentTime = 5;

      const { result } = renderHook(() =>
        useVideoControls({
          videoRef: { current: mockVideoElement as HTMLVideoElement },
          canvasRef: { current: mockCanvasElement as HTMLCanvasElement },
          frameAcquisitionRef: {
            current: mockFrameAcquisition as VideoFrameAcquisition,
          },
          skeletonRendererRef: {
            current: mockSkeletonRenderer as SkeletonRenderer,
          },
          appState: mockAppState,
          setStatus,
          setSpineAngle,
          setArmToSpineAngle,
          setAppState,
          setDisplayMode,
          resetPipeline,
        })
      );

      act(() => {
        result.current.resetVideoAndState();
      });

      expect(mockVideoElement.pause).toHaveBeenCalled();
      expect(mockVideoElement.currentTime).toBe(0);
    });

    it('resets spine angle to zero', () => {
      const { result } = renderHook(() =>
        useVideoControls({
          videoRef: { current: mockVideoElement as HTMLVideoElement },
          canvasRef: { current: mockCanvasElement as HTMLCanvasElement },
          frameAcquisitionRef: {
            current: mockFrameAcquisition as VideoFrameAcquisition,
          },
          skeletonRendererRef: {
            current: mockSkeletonRenderer as SkeletonRenderer,
          },
          appState: mockAppState,
          setStatus,
          setSpineAngle,
          setArmToSpineAngle,
          setAppState,
          setDisplayMode,
          resetPipeline,
        })
      );

      act(() => {
        result.current.resetVideoAndState();
      });

      expect(setSpineAngle).toHaveBeenCalledWith(0);
    });

    it('calls resetPipeline if provided', () => {
      const { result } = renderHook(() =>
        useVideoControls({
          videoRef: { current: mockVideoElement as HTMLVideoElement },
          canvasRef: { current: mockCanvasElement as HTMLCanvasElement },
          frameAcquisitionRef: {
            current: mockFrameAcquisition as VideoFrameAcquisition,
          },
          skeletonRendererRef: {
            current: mockSkeletonRenderer as SkeletonRenderer,
          },
          appState: mockAppState,
          setStatus,
          setSpineAngle,
          setArmToSpineAngle,
          setAppState,
          setDisplayMode,
          resetPipeline,
        })
      );

      act(() => {
        result.current.resetVideoAndState();
      });

      expect(resetPipeline).toHaveBeenCalled();
    });

    it('resets display mode', () => {
      const { result } = renderHook(() =>
        useVideoControls({
          videoRef: { current: mockVideoElement as HTMLVideoElement },
          canvasRef: { current: mockCanvasElement as HTMLCanvasElement },
          frameAcquisitionRef: {
            current: mockFrameAcquisition as VideoFrameAcquisition,
          },
          skeletonRendererRef: {
            current: mockSkeletonRenderer as SkeletonRenderer,
          },
          appState: mockAppState,
          setStatus,
          setSpineAngle,
          setArmToSpineAngle,
          setAppState,
          setDisplayMode,
          resetPipeline,
        })
      );

      act(() => {
        result.current.resetVideoAndState();
      });

      expect(setDisplayMode).toHaveBeenCalledWith('both');
    });

    it('clears current video file', () => {
      const { result } = renderHook(() =>
        useVideoControls({
          videoRef: { current: mockVideoElement as HTMLVideoElement },
          canvasRef: { current: mockCanvasElement as HTMLCanvasElement },
          frameAcquisitionRef: {
            current: mockFrameAcquisition as VideoFrameAcquisition,
          },
          skeletonRendererRef: {
            current: mockSkeletonRenderer as SkeletonRenderer,
          },
          appState: mockAppState,
          setStatus,
          setSpineAngle,
          setArmToSpineAngle,
          setAppState,
          setDisplayMode,
          resetPipeline,
        })
      );

      act(() => {
        result.current.resetVideoAndState();
      });

      expect(result.current.currentVideoFile).toBeNull();
    });
  });

  describe('loadHardcodedVideo', () => {
    beforeEach(() => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        blob: vi.fn().mockResolvedValue(new Blob(['video data'])),
      } as unknown as Response);
    });

    it('loads video from URL successfully', async () => {
      const { result } = renderHook(() =>
        useVideoControls({
          videoRef: { current: mockVideoElement as HTMLVideoElement },
          canvasRef: { current: mockCanvasElement as HTMLCanvasElement },
          frameAcquisitionRef: {
            current: mockFrameAcquisition as VideoFrameAcquisition,
          },
          skeletonRendererRef: {
            current: mockSkeletonRenderer as SkeletonRenderer,
          },
          appState: mockAppState,
          setStatus,
          setSpineAngle,
          setArmToSpineAngle,
          setAppState,
          setDisplayMode,
          resetPipeline,
        })
      );

      await act(async () => {
        await result.current.loadHardcodedVideo();
      });

      expect(global.fetch).toHaveBeenCalled();
      expect(mockFrameAcquisition.loadVideoFromURL).toHaveBeenCalled();
      expect(setStatus).toHaveBeenCalledWith('Video loaded. Press Play to start.');
    });

    it('updates app state to not using camera', async () => {
      const { result } = renderHook(() =>
        useVideoControls({
          videoRef: { current: mockVideoElement as HTMLVideoElement },
          canvasRef: { current: mockCanvasElement as HTMLCanvasElement },
          frameAcquisitionRef: {
            current: mockFrameAcquisition as VideoFrameAcquisition,
          },
          skeletonRendererRef: {
            current: mockSkeletonRenderer as SkeletonRenderer,
          },
          appState: mockAppState,
          setStatus,
          setSpineAngle,
          setArmToSpineAngle,
          setAppState,
          setDisplayMode,
          resetPipeline,
        })
      );

      await act(async () => {
        await result.current.loadHardcodedVideo();
      });

      expect(setAppState).toHaveBeenCalledWith(expect.any(Function));
    });

    it('handles fetch errors gracefully', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 404,
      } as Response);

      const { result } = renderHook(() =>
        useVideoControls({
          videoRef: { current: mockVideoElement as HTMLVideoElement },
          canvasRef: { current: mockCanvasElement as HTMLCanvasElement },
          frameAcquisitionRef: {
            current: mockFrameAcquisition as VideoFrameAcquisition,
          },
          skeletonRendererRef: {
            current: mockSkeletonRenderer as SkeletonRenderer,
          },
          appState: mockAppState,
          setStatus,
          setSpineAngle,
          setArmToSpineAngle,
          setAppState,
          setDisplayMode,
          resetPipeline,
        })
      );

      await act(async () => {
        await result.current.loadHardcodedVideo();
      });

      expect(setStatus).toHaveBeenCalledWith(
        'Error: Could not download video. Check your connection.'
      );
    });

    it('makes canvas visible', async () => {
      const { result } = renderHook(() =>
        useVideoControls({
          videoRef: { current: mockVideoElement as HTMLVideoElement },
          canvasRef: { current: mockCanvasElement as HTMLCanvasElement },
          frameAcquisitionRef: {
            current: mockFrameAcquisition as VideoFrameAcquisition,
          },
          skeletonRendererRef: {
            current: mockSkeletonRenderer as SkeletonRenderer,
          },
          appState: mockAppState,
          setStatus,
          setSpineAngle,
          setArmToSpineAngle,
          setAppState,
          setDisplayMode,
          resetPipeline,
        })
      );

      await act(async () => {
        await result.current.loadHardcodedVideo();
      });

      expect(mockCanvasElement.style?.display).toBe('block');
    });
  });

  describe('handleVideoUpload', () => {
    it('loads uploaded video file', async () => {
      const mockFile = new File(['video content'], 'test-video.mp4', {
        type: 'video/mp4',
      });
      const mockEvent = {
        target: {
          files: [mockFile],
        },
      } as unknown as React.ChangeEvent<HTMLInputElement>;

      const { result } = renderHook(() =>
        useVideoControls({
          videoRef: { current: mockVideoElement as HTMLVideoElement },
          canvasRef: { current: mockCanvasElement as HTMLCanvasElement },
          frameAcquisitionRef: {
            current: mockFrameAcquisition as VideoFrameAcquisition,
          },
          skeletonRendererRef: {
            current: mockSkeletonRenderer as SkeletonRenderer,
          },
          appState: mockAppState,
          setStatus,
          setSpineAngle,
          setArmToSpineAngle,
          setAppState,
          setDisplayMode,
          resetPipeline,
        })
      );

      await act(async () => {
        result.current.handleVideoUpload(mockEvent);
        // Wait for async operations to complete
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(mockFrameAcquisition.loadVideoFromURL).toHaveBeenCalled();
      expect(result.current.currentVideoFile).toBe(mockFile);
    });

    it('does nothing when no file is selected', async () => {
      const mockEvent = {
        target: {
          files: null,
        },
      } as unknown as React.ChangeEvent<HTMLInputElement>;

      const { result } = renderHook(() =>
        useVideoControls({
          videoRef: { current: mockVideoElement as HTMLVideoElement },
          canvasRef: { current: mockCanvasElement as HTMLCanvasElement },
          frameAcquisitionRef: {
            current: mockFrameAcquisition as VideoFrameAcquisition,
          },
          skeletonRendererRef: {
            current: mockSkeletonRenderer as SkeletonRenderer,
          },
          appState: mockAppState,
          setStatus,
          setSpineAngle,
          setArmToSpineAngle,
          setAppState,
          setDisplayMode,
          resetPipeline,
        })
      );

      await act(async () => {
        result.current.handleVideoUpload(mockEvent);
      });

      expect(mockFrameAcquisition.loadVideoFromURL).not.toHaveBeenCalled();
    });

    it('handles video load errors', async () => {
      const mockFile = new File(['video content'], 'test-video.mp4', {
        type: 'video/mp4',
      });
      const mockEvent = {
        target: {
          files: [mockFile],
        },
      } as unknown as React.ChangeEvent<HTMLInputElement>;

      mockFrameAcquisition.loadVideoFromURL = vi
        .fn()
        .mockRejectedValue(new Error('Load failed'));

      const { result } = renderHook(() =>
        useVideoControls({
          videoRef: { current: mockVideoElement as HTMLVideoElement },
          canvasRef: { current: mockCanvasElement as HTMLCanvasElement },
          frameAcquisitionRef: {
            current: mockFrameAcquisition as VideoFrameAcquisition,
          },
          skeletonRendererRef: {
            current: mockSkeletonRenderer as SkeletonRenderer,
          },
          appState: mockAppState,
          setStatus,
          setSpineAngle,
          setArmToSpineAngle,
          setAppState,
          setDisplayMode,
          resetPipeline,
        })
      );

      await act(async () => {
        result.current.handleVideoUpload(mockEvent);
        // Wait for promise to reject
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(setStatus).toHaveBeenCalledWith('Error: Could not load video. Please try a different file.');
    });
  });

  describe('stopVideo', () => {
    it('pauses and rewinds video', () => {
      mockVideoElement.currentTime = 5;

      const { result } = renderHook(() =>
        useVideoControls({
          videoRef: { current: mockVideoElement as HTMLVideoElement },
          canvasRef: { current: mockCanvasElement as HTMLCanvasElement },
          frameAcquisitionRef: {
            current: mockFrameAcquisition as VideoFrameAcquisition,
          },
          skeletonRendererRef: {
            current: mockSkeletonRenderer as SkeletonRenderer,
          },
          appState: mockAppState,
          setStatus,
          setSpineAngle,
          setArmToSpineAngle,
          setAppState,
          setDisplayMode,
          resetPipeline,
        })
      );

      act(() => {
        result.current.stopVideo();
      });

      expect(mockVideoElement.pause).toHaveBeenCalled();
      expect(mockVideoElement.currentTime).toBe(0);
    });

    it('preserves videoStartTime for filmstrip seeking', () => {
      const { result } = renderHook(() =>
        useVideoControls({
          videoRef: { current: mockVideoElement as HTMLVideoElement },
          canvasRef: { current: mockCanvasElement as HTMLCanvasElement },
          frameAcquisitionRef: {
            current: mockFrameAcquisition as VideoFrameAcquisition,
          },
          skeletonRendererRef: {
            current: mockSkeletonRenderer as SkeletonRenderer,
          },
          appState: mockAppState,
          setStatus,
          setSpineAngle,
          setArmToSpineAngle,
          setAppState,
          setDisplayMode,
          resetPipeline,
        })
      );

      act(() => {
        result.current.stopVideo();
      });

      // videoStartTime should not be reset by stopVideo
      // It will be reset by resetVideoAndState instead
      expect(result.current.videoStartTime).toBeNull();
    });

    it('resets display mode', () => {
      const { result } = renderHook(() =>
        useVideoControls({
          videoRef: { current: mockVideoElement as HTMLVideoElement },
          canvasRef: { current: mockCanvasElement as HTMLCanvasElement },
          frameAcquisitionRef: {
            current: mockFrameAcquisition as VideoFrameAcquisition,
          },
          skeletonRendererRef: {
            current: mockSkeletonRenderer as SkeletonRenderer,
          },
          appState: mockAppState,
          setStatus,
          setSpineAngle,
          setArmToSpineAngle,
          setAppState,
          setDisplayMode,
          resetPipeline,
        })
      );

      act(() => {
        result.current.stopVideo();
      });

      expect(setDisplayMode).toHaveBeenCalledWith('both');
    });
  });

  describe('video event listeners', () => {
    it('sets isPlaying to true on play event', () => {
      let playHandler: (() => void) | undefined;
      mockVideoElement.addEventListener = vi.fn((event, handler) => {
        if (event === 'play') {
          playHandler = handler as () => void;
        }
      });

      const { result } = renderHook(() =>
        useVideoControls({
          videoRef: { current: mockVideoElement as HTMLVideoElement },
          canvasRef: { current: mockCanvasElement as HTMLCanvasElement },
          frameAcquisitionRef: {
            current: mockFrameAcquisition as VideoFrameAcquisition,
          },
          skeletonRendererRef: {
            current: mockSkeletonRenderer as SkeletonRenderer,
          },
          appState: mockAppState,
          setStatus,
          setSpineAngle,
          setArmToSpineAngle,
          setAppState,
          setDisplayMode,
          resetPipeline,
        })
      );

      expect(playHandler).toBeDefined();

      act(() => {
        playHandler?.();
      });

      expect(result.current.isPlaying).toBe(true);
    });

    it('sets isPlaying to false on pause event', () => {
      let pauseHandler: (() => void) | undefined;
      mockVideoElement.addEventListener = vi.fn((event, handler) => {
        if (event === 'pause') {
          pauseHandler = handler as () => void;
        }
      });

      const { result } = renderHook(() =>
        useVideoControls({
          videoRef: { current: mockVideoElement as HTMLVideoElement },
          canvasRef: { current: mockCanvasElement as HTMLCanvasElement },
          frameAcquisitionRef: {
            current: mockFrameAcquisition as VideoFrameAcquisition,
          },
          skeletonRendererRef: {
            current: mockSkeletonRenderer as SkeletonRenderer,
          },
          appState: mockAppState,
          setStatus,
          setSpineAngle,
          setArmToSpineAngle,
          setAppState,
          setDisplayMode,
          resetPipeline,
        })
      );

      expect(pauseHandler).toBeDefined();

      act(() => {
        pauseHandler?.();
      });

      expect(result.current.isPlaying).toBe(false);
    });

    it('sets isPlaying to false on ended event', () => {
      let endedHandler: (() => void) | undefined;
      mockVideoElement.addEventListener = vi.fn((event, handler) => {
        if (event === 'ended') {
          endedHandler = handler as () => void;
        }
      });

      const { result } = renderHook(() =>
        useVideoControls({
          videoRef: { current: mockVideoElement as HTMLVideoElement },
          canvasRef: { current: mockCanvasElement as HTMLCanvasElement },
          frameAcquisitionRef: {
            current: mockFrameAcquisition as VideoFrameAcquisition,
          },
          skeletonRendererRef: {
            current: mockSkeletonRenderer as SkeletonRenderer,
          },
          appState: mockAppState,
          setStatus,
          setSpineAngle,
          setArmToSpineAngle,
          setAppState,
          setDisplayMode,
          resetPipeline,
        })
      );

      expect(endedHandler).toBeDefined();

      act(() => {
        endedHandler?.();
      });

      expect(result.current.isPlaying).toBe(false);
    });
  });
});
