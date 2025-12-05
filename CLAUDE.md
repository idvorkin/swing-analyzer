- Use PRs to do updates

## Convention Updates

**Last reviewed:** 2025-12-05 (chop-conventions @ 2a6b6e6)

Projects using [chop-conventions](https://github.com/idvorkin/chop-conventions) should periodically:

1. **Pull updates** - Check chop-conventions for new conventions or improvements
2. **Push improvements** - If you've developed useful patterns locally, submit a PR to chop-conventions
3. **Update this date** - After reviewing, update the "Last reviewed" date above

**Before reviewing external repos**: Always `git fetch upstream && git reset --hard upstream/main` first.

## Multi-Agent Setup

- **Use full clones**, not worktrees - worktrees cause issues with parallel agents
- **Remote setup**: `origin` = idvorkin-ai-tools fork (push here), `upstream` = idvorkin (fetch from here)
- **Clone command**: `git clone https://github.com/idvorkin-ai-tools/swing-analyzer.git swing-N`
- **After cloning**: `cd swing-N && just setup && git remote add upstream https://github.com/idvorkin/swing-analyzer.git && git checkout dev`

### Per-Clone Branches (Recommended)

Each clone works on its own persistent branch for zero-conflict parallelization:

```
swing-1 → agent/swing-1
swing-2 → agent/swing-2
swing-3 → agent/swing-3
```

**Why:** Each agent pushes only to its own branch - no conflicts, no rebasing mid-work, full parallelization.

**Session start:**
```bash
# Create or switch to your agent branch
git fetch origin
git checkout agent/swing-N 2>/dev/null || git checkout -b agent/swing-N
git pull origin agent/swing-N --rebase 2>/dev/null || true
```

**During work:**
```bash
git add . && git commit -m "..."
git push origin agent/swing-N  # Never conflicts with other agents!
```

**Human merges to dev** when ready:
```bash
git checkout dev && git merge agent/swing-N && git push
```

### Collaborative Feature Branches

When a feature needs multiple agents, use a feature branch and create beads issues:

```bash
# Agent creates feature branch
git checkout -b feature/skeleton-rendering
git push -u origin feature/skeleton-rendering

# Create beads issue for help needed (other agents will see it in bd ready)
bd create --title="Help needed: optimize skeleton math on feature/skeleton-rendering" --type=task
```

**Other agent picks up work:**
```bash
bd ready                                    # Sees the help request
bd update swing-xyz --status=in_progress    # Claims it
git fetch origin
git checkout feature/skeleton-rendering     # Joins the branch
git pull --rebase
# Work, commit, push to same branch
bd close swing-xyz --reason="Done"
```

**Naming convention:**
- `agent/swing-N` - Solo work, one agent per branch
- `feature/description` - Collaborative, multiple agents can join via beads
- `fix/description` - Bug fix collaboration

### Agent Dashboard

Monitor all running agents from a central portal: **http://localhost:9999** (or via Tailscale)

Shows for each agent clone:
- Branch and PR status
- GitHub links (Diff, Commit, History)
- Running servers (vite, playwright)
- Beads status (open issues, work in progress)

**Start dashboard:**
```bash
cd ~/gits/agent-dashboard && npm run dev
# Or: just dashboard (from any swing clone)
```

**Repo:** https://github.com/idvorkin-ai-tools/agent-dashboard

## Guardrails

Actions requiring explicit "YES" approval from user:

- **Removing broken tests** - Fix the test or code, never delete failing tests
- **Pushing to main** - Always use feature branches and PRs
- **Force pushing** - Can destroy history
- **Accepting/merging PRs** - Human must review and approve
- **Any action that loses work** - Deleting branches with unmerged commits, hard resets

**Encouraged** (not losing work): Deleting unused functions/files, removing commented-out code, cleaning unused imports - these are preserved in git history.

**End of session**: When user signals done or says "workflow review":

1. Review session for patterns: repeated corrections, friction, missing context
2. Create `.claude/workflow-recommendations/YYYY-MM-DD-HHMMSS-XXXX.md` (XXXX = random 4 chars)
3. Ask user if they want to merge any immediately into CLAUDE.md
4. For generalizable patterns, offer to PR to chop-conventions

## Task Tracking (Beads)

This project uses [beads](https://github.com/steveyegge/beads) for issue tracking. Run `bd prime` at session start for workflow context.

**IMPORTANT: Beads uses the `beads-metadata` branch for sync, NOT local files.**

- `bd sync` pushes to the `beads-metadata` branch on `origin`
- If `bd sync` fails with permission errors, ask the user: "Beads sync failed. Type YES if you want help fixing it."
- Never rely on `.beads/issues.jsonl` in the working tree - always verify issues are in `beads-metadata` branch

**Fix for permission errors**: The `beads-metadata` branch must track `origin`, not `upstream`:
```bash
git branch --set-upstream-to=origin/beads-metadata beads-metadata
```

**AI-supervised workflow:**

**Assignee naming**: When claiming tasks, use `claude-machinename-directoryname` format (e.g., `claude-orbstack-swing-2`). This identifies which agent instance is working on what, preventing conflicts when multiple agents run in parallel.

1. **Find ready work**: `bd ready` - shows unblocked tasks
2. **Claim task**: `bd update ID --status in_progress --assignee claude-machinename-directoryname` - prevents duplicate work
3. **Do the work**: implement, test, document
4. **Discover new work**: Use `discovered-from` dependency (see below)
5. **Complete**: `bd close ID --reason "why"` - documents completion
6. **Check unblocked**: `bd ready` - see what's now available

**Discovered-from dependencies** (critical for agent workflows):

When you find new work during implementation, link it back to maintain audit trails:

```bash
# Working on swing-48b, found a bug
bd create --title="Found memory leak in cache" --type=bug
bd dep add swing-new swing-48b --type discovered-from
```

**Dependency types:**

| Type | Use When |
|------|----------|
| `blocks` | Work cannot start until blocker done |
| `related` | Issues share context but don't block |
| `parent-child` | Epic/subtask hierarchy |
| `discovered-from` | Found during other work (agent audit trail) |

**Quick reference:**

```bash
bd prime                   # Get workflow context (run at session start)
bd ready                   # Show unblocked work
bd list                    # List all issues
bd show swing-abc          # View issue details
bd update swing-abc --status in_progress --assignee claude-machinename-directoryname
bd close swing-abc --reason "Done in PR #42"
bd dep add swing-def swing-abc                    # blocks (default)
bd dep add swing-new swing-old --type discovered-from  # audit trail
```

**Session close checklist** - Before ending a session, always run:

```bash
git status            # Check what changed
git add <files>       # Stage code changes
bd sync               # Commit beads changes
git commit -m "..."   # Commit code
bd sync               # Commit any new beads changes
git push              # Push to remote
```

See `FULL_PR_PLAN.md` for the project roadmap (also tracked as beads issues).

## PR Workflow

### First-Time Setup

After cloning, run once:

```bash
just setup
```

This configures git hooks and installs npm dependencies.

**Playwright**: Use a global install since we have Playwright in many repos:

```bash
# One-time global setup (not per-repo)
npm install -g playwright
playwright install --with-deps
```

This avoids downloading browsers separately for each project.

### Git Hooks

The `.githooks/` directory contains:
- `pre-commit` - Syncs beads before commits
- `post-merge` - Syncs beads after pulls
- `pre-push` - Blocks direct pushes to `main`

### Branch Strategy

- **feature branches**: Agents work here, one branch per task
- **dev branch**: Feature branches merge here after local review
- **main branch**: Nothing merges without a PR and human approval
- **PR merge process**: Periodically diff dev from main, split into clean PRs, merge to main

**⚠️ CRITICAL: Only humans merge to main. Agents must NEVER merge PRs to main unless the user explicitly says "YES" (uppercase). Phrases like "get it to main" or "merge it" are NOT sufficient - you must ask for confirmation and receive "YES" before merging any PR to main.**

**📦 MINIMAL PRs**: When creating PRs to main, include ONLY the changes the user explicitly requested. Do not bundle unrelated changes from the branch. If unsure what to include, ask the user to confirm scope before creating the PR.

**🚫 NO --no-verify**: Never use `git commit --no-verify` unless absolutely necessary.

**🧹 LINT FIRST**: Before making code changes, run pre-commit on affected files to fix existing lint issues. Commit those fixes first, then make your actual change. This keeps your logic commits clean and focused.

**🚫 NO FORCE PUSH**: Never use `git push --force` or `git push -f` unless the user explicitly types "yes" to confirm. If you have conflicts or diverged history, resolve them with rebase and regular push. Messy history on a branch is okay - losing other people's work is not.

**🔄 REBASE OFTEN**: Multiple agents push to dev constantly. Always rebase before starting work:

```bash
git fetch origin && git rebase origin/dev
```

### Merging Feature Branches to Dev

**⚠️ MANDATORY: Run PR review agents before ANY merge to dev.**

Before merging your feature branch to dev:

1. **Rebase on dev**: `git fetch origin && git rebase origin/dev`
2. **Run PR review agents**: `/code-review:code-review` or `/pr-review-toolkit:review-pr`
3. **Fix all issues** found by the review - do NOT skip this
4. **Run tests**: `npx playwright test && npx tsc --noEmit`
5. **Merge to dev**: `git checkout dev && git merge feature-branch && git push`

**📋 E2E TEST COVERAGE**: Any change affecting user experience MUST have E2E test coverage. This includes:
- New UI components or buttons
- Changed user flows or interactions
- New features visible to users
- Bug fixes for user-facing issues

If E2E tests don't exist for the affected area, create them before merging.

### Splitting Dev Branch into Clean PRs

When dev has accumulated many unrelated changes:

1. **Diff dev from main**: `git diff main..dev --stat` to see all changes
2. **Analyze commits**: `git log main..dev --oneline` to see commit history
3. **Categorize changes** into logical groups (e.g., bug fixes, new features, refactors)
4. **Create beads issues** for each PR: `bd create --title="Merge PR #X: description" --priority=1`
5. **Add dependencies** between PRs: `bd dep add <blocked> <blocker>`
6. **Create feature branches** from main, cherry-pick or manually copy changes
7. **Rebase each branch** on main: `git rebase origin/main`
8. **Run code review agent** on each PR to find issues
9. **Fix issues**, run tests, push
10. **Merge PRs** in dependency order, then sync dev with main

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

## Clean Code & Commits

**Clean code principles** (for new code only, don't change unrelated areas):

- Keep code DRY (Don't Repeat Yourself)
- Use `const` whenever possible
- Use types whenever possible
- Avoid deep nesting - return early from functions
- Use humble objects (managers) when interacting with external systems for easier testing

**Clean commits**:

- Always run `git status` before committing to review staged files
- Use `git add <specific-files>` not `git add -A` - prevents unrelated changes creeping in
- Run pre-commit on affected files BEFORE making changes, commit lint fixes first
- Split independent changes into logical commits
- For complex commits, write message to COMMIT_MSG file and verify with user

**CLI tips**:

- If git output is truncated: `git --no-pager diff`
- If head/cat errors: `unset PAGER`
- Check justfile for existing commands before writing new ones
- Auto-approved to run: `just test`, `just fast-test`

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

## Tech Pack

Project documentation lives in `docs/tech-pack/`:

- **[TEST_STRATEGY.md](docs/tech-pack/TEST_STRATEGY.md)** - Test pyramid, when to use which test type
- **[E2E_TESTING_PLAN.md](docs/E2E_TESTING_PLAN.md)** - Detailed E2E implementation

**Core principle**: Tests are more important than code. Users should never find bugs that tests could have caught.

## Testing

### Test Philosophy

1. **Fast tests for CI** - Seeded data, run on every PR (~1-3s each)
2. **Realistic tests for releases** - Mock detector with timing, simulates user experience (~30-60s each)
3. **When debugging user issues** - Always write a realistic test first that reproduces the bug

### E2E Tests (Playwright)

- `e2e-tests/user-journey.spec.ts` - Fast: UI journey tests (seeded data)
- `e2e-tests/extraction-flow.spec.ts` - Realistic: Full extraction with mock detector
- `e2e-tests/swing-analyzer.spec.ts` - Fast: Core app functionality
- `e2e-tests/fixtures/` - Pose data fixtures and factory

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

### When to Run Tests

- **Unit tests**: Run after any code changes (`just test-unit`)
- **E2E tests**: Run after major changes, especially:
  - Pipeline or transformer changes
  - UI component changes affecting video/skeleton rendering
  - Changes to pose detection or extraction
  - Before creating PRs for significant features

### Viewing Test Reports

Run `just e2e-report` to start the report server. It will display:

- Access URLs (local and Tailscale)
- Instructions for viewing trace files
- Options for SSH tunnel or online trace viewer

The HTML report includes:

- Test results with pass/fail status
- Videos and screenshots (captured automatically in dev)
- Trace viewer with timeline, DOM snapshots, network requests, and console logs
