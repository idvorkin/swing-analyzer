/**
 * Tracks consecutive FRAMES that produced analysis errors. Pipeline errors
 * are emitted synchronously during processSkeletonEvent, so per-frame
 * success cannot be inferred from "the call returned" — the caller marks
 * errors as they arrive and closes each frame with frameProcessed().
 */
export function createConsecutiveErrorTracker(
  threshold: number,
  onThreshold: () => void
) {
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
    /**
     * Zeroes the streak and clears any pending erroredThisFrame flag, for
     * use when starting a new video so an in-progress streak (or a fired
     * threshold) doesn't leak across videos. This does NOT "re-arm"
     * onThreshold in any special sense — onThreshold only ever fires when
     * `consecutive` reaches `threshold` exactly, and a fired threshold
     * already stays fired only within that one streak (see
     * "does not re-fire onThreshold" above). So after reset() a fresh
     * streak reaching `threshold` will fire onThreshold again, same as any
     * other new streak - which is the correct behavior for a new video.
     */
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
  tracker: ReturnType<typeof createConsecutiveErrorTracker> | null,
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
