- **Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** to understand where code belongs before making changes
- Use PRs to do updates
- When reporting dev server URLs, always use the **Tailscale URL** (e.g., `https://c-5001.squeaker-teeth.ts.net:5174`), not localhost

## Convention Updates

**Last reviewed:** 2025-12-05 (chop-conventions @ 2a6b6e6)

Projects using [chop-conventions](https://github.com/idvorkin/chop-conventions) should periodically:

1. **Pull updates** - Check chop-conventions for new conventions or improvements
2. **Push improvements** - If you've developed useful patterns locally, submit a PR to chop-conventions
3. **Update this date** - After reviewing, update the "Last reviewed" date above

**Before reviewing external repos**: Always `git fetch upstream && git reset --hard upstream/main` first.

## Multi-Agent Setup

- **Use full clones**, not worktrees - worktrees cause issues with parallel agents
- **Remote setup**:
  - `origin` = **idvorkin-ai-tools** fork (agents push here, can merge to main directly)
  - `upstream` = **idvorkin** (human-only repo, requires PR approval to merge)
- **Clone command**: `git clone https://github.com/idvorkin-ai-tools/swing-analyzer.git swing-N`
- **After cloning**: `cd swing-N && just setup && git remote add upstream https://github.com/idvorkin/swing-analyzer.git`

### Feature-Based Branches (Recommended)

Use **feature-based branch names**, not agent-number-based names:

```
# Good - describes what you're working on
feature/pose-download
fix/rep-detection-one-hand
refactor/skeleton-rendering

# Avoid - doesn't describe the work
agent/swing-1
agent/swing-2
```

**Why:** Feature names are self-documenting, make PRs clearer, and help when reviewing git history. Multiple agents can work on different features without confusion.

**Session start:**
```bash
# Create or switch to your feature branch
git fetch origin
git checkout -b feature/your-feature-name  # New feature
# OR
git checkout feature/existing-feature      # Continue existing work
git pull origin feature/existing-feature --rebase 2>/dev/null || true

# IMPORTANT: Each Claude instance MUST start its own dev server
just dev  # Runs vite dev server (auto-finds available port)
```

**⚠️ After switching branches:** Always rebuild to ensure you're running the new code:
```bash
# Kill existing dev server if running, then restart
# Vite usually hot-reloads, but for safety after branch switch:
npm run build  # or just restart dev server
```

**⚠️ EVERY Claude instance runs its own server.** The dashboard detects servers by their working directory, so each clone (swing-1, swing-2, etc.) appears as a separate agent when its server is running. Vite auto-finds an available port (5173, 5174, etc.), so multiple servers can run simultaneously.

This ensures:
1. **Dashboard visibility** - Your clone appears as "active" with a server link
2. **E2E test speed** - Tests reuse the running server instead of starting a new one
3. **Consistent testing** - Tests run against your current code changes
4. **Agent isolation** - Each agent's work is tested against its own code

**E2E tests automatically use your running server** via `reuseExistingServer: true` in playwright.config.ts. If no server is running, Playwright starts one temporarily.

**Check your server is detected:**
```bash
curl -s http://localhost:9999/api/agents | jq '.agents[] | select(.id == "swing-N") | .servers'
```

**Verify server is from YOUR directory before reusing:**
```bash
# Multiple clones may have servers running - verify the port serves YOUR code
for pid in $(lsof -ti :5173 -ti :5174 2>/dev/null); do
  echo "PID $pid port $(lsof -p $pid -i -P | grep LISTEN | awk '{print $9}'): $(readlink -f /proc/$pid/cwd)"
done
```
Only reuse a server if its cwd matches your working directory. Otherwise, start a new one with `just dev`.

**During work (commit → push immediately):**
```bash
git pull origin feature/your-branch --rebase  # Get any updates first
git add . && git commit -m "..."
git push origin feature/your-branch           # Push right after commit!
```
Always push after every commit - keeps your work visible in dashboard.

**Stay current (rebase often):**
```bash
git fetch origin main && git rebase origin/main
git push origin feature/your-branch --force-with-lease
```
Rebase on main:
- Every 15 minutes during active work
- Before starting any major new task
- Before merging to main

This keeps your branch up-to-date with changes from other agents.

**Merging to main** (on origin/idvorkin-ai-tools):
```bash
git checkout main && git merge feature/your-branch
# If merge had conflicts, run tests before pushing:
npx playwright test && npx tsc --noEmit
git push origin main
```

**Merge criteria:**
- Feature/task is complete
- Rebased on latest main (no conflicts, or conflicts resolved)
- If merge had conflicts: **must run test suite before pushing**

**If merge conflicts occur:**
1. Resolve conflicts carefully
2. Run full test suite: `npx playwright test && npx tsc --noEmit`
3. Only push if tests pass
4. If tests fail, fix issues before pushing

**If main is broken after merge:**
1. `git revert HEAD && git push origin main` (quick rollback)
2. Fix the issue on your agent branch
3. Re-merge after fixing

For upstream (idvorkin), create a PR instead of direct merge.

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
- `feature/description` - Feature work (preferred)
- `fix/description` - Bug fix work
- `refactor/description` - Refactoring work

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
- **Pushing to upstream (idvorkin repo)** - Requires PR and human approval
- **Force pushing** - Can destroy history
- **Any action that loses work** - Deleting branches with unmerged commits, hard resets
- **`bd init --force`** - Erases the beads database and rebuilds from JSONL. The database should already exist from clone.

**Allowed without approval:**
- Merging to origin/main (idvorkin-ai-tools) - this is the agent working repo

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

**Beads across multiple clones**: All swing directories share the SAME beads database (synced via `beads-metadata` branch).

- The same issue ID (e.g., `swing-b66`) appears in ALL clones - it's ONE issue, not duplicates
- Run `bd sync` from ONE directory, not all simultaneously
- Before claiming an issue, verify it's not already assigned: `bd show ISSUE_ID`
- If you see the same open issue in multiple directories, that's expected - close it once and it closes everywhere after sync

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

**Beads troubleshooting** - If beads isn't working:

```bash
bd doctor             # Diagnose issues (missing hooks, sync problems, etc.)
bd doctor --fix       # Auto-fix common issues
bd sync               # Force sync with remote
```

Common issues:
- **"Database not found"**: The database should exist from clone. Run `bd sync` to pull from remote. If truly missing, ask user for permission to run `bd init --force --prefix=swing` (this erases local data).
- **"beads-metadata branch missing"**: `git fetch origin beads-metadata && git branch beads-metadata origin/beads-metadata`
- **Sync permission errors**: `git branch --set-upstream-to=origin/beads-metadata beads-metadata`

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
- `pre-push` - Blocks pushes to upstream/main only (origin/main is allowed)

### Branch Strategy

- **feature/fix/refactor branches**: Feature-based branches for all work
- **main branch**:
  - On **origin** (idvorkin-ai-tools): Agents can merge directly
  - On **upstream** (idvorkin): Requires PR and human approval

### Branch Hygiene (Every Few Days)

Run branch audit to prevent stale branch accumulation:

```bash
# List remote branches by last commit date with behind/ahead counts
for branch in $(git branch -r | grep -v HEAD | head -20); do
  behind=$(git rev-list --count origin/main ^$branch 2>/dev/null || echo "?")
  ahead=$(git rev-list --count $branch ^origin/main 2>/dev/null || echo "?")
  date=$(git log -1 --format='%ci' $branch 2>/dev/null | cut -d' ' -f1)
  echo "$date | $branch | +$ahead -$behind"
done | sort -r
```

**Delete criteria:**
- Branches 100+ commits behind with 0 unique commits (already merged)
- Branches 200+ commits behind (too stale to salvage)
- Copilot/exploration branches older than 2 weeks

**Keep criteria:**
- Active feature branches with recent work
- Branches with open PRs
- `main`, `beads-metadata`

### Clone Health Check (Weekly)

Multiple swing directories can accumulate stale state. Run this check weekly:

```bash
# Check all swing clones for issues
for dir in ~/gits/swing-*; do
  [ -d "$dir/.git" ] || continue
  cd "$dir"
  branch=$(git branch --show-current 2>/dev/null)
  ahead=$(git rev-list --count origin/main..HEAD 2>/dev/null || echo "?")
  changes=$(git status --porcelain 2>/dev/null | wc -l)
  if [ "$ahead" -gt 20 ] || [ "$changes" -gt 0 ]; then
    echo "⚠️  $(basename $dir): $branch (+$ahead ahead) uncommitted:$changes"
  fi
done
```

**Action items:**
- Branches 50+ commits ahead with no PR: either create PR or reset to main
- Uncommitted changes: commit/push or discard
- Stale feature branches: delete if work was merged elsewhere

**⚠️ UPSTREAM MERGES (idvorkin repo)**: Only humans merge to upstream/main. Agents must NEVER merge PRs to upstream unless the user explicitly says "YES" (uppercase). Phrases like "get it to main" or "merge it" are NOT sufficient - you must ask for confirmation and receive "YES" before merging any PR to upstream.

**✅ ORIGIN MERGES (idvorkin-ai-tools fork)**: Agents can merge directly to origin/main. This is the working repo for agents.

**📦 MINIMAL PRs**: When creating PRs to upstream, include ONLY the changes the user explicitly requested. Do not bundle unrelated changes from the branch. If unsure what to include, ask the user to confirm scope before creating the PR.

**🚫 NO --no-verify**: Never use `--no-verify` unless absolutely necessary. The pre-push hook now allows origin/main pushes, so `--no-verify` shouldn't be needed.

**🧹 LINT FIRST**: Before making code changes, run pre-commit on affected files to fix existing lint issues. Commit those fixes first, then make your actual change. This keeps your logic commits clean and focused.

**🚫 NO FORCE PUSH**: Never use `git push --force` or `git push -f` unless the user explicitly types "yes" to confirm. If you have conflicts or diverged history, resolve them with rebase and regular push. Messy history on a branch is okay - losing other people's work is not.

**🔄 REBASE OFTEN**: Multiple agents push to main constantly. Always rebase before starting work:

```bash
git fetch origin && git rebase origin/main
```

**🔀 REBASE vs MERGE**: When rebase has many conflicts, check if branches have diverged due to PR squash/merge creating duplicate commits with different hashes. If commits have matching messages but different hashes, **merge is cleaner than rebase**.

### Merging Feature Branches to Main

**⚠️ MANDATORY: Run PR review agents before ANY merge to main.**

Before merging your feature branch to main:

1. **Rebase on main**: `git fetch origin && git rebase origin/main`
2. **Run PR review agents**: `/code-review:code-review` or `/pr-review-toolkit:review-pr`
3. **Fix all issues** found by the review - do NOT skip this
4. **Run tests**: `npx playwright test && npx tsc --noEmit`
5. **Merge to main**: `git checkout main && git merge feature-branch && git push`

**🏗️ BIG ARCHITECTURAL CHANGES**: For refactoring or architecture changes (new state machines, new patterns, multiple new files), run comprehensive review:

```bash
/pr-review-toolkit:review-pr all
```

This runs multiple specialized agents in parallel:
- **code-reviewer** - General code quality and CLAUDE.md compliance
- **silent-failure-hunter** - Error handling and silent failures
- **pr-test-analyzer** - Test coverage gaps
- **type-design-analyzer** - Type design quality (for new types)

Fix all critical and important issues before merging.

**📋 E2E TEST COVERAGE**: Any change affecting user experience MUST have E2E test coverage. This includes:
- New UI components or buttons
- Changed user flows or interactions
- New features visible to users
- Bug fixes for user-facing issues

If E2E tests don't exist for the affected area, create them before merging.

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

### Post-PR: Check CodeRabbit Comments

After creating a PR to upstream, CodeRabbit will review it automatically. Check for critical issues:

```bash
# View CodeRabbit comments on a PR
gh api repos/idvorkin/swing-analyzer/pulls/PR_NUMBER/comments \
  --jq '.[] | "File: \(.path):\(.line // .original_line)\n\(.body[0:300])\n---"' | head -100
```

**Address all critical issues before merge.** Common CodeRabbit findings:
- Phase detection bugs (e.g., matching wrong exercise type)
- Stale DOM elements not updating on state change
- Missing null checks or error handling

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
- `src/pipeline/PoseSkeletonTransformer.ts` - BlazePose pose detection
- `src/analyzers/KettlebellSwingFormAnalyzer.ts` - Swing position detection (Top/Connect/Bottom/Release)
- `src/models/Skeleton.ts` - Angle calculations (spine, hip, knee, arm angles)

### Current Model: BlazePose

- MediaPipe BlazePose-33 keypoint format (33 keypoints)
- Variants: Lite (default), Full, Heavy
- Configured in `src/config/modelConfig.ts`

### Current Limitations (for future abstraction)

1. **Model coupling** - BlazePose hardcoded in `PoseDetectorFactory`, no runtime model selection UI
2. **Exercise coupling** - Only kettlebell swing analyzer exists (but plugin architecture ready for more)
3. **Hardcoded thresholds** - Ideal angles in `KettlebellSwingFormAnalyzer` as magic numbers

## Current Architecture

### Unified Pipeline with Swappable Sources (Implemented)

```
                      FormAnalyzer (plugin interface)
                             ▲
                             │
                         Pipeline
                             ▲
                             │
                 Observable<SkeletonEvent>
                             ▲
                             │
            ┌────────────────┴────────────────┐
            │                                 │
   PoseSkeletonTransformer         CachedPoseSkeletonTransformer
   (real-time ML inference)        (pre-extracted poses)
            │                                 │
            ▼                                 ▼
   Camera/Video + BlazePose         LivePoseCache (streaming)
```

**Key insight**: Same streaming interface, different sources. Cached transformer runs faster than real-time.

### Components

| Component                       | Purpose                                                                                            |
| ------------------------------- | -------------------------------------------------------------------------------------------------- |
| `KettlebellSwingFormAnalyzer`   | Pure analysis logic - position detection, rep counting, thresholds. Implements `FormAnalyzer`.     |
| `Pipeline`                      | Orchestrates frame acquisition + skeleton transformation + form analysis.                          |
| `PoseSkeletonTransformer`       | Real-time source - BlazePose ML inference. Throttled by model speed.                               |
| `CachedPoseSkeletonTransformer` | Cached source - reads from `LivePoseCache`. As fast as CPU allows.                                 |
| `VideoFileSkeletonSource`       | Coordinates extraction and caching for video files.                                                |

### Benefits

- Single source of truth for analysis logic (FormAnalyzer plugin)
- Unit test analyzers with hardcoded skeletons
- E2E tests use cached poses - no ML inference, deterministic
- Real-time and batch modes use same analysis code

## Future Roadmap

### 1. Exercise Abstraction (to support Pull-ups, Pistol Squats, etc.)

- Create exercise-specific analyzers: `PullUpFormAnalyzer`, `PistolSquatFormAnalyzer`
- Add exercise selection UI
- Configuration-driven instead of code-driven thresholds

### 2. Model Selection UI

- Expose BlazePose variant selection (Lite/Full/Heavy) in settings
- Add runtime model switching support

### 3. Camera Source

- Create `CameraSkeletonSource` for live webcam input
- Real-time analysis without pre-recorded video

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

### Bug Investigation Protocol

**When you find a bug, STOP and answer these questions before fixing:**

**Spec Questions:**
1. Is this actually a bug, or is my understanding of the spec wrong?
2. Is there a missing or unclear spec that led to this?
3. **Ask the user** if there's any ambiguity: "The behavior is X, but I expected Y. Which is correct?"

**Test Coverage Questions:**
1. Why did tests not catch this?
2. What level of our test pyramid could have caught this earliest? (unit → integration → E2E)
3. Add the missing test BEFORE fixing the bug

**Architecture Questions:**
1. Is there an architectural problem that made this bug possible?
2. If yes, create a beads issue: `bd create --title="Architecture: <problem>" --type=bug`
3. **Ask the user**: "I found an architectural issue: [description]. Type YES to address it now, or I'll just fix the immediate bug."

**Why this matters**: Bugs that are hard to test or hard to fix often signal deeper problems. Patching around bad architecture creates technical debt. Catching issues at the unit test level is 10x cheaper than E2E, and 100x cheaper than production.

### E2E Tests (Playwright)

- `e2e-tests/user-journey.spec.ts` - Fast: UI journey tests (seeded data)
- `e2e-tests/extraction-flow.spec.ts` - Realistic: Full extraction with mock detector
- `e2e-tests/swing-analyzer.spec.ts` - Fast: Core app functionality
- `e2e-tests/fixtures/` - Pose data fixtures and factory

### Fixture Management

**IMPORTANT**: E2E test fixtures contain video hashes that must match the actual video files.

**When tests fail with "Error: Could not load sample video" or hash mismatch errors:**

1. **Check if video files changed**: Run `just check-fixture-hashes`
2. **Update hashes if needed**: Run `just update-fixture-hashes`
3. **Re-run tests**: `just e2e`

**When to regenerate fixtures:**
- After running `just download-test-videos` (videos may have been updated upstream)
- After any changes to video files in `public/videos/`
- When E2E tests fail with cache lookup errors

**Manual hash update** (if script unavailable):
```bash
# Compute hash for a video file
node -e "
const fs = require('fs');
const crypto = require('crypto');
const buffer = fs.readFileSync('public/videos/swing-sample-4reps.webm');
const chunk = buffer.slice(0, 64 * 1024);
const hash = crypto.createHash('sha256')
  .update(chunk)
  .update(buffer.length.toString())
  .digest('hex');
console.log(hash);
"
```

Then update:
- `e2e-tests/fixtures/pose-factory.ts` - the hash constant
- `e2e-tests/fixtures/poses/*.posetrack.json` - the `sourceVideoHash` field

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

### Testing Architecture: SessionRecorder

The app includes a **SessionRecorder** (`src/services/SessionRecorder.ts`) that captures detailed logs of user interactions and pipeline state. This is the foundation of our debugging strategy.

**What SessionRecorder captures:**
- User interactions (clicks, keypresses with element info)
- Pipeline state snapshots at 4 FPS (rep count, video time, skeleton angles, form position)
- State change events (extraction start/complete, playback start/pause, rep detected)
- Console errors and unhandled exceptions
- Memory usage (Chrome only)

**Why E2E tests should use SessionRecorder:**

1. **Same data format as production** - Customer bug reports include SessionRecorder logs. Writing tests that emit the same events means you can:
   - Replay customer sessions to reproduce bugs
   - Compare test runs with production behavior
   - Build tooling that works for both debugging and testing

2. **Rich debugging context** - When a test fails, the SessionRecorder log shows exactly what happened:
   - Which buttons were clicked
   - What the pipeline state was at each moment
   - Where extraction/playback started and stopped

3. **Deterministic debugging** - SessionRecorder logs are JSON, making them:
   - Easy to diff between runs
   - Searchable for specific events
   - Version-controllable as test fixtures

**Using SessionRecorder in E2E tests:**

```typescript
// In your E2E test
test('should detect reps during extraction', async ({ page }) => {
  // SessionRecorder is auto-active in the app
  // Access it via window.swingDebug

  // ... perform test actions ...

  // Get the session recording for debugging
  const session = await page.evaluate(() =>
    (window as any).swingDebug.getCurrentSession()
  );

  // Check state changes
  const repEvents = session.stateChanges.filter(
    (e: any) => e.type === 'rep_detected'
  );
  expect(repEvents).toHaveLength(4);

  // Save session on failure for analysis
  if (testFailed) {
    await page.evaluate(() =>
      (window as any).swingDebug.downloadSession()
    );
  }
});
```

**Debugging with customer SessionRecorder logs:**

When a customer reports a bug, ask them to download their session log from Settings → Developer → Download Session Recording. Then:

1. Load the JSON and inspect `stateChanges` for the sequence of events
2. Check `pipelineSnapshots` for state at specific timestamps
3. Look at `interactions` to see what the user clicked
4. Check `memorySnapshots` for memory leaks

```bash
# Quick analysis in console
cat session.json | jq '.stateChanges | .[] | select(.type == "error")'
cat session.json | jq '.pipelineSnapshots | last(10) | .[].repCount'
```

**Console debugging (in browser):**

```javascript
// Available on window.swingDebug in all environments
swingDebug.getCurrentSession()  // Get current recording
swingDebug.getCrashLogs()       // Get persisted sessions (after crash)
swingDebug.getStats()           // Recording stats
swingDebug.analyzeMemory()      // Memory trend analysis
swingDebug.downloadSession()    // Download as JSON
```
