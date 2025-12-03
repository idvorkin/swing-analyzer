- Use PRs to do updates

## Task Tracking (Beads)

This project uses [beads](https://github.com/steveyegge/beads) for issue tracking. Follow the AI-supervised workflow:

1. **Find ready work**: `/beads:ready` - shows unblocked tasks
2. **Claim task**: `/beads:update ID in_progress` - prevents duplicate work
3. **Do the work**: implement, test, document
4. **Discover new work**: `/beads:create` then link with `/beads:dep`
5. **Complete**: `/beads:close ID "reason"` - documents why
6. **Check unblocked**: `/beads:ready` - see what's now available

Quick reference:

```bash
bd list                    # List all issues
bd ready                   # Show unblocked work
bd show SWING-1            # View issue details
bd update SWING-1 --status in_progress
bd close SWING-1 --reason "Done in PR #42"
bd dep add SWING-2 SWING-1 # SWING-1 blocks SWING-2
```

See `FULL_PR_PLAN.md` for the project roadmap (also tracked as beads issues).

## PR Workflow

### Splitting Messy PRs into Clean Commits

When a branch has accumulated many unrelated changes:

1. **Analyze the branch**: `git log main..HEAD --oneline` to see all commits
2. **Categorize changes** into logical groups (e.g., bug fixes, new features, refactors)
3. **Create beads issues** for each PR: `bd create --title="Merge PR #X: description" --priority=1`
4. **Add dependencies** between PRs: `bd dep add <blocked> <blocker>`
5. **Cherry-pick or manually copy** changes to new feature branches
6. **Rebase each branch** on main: `git rebase origin/main`
7. **Run code review agent** on each PR to find issues
8. **Fix issues**, run tests, push

### PR Review Checklist

For each PR before merge:

```bash
git fetch origin main && git rebase origin/main  # Rebase on latest main
npx playwright test                               # Run E2E tests
npx tsc --noEmit                                  # Type check
```

Use code review agent to check for:

- Dead code, unused variables
- Missing error handling
- Race conditions, memory leaks
- Type safety issues

### Tracking PRs in Beads

```bash
# Create issues for each PR
bd create --title="Merge PR #44: BlazePose abstraction" --type=task --priority=1

# Set up merge order with dependencies
bd dep add swing-25 swing-22  # swing-25 blocked by swing-22

# Check what's ready to merge
bd ready

# Check what's blocked
bd blocked

# After merging, close the issue
bd close swing-22 --reason="Merged in PR #44"
```

### Handling Overlapping PRs

When two PRs modify the same files:

1. Compare with `git diff origin/branch-a origin/branch-b -- path/to/file`
2. Identify which has better code (error handling, tests, etc.)
3. Create a beads task to merge unique changes: `bd create --title="Merge PR #X unique changes into PR #Y"`
4. Cherry-pick or manually copy the unique improvements
5. Close the superseded PR

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
