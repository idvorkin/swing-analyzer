/**
 * usePoseTrack Hook
 *
 * React hook for managing pose track extraction and loading.
 * Integrates with the main useSwingAnalyzer hook.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { LivePoseCache } from '../pipeline/LivePoseCache';
import { PoseTrackPipeline } from '../pipeline/PoseTrackPipeline';
import {
  extractPosesFromVideo,
  getModelDisplayName,
} from '../services/PoseExtractor';
import {
  downloadPoseTrack,
  hasPoseTrackForVideo,
  loadPoseTrackFromFile,
  loadPoseTrackFromStorage,
  savePoseTrackToStorage,
} from '../services/PoseTrackService';
import type {
  PoseExtractionProgress,
  PoseModel,
  PoseTrackFile,
  PoseTrackStatus,
} from '../types/posetrack';
import { computeQuickVideoHash } from '../utils/videoHash';

export interface UsePoseTrackOptions {
  /** Auto-extract poses when video loads (default: true) */
  autoExtract?: boolean;
  /** Default model for extraction (default: 'movenet-lightning') */
  defaultModel?: PoseModel;
  /** Pre-compute angles during extraction (default: true) */
  precomputeAngles?: boolean;
  /**
   * Callback called BEFORE extraction starts, with the live cache.
   * Used to reinitialize the pipeline before frames start arriving.
   * This is async - extraction waits for it to complete.
   */
  onExtractionStart?: (liveCache: LivePoseCache) => Promise<void>;
  /**
   * Callback called for each frame during extraction.
   * Used to stream frames through the pipeline for instant filmstrip.
   */
  onFrameExtracted?: (frame: import('../types/posetrack').PoseTrackFrame) => void;
}

export interface UsePoseTrackReturn {
  /** Current pose track status */
  status: PoseTrackStatus;
  /** Current video hash (if video loaded) */
  videoHash: string | null;
  /** Selected extraction model */
  model: PoseModel;
  /** Set the extraction model */
  setModel: (model: PoseModel) => void;
  /** Start pose extraction for current video */
  startExtraction: (videoFile: File) => Promise<void>;
  /** Cancel ongoing extraction */
  cancelExtraction: () => void;
  /** Save current pose track to storage */
  savePoseTrack: () => Promise<void>;
  /** Download current pose track as file */
  downloadPoseTrack: () => void;
  /** Load pose track from file */
  loadFromFile: (file: File) => Promise<void>;
  /** Check if pose track exists for a video */
  checkForExisting: (videoFile: File) => Promise<boolean>;
  /** Load existing pose track for video hash */
  loadExisting: (videoHash: string) => Promise<boolean>;
  /** Get the pose track pipeline for analysis */
  getPipeline: () => PoseTrackPipeline | null;
  /** Get the live pose cache for streaming playback during extraction */
  getLivePoseCache: () => LivePoseCache | null;
  /** Get model display name */
  getModelDisplayName: (model: PoseModel) => string;
}

export function usePoseTrack(
  options: UsePoseTrackOptions = {}
): UsePoseTrackReturn {
  const {
    autoExtract = true,
    defaultModel = 'movenet-lightning',
    precomputeAngles = true,
    onExtractionStart: onExtractionStartCallback,
    onFrameExtracted: onFrameExtractedCallback,
  } = options;

  // State
  const [status, setStatus] = useState<PoseTrackStatus>({ type: 'none' });
  const [videoHash, setVideoHash] = useState<string | null>(null);
  const [model, setModel] = useState<PoseModel>(defaultModel);

  // Refs
  const abortControllerRef = useRef<AbortController | null>(null);
  const pipelineRef = useRef<PoseTrackPipeline | null>(null);
  const currentPoseTrackRef = useRef<PoseTrackFile | null>(null);
  const livePoseCacheRef = useRef<LivePoseCache | null>(null);

  /**
   * Cancel ongoing extraction
   */
  const cancelExtraction = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    // Clear the live cache on cancel
    if (livePoseCacheRef.current) {
      livePoseCacheRef.current.clear();
      livePoseCacheRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelExtraction();
      if (pipelineRef.current) {
        pipelineRef.current.dispose();
        pipelineRef.current = null;
      }
      if (livePoseCacheRef.current) {
        livePoseCacheRef.current.clear();
        livePoseCacheRef.current = null;
      }
    };
  }, [cancelExtraction]);

  /**
   * Start pose extraction for a video file
   */
  const startExtraction = useCallback(
    async (videoFile: File) => {
      // Cancel any existing extraction
      cancelExtraction();

      // Compute video hash
      const hash = await computeQuickVideoHash(videoFile);
      setVideoHash(hash);

      // Check if we already have a pose track for this video
      const existing = await loadPoseTrackFromStorage(hash);
      if (existing) {
        // Use existing pose track
        currentPoseTrackRef.current = existing;
        pipelineRef.current = new PoseTrackPipeline(existing);
        setStatus({ type: 'ready', poseTrack: existing, fromCache: true });
        return;
      }

      // If auto-extract is disabled, stop here
      if (!autoExtract) {
        setStatus({ type: 'none' });
        return;
      }

      // Start extraction
      const controller = new AbortController();
      abortControllerRef.current = controller;

      // Create live cache for streaming playback during extraction
      const liveCache = new LivePoseCache(hash);
      livePoseCacheRef.current = liveCache;

      setStatus({
        type: 'extracting',
        progress: {
          currentFrame: 0,
          totalFrames: 0,
          percentage: 0,
          currentTime: 0,
          totalDuration: 0,
        },
      });

      // CRITICAL: Call onExtractionStart BEFORE extraction begins
      // This allows the pipeline to be reinitialized synchronously before frames arrive
      if (onExtractionStartCallback) {
        try {
          await onExtractionStartCallback(liveCache);
        } catch (err) {
          console.error('Error in onExtractionStart callback:', err);
          // Continue with extraction even if callback fails
        }
      }

      try {
        const result = await extractPosesFromVideo(videoFile, {
          model,
          precomputeAngles,
          signal: controller.signal,
          onProgress: (progress: PoseExtractionProgress) => {
            setStatus({ type: 'extracting', progress });
          },
          // Stream each frame to the live cache as it's extracted
          onFrameExtracted: (frame) => {
            liveCache.addFrame(frame);
            // Also call the external callback for pipeline processing
            if (onFrameExtractedCallback) {
              try {
                onFrameExtractedCallback(frame);
              } catch (err) {
                // Log but don't fail extraction - the callback is for instant filmstrip
                // and should not interrupt pose extraction
                console.error('Error in onFrameExtracted callback:', err);
              }
            }
          },
        });

        // Mark cache as complete with metadata
        liveCache.markComplete(result.poseTrack.metadata);

        // Store the result
        currentPoseTrackRef.current = result.poseTrack;
        pipelineRef.current = new PoseTrackPipeline(result.poseTrack);

        setStatus({
          type: 'ready',
          poseTrack: result.poseTrack,
          fromCache: false,
        });

        console.log(
          `Pose extraction complete: ${result.poseTrack.frames.length} frames in ${(result.extractionTimeMs / 1000).toFixed(1)}s (${result.extractionFps.toFixed(1)} fps)`
        );
      } catch (error) {
        // Always clear live cache on any failure
        if (livePoseCacheRef.current) {
          livePoseCacheRef.current.clear();
          livePoseCacheRef.current = null;
        }

        if (error instanceof DOMException && error.name === 'AbortError') {
          setStatus({ type: 'none' });
        } else {
          console.error('Pose extraction failed:', error);
          setStatus({
            type: 'error',
            error: error instanceof Error ? error.message : 'Extraction failed',
          });
        }
      } finally {
        abortControllerRef.current = null;
      }
    },
    [model, autoExtract, precomputeAngles, cancelExtraction, onExtractionStartCallback, onFrameExtractedCallback]
  );

  /**
   * Save current pose track to IndexedDB
   */
  const savePoseTrackToDb = useCallback(async () => {
    if (!currentPoseTrackRef.current) {
      console.warn('No pose track to save');
      return;
    }

    try {
      await savePoseTrackToStorage(currentPoseTrackRef.current);
      console.log('Pose track saved to storage');
    } catch (error) {
      console.error('Failed to save pose track:', error);
      throw error;
    }
  }, []);

  /**
   * Download current pose track as file
   */
  const downloadPoseTrackFile = useCallback(() => {
    if (!currentPoseTrackRef.current) {
      console.warn('No pose track to download');
      return;
    }

    downloadPoseTrack(currentPoseTrackRef.current);
  }, []);

  /**
   * Load pose track from file
   */
  const loadFromFile = useCallback(async (file: File) => {
    try {
      const poseTrack = await loadPoseTrackFromFile(file);
      currentPoseTrackRef.current = poseTrack;
      pipelineRef.current = new PoseTrackPipeline(poseTrack);
      setVideoHash(poseTrack.metadata.sourceVideoHash);
      setStatus({ type: 'ready', poseTrack, fromCache: false });
    } catch (error) {
      console.error('Failed to load pose track file:', error);
      setStatus({
        type: 'error',
        error: error instanceof Error ? error.message : 'Failed to load file',
      });
    }
  }, []);

  /**
   * Check if a pose track exists for a video
   */
  const checkForExisting = useCallback(
    async (videoFile: File): Promise<boolean> => {
      try {
        const hash = await computeQuickVideoHash(videoFile);
        return hasPoseTrackForVideo(hash);
      } catch (error) {
        console.error('Failed to check for existing pose track:', error);
        return false;
      }
    },
    []
  );

  /**
   * Load existing pose track by video hash
   */
  const loadExisting = useCallback(async (hash: string): Promise<boolean> => {
    try {
      const poseTrack = await loadPoseTrackFromStorage(hash);
      if (poseTrack) {
        currentPoseTrackRef.current = poseTrack;
        pipelineRef.current = new PoseTrackPipeline(poseTrack);
        setVideoHash(hash);
        setStatus({ type: 'ready', poseTrack, fromCache: true });
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to load existing pose track:', error);
      setStatus({
        type: 'error',
        error:
          error instanceof Error
            ? `Failed to load saved data: ${error.message}`
            : 'Failed to load saved pose track from storage',
      });
      return false;
    }
  }, []);

  /**
   * Get the pose track pipeline for analysis
   */
  const getPipeline = useCallback((): PoseTrackPipeline | null => {
    return pipelineRef.current;
  }, []);

  /**
   * Get the live pose cache for streaming playback during extraction
   */
  const getLivePoseCache = useCallback((): LivePoseCache | null => {
    return livePoseCacheRef.current;
  }, []);

  return {
    status,
    videoHash,
    model,
    setModel,
    startExtraction,
    cancelExtraction,
    savePoseTrack: savePoseTrackToDb,
    downloadPoseTrack: downloadPoseTrackFile,
    loadFromFile,
    checkForExisting,
    loadExisting,
    getPipeline,
    getLivePoseCache,
    getModelDisplayName,
  };
}
