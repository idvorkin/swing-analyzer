export interface ConsecutiveErrorTracker {
  /** Mark the current frame as errored (idempotent within a frame). */
  recordError(): void;
  /** Close the current frame; exactly one call per frame. */
  frameProcessed(): void;
  /**
   * Zeroes the streak and clears any pending erroredThisFrame flag — call
   * when starting a new video so a streak (or a fired threshold) doesn't
   * leak across videos. onThreshold fires only when the streak reaches
   * `threshold` exactly, so a fresh post-reset streak fires it again.
   */
  reset(): void;
}

/**
 * Tracks consecutive FRAMES that produced analysis errors. Pipeline errors
 * are emitted synchronously during processSkeletonEvent, so per-frame
 * success cannot be inferred from "the call returned" — the caller marks
 * errors as they arrive and closes each frame with frameProcessed()
 * (or uses runTrackedFrame, which does so in a finally).
 */
export function createConsecutiveErrorTracker(
  threshold: number,
  onThreshold: () => void
): ConsecutiveErrorTracker {
  // The fire condition is `consecutive === threshold` exactly; a
  // non-positive or fractional threshold would silently never fire.
  if (!Number.isInteger(threshold) || threshold < 1) {
    throw new Error(`threshold must be a positive integer, got ${threshold}`);
  }
  let consecutive = 0;
  let erroredThisFrame = false;
  return {
    recordError() {
      erroredThisFrame = true;
    },
    frameProcessed() {
      if (erroredThisFrame) {
        erroredThisFrame = false;
        consecutive++;
        if (consecutive === threshold) {
          onThreshold();
        }
      } else {
        consecutive = 0;
      }
    },
    reset() {
      consecutive = 0;
      erroredThisFrame = false;
    },
  };
}

export type TrackedFrameResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: unknown };

/**
 * Runs one frame's processing under the tracker's protocol: a throw counts
 * as an errored frame, and the frame is ALWAYS closed (frameProcessed in a
 * finally), so an error recorded mid-frame can never leak into the next
 * frame's accounting. The throw is returned, not propagated — frame
 * processing must not crash the caller.
 */
export function runTrackedFrame<T>(
  tracker: ConsecutiveErrorTracker | null,
  fn: () => T
): TrackedFrameResult<T> {
  try {
    return { ok: true, value: fn() };
  } catch (error) {
    tracker?.recordError();
    return { ok: false, error };
  } finally {
    tracker?.frameProcessed();
  }
}
