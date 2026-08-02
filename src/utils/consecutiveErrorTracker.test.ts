import { describe, expect, it, vi } from 'vitest';
import {
  createConsecutiveErrorTracker,
  runTrackedFrame,
} from './consecutiveErrorTracker';

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

  it('reset() mid-streak requires a full fresh streak to reach threshold', () => {
    const onThreshold = vi.fn();
    const tracker = createConsecutiveErrorTracker(3, onThreshold);

    // threshold-1 errored frames
    tracker.recordError();
    tracker.frameProcessed();
    tracker.recordError();
    tracker.frameProcessed();
    expect(onThreshold).not.toHaveBeenCalled();

    tracker.reset();

    // Only 2 more errored frames (would have hit threshold=3 without reset)
    tracker.recordError();
    tracker.frameProcessed();
    tracker.recordError();
    tracker.frameProcessed();
    expect(onThreshold).not.toHaveBeenCalled();

    // A full fresh streak of 3 now fires it
    tracker.recordError();
    tracker.frameProcessed();
    expect(onThreshold).toHaveBeenCalledTimes(1);
  });

  it('reset() clears a pending erroredThisFrame so the next frameProcessed() counts as clean', () => {
    const onThreshold = vi.fn();
    const tracker = createConsecutiveErrorTracker(2, onThreshold);

    tracker.recordError();
    tracker.frameProcessed(); // 1 errored frame
    tracker.recordError(); // pending error, not yet closed by frameProcessed()

    tracker.reset();

    // The pending recordError() must not carry over into this frame.
    tracker.frameProcessed();
    tracker.recordError();
    tracker.frameProcessed(); // would be the 2nd errored frame only if the streak survived reset
    expect(onThreshold).not.toHaveBeenCalled();
  });

  it('after a fired threshold + reset(), a new full streak fires onThreshold again', () => {
    const onThreshold = vi.fn();
    const tracker = createConsecutiveErrorTracker(2, onThreshold);

    tracker.recordError();
    tracker.frameProcessed();
    tracker.recordError();
    tracker.frameProcessed(); // threshold reached
    expect(onThreshold).toHaveBeenCalledTimes(1);

    tracker.reset();

    tracker.recordError();
    tracker.frameProcessed();
    tracker.recordError();
    tracker.frameProcessed(); // fresh streak reaches threshold again
    expect(onThreshold).toHaveBeenCalledTimes(2);
  });
});

describe('threshold validation', () => {
  it.each([0, -1, 2.5, Number.NaN])(
    'rejects threshold %p at construction instead of silently never firing',
    (threshold) => {
      expect(() => createConsecutiveErrorTracker(threshold, vi.fn())).toThrow(
        /threshold/i
      );
    }
  );

  it('accepts threshold 1 and fires on the first errored frame', () => {
    const onThreshold = vi.fn();
    const tracker = createConsecutiveErrorTracker(1, onThreshold);
    tracker.recordError();
    tracker.frameProcessed();
    expect(onThreshold).toHaveBeenCalledTimes(1);
  });
});

describe('runTrackedFrame', () => {
  it('a throwing frame counts toward the consecutive-error streak', () => {
    const onThreshold = vi.fn();
    const tracker = createConsecutiveErrorTracker(2, onThreshold);

    runTrackedFrame(tracker, () => {
      throw new Error('boom');
    });
    expect(onThreshold).not.toHaveBeenCalled();
    runTrackedFrame(tracker, () => {
      throw new Error('boom again');
    });
    expect(onThreshold).toHaveBeenCalledTimes(1);
  });

  it('returns the value and closes the frame clean on success', () => {
    const onThreshold = vi.fn();
    const tracker = createConsecutiveErrorTracker(2, onThreshold);

    runTrackedFrame(tracker, () => {
      throw new Error('boom');
    }); // streak 1
    const result = runTrackedFrame(tracker, () => 42); // clean frame resets
    expect(result).toEqual({ ok: true, value: 42 });
    runTrackedFrame(tracker, () => {
      throw new Error('boom');
    }); // streak 1 again, not 2
    expect(onThreshold).not.toHaveBeenCalled();
  });

  it('returns {ok:false, error} instead of propagating the throw', () => {
    const tracker = createConsecutiveErrorTracker(5, vi.fn());
    const boom = new Error('boom');
    const result = runTrackedFrame(tracker, () => {
      throw boom;
    });
    expect(result).toEqual({ ok: false, error: boom });
  });

  it('an error recorded mid-frame before a throw is charged to THAT frame, not the next', () => {
    const onThreshold = vi.fn();
    const tracker = createConsecutiveErrorTracker(2, onThreshold);

    // Frame 1: pipeline emits an error to the subscription (recordError),
    // then the call itself throws. Both must collapse into ONE errored
    // frame that is closed now — not left pending for frame 2.
    runTrackedFrame(tracker, () => {
      tracker.recordError();
      throw new Error('boom');
    });
    // Frame 2: clean — resets the streak (would count as errored if the
    // pending flag leaked).
    runTrackedFrame(tracker, () => 'ok');
    // Frame 3: errored — streak restarts at 1.
    runTrackedFrame(tracker, () => {
      tracker.recordError();
      return 'ok';
    });
    expect(onThreshold).not.toHaveBeenCalled();
  });

  it('runs the frame directly when no tracker exists yet', () => {
    const result = runTrackedFrame(null, () => 7);
    expect(result).toEqual({ ok: true, value: 7 });
  });
});
