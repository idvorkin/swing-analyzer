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
  };
}
