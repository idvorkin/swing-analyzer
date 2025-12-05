import { useCallback, type RefObject } from 'react';
import type { VideoFrameAcquisition } from '../pipeline/VideoFrameAcquisition';
import type { Pipeline } from '../pipeline/Pipeline';

/**
 * Get a user-friendly error message for camera errors.
 */
function getCameraErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    switch (error.name) {
      case 'NotAllowedError':
        return 'Error: Camera access denied. Please allow camera permissions.';
      case 'NotFoundError':
        return 'Error: No camera found. Please connect a camera.';
      case 'NotReadableError':
        return 'Error: Camera is in use by another app. Please close other apps.';
      case 'OverconstrainedError':
        return 'Error: Camera does not support required settings.';
      case 'AbortError':
        return 'Error: Camera access was interrupted. Please try again.';
      case 'SecurityError':
        return 'Error: Camera access blocked. Please check site permissions.';
    }
  }
  return 'Error: Could not access camera. Please check permissions.';
}

export interface UseCameraControlsParams {
  frameAcquisitionRef: RefObject<VideoFrameAcquisition | null>;
  videoRef: RefObject<HTMLVideoElement | null>;
  pipelineRef: RefObject<Pipeline | null>;
  cameraMode: 'user' | 'environment';
  isProcessing: boolean;
  onCameraModeChange: (mode: 'user' | 'environment') => void;
  onUsingCameraChange: (usingCamera: boolean) => void;
  onStatusChange: (status: string) => void;
  stopProcessing: () => void;
}

export interface UseCameraControlsReturn {
  startCamera: () => Promise<void>;
  switchCamera: () => Promise<void>;
  cameraMode: 'user' | 'environment';
}

export function useCameraControls({
  frameAcquisitionRef,
  videoRef,
  pipelineRef,
  cameraMode,
  isProcessing,
  onCameraModeChange,
  onUsingCameraChange,
  onStatusChange,
  stopProcessing,
}: UseCameraControlsParams): UseCameraControlsReturn {
  // Start camera
  const startCamera = useCallback(async () => {
    if (!frameAcquisitionRef.current) return;

    onStatusChange('Starting camera...');
    try {
      await frameAcquisitionRef.current.stopCamera();
      if (pipelineRef.current && isProcessing) {
        stopProcessing();
      }
      await frameAcquisitionRef.current.startCamera(cameraMode);

      if (videoRef.current) {
        videoRef.current.onloadedmetadata = () => {
          // Video play event will start the pipeline
          videoRef.current?.play().catch((err) => {
            console.error('Error starting camera video playback:', err);
          });
        };
      }

      onUsingCameraChange(true);
    } catch (error) {
      console.error('Error accessing camera:', error);
      const errorMessage = getCameraErrorMessage(error);
      onStatusChange(errorMessage);
    }
  }, [
    frameAcquisitionRef,
    pipelineRef,
    videoRef,
    cameraMode,
    isProcessing,
    onCameraModeChange,
    onUsingCameraChange,
    onStatusChange,
    stopProcessing,
  ]);

  // Switch camera
  const switchCamera = useCallback(async () => {
    if (!frameAcquisitionRef.current) return;

    const newMode = cameraMode === 'environment' ? 'user' : 'environment';

    try {
      // Stop pipeline while switching cameras
      if (pipelineRef.current && isProcessing) {
        stopProcessing();
      }

      await frameAcquisitionRef.current.stopCamera();
      await frameAcquisitionRef.current.startCamera(newMode);

      // Video play event will restart the pipeline
      if (videoRef.current) {
        videoRef.current.play().catch((err) => {
          console.error('Error restarting video after camera switch:', err);
        });
      }

      onCameraModeChange(newMode);
    } catch (error) {
      console.error('Error switching camera:', error);
      const errorMessage = getCameraErrorMessage(error);
      onStatusChange(errorMessage);
    }
  }, [
    frameAcquisitionRef,
    pipelineRef,
    videoRef,
    cameraMode,
    isProcessing,
    onCameraModeChange,
    onStatusChange,
    stopProcessing,
  ]);

  return {
    startCamera,
    switchCamera,
    cameraMode,
  };
}
