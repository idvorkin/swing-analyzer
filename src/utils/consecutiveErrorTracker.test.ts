import { describe, expect, it, vi } from 'vitest';
import { createConsecutiveErrorTracker } from './consecutiveErrorTracker';

describe('createConsecutiveErrorTracker', () => {
  it('fires onThreshold exactly once, at the threshold-th consecutive errored frame', () => {
    const onThreshold = vi.fn();
    const tracker = createConsecutiveErrorTracker(3, onThreshold);

    tracker.recordError();
    tracker.frameProcessed(); // errored frame 1
    expect(onThreshold).not.toHaveBeenCalled();

    tracker.recordError();
    tracker.frameProcessed(); // errored frame 2
    expect(onThreshold).not.toHaveBeenCalled();

    tracker.recordError();
    tracker.frameProcessed(); // errored frame 3 - threshold reached
    expect(onThreshold).toHaveBeenCalledTimes(1);
  });

  it('resets the streak when a clean frame occurs, so it never fires if the streak is broken', () => {
    const onThreshold = vi.fn();
    const tracker = createConsecutiveErrorTracker(3, onThreshold);

    // threshold-1 errored frames
    tracker.recordError();
    tracker.frameProcessed();
    tracker.recordError();
    tracker.frameProcessed();

    // one clean frame resets the streak
    tracker.frameProcessed();

    // threshold-1 errored frames again - still short of threshold
    tracker.recordError();
    tracker.frameProcessed();
    tracker.recordError();
    tracker.frameProcessed();

    expect(onThreshold).not.toHaveBeenCalled();
  });

  it('counts multiple recordError() calls within one frame as a single errored frame', () => {
    const onThreshold = vi.fn();
    const tracker = createConsecutiveErrorTracker(2, onThreshold);

    tracker.recordError();
    tracker.recordError();
    tracker.recordError();
    tracker.frameProcessed(); // still just 1 errored frame despite 3 recordError() calls
    expect(onThreshold).not.toHaveBeenCalled();

    tracker.recordError();
    tracker.frameProcessed(); // 2nd errored frame - threshold reached
    expect(onThreshold).toHaveBeenCalledTimes(1);
  });

  it('does not re-fire onThreshold for errored frames beyond the threshold', () => {
    const onThreshold = vi.fn();
    const tracker = createConsecutiveErrorTracker(2, onThreshold);

    tracker.recordError();
    tracker.frameProcessed();
    tracker.recordError();
    tracker.frameProcessed(); // threshold reached
    expect(onThreshold).toHaveBeenCalledTimes(1);

    tracker.recordError();
    tracker.frameProcessed();
    tracker.recordError();
    tracker.frameProcessed();
    expect(onThreshold).toHaveBeenCalledTimes(1);
  });
});
