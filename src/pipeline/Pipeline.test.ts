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
