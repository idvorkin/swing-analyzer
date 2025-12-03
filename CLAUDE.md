- Use PRs to do updates

## Architecture Overview

### Pipeline Design (RxJS-based)

```
Frame Acquisition → Pose/Skeleton Transformer → Form Processor → Rep Processor → UI
     ↓                      ↓                        ↓               ↓
Observable<Frame>    Observable<Skeleton>    Observable<Form>   Observable<Rep>
```

**Key Files:**

- `src/pipeline/Pipeline.ts` - Orchestrator
- `src/pipeline/PoseSkeletonTransformer.ts` - MoveNet pose detection
- `src/pipeline/SwingFormProcessor.ts` - Swing position detection (Top/Connect/Bottom/Release)
- `src/pipeline/SwingRepProcessor.ts` - Rep counting (Release→Top = 1 rep)
- `src/models/Skeleton.ts` - Angle calculations (spine, hip, knee, arm angles)

### Current Model: MoveNet Lightning

- COCO-17 keypoint format
- Fallback to PoseNet if MoveNet fails
- Hardcoded in `PoseSkeletonTransformer`

### Current Limitations (for future abstraction)

1. **Model coupling** - MoveNet hardcoded, no runtime model selection
2. **Exercise coupling** - Swing-specific positions/angles/rep logic throughout
3. **Hardcoded thresholds** - Ideal angles in `SwingFormProcessor` as magic numbers

## Target Architecture

### Unified Pipeline with Swappable Sources

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
            │                                 │
            ▼                                 ▼
   Camera/Video + ML model            PoseTrackFile (JSON)
```

**Key insight**: Same streaming interface, different sources. PoseTrack source just runs faster than real-time.

### Components

| Component                 | Purpose                                                                                            |
| ------------------------- | -------------------------------------------------------------------------------------------------- |
| `SwingAnalyzer`           | Pure analysis logic - position detection, rep counting, thresholds. No video/ML/RxJS dependencies. |
| `SwingProcessor`          | Wraps analyzer in RxJS streaming interface. One implementation for both modes.                     |
| `VideoSkeletonSource`     | Live source - camera/video feed + ML model. Throttled by playback speed.                           |
| `PoseTrackSkeletonSource` | Recorded source - iterates PoseTrack frames. As fast as CPU allows.                                |

### Benefits

- Single source of truth for analysis logic
- Unit test `SwingAnalyzer` with hardcoded skeletons
- E2E tests use `PoseTrackSkeletonSource` - no video, no ML, deterministic
- Real-time and batch modes guaranteed identical results

## Future Roadmap

### 1. Refactor to Unified Pipeline

- Extract shared logic from `SwingFormProcessor` → `SwingAnalyzer`
- Create `VideoSkeletonSource` (wrap current ML path)
- Create `PoseTrackSkeletonSource` (wrap PoseTrack iteration)
- Delete duplicated logic from `PoseTrackPipeline`

### 2. Model Abstraction (to support BlazePose, etc.)

- Extract model config to separate file
- Make `PoseSkeletonTransformer` accept model type
- Create `PoseDetectorFactory` for model instantiation
- Handle different keypoint formats (COCO vs MediaPipe)

### 3. Exercise Abstraction (to support Pull-ups, Pistol Squats, etc.)

- Create `ExerciseDefinition` interface with positions, ideal angles, rep criteria
- Create exercise-specific analyzers: `PullUpAnalyzer`, `PistolSquatAnalyzer`
- Configuration-driven instead of code-driven thresholds

## Testing

### E2E Tests (Playwright)

- `e2e-tests/swing-analyzer.spec.ts` - Main app tests
- `e2e-tests/pose-fixtures.spec.ts` - Pose fixture integration
- `e2e-tests/fixtures/pose-factory.ts` - Synthetic pose generation for testing

### Unit Tests (Vitest)

- Pipeline tests: `src/pipeline/*.test.ts`
- Model tests: `src/models/Skeleton.test.ts`
- Service tests: `src/services/*.test.ts`

### Test Commands (via justfile)

```bash
just e2e              # Run all E2E tests
just e2e-desktop      # Run desktop-only tests
just e2e-ui           # Playwright UI mode
just e2e-debug        # Debug mode
just e2e-report       # View HTML report with traces
just test-unit        # Run unit tests
```

### Viewing Test Reports

Run `just e2e-report` to start the report server. It will display:

- Access URLs (local and Tailscale)
- Instructions for viewing trace files
- Options for SSH tunnel or online trace viewer

The HTML report includes:

- Test results with pass/fail status
- Videos and screenshots (captured automatically in dev)
- Trace viewer with timeline, DOM snapshots, network requests, and console logs
