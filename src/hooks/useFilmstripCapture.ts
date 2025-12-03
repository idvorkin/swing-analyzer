/**
 * useFilmstripCapture Hook
 *
 * Captures video frames at specific timestamps using a hidden video element.
 * This decouples frame capture from the main video playback, avoiding race conditions.
 *
 * Architecture:
 * - Creates a hidden video element dedicated to frame capture
 * - Accepts capture requests with timestamps
 * - Seeks silently and captures frames
 * - Returns captured ImageData when ready
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SwingPositionName } from '../types';

export interface CapturedFrame {
  position: SwingPositionName;
  videoTime: number;
  imageData: ImageData;
  spineAngle: number;
}

export interface CaptureRequest {
  cycleIndex: number;
  position: SwingPositionName;
  videoTime: number;
  spineAngle: number;
}

export interface UseFilmstripCaptureOptions {
  /** Video source URL */
  videoSrc: string | null;
  /** Width for captured frames (default: 200) */
  captureWidth?: number;
  /** Height for captured frames (default: 200) */
  captureHeight?: number;
}

export interface UseFilmstripCaptureReturn {
  /** Captured frames organized by cycle index */
  capturedFrames: Map<number, CapturedFrame[]>;
  /** Whether capture is in progress */
  isCapturing: boolean;
  /** Request frame captures for a set of positions */
  requestCaptures: (requests: CaptureRequest[]) => void;
  /** Clear all captured frames */
  clearCaptures: () => void;
}

export function useFilmstripCapture(
  options: UseFilmstripCaptureOptions
): UseFilmstripCaptureReturn {
  const { videoSrc, captureWidth = 200, captureHeight = 200 } = options;

  // State
  const [capturedFrames, setCapturedFrames] = useState<
    Map<number, CapturedFrame[]>
  >(new Map());
  const [isCapturing, setIsCapturing] = useState(false);

  // Refs
  const hiddenVideoRef = useRef<HTMLVideoElement | null>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pendingRequestsRef = useRef<CaptureRequest[]>([]);
  const currentSrcRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Create hidden video and canvas elements
  useEffect(() => {
    // Create hidden video element
    const video = document.createElement('video');
    video.style.display = 'none';
    video.playsInline = true;
    video.muted = true;
    video.preload = 'auto';
    document.body.appendChild(video);
    hiddenVideoRef.current = video;

    // Create capture canvas
    const canvas = document.createElement('canvas');
    canvas.width = captureWidth;
    canvas.height = captureHeight;
    captureCanvasRef.current = canvas;

    return () => {
      if (hiddenVideoRef.current) {
        document.body.removeChild(hiddenVideoRef.current);
        hiddenVideoRef.current = null;
      }
    };
  }, [captureWidth, captureHeight]);

  // Update video source when it changes
  useEffect(() => {
    const video = hiddenVideoRef.current;
    if (!video || !videoSrc) return;

    // Only reload if source changed
    if (currentSrcRef.current === videoSrc) return;

    // Abort any in-progress captures before changing source
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Stop any ongoing loading/playback from previous source
    video.pause();
    video.src = ''; // Clear previous source to stop network requests
    video.load(); // Reset internal state

    currentSrcRef.current = videoSrc;
    pendingRequestsRef.current = []; // Clear pending requests

    video.src = videoSrc;
    video.load();

    // Clear captures when source changes
    setCapturedFrames(new Map());
  }, [videoSrc]);

  // Capture a single frame at the current video position
  const captureCurrentFrame = useCallback((): ImageData | null => {
    const video = hiddenVideoRef.current;
    const canvas = captureCanvasRef.current;
    if (!video || !canvas) return null;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Draw video frame to canvas (scaled to fit)
    const videoAspect = video.videoWidth / video.videoHeight;
    const canvasAspect = canvas.width / canvas.height;

    let drawWidth = canvas.width;
    let drawHeight = canvas.height;
    let drawX = 0;
    let drawY = 0;

    if (videoAspect > canvasAspect) {
      // Video is wider - fit to height
      drawHeight = canvas.height;
      drawWidth = drawHeight * videoAspect;
      drawX = (canvas.width - drawWidth) / 2;
    } else {
      // Video is taller - fit to width
      drawWidth = canvas.width;
      drawHeight = drawWidth / videoAspect;
      drawY = (canvas.height - drawHeight) / 2;
    }

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, drawX, drawY, drawWidth, drawHeight);

    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }, []);

  // Process pending capture requests
  const processCaptureQueue = useCallback(async () => {
    const video = hiddenVideoRef.current;
    if (!video || pendingRequestsRef.current.length === 0) {
      setIsCapturing(false);
      return;
    }

    // Create abort controller for this capture session
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Wait for video to be ready
    if (video.readyState < 2) {
      await new Promise<void>((resolve) => {
        const handleCanPlay = () => {
          video.removeEventListener('canplay', handleCanPlay);
          resolve();
        };
        video.addEventListener('canplay', handleCanPlay);
      });
    }

    // Check if aborted before starting
    if (abortController.signal.aborted) {
      setIsCapturing(false);
      return;
    }

    setIsCapturing(true);
    const results = new Map<number, CapturedFrame[]>();

    for (const request of pendingRequestsRef.current) {
      // Check if aborted
      if (abortController.signal.aborted) {
        break;
      }

      // Seek to the requested time
      video.currentTime = request.videoTime;

      // Wait for seek to complete, track if it succeeded or timed out
      const seekCompleted = await new Promise<boolean>((resolve) => {
        const handleSeeked = () => {
          video.removeEventListener('seeked', handleSeeked);
          resolve(true);
        };
        video.addEventListener('seeked', handleSeeked);

        // Timeout after 2 seconds
        setTimeout(() => {
          video.removeEventListener('seeked', handleSeeked);
          resolve(false); // Indicates timeout
        }, 2000);
      });

      // Skip this frame if seek timed out
      if (!seekCompleted) {
        console.warn(
          `Seek timed out for videoTime ${request.videoTime}, skipping frame`
        );
        continue;
      }

      // Small delay for frame to render
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Capture the frame
      const imageData = captureCurrentFrame();
      if (imageData) {
        const frame: CapturedFrame = {
          position: request.position,
          videoTime: request.videoTime,
          imageData,
          spineAngle: request.spineAngle,
        };

        if (!results.has(request.cycleIndex)) {
          results.set(request.cycleIndex, []);
        }
        results.get(request.cycleIndex)!.push(frame);
      }
    }

    pendingRequestsRef.current = [];
    abortControllerRef.current = null;

    // Merge new results with existing captured frames (unless aborted)
    if (!abortController.signal.aborted) {
      setCapturedFrames((prev) => {
        const merged = new Map(prev);
        for (const [cycleIndex, frames] of results) {
          merged.set(cycleIndex, frames);
        }
        return merged;
      });
    }
    setIsCapturing(false);

    console.log(`Captured ${results.size} new cycles of filmstrip frames`);
  }, [captureCurrentFrame]);

  // Request frame captures
  const requestCaptures = useCallback(
    (requests: CaptureRequest[]) => {
      if (requests.length === 0) return;

      // If already capturing, abort current session and start fresh
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }

      pendingRequestsRef.current = requests;
      processCaptureQueue();
    },
    [processCaptureQueue]
  );

  // Clear all captures
  const clearCaptures = useCallback(() => {
    setCapturedFrames(new Map());
    pendingRequestsRef.current = [];
  }, []);

  return {
    capturedFrames,
    isCapturing,
    requestCaptures,
    clearCaptures,
  };
}
