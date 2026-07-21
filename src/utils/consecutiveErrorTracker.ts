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
