/**
 * useInputSession - React hook for managing input sources
 *
 * This is a thin wrapper around InputSession that:
 * - Creates and manages the InputSession lifecycle
 * - Exposes state as React state
 * - Handles cleanup on unmount
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { InputSession, type InputSessionState } from '../pipeline/InputSession';
import type { SkeletonEvent } from '../pipeline/PipelineInterfaces';
import type { ExtractionProgress } from '../pipeline/SkeletonSource';

/**
 * Options for useInputSession
 */
export interface UseInputSessionOptions {
  /** Video element ref */
  videoElement: HTMLVideoElement | null;
  /** Canvas element ref */
  canvasElement: HTMLCanvasElement | null;
  /** Callback when skeleton is detected */
  onSkeleton?: (skeleton: SkeletonEvent) => void;
  /** Callback when extraction progress updates */
  onExtractionProgress?: (progress: ExtractionProgress) => void;
}

/**
 * Return value from useInputSession
 */
export interface UseInputSessionReturn {
  /** Current session state */
  state: InputSessionState;
  /** Whether we're currently extracting */
  isExtracting: boolean;
  /** Whether extraction/cache loading is complete */
  isReady: boolean;
  /** Whether there's an error */
  hasError: boolean;
  /** Error message if any */
  errorMessage: string | null;
  /** Current extraction progress (if extracting) */
  extractionProgress: ExtractionProgress | null;
  /** Start video file input */
  startVideoFile: (file: File) => Promise<void>;
  /** Stop current input */
  stop: () => void;
  /** Get skeleton at a specific video time (for seeking) */
  getSkeletonAtTime: (videoTime: number) => SkeletonEvent | null;
  /** Check if skeleton is available at time */
  hasSkeletonAtTime: (videoTime: number) => boolean;
  /** Save current pose track to storage */
  save: () => Promise<void>;
  /** The underlying session (for advanced use) */
  session: InputSession | null;
}

/**
 * React hook for managing video input
 */
export function useInputSession(
  options: UseInputSessionOptions
): UseInputSessionReturn {
  const { videoElement, canvasElement, onSkeleton, onExtractionProgress } =
    options;

  // Session instance
  const sessionRef = useRef<InputSession | null>(null);

  // Store callbacks in refs to avoid session recreation when callbacks change
  const onSkeletonRef = useRef(onSkeleton);
  const onExtractionProgressRef = useRef(onExtractionProgress);

  // Keep refs in sync with current callbacks
  useEffect(() => {
    onSkeletonRef.current = onSkeleton;
  }, [onSkeleton]);

  useEffect(() => {
    onExtractionProgressRef.current = onExtractionProgress;
  }, [onExtractionProgress]);

  // State
  const [state, setState] = useState<InputSessionState>({ type: 'idle' });
  const [extractionProgress, setExtractionProgress] =
    useState<ExtractionProgress | null>(null);

  // Create session when elements are available
  useEffect(() => {
    if (!videoElement || !canvasElement) {
      return;
    }

    // Create session
    const session = new InputSession({
      videoElement,
      canvasElement,
    });

    sessionRef.current = session;

    // Subscribe to state changes
    const stateSubscription = session.state$.subscribe((newState) => {
      setState(newState);
    });

    // Subscribe to skeleton events (use ref for callback stability)
    const skeletonSubscription = session.skeletons$.subscribe((skeleton) => {
      onSkeletonRef.current?.(skeleton);
    });

    // Subscribe to extraction progress (use ref for callback stability)
    const progressSubscription = session.extractionProgress$.subscribe(
      (progress) => {
        setExtractionProgress(progress);
        onExtractionProgressRef.current?.(progress);
      }
    );

    // Cleanup
    return () => {
      stateSubscription.unsubscribe();
      skeletonSubscription.unsubscribe();
      progressSubscription.unsubscribe();
      session.dispose();
      sessionRef.current = null;
    };
  }, [videoElement, canvasElement]); // Callbacks excluded - handled via refs

  // Start video file
  const startVideoFile = useCallback(async (file: File) => {
    if (!sessionRef.current) {
      throw new Error('Session not initialized');
    }
    await sessionRef.current.startVideoFile(file);
  }, []);

  // Stop
  const stop = useCallback(() => {
    sessionRef.current?.stop();
  }, []);

  // Get skeleton at time
  const getSkeletonAtTime = useCallback((videoTime: number) => {
    return sessionRef.current?.getSkeletonAtTime(videoTime) ?? null;
  }, []);

  // Has skeleton at time
  const hasSkeletonAtTime = useCallback((videoTime: number) => {
    return sessionRef.current?.hasSkeletonAtTime(videoTime) ?? false;
  }, []);

  // Save
  const save = useCallback(async () => {
    if (!sessionRef.current) {
      throw new Error('Session not initialized');
    }
    await sessionRef.current.save();
  }, []);

  // Derived state
  const isExtracting = useMemo(() => {
    if (state.type === 'video-file') {
      return state.sourceState.type === 'extracting';
    }
    return false;
  }, [state]);

  const isReady = useMemo(() => {
    if (state.type === 'video-file') {
      return state.sourceState.type === 'active';
    }
    return false;
  }, [state]);

  const hasError = state.type === 'error';
  const errorMessage = state.type === 'error' ? state.message : null;

  return {
    state,
    isExtracting,
    isReady,
    hasError,
    errorMessage,
    extractionProgress: isExtracting ? extractionProgress : null,
    startVideoFile,
    stop,
    getSkeletonAtTime,
    hasSkeletonAtTime,
    save,
    session: sessionRef.current,
  };
}
