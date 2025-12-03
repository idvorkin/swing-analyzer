# Swing Analyzer - Full PR Plan

This document captures the planned changes for the swing analyzer project.

## Current State

- ✅ E2E tests working with pose fixtures (PR #33)
- ✅ Playwright reporting infrastructure added
- ✅ Architecture documented in CLAUDE.md
- 111 unit tests passing
- 26 E2E tests passing

## Phase 1: Testing Foundation (Current PR #33)

**Status: Ready to merge**

- [x] Fix E2E tests to use pose fixtures instead of ML model
- [x] Add smart artifact capture (trace/video/screenshot)
- [x] Add `just e2e-report` command with self-documenting output
- [x] Document architecture in CLAUDE.md

## Phase 2: Unit Tests for Analysis Pipeline

**Status: Not started**

Goal: Add comprehensive unit tests for the analysis pipeline using hardcoded poseTracks.

- [ ] Add unit tests for `SwingFormProcessor` position detection
  - Test each position (Top, Connect, Bottom, Release) with known skeleton data
  - Test threshold boundaries
  - Test cycle detection logic
- [ ] Add unit tests for `SwingRepProcessor` rep counting
  - Test rep completion sequence (Release → Top)
  - Test partial cycles
  - Test reset behavior
- [ ] Add unit tests for `PoseTrackPipeline` with fixture data
  - Test `processAllFrames()` returns expected results
  - Test seeking behavior
  - Test rep counting accuracy

## Phase 3: Unified Pipeline Refactor

**Status: Not started**

Goal: Extract shared analysis logic so both real-time and batch modes use the same code.

### Target Architecture

```
                      SwingAnalyzer (shared core)
                             ▲
                             │
                      SwingProcessor
                             ▲
                             │
                 Observable<SkeletonEvent>
                             ▲
                             │
            ┌────────────────┴────────────────┐
            │                                 │
   VideoSkeletonSource              PoseTrackSkeletonSource
   (live, real-time)                (pre-extracted, fast)
```

### Components to Create

| Component                 | Purpose                                                    |
| ------------------------- | ---------------------------------------------------------- |
| `SwingAnalyzer`           | Pure analysis logic - position detection, rep counting     |
| `VideoSkeletonSource`     | Wraps current ML path, emits Observable<SkeletonEvent>     |
| `PoseTrackSkeletonSource` | Iterates PoseTrack frames, emits Observable<SkeletonEvent> |

### Refactor Steps

1. [ ] Extract `SwingAnalyzer` from `SwingFormProcessor`

   - Move position detection logic (`detectPosition`)
   - Move ideal angles and thresholds
   - Move cycle tracking state
   - Make it a pure class with no RxJS/video dependencies

2. [ ] Create `VideoSkeletonSource`

   - Wrap `VideoFrameAcquisition` + `PoseSkeletonTransformer`
   - Emit `Observable<SkeletonEvent>`

3. [ ] Create `PoseTrackSkeletonSource`

   - Take `PoseTrackFile` as input
   - Iterate frames, build Skeleton from keypoints
   - Emit `Observable<SkeletonEvent>` (fast, not throttled)

4. [ ] Update `SwingFormProcessor` to use `SwingAnalyzer`

   - Becomes a thin wrapper that subscribes to skeleton source
   - Delegates to `SwingAnalyzer` for analysis

5. [ ] Update `PoseTrackPipeline` to use `SwingAnalyzer`

   - Delete duplicated position detection logic (lines 354-419)
   - Use shared `SwingAnalyzer` instance

6. [ ] Verify both paths produce identical results
   - Add integration test comparing real-time vs batch analysis

## Phase 4: Model Abstraction (BlazePose Support)

**Status: Not started**

Goal: Support multiple pose detection models (MoveNet, BlazePose).

### Changes Required

1. [ ] Create model configuration

   - `src/config/modelConfig.ts` with model options
   - Runtime model selection

2. [ ] Create `PoseDetectorFactory`

   - Instantiate correct model based on config
   - Handle different keypoint formats (COCO-17 vs MediaPipe-33)

3. [ ] Update `PoseSkeletonTransformer`

   - Accept model type in constructor
   - Use factory to create detector

4. [ ] Create keypoint adapter
   - Map MediaPipe keypoints to COCO format (or vice versa)
   - Ensure `Skeleton` class works with both

### Keypoint Format Differences

| COCO-17              | MediaPipe-33                   |
| -------------------- | ------------------------------ |
| 17 keypoints         | 33 keypoints                   |
| No hands/face detail | Includes hands, face landmarks |
| Standard for MoveNet | Standard for BlazePose         |

## Phase 5: Exercise Abstraction (Pull-ups, Pistol Squats)

**Status: Not started**

Goal: Support multiple exercises beyond kettlebell swings.

### New Exercises

1. **Pull-ups**

   - Positions: Hang, Pull, Top
   - Key angles: Elbow angle, shoulder elevation
   - Rep: Hang → Top → Hang

2. **Pistol Squats**
   - Positions: Standing, Descending, Bottom, Ascending
   - Key angles: Hip, knee (single leg)
   - Rep: Standing → Bottom → Standing

### Architecture Changes

1. [ ] Create `ExerciseDefinition` interface

   ```typescript
   interface ExerciseDefinition {
     name: string;
     positions: string[];
     idealAngles: Map<string, AngleConfig>;
     repCriteria: RepCriteria;
   }
   ```

2. [ ] Create exercise-specific analyzers

   - `SwingAnalyzer` (existing, refactored)
   - `PullUpAnalyzer`
   - `PistolSquatAnalyzer`

3. [ ] Create analyzer factory

   ```typescript
   function createAnalyzer(exercise: ExerciseType): ExerciseAnalyzer;
   ```

4. [ ] Update UI to select exercise type

## Open Questions

1. **BlazePose priority**: Is this a firm requirement or nice-to-have?
2. **Exercise reference videos**: Do we have sample videos for pull-ups and pistol squats?
3. **Mobile support**: When should we enable mobile E2E tests?

## Related Files

- `CLAUDE.md` - Architecture documentation
- `e2e-tests/fixtures/pose-factory.ts` - Synthetic pose generation
- `src/pipeline/SwingFormProcessor.ts` - Current position detection (659 lines)
- `src/pipeline/PoseTrackPipeline.ts` - Current batch processing (531 lines)
- `src/pipeline/PoseSkeletonTransformer.ts` - Current ML integration (309 lines)
