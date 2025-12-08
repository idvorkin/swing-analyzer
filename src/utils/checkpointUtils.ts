/**
 * Checkpoint utilities for rep navigation
 *
 * Extracted from useSwingAnalyzerV2 to enable unit testing.
 */

import type { PositionCandidate } from '../types/exercise';

export interface Checkpoint {
  repNum: number;
  position: string;
  videoTime: number;
}

/**
 * Build a flat list of all checkpoints sorted by video time.
 *
 * @param repThumbnails - Map of rep number to position thumbnails
 * @param phases - Ordered list of phase names for the current exercise
 * @returns Sorted array of checkpoints
 */
export function buildCheckpointList(
  repThumbnails: Map<number, Map<string, PositionCandidate>>,
  phases: readonly string[]
): Checkpoint[] {
  const checkpoints: Checkpoint[] = [];

  for (const [repNum, positions] of repThumbnails.entries()) {
    for (const posName of phases) {
      const candidate = positions.get(posName);
      if (candidate?.videoTime !== undefined) {
        checkpoints.push({
          repNum,
          position: posName,
          videoTime: candidate.videoTime,
        });
      }
    }
  }

  // Sort by video time
  checkpoints.sort((a, b) => a.videoTime - b.videoTime);
  return checkpoints;
}

/**
 * Find the next checkpoint after a given time.
 *
 * @param checkpoints - Sorted list of checkpoints
 * @param currentTime - Current video time
 * @param tolerance - Time tolerance to avoid finding the same checkpoint (default 0.01s)
 * @returns The next checkpoint, or undefined if none exists
 */
export function findNextCheckpoint(
  checkpoints: Checkpoint[],
  currentTime: number,
  tolerance = 0.01
): Checkpoint | undefined {
  return checkpoints.find(cp => cp.videoTime > currentTime + tolerance);
}

/**
 * Find the previous checkpoint before a given time.
 *
 * @param checkpoints - Sorted list of checkpoints
 * @param currentTime - Current video time
 * @param tolerance - Time tolerance (default 0.1s)
 * @returns The previous checkpoint, or undefined if none exists
 */
export function findPreviousCheckpoint(
  checkpoints: Checkpoint[],
  currentTime: number,
  tolerance = 0.1
): Checkpoint | undefined {
  // Find the last checkpoint before (currentTime - tolerance)
  const targetTime = currentTime - tolerance;
  let prevCheckpoint: Checkpoint | undefined;

  for (const cp of checkpoints) {
    if (cp.videoTime < targetTime) {
      prevCheckpoint = cp;
    } else {
      break;
    }
  }

  return prevCheckpoint;
}
