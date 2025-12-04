/**
 * useSwingAnalyzer Integration Tests
 *
 * Tests the composed hook to verify all extracted hooks wire together correctly.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSwingAnalyzer } from './useSwingAnalyzer';

// Mock all the extracted hooks
vi.mock('./usePipelineLifecycle', () => ({
  usePipelineLifecycle: vi.fn(() => ({
    pipelineRef: { current: { reset: vi.fn(), start: vi.fn(), stop: vi.fn() } },
    frameAcquisitionRef: { current: null },
    skeletonRendererRef: { current: null },
    livePoseCacheRef: { current: null },
    startProcessing: vi.fn(),
    stopProcessing: vi.fn(),
    reset: vi.fn(),
    resetPipelineOnly: vi.fn(),
    reinitializeWithCachedPoses: vi.fn(),
    reinitializeWithLiveCache: vi.fn(),
  })),
}));

vi.mock('./useVideoControls', () => ({
  useVideoControls: vi.fn(() => ({
    isPlaying: false,
    videoStartTime: null,
    currentVideoFile: null,
    togglePlayPause: vi.fn(),
    nextFrame: vi.fn(),
    previousFrame: vi.fn(),
    loadHardcodedVideo: vi.fn(),
    handleVideoUpload: vi.fn(),
    stopVideo: vi.fn(),
  })),
}));

vi.mock('./useCameraControls', () => ({
  useCameraControls: vi.fn(() => ({
    startCamera: vi.fn(),
    switchCamera: vi.fn(),
    cameraMode: 'environment',
  })),
}));

vi.mock('./useSkeletonRendering', () => ({
  useSkeletonRendering: vi.fn(() => ({
    buildSkeletonFromFrame: vi.fn(),
    setBodyPartDisplay: vi.fn(),
    setDebugMode: vi.fn(),
    skeletonRendererRef: { current: null },
  })),
}));

vi.mock('./useKeyboardNavigation', () => ({
  useKeyboardNavigation: vi.fn(() => ({
    isFullscreen: false,
    navigateToPreviousRep: vi.fn(),
    navigateToNextRep: vi.fn(),
  })),
}));

describe('useSwingAnalyzer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('returns all expected state properties', () => {
      const { result } = renderHook(() => useSwingAnalyzer());

      // State
      expect(result.current).toHaveProperty('appState');
      expect(result.current).toHaveProperty('status');
      expect(result.current).toHaveProperty('repCount');
      expect(result.current).toHaveProperty('spineAngle');
      expect(result.current).toHaveProperty('armToSpineAngle');
      expect(result.current).toHaveProperty('isPlaying');
      expect(result.current).toHaveProperty('videoStartTime');
      expect(result.current).toHaveProperty('isFullscreen');
      expect(result.current).toHaveProperty('currentVideoFile');
      expect(result.current).toHaveProperty('usingCachedPoses');
    });

    it('returns all expected refs', () => {
      const { result } = renderHook(() => useSwingAnalyzer());

      expect(result.current).toHaveProperty('videoRef');
      expect(result.current).toHaveProperty('canvasRef');
      expect(result.current).toHaveProperty('fileInputRef');
      expect(result.current).toHaveProperty('checkpointGridRef');
      expect(result.current).toHaveProperty('pipelineRef');
    });

    it('returns all expected action functions', () => {
      const { result } = renderHook(() => useSwingAnalyzer());

      // Actions
      expect(typeof result.current.startCamera).toBe('function');
      expect(typeof result.current.switchCamera).toBe('function');
      expect(typeof result.current.handleVideoUpload).toBe('function');
      expect(typeof result.current.loadHardcodedVideo).toBe('function');
      expect(typeof result.current.togglePlayPause).toBe('function');
      expect(typeof result.current.stopVideo).toBe('function');
      expect(typeof result.current.startProcessing).toBe('function');
      expect(typeof result.current.stopProcessing).toBe('function');
      expect(typeof result.current.reset).toBe('function');
      expect(typeof result.current.resetPipelineOnly).toBe('function');
      expect(typeof result.current.nextFrame).toBe('function');
      expect(typeof result.current.previousFrame).toBe('function');
      expect(typeof result.current.setBodyPartDisplay).toBe('function');
      expect(typeof result.current.setDisplayMode).toBe('function');
      expect(typeof result.current.setDebugMode).toBe('function');
      expect(typeof result.current.navigateToPreviousRep).toBe('function');
      expect(typeof result.current.navigateToNextRep).toBe('function');
      expect(typeof result.current.getVideoContainerClass).toBe('function');
      expect(typeof result.current.reinitializeWithCachedPoses).toBe('function');
      expect(typeof result.current.reinitializeWithLiveCache).toBe('function');
    });

    it('initializes with default appState', () => {
      const { result } = renderHook(() => useSwingAnalyzer());

      expect(result.current.appState).toEqual({
        usingCamera: false,
        cameraMode: 'environment',
        displayMode: 'both',
        isModelLoaded: false,
        isProcessing: false,
        repCounter: {
          count: 0,
          isConnect: false,
          lastConnectState: false,
          connectThreshold: 45,
        },
        showBodyParts: true,
        bodyPartDisplayTime: 0.5,
        currentRepIndex: 0,
      });
    });

    it('accepts initial state overrides', () => {
      const { result } = renderHook(() =>
        useSwingAnalyzer({
          displayMode: 'overlay',
          showBodyParts: false,
        })
      );

      expect(result.current.appState.displayMode).toBe('overlay');
      expect(result.current.appState.showBodyParts).toBe(false);
    });

    it('initializes with default UI state', () => {
      const { result } = renderHook(() => useSwingAnalyzer());

      expect(result.current.status).toBe('Loading model...');
      expect(result.current.repCount).toBe(0);
      expect(result.current.spineAngle).toBe(0);
      expect(result.current.armToSpineAngle).toBe(0);
      expect(result.current.usingCachedPoses).toBe(false);
    });
  });

  describe('display mode', () => {
    it('updates appState when setDisplayMode is called', () => {
      const { result } = renderHook(() => useSwingAnalyzer());

      act(() => {
        result.current.setDisplayMode('overlay');
      });

      expect(result.current.appState.displayMode).toBe('overlay');
    });

    it('cycles through all display modes', () => {
      const { result } = renderHook(() => useSwingAnalyzer());

      expect(result.current.appState.displayMode).toBe('both');

      act(() => {
        result.current.setDisplayMode('video');
      });
      expect(result.current.appState.displayMode).toBe('video');

      act(() => {
        result.current.setDisplayMode('overlay');
      });
      expect(result.current.appState.displayMode).toBe('overlay');

      act(() => {
        result.current.setDisplayMode('both');
      });
      expect(result.current.appState.displayMode).toBe('both');
    });
  });

  describe('reset', () => {
    it('resets rep count and spine angle', () => {
      const { result } = renderHook(() => useSwingAnalyzer());

      // The reset function should reset state
      act(() => {
        result.current.reset();
      });

      expect(result.current.repCount).toBe(0);
      expect(result.current.spineAngle).toBe(0);
      expect(result.current.appState.currentRepIndex).toBe(0);
    });
  });

  describe('rep navigation', () => {
    it('navigateToPreviousRep decrements currentRepIndex', () => {
      const { result } = renderHook(() =>
        useSwingAnalyzer({ currentRepIndex: 2 })
      );

      act(() => {
        result.current.navigateToPreviousRep();
      });

      expect(result.current.appState.currentRepIndex).toBe(1);
    });

    it('navigateToPreviousRep does not go below 0', () => {
      const { result } = renderHook(() =>
        useSwingAnalyzer({ currentRepIndex: 0 })
      );

      act(() => {
        result.current.navigateToPreviousRep();
      });

      expect(result.current.appState.currentRepIndex).toBe(0);
    });

    it('navigateToNextRep does nothing when repCount is 0', () => {
      const { result } = renderHook(() =>
        useSwingAnalyzer({ currentRepIndex: 0 })
      );

      // With repCount 0, navigation should be a no-op
      act(() => {
        result.current.navigateToNextRep();
      });

      // Index stays at 0 - no reps to navigate to
      expect(result.current.appState.currentRepIndex).toBe(0);
    });
  });

  describe('body part display', () => {
    it('updates appState when setBodyPartDisplay is called', () => {
      const { result } = renderHook(() => useSwingAnalyzer());

      act(() => {
        result.current.setBodyPartDisplay(false, 1.0);
      });

      expect(result.current.appState.showBodyParts).toBe(false);
      expect(result.current.appState.bodyPartDisplayTime).toBe(1.0);
    });
  });

  describe('getVideoContainerClass', () => {
    it('returns empty string when videoRef is null', () => {
      const { result } = renderHook(() => useSwingAnalyzer());

      expect(result.current.getVideoContainerClass()).toBe('');
    });
  });

  describe('hook composition', () => {
    it('passes correct options to usePipelineLifecycle', async () => {
      const { usePipelineLifecycle } = await import('./usePipelineLifecycle');

      renderHook(() => useSwingAnalyzer());

      expect(usePipelineLifecycle).toHaveBeenCalledWith(
        expect.objectContaining({
          showBodyParts: true,
          bodyPartDisplayTime: 0.5,
        })
      );
    });

    it('passes correct options to useVideoControls', async () => {
      const { useVideoControls } = await import('./useVideoControls');

      renderHook(() => useSwingAnalyzer());

      expect(useVideoControls).toHaveBeenCalledWith(
        expect.objectContaining({
          appState: expect.any(Object),
        })
      );
    });

    it('passes correct options to useCameraControls', async () => {
      const { useCameraControls } = await import('./useCameraControls');

      renderHook(() => useSwingAnalyzer());

      expect(useCameraControls).toHaveBeenCalledWith(
        expect.objectContaining({
          cameraMode: 'environment',
          isProcessing: false,
        })
      );
    });

    it('passes correct options to useKeyboardNavigation', async () => {
      const { useKeyboardNavigation } = await import('./useKeyboardNavigation');

      renderHook(() => useSwingAnalyzer());

      expect(useKeyboardNavigation).toHaveBeenCalledWith(
        expect.objectContaining({
          currentRepIndex: 0,
          repCount: 0,
        })
      );
    });
  });
});
