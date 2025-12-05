/**
 * useCameraControls Hook Tests
 *
 * Tests for the camera control hook that manages camera start/switch functionality.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCameraControls } from './useCameraControls';
import type { VideoFrameAcquisition } from '../pipeline/VideoFrameAcquisition';
import type { Pipeline } from '../pipeline/Pipeline';

describe('useCameraControls', () => {
  // Mock refs
  let mockFrameAcquisition: VideoFrameAcquisition;
  let mockVideo: HTMLVideoElement;
  let mockPipeline: Pipeline;
  let frameAcquisitionRef: { current: VideoFrameAcquisition | null };
  let videoRef: { current: HTMLVideoElement | null };
  let pipelineRef: { current: Pipeline | null };

  // Mock callbacks
  let onCameraModeChange: ReturnType<typeof vi.fn>;
  let onUsingCameraChange: ReturnType<typeof vi.fn>;
  let onStatusChange: ReturnType<typeof vi.fn>;
  let stopProcessing: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Create mock VideoFrameAcquisition
    mockFrameAcquisition = {
      startCamera: vi.fn().mockResolvedValue(undefined),
      stopCamera: vi.fn().mockResolvedValue(undefined),
      start: vi.fn(),
      stop: vi.fn(),
      getCurrentFrame: vi.fn(),
      loadVideoFromURL: vi.fn(),
      updateCanvasDimensions: vi.fn(),
    } as unknown as VideoFrameAcquisition;

    // Create mock video element
    mockVideo = {
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      onloadedmetadata: null,
    } as unknown as HTMLVideoElement;

    // Create mock pipeline
    mockPipeline = {
      initialize: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      reset: vi.fn(),
      getRepCount: vi.fn(),
      getLatestSkeleton: vi.fn(),
      getSkeletonEvents: vi.fn(),
      getResults: vi.fn(),
    } as unknown as Pipeline;

    // Create refs
    frameAcquisitionRef = { current: mockFrameAcquisition };
    videoRef = { current: mockVideo };
    pipelineRef = { current: mockPipeline };

    // Create mock callbacks
    onCameraModeChange = vi.fn();
    onUsingCameraChange = vi.fn();
    onStatusChange = vi.fn();
    stopProcessing = vi.fn();
  });

  describe('initialization', () => {
    it('returns startCamera, switchCamera functions and cameraMode', () => {
      const { result } = renderHook(() =>
        useCameraControls({
          frameAcquisitionRef,
          videoRef,
          pipelineRef,
          cameraMode: 'environment',
          isProcessing: false,
          onCameraModeChange,
          onUsingCameraChange,
          onStatusChange,
          stopProcessing,
        })
      );

      expect(result.current.startCamera).toBeInstanceOf(Function);
      expect(result.current.switchCamera).toBeInstanceOf(Function);
      expect(result.current.cameraMode).toBe('environment');
    });
  });

  describe('startCamera', () => {
    it('starts camera successfully', async () => {
      const { result } = renderHook(() =>
        useCameraControls({
          frameAcquisitionRef,
          videoRef,
          pipelineRef,
          cameraMode: 'environment',
          isProcessing: false,
          onCameraModeChange,
          onUsingCameraChange,
          onStatusChange,
          stopProcessing,
        })
      );

      await act(async () => {
        await result.current.startCamera();
      });

      // Should update status
      expect(onStatusChange).toHaveBeenCalledWith('Starting camera...');

      // Should stop existing camera first
      expect(mockFrameAcquisition.stopCamera).toHaveBeenCalled();

      // Should start camera with current mode
      expect(mockFrameAcquisition.startCamera).toHaveBeenCalledWith('environment');

      // Should set usingCamera to true
      expect(onUsingCameraChange).toHaveBeenCalledWith(true);
    });

    it('stops processing before starting camera if processing is active', async () => {
      const { result } = renderHook(() =>
        useCameraControls({
          frameAcquisitionRef,
          videoRef,
          pipelineRef,
          cameraMode: 'environment',
          isProcessing: true,
          onCameraModeChange,
          onUsingCameraChange,
          onStatusChange,
          stopProcessing,
        })
      );

      await act(async () => {
        await result.current.startCamera();
      });

      expect(stopProcessing).toHaveBeenCalled();
    });

    it('does not stop processing if not active', async () => {
      const { result } = renderHook(() =>
        useCameraControls({
          frameAcquisitionRef,
          videoRef,
          pipelineRef,
          cameraMode: 'environment',
          isProcessing: false,
          onCameraModeChange,
          onUsingCameraChange,
          onStatusChange,
          stopProcessing,
        })
      );

      await act(async () => {
        await result.current.startCamera();
      });

      expect(stopProcessing).not.toHaveBeenCalled();
    });

    it('sets up video onloadedmetadata handler', async () => {
      const { result } = renderHook(() =>
        useCameraControls({
          frameAcquisitionRef,
          videoRef,
          pipelineRef,
          cameraMode: 'environment',
          isProcessing: false,
          onCameraModeChange,
          onUsingCameraChange,
          onStatusChange,
          stopProcessing,
        })
      );

      await act(async () => {
        await result.current.startCamera();
      });

      // Should set onloadedmetadata handler
      expect(mockVideo.onloadedmetadata).toBeInstanceOf(Function);

      // Call the handler to simulate video loaded
      if (mockVideo.onloadedmetadata) {
        mockVideo.onloadedmetadata({} as Event);
        expect(mockVideo.play).toHaveBeenCalled();
      }
    });

    it('handles camera access errors', async () => {
      const error = new Error('Camera access denied');
      mockFrameAcquisition.startCamera = vi.fn().mockRejectedValue(error);

      const { result } = renderHook(() =>
        useCameraControls({
          frameAcquisitionRef,
          videoRef,
          pipelineRef,
          cameraMode: 'environment',
          isProcessing: false,
          onCameraModeChange,
          onUsingCameraChange,
          onStatusChange,
          stopProcessing,
        })
      );

      await act(async () => {
        await result.current.startCamera();
      });

      expect(onStatusChange).toHaveBeenCalledWith('Error: Could not access camera. Please check permissions.');
    });

    it('does nothing if frameAcquisitionRef is null', async () => {
      frameAcquisitionRef.current = null;

      const { result } = renderHook(() =>
        useCameraControls({
          frameAcquisitionRef,
          videoRef,
          pipelineRef,
          cameraMode: 'environment',
          isProcessing: false,
          onCameraModeChange,
          onUsingCameraChange,
          onStatusChange,
          stopProcessing,
        })
      );

      await act(async () => {
        await result.current.startCamera();
      });

      expect(onStatusChange).not.toHaveBeenCalled();
    });
  });

  describe('switchCamera', () => {
    it('switches from environment to user camera', async () => {
      const { result } = renderHook(() =>
        useCameraControls({
          frameAcquisitionRef,
          videoRef,
          pipelineRef,
          cameraMode: 'environment',
          isProcessing: false,
          onCameraModeChange,
          onUsingCameraChange,
          onStatusChange,
          stopProcessing,
        })
      );

      await act(async () => {
        await result.current.switchCamera();
      });

      // Should stop current camera
      expect(mockFrameAcquisition.stopCamera).toHaveBeenCalled();

      // Should start camera with new mode
      expect(mockFrameAcquisition.startCamera).toHaveBeenCalledWith('user');

      // Should update camera mode
      expect(onCameraModeChange).toHaveBeenCalledWith('user');
    });

    it('switches from user to environment camera', async () => {
      const { result } = renderHook(() =>
        useCameraControls({
          frameAcquisitionRef,
          videoRef,
          pipelineRef,
          cameraMode: 'user',
          isProcessing: false,
          onCameraModeChange,
          onUsingCameraChange,
          onStatusChange,
          stopProcessing,
        })
      );

      await act(async () => {
        await result.current.switchCamera();
      });

      expect(mockFrameAcquisition.startCamera).toHaveBeenCalledWith('environment');
      expect(onCameraModeChange).toHaveBeenCalledWith('environment');
    });

    it('stops processing before switching if processing is active', async () => {
      const { result } = renderHook(() =>
        useCameraControls({
          frameAcquisitionRef,
          videoRef,
          pipelineRef,
          cameraMode: 'environment',
          isProcessing: true,
          onCameraModeChange,
          onUsingCameraChange,
          onStatusChange,
          stopProcessing,
        })
      );

      await act(async () => {
        await result.current.switchCamera();
      });

      expect(stopProcessing).toHaveBeenCalled();
    });

    it('restarts video playback after switching', async () => {
      const { result } = renderHook(() =>
        useCameraControls({
          frameAcquisitionRef,
          videoRef,
          pipelineRef,
          cameraMode: 'environment',
          isProcessing: false,
          onCameraModeChange,
          onUsingCameraChange,
          onStatusChange,
          stopProcessing,
        })
      );

      await act(async () => {
        await result.current.switchCamera();
      });

      expect(mockVideo.play).toHaveBeenCalled();
    });

    it('handles camera switch errors', async () => {
      const error = new Error('Switch camera failed');
      mockFrameAcquisition.startCamera = vi.fn().mockRejectedValue(error);

      const { result } = renderHook(() =>
        useCameraControls({
          frameAcquisitionRef,
          videoRef,
          pipelineRef,
          cameraMode: 'environment',
          isProcessing: false,
          onCameraModeChange,
          onUsingCameraChange,
          onStatusChange,
          stopProcessing,
        })
      );

      await act(async () => {
        await result.current.switchCamera();
      });

      expect(onStatusChange).toHaveBeenCalledWith('Error: Could not access camera. Please check permissions.');
    });

    it('does nothing if frameAcquisitionRef is null', async () => {
      frameAcquisitionRef.current = null;

      const { result } = renderHook(() =>
        useCameraControls({
          frameAcquisitionRef,
          videoRef,
          pipelineRef,
          cameraMode: 'environment',
          isProcessing: false,
          onCameraModeChange,
          onUsingCameraChange,
          onStatusChange,
          stopProcessing,
        })
      );

      await act(async () => {
        await result.current.switchCamera();
      });

      expect(mockFrameAcquisition.stopCamera).not.toHaveBeenCalled();
    });

    it('handles video play errors gracefully', async () => {
      mockVideo.play = vi.fn().mockRejectedValue(new Error('Play failed'));
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { result } = renderHook(() =>
        useCameraControls({
          frameAcquisitionRef,
          videoRef,
          pipelineRef,
          cameraMode: 'environment',
          isProcessing: false,
          onCameraModeChange,
          onUsingCameraChange,
          onStatusChange,
          stopProcessing,
        })
      );

      await act(async () => {
        await result.current.switchCamera();
      });

      // Should attempt to play but handle error
      expect(mockVideo.play).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error restarting video after camera switch:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('cameraMode state', () => {
    it('reflects the current camera mode', () => {
      const { result, rerender } = renderHook<
        ReturnType<typeof useCameraControls>,
        { mode: 'user' | 'environment' }
      >(
        ({ mode }) =>
          useCameraControls({
            frameAcquisitionRef,
            videoRef,
            pipelineRef,
            cameraMode: mode,
            isProcessing: false,
            onCameraModeChange,
            onUsingCameraChange,
            onStatusChange,
            stopProcessing,
          }),
        {
          initialProps: { mode: 'environment' },
        }
      );

      expect(result.current.cameraMode).toBe('environment');

      // Rerender with different mode
      rerender({ mode: 'user' });
      expect(result.current.cameraMode).toBe('user');
    });
  });

  describe('edge cases', () => {
    it('handles missing videoRef gracefully', async () => {
      videoRef.current = null;

      const { result } = renderHook(() =>
        useCameraControls({
          frameAcquisitionRef,
          videoRef,
          pipelineRef,
          cameraMode: 'environment',
          isProcessing: false,
          onCameraModeChange,
          onUsingCameraChange,
          onStatusChange,
          stopProcessing,
        })
      );

      await act(async () => {
        await result.current.startCamera();
      });

      // Should still call other methods
      expect(mockFrameAcquisition.startCamera).toHaveBeenCalled();
      expect(onUsingCameraChange).toHaveBeenCalled();
    });

    it('handles missing pipelineRef gracefully', async () => {
      pipelineRef.current = null;

      const { result } = renderHook(() =>
        useCameraControls({
          frameAcquisitionRef,
          videoRef,
          pipelineRef,
          cameraMode: 'environment',
          isProcessing: true, // isProcessing is true but pipeline is null
          onCameraModeChange,
          onUsingCameraChange,
          onStatusChange,
          stopProcessing,
        })
      );

      await act(async () => {
        await result.current.startCamera();
      });

      // Should still work even without pipeline
      expect(mockFrameAcquisition.startCamera).toHaveBeenCalled();
    });
  });
});
