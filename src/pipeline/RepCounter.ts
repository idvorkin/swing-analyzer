/**
 * RepCounter - Generic rep counting for exercise analysis
 *
 * A configurable rep counter that tracks position sequences and enforces
 * timing constraints based on RepCriteria configuration. This class is
 * pure and has no dependencies on RxJS or video.
 *
 * Can be used:
 * - Standalone with manual position updates
 * - Composed with FormAnalyzer for full analysis
 * - In batch processing for recorded data
 */

import type { RepCriteria } from '../types/exercise';

/**
 * Result of processing a position update
 */
export interface RepCountResult {
  /** Current rep count */
  repCount: number;
  /** Whether a rep was just completed */
  repCompleted: boolean;
  /** Positions detected in current rep attempt */
  detectedPositions: string[];
  /** Missing positions for rep completion */
  missingPositions: string[];
  /** Last detected position */
  lastPosition: string | null;
}

/**
 * Generic rep counter that works with any RepCriteria configuration
 */
export class RepCounter {
  private readonly criteria: RepCriteria;

  // Counting state
  private repCount = 0;
  private detectedPositions = new Set<string>();
  private lastPosition: string | null = null;
  private lastRepTimestamp = 0;

  constructor(criteria: RepCriteria) {
    this.criteria = criteria;
  }

  /**
   * Process a position update and check for rep completion.
   *
   * @param position - Current detected position (or null if no position)
   * @param timestamp - Current timestamp in milliseconds
   * @returns Rep count result with completion status
   */
  processPosition(
    position: string | null,
    timestamp: number = Date.now()
  ): RepCountResult {
    let repCompleted = false;

    if (position) {
      // Track this position
      this.detectedPositions.add(position);

      // Check for rep completion based on criteria
      if (this.shouldCountRep(position, timestamp)) {
        this.repCount++;
        repCompleted = true;
        this.lastRepTimestamp = timestamp;

        // Reset for next rep, keeping current position
        this.detectedPositions.clear();
        this.detectedPositions.add(position);
      }

      this.lastPosition = position;
    }

    return {
      repCount: this.repCount,
      repCompleted,
      detectedPositions: Array.from(this.detectedPositions),
      missingPositions: this.getMissingPositions(),
      lastPosition: this.lastPosition,
    };
  }

  /**
   * Check if conditions are met to count a rep
   */
  private shouldCountRep(currentPosition: string, timestamp: number): boolean {
    const { completionSequence, minRepDuration, maxRepDuration } = this.criteria;

    // Check if we have at least 2 positions in completion sequence
    if (completionSequence.length < 2) {
      return false;
    }

    // Check sequence: last position should be first in sequence,
    // current position should be last in sequence
    const sequenceStart = completionSequence[0];
    const sequenceEnd = completionSequence[completionSequence.length - 1];

    if (this.lastPosition !== sequenceStart || currentPosition !== sequenceEnd) {
      return false;
    }

    // Check that all required positions have been detected
    if (!this.hasRequiredPositions()) {
      return false;
    }

    // Check timing constraints
    const timeSinceLastRep = timestamp - this.lastRepTimestamp;

    // Minimum duration check (not too fast)
    if (timeSinceLastRep < minRepDuration) {
      return false;
    }

    // Maximum duration check (not too slow) - only if we've counted at least one rep
    if (this.lastRepTimestamp > 0 && timeSinceLastRep > maxRepDuration) {
      // Rep took too long - still count it but note the timing issue
      // Could add a quality flag here in the future
    }

    return true;
  }

  /**
   * Check if all required positions have been detected
   */
  private hasRequiredPositions(): boolean {
    return this.criteria.requiredPositions.every((pos) =>
      this.detectedPositions.has(pos)
    );
  }

  /**
   * Get positions that are still needed for rep completion
   */
  private getMissingPositions(): string[] {
    return this.criteria.requiredPositions.filter(
      (pos) => !this.detectedPositions.has(pos)
    );
  }

  /**
   * Get current rep count
   */
  getRepCount(): number {
    return this.repCount;
  }

  /**
   * Get the criteria configuration
   */
  getCriteria(): RepCriteria {
    return this.criteria;
  }

  /**
   * Get detected positions in current rep attempt
   */
  getDetectedPositions(): string[] {
    return Array.from(this.detectedPositions);
  }

  /**
   * Get the last detected position
   */
  getLastPosition(): string | null {
    return this.lastPosition;
  }

  /**
   * Get time since last rep was counted
   */
  getTimeSinceLastRep(currentTimestamp: number = Date.now()): number {
    if (this.lastRepTimestamp === 0) {
      return 0;
    }
    return currentTimestamp - this.lastRepTimestamp;
  }

  /**
   * Check if rep is in progress (some positions detected but not complete)
   */
  isRepInProgress(): boolean {
    return (
      this.detectedPositions.size > 0 &&
      !this.hasRequiredPositions()
    );
  }

  /**
   * Get progress towards next rep (0-100%)
   */
  getRepProgress(): number {
    const required = this.criteria.requiredPositions;
    if (required.length === 0) return 0;

    const detected = required.filter((pos) =>
      this.detectedPositions.has(pos)
    ).length;
    return (detected / required.length) * 100;
  }

  /**
   * Reset the counter state
   */
  reset(): void {
    this.repCount = 0;
    this.detectedPositions.clear();
    this.lastPosition = null;
    this.lastRepTimestamp = 0;
  }

  /**
   * Set rep count manually (e.g., for restoring state)
   */
  setRepCount(count: number): void {
    this.repCount = count;
  }
}

/**
 * Factory function to create a RepCounter with default swing criteria
 */
export function createSwingRepCounter(): RepCounter {
  return new RepCounter({
    requiredPositions: ['top', 'connect', 'bottom', 'release'],
    completionSequence: ['release', 'top'],
    minRepDuration: 500,
    maxRepDuration: 5000,
  });
}

/**
 * Factory function to create a RepCounter with default pull-up criteria
 */
export function createPullUpRepCounter(): RepCounter {
  return new RepCounter({
    requiredPositions: ['hang', 'top'],
    completionSequence: ['top', 'hang'],
    minRepDuration: 1000,
    maxRepDuration: 10000,
  });
}

/**
 * Factory function to create a RepCounter with default pistol squat criteria
 */
export function createPistolSquatRepCounter(): RepCounter {
  return new RepCounter({
    requiredPositions: ['stand', 'bottom'],
    completionSequence: ['bottom', 'stand'],
    minRepDuration: 1500,
    maxRepDuration: 15000,
  });
}
