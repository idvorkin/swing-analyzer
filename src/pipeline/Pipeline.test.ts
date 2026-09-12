/**
 * Contract tests for Pipeline's error semantics. The consecutive-error
 * tracker in useExerciseAnalyzer depends on two invariants:
 *
 * 1. processSkeletonEvent() emits analysis errors to getErrorEvents()
 *    SYNCHRONOUSLY during the call (never deferred), so the caller can
 *    close each frame with frameProcessed() right after the call returns.
 * 2. The error channel never terminates: a streaming-path failure must not
 *    kill the Subject, or every later error becomes a silent no-op and
 *    degraded-analysis detection is permanently disarmed.
 */
import { Subject, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FormAnalyzer, FormAnalyzerResult } from '../analyzers';
import type { Skeleton } from '../models/Skeleton';
import type { CropRegion } from '../types/posetrack';
import {
  asRepCount,
  asTimestampMs,
  asVideoTimeSeconds,
} from '../utils/brandedTypes';
import { Pipeline, type PipelineError } from './Pipeline';
import type {
  FrameAcquisition,
  FrameEvent,
  SkeletonEvent,
  SkeletonTransformer,
} from './PipelineInterfaces';
import { VideoFrameAcquisition } from './VideoFrameAcquisition';

function makeFrameAcquisition(
  overrides: Partial<FrameAcquisition> = {}
): FrameAcquisition {
  return {
    getCurrentFrame: () => ({}) as HTMLCanvasElement,
    start: () => new Subject<FrameEvent>().asObservable(),
    stop: vi.fn(),
    ...overrides,
  } as FrameAcquisition;
}

const fakeTransformer = {
  initialize: async () => {},
  transformToSkeleton: () => new Subject<SkeletonEvent>().asObservable(),
  transformToSkeletonAsync: async () =>
    ({ skeleton: null }) as unknown as SkeletonEvent,
} as unknown as SkeletonTransformer;

/**
 * FormAnalyzer stub whose behavior is scripted per call. Reports itself as
 * the kettlebell-swing analyzer so setExerciseType('kettlebell-swing')
 * locks detection WITHOUT swapping the stub out for a real analyzer.
 */
function makeAnalyzer(script: Array<number | 'throw'>): FormAnalyzer {
  let call = 0;
  return {
    processFrame(): FormAnalyzerResult {
      const step = script[Math.min(call, script.length - 1)];
      call++;
      if (step === 'throw') {
        throw new Error('analyzer boom');
      }
      return {
        phase: 'top',
        repCount: asRepCount(step),
        repCompleted: false,
        angles: {},
      } as FormAnalyzerResult;
    },
    getPhase: () => 'top',
    getRepCount: () => asRepCount(0),
    getLastRepQuality: () => null,
    reset: vi.fn(),
    getExerciseName: () => 'Kettlebell Swing',
    getPhases: () => ['top', 'connect', 'bottom', 'release'],
    getHudConfig: () => ({ metrics: [] }),
  } as unknown as FormAnalyzer;
}

function makeSkeletonEvent(): SkeletonEvent {
  return {
    skeleton: {} as unknown as Skeleton,
    poseEvent: {
      pose: null,
      frameEvent: {
        frame: {} as HTMLCanvasElement,
        timestamp: asTimestampMs(1),
        videoTime: asVideoTimeSeconds(0.5),
      },
    },
  };
}

describe('Pipeline error contract', () => {
  let errors: PipelineError[];

  beforeEach(() => {
    errors = [];
  });

  function build(script: Array<number | 'throw'>, acq?: FrameAcquisition) {
    const pipeline = new Pipeline(
      acq ?? makeFrameAcquisition(),
      fakeTransformer,
      makeAnalyzer(script)
    );
    // Lock detection so the fake skeleton never reaches ExerciseDetector
    // (the stub names itself Kettlebell Swing, so the analyzer is kept).
    pipeline.setExerciseType('kettlebell-swing');
    pipeline.getErrorEvents().subscribe((e) => errors.push(e));
    return pipeline;
  }

  it('processSkeletonEvent never throws when the form analyzer throws', () => {
    const pipeline = build(['throw']);
    expect(() =>
      pipeline.processSkeletonEvent(makeSkeletonEvent())
    ).not.toThrow();
  });

  it('emits analyzer errors synchronously during the processSkeletonEvent call', () => {
    const pipeline = build(['throw']);
    pipeline.processSkeletonEvent(makeSkeletonEvent());
    // Same tick, no await: a deferred emission (microtask/observeOn) would
    // leave `errors` empty here and break per-frame error accounting.
    expect(errors).toHaveLength(1);
    expect(errors[0].source).toBe('form-analyzer');
    expect(errors[0].error.message).toBe('analyzer boom');
  });

  it('preserves the rep count from prior successful frames when a frame errors', () => {
    const pipeline = build([2, 'throw']);
    expect(pipeline.processSkeletonEvent(makeSkeletonEvent())).toBe(2);
    expect(pipeline.processSkeletonEvent(makeSkeletonEvent())).toBe(2);
  });

  it('keeps delivering error events after a streaming-path failure', () => {
    const acq = makeFrameAcquisition({
      start: () => throwError(() => new Error('stream died')),
    });
    const pipeline = build(['throw'], acq);
    const channelDied = vi.fn();
    pipeline.getErrorEvents().subscribe({ error: channelDied });

    pipeline.start(); // stream errors immediately

    // The stream failure itself must arrive as an EVENT, not a terminal
    // .error() on the channel.
    expect(channelDied).not.toHaveBeenCalled();
    expect(errors.some((e) => e.source === 'stream')).toBe(true);

    // And later analysis errors must still be delivered.
    const before = errors.length;
    pipeline.processSkeletonEvent(makeSkeletonEvent());
    expect(errors.length).toBe(before + 1);
    expect(errors[errors.length - 1].source).toBe('form-analyzer');
  });
});

describe('Pipeline crop state', () => {
  // useExerciseAnalyzer.resetVideoState relies on Pipeline.setCropEnabled(false)
  // being sufficient to report isCropEnabled() === false, because Pipeline.reset()
  // does NOT clear crop state on its own.
  function makeCrop(): CropRegion {
    return {
      x: 100,
      y: 50,
      width: 540,
      height: 720,
    } as CropRegion;
  }

  function buildWithVideoAcquisition() {
    const video = document.createElement('video');
    const acq = new VideoFrameAcquisition(video);
    const pipeline = new Pipeline(acq, fakeTransformer, makeAnalyzer([0]));
    return { pipeline, acq };
  }

  it('isCropEnabled() is false by default (no region, disabled)', () => {
    const { pipeline } = buildWithVideoAcquisition();
    expect(pipeline.isCropEnabled()).toBe(false);
    expect(pipeline.getCropRegion()).toBeNull();
  });

  it('setCropEnabled(true) reports enabled only when a crop region is set', () => {
    const { pipeline } = buildWithVideoAcquisition();
    pipeline.setCropRegion(makeCrop());
    // A region alone (without enabling) is not "enabled".
    expect(pipeline.isCropEnabled()).toBe(false);
    pipeline.setCropEnabled(true);
    expect(pipeline.isCropEnabled()).toBe(true);
    expect(pipeline.getCropRegion()).not.toBeNull();
  });

  it('setCropEnabled(false) disables crop even when a region is still set', () => {
    // This is the contract resetVideoState depends on: it calls
    // setCropEnabled(false) without clearing the region, and expects
    // isCropEnabled() === false afterwards (so the visible transform / CSS
    // driven by the React isCropEnabled flag and the pipeline flag agree).
    const { pipeline } = buildWithVideoAcquisition();
    pipeline.setCropRegion(makeCrop());
    pipeline.setCropEnabled(true);
    expect(pipeline.isCropEnabled()).toBe(true);

    pipeline.setCropEnabled(false);
    expect(pipeline.isCropEnabled()).toBe(false);
    // Region is intentionally left intact; only the enabled flag flips.
    expect(pipeline.getCropRegion()).not.toBeNull();
  });

  it('reset() does not clear crop state (the hook must clear it itself)', () => {
    // Documents why resetVideoState calls pipeline.setCropEnabled(false)
    // explicitly: Pipeline.reset() is not responsible for crop state.
    const { pipeline } = buildWithVideoAcquisition();
    pipeline.setCropRegion(makeCrop());
    pipeline.setCropEnabled(true);
    expect(pipeline.isCropEnabled()).toBe(true);

    pipeline.reset();
    // reset() leaves crop enabled; this is precisely the gap the hook patches.
    expect(pipeline.isCropEnabled()).toBe(true);
    expect(pipeline.getCropRegion()).not.toBeNull();
  });
});
