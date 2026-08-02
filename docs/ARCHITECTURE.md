# Architecture Overview

This document describes the architecture of the Swing Analyzer application to help developers understand where different types of code belong.

## Core Concept

The app processes video frames through a pipeline that detects human poses, calculates biomechanical angles, identifies exercise phases, and counts reps:

```
Frame → Pose Detection → Skeleton → Form Analysis → Rep Count → UI
```

## Layer Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         UI LAYER                            │
│  React components: VideoSectionV2, StatusBanner, etc.      │
└─────────────────────────────────────────────────────────────┘
                              ▲
┌─────────────────────────────────────────────────────────────┐
│                       HOOKS LAYER                           │
│  State management: useSwingAnalyzerV2, useVideoControls    │
└─────────────────────────────────────────────────────────────┘
                              ▲
┌─────────────────────────────────────────────────────────────┐
│                    PIPELINE LAYER                           │
│  Orchestration: Pipeline, InputSession, SkeletonSource     │
└─────────────────────────────────────────────────────────────┘
                              ▲
┌─────────────────────────────────────────────────────────────┐
│                    ANALYSIS LAYER                           │
│  Exercise logic: FormAnalyzer, KettlebellSwingFormAnalyzer │
└─────────────────────────────────────────────────────────────┘
                              ▲
┌─────────────────────────────────────────────────────────────┐
│                  BIOMECHANICS LAYER                         │
│  Skeleton model: angle calculations, keypoint queries      │
└─────────────────────────────────────────────────────────────┘
                              ▲
┌─────────────────────────────────────────────────────────────┐
│                  INFRASTRUCTURE LAYER                       │
│  ML models, file I/O, device services, session recording   │
└─────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
src/
├── components/          # React UI components
├── hooks/               # React hooks (state + side effects)
├── pipeline/            # Data processing orchestration
├── analyzers/           # Exercise-specific form analysis
├── models/              # Domain models (Skeleton)
├── viewmodels/          # View logic (SkeletonRenderer)
├── services/            # Infrastructure services
├── config/              # Configuration (model settings, sample videos)
├── utils/               # Pure utility functions
└── types.ts             # Shared type definitions
```

Documentation lives in two places by origin: `docs/specs/` holds
feature specs written directly, while `docs/superpowers/specs/` and
`docs/superpowers/plans/` hold specs and implementation plans produced
by the superpowers brainstorming/planning workflow (dated, with
completion/deviation headers once shipped).

## Layer Details

### 1. UI Layer (`src/components/`)

React components for rendering. **No business logic here.**

| Component                | Purpose                                 |
| ------------------------ | --------------------------------------- |
| `VideoSectionV2.tsx`     | Main video player container (incl. HUD) |
| `StatusBanner.tsx`       | Error/warning banner (AppError channel) |
| `SettingsModal.tsx`      | User preferences                        |
| `PoseTrackStatusBar.tsx` | Extraction progress                     |

**Where to add UI:**

- New visual elements → `components/`
- Complex UI state → create a hook in `hooks/`

### 2. Hooks Layer (`src/hooks/`)

State management and side effect coordination.

| Hook                       | Purpose                                    |
| -------------------------- | ------------------------------------------ |
| `useSwingAnalyzerV2.tsx`   | Main coordinator - connects pipeline to UI |
| `useVideoControls.ts`      | Video playback state                       |
| `useInputSession.ts`       | Input mode state machine                   |
| `useKeyboardNavigation.ts` | Keyboard shortcuts                         |

**Where to add state logic:**

- UI-specific state → keep in component
- Shared/complex state → create hook
- Cross-cutting concerns → add to `useSwingAnalyzerV2`

### 3. Pipeline Layer (`src/pipeline/`)

Data processing orchestration. This is where frames become analysis results.

| Module                             | Purpose                                                  |
| ---------------------------------- | -------------------------------------------------------- |
| `Pipeline.ts`                      | Main orchestrator - combines frame + skeleton + analysis |
| `InputSession.ts`                  | State machine for input lifecycle                        |
| `VideoFileSkeletonSource.ts`       | Extracts skeletons from video files                      |
| `LivePoseCache.ts`                 | Streaming cache for concurrent extraction/playback       |
| `PoseSkeletonTransformer.ts`       | Converts ML poses → Skeleton objects                     |
| `CachedPoseSkeletonTransformer.ts` | Uses pre-extracted poses (from cache)                    |
| `PipelineFactory.ts`               | Creates pipeline instances                               |
| `KeypointAdapter.ts`               | Validates MediaPipe BlazePose-33 keypoint format         |

**Data flow:**

```
VideoFileSkeletonSource
    │
    ▼ (emits SkeletonEvent)
Pipeline.processSkeletonEvent()
    │
    ├── exerciseDetector.processFrame() → auto-detect (until locked)
    ├── formAnalyzer.processFrame()     → phase detection + rep counting
    │
    ▼ (returns rep count; thumbnails/errors via subjects)
UI updates (hooks consume results)
```

**Where to add pipeline logic:**

- New input sources → implement `SkeletonSource` interface
- New processing steps → add to `Pipeline.ts`
- New skeleton transformations → create transformer

### 4. Analysis Layer (`src/analyzers/`)

Exercise-specific form analysis. **This is the plugin system.**

| Module                           | Purpose                                  |
| -------------------------------- | ---------------------------------------- |
| `FormAnalyzer.ts`                | Interface definition                     |
| `FormAnalyzerBase.ts`            | Abstract base class with common logic    |
| `ExerciseRegistry.ts`            | Plugin registry for all exercises        |
| `ExerciseDetector.ts`            | Auto-detects exercise type from movement |
| `KettlebellSwingFormAnalyzer.ts` | Swing-specific state machine             |
| `PistolSquatFormAnalyzer.ts`     | Pistol squat state machine               |

**Registered exercises:**

| Exercise         | Analyzer                      | Phases                                     |
| ---------------- | ----------------------------- | ------------------------------------------ |
| Kettlebell Swing | `KettlebellSwingFormAnalyzer` | top → connect → bottom → release           |
| Pistol Squat     | `PistolSquatFormAnalyzer`     | standing → descending → bottom → ascending |

**FormAnalyzer interface:**

```typescript
interface FormAnalyzer {
  processFrame(
    skeleton: Skeleton,
    timestamp: number,
    videoTime?: number,
    frameImage?: ImageData
  ): FormAnalyzerResult;
  getPhase(): string;
  getRepCount(): number;
  getLastRepQuality(): RepQuality | null;
  reset(): void;
  getExerciseName(): string;
  getPhases(): string[];
  getWorkingLeg?(): 'left' | 'right' | null; // For side-specific exercises
}

interface FormAnalyzerResult {
  phase: string;
  repCompleted: boolean;
  repCount: number;
  repPositions?: RepPosition[]; // Present when repCompleted=true
  repQuality?: RepQuality; // Present when repCompleted=true
  angles: Record<string, number>;
}
```

**Adding a new exercise:**

1. Create `src/analyzers/YourExerciseFormAnalyzer.ts` extending `FormAnalyzerBase`
2. Define phases and implement state machine transitions
3. Add to `DetectedExercise` type in `ExerciseDetector.ts`
4. Register in `EXERCISE_REGISTRY` in `ExerciseRegistry.ts`
5. Add detection logic to `ExerciseDetector` (optional - for auto-detection)

### 5. Biomechanics Layer (`src/models/`)

Domain models for human pose and movement analysis.

| Module                    | Purpose                                      |
| ------------------------- | -------------------------------------------- |
| `Skeleton.ts`             | Pose model with angle calculations           |
| `BiomechanicsAnalyzer.ts` | Temporal analysis, quality scoring, coaching |

**Skeleton - key responsibilities:**

- Store keypoints from ML detection
- Calculate angles (spine, hip, knee, arm)
- Cache expensive calculations
- Provide queries (wrist height, facing direction, bounding box)

```typescript
// Skeleton provides cached angle calculations
skeleton.getSpineAngle(); // Torso lean from vertical
skeleton.getHipAngle(); // Hip hinge depth
skeleton.getKneeAngle(); // Knee bend
skeleton.getArmToVerticalAngle(); // Arm position
skeleton.getWristHeight(); // For phase detection
skeleton.getFacingDirection(); // Left or right
```

**BiomechanicsAnalyzer - temporal analysis:**

- Frame buffer for smoothed angles (exponential moving average)
- Angular velocity calculations
- Quality scoring (hinge, power, consistency, lockout, depth)
- Auto-generated coaching cues

**Where to add biomechanics:**

- New angle calculations → add method to `Skeleton`
- New keypoint queries → add method to `Skeleton`
- Temporal/smoothed analysis → add to `BiomechanicsAnalyzer`
- Exercise-specific thresholds → keep in analyzer, not here

### 6. Infrastructure Layer (`src/services/`)

External integrations and system services.

| Service                  | Purpose                     |
| ------------------------ | --------------------------- |
| `PoseDetectorFactory.ts` | Creates ML model instances  |
| `PoseExtractor.ts`       | Batch extraction from video |
| `PoseTrackService.ts`    | File I/O for pose data      |
| `SessionRecorder.ts`     | Debug logging and telemetry |
| `DeviceService.ts`       | Device capability detection |

**Where to add infrastructure:**

- ML model support → `PoseDetectorFactory`
- File format support → `PoseTrackService`
- External API → new service file

### 7. Rendering (`src/viewmodels/`)

Visual representation of domain models.

| Module                | Purpose                              |
| --------------------- | ------------------------------------ |
| `SkeletonRenderer.ts` | Canvas rendering of skeleton overlay |

**Where to add rendering:**

- Skeleton visualization changes → `SkeletonRenderer`
- New overlays → add methods to `SkeletonRenderer`

### 8. Utilities (`src/utils/`)

Pure functions with no side effects.

| Utility             | Purpose                        |
| ------------------- | ------------------------------ |
| `videoHash.ts`      | Content hashing for cache keys |
| `videoCrop.ts`      | Person-centered cropping       |
| `frameHash.ts`      | Frame deduplication            |
| `shakeDetection.ts` | Mobile gesture detection       |
| `logger.ts`         | Logging utilities              |

**Where to add utilities:**

- Pure transformations → `utils/`
- Side effects → `services/`

## Key Abstractions

### Pose vs Skeleton

These terms have specific meanings:

- **Pose** = Raw keypoints from ML model (`PoseKeypoint`, `PoseResult`)
- **Skeleton** = Processed biomechanics model with calculated angles

```
ML Model → Pose (raw) → SkeletonTransformer → Skeleton (processed)
```

### Phase Detection

Exercises are modeled as state machines with phases:

```
Kettlebell Swing: top → connect → bottom → release → top (1 rep)
Pistol Squat:     standing → descending → bottom → ascending → standing (1 rep)
```

The `FormAnalyzer` tracks current phase and detects transitions based on skeleton angles. Exercise type is auto-detected by `ExerciseDetector` during extraction.

### Processing Modes

The app supports two modes:

1. **Batch extraction**: video processed as fast as possible via
   `Pipeline.processSkeletonEvent()`, results cached to IndexedDB
2. **Cached playback/seek**: skeletons looked up from the pose cache
   (`getSkeletonAtTime`) and rendered — no per-frame analysis

Both use the same `Pipeline` and `FormAnalyzer` - only the source differs.

## Extension Points

### Adding New Pose Models

1. Add model config to `src/config/modelConfig.ts`
2. Update `PoseDetectorFactory` to instantiate new model
3. Ensure `KeypointAdapter` normalizes keypoints to standard format
4. Update tests

### Adding New Exercises

1. Create `src/analyzers/NewExerciseFormAnalyzer.ts` extending `FormAnalyzerBase`
2. Define phases and implement state machine transitions
3. Add to `DetectedExercise` type in `ExerciseDetector.ts`
4. Register in `EXERCISE_REGISTRY` in `ExerciseRegistry.ts`
5. Add detection logic to `ExerciseDetector` (for auto-detection)

### Adding New Analysis Metrics

1. If it's a skeleton measurement → add to `Skeleton` class
2. If it's exercise-specific → add to `FormAnalyzer` implementation
3. If it needs temporal data → consider dedicated analyzer class

## Performance Considerations

- **Angle caching**: `Skeleton` caches computed angles
- **Keypoint confidence**: Low-confidence keypoints are filtered
- **Frame throttling**: Pipeline can skip frames if processing lags
- **Canvas reuse**: `SkeletonRenderer` reuses canvas context

### Throttled Playback Sync

During video playback, we need to update UI state (rep counter, position display) based on the current video time. The naive approach would be:

1. **Separate interval timer** - Creates a second timing loop alongside the frame callback, leading to more complexity and potential race conditions.
2. **Per-frame updates** - Updates state on every frame (~30/60 fps), which is wasteful for UI that only needs 1Hz updates.

**Our approach**: Throttle within the existing `requestVideoFrameCallback` loop.

```typescript
// In renderVideoFrame callback (fires every video frame)
if (now - lastRepSyncTimeRef.current >= REP_SYNC_INTERVAL_MS) {
  lastRepSyncTimeRef.current = now;
  updateRepAndPositionFromTime(metadata.mediaTime);
}
```

**Benefits:**

- **No additional timers** - Uses the existing frame loop
- **Automatic cleanup** - No interval to manage on pause/end
- **Synced with playback** - Uses `metadata.mediaTime` (actual video time)
- **Configurable frequency** - `REP_SYNC_INTERVAL_MS` (default 1000ms)

**When to use this pattern:**

- Any UI update during playback that doesn't need per-frame precision
- State that depends on video time but changes infrequently
- Expensive calculations that shouldn't run every frame

**Example locations:**

- `useSwingAnalyzerV2.tsx`: Rep counter and position sync during playback
- Future: Form quality indicators, coaching cues

## Testing Strategy

See [TEST_STRATEGY.md](./tech-pack/TEST_STRATEGY.md) for details.

- **Unit tests**: Skeleton angle calculations, analyzer state machines
- **E2E tests**: Full user journeys with seeded pose data
- **Integration tests**: Pipeline processing with mock detectors

## Common Tasks

### "I need to change how angles are calculated"

→ Edit `src/models/Skeleton.ts`

### "I need to add a new exercise"

→ Create analyzer in `src/analyzers/`, implement `FormAnalyzer` interface

### "I need to support a new ML model"

→ Update `PoseDetectorFactory` and `KeypointAdapter`

### "I need to add a new UI feature"

→ Create component in `src/components/`, hook in `src/hooks/` if needed

### "I need to change rep counting logic"

→ Edit the relevant `FormAnalyzer` implementation

### "I need to add a new file format"

→ Update `PoseTrackService` in `src/services/`
