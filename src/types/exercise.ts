/**
 * Position Candidate Type
 *
 * Used to store captured position data for rep filmstrips.
 */

/**
 * Candidate for a position within a rep cycle
 */
export interface PositionCandidate {
  /** Position name */
  position: string;
  /** Frame timestamp */
  timestamp: number;
  /** Video time in seconds */
  videoTime?: number;
  /** All angle values at this frame */
  angles: Record<string, number>;
  /** Score indicating how well this matches the ideal position (lower = better) */
  score: number;
  /** Thumbnail image for filmstrip (runtime only, not persisted) */
  frameImage?: ImageData;
}
