import { useCallback, useEffect, useState } from 'react';

export interface UseKeyboardNavigationProps {
  currentRepIndex: number;
  repCount: number;
  onNavigateToPreviousRep: () => void;
  onNavigateToNextRep: () => void;
  togglePlayPause: () => void;
  nextFrame: () => void;
  previousFrame: () => void;
}

export interface UseKeyboardNavigationReturn {
  isFullscreen: boolean;
  navigateToPreviousRep: () => void;
  navigateToNextRep: () => void;
}

/**
 * Hook for keyboard navigation controls
 *
 * Provides:
 * - Rep navigation (previous/next) in fullscreen mode using arrow keys
 * - Fullscreen state detection
 * - Global keyboard shortcuts:
 *   - Space: toggle play/pause
 *   - Period (.): next frame
 *   - Comma (,): previous frame
 *   - Arrow Left/Right: navigate reps (fullscreen only)
 */
export function useKeyboardNavigation({
  currentRepIndex,
  repCount,
  onNavigateToPreviousRep,
  onNavigateToNextRep,
  togglePlayPause,
  nextFrame,
  previousFrame,
}: UseKeyboardNavigationProps): UseKeyboardNavigationReturn {
  // Track fullscreen state
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Rep navigation with bounds checking
  const navigateToPreviousRep = useCallback(() => {
    if (currentRepIndex > 0) {
      onNavigateToPreviousRep();
    }
  }, [currentRepIndex, onNavigateToPreviousRep]);

  const navigateToNextRep = useCallback(() => {
    if (currentRepIndex < repCount - 1) {
      onNavigateToNextRep();
    }
  }, [currentRepIndex, repCount, onNavigateToNextRep]);

  // Setup fullscreen detection and keyboard navigation
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      // Fullscreen mode only controls
      if (document.fullscreenElement) {
        if (event.key === 'ArrowLeft') {
          navigateToPreviousRep();
        } else if (event.key === 'ArrowRight') {
          navigateToNextRep();
        }
      }

      // Global video controls (work in any view)
      if (event.key === ' ' || event.key === 'Space') {
        // Space bar toggles play/pause
        event.preventDefault(); // Prevent page scrolling
        togglePlayPause();
      } else if (event.key === '.') {
        // Period key steps forward one frame
        event.preventDefault();
        nextFrame();
      } else if (event.key === ',') {
        // Comma key steps backward one frame
        event.preventDefault();
        previousFrame();
      }
    };

    // Add event listeners
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    // Clean up event listeners on unmount
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [
    navigateToPreviousRep,
    navigateToNextRep,
    togglePlayPause,
    nextFrame,
    previousFrame,
  ]);

  return {
    isFullscreen,
    navigateToPreviousRep,
    navigateToNextRep,
  };
}
