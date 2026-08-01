# Swing Analyzer - Agent Instructions

- **Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** before making changes
- Use **Tailscale URLs** (e.g., `https://c-5001.squeaker-teeth.ts.net:5174`), not localhost

## Quick Reference

### Requires Explicit "YES" From User

- Pushing to **upstream** (idvorkin repo) - always needs PR + human approval
- Force pushing (`--force`, `-f`)
- Removing/deleting tests
- Any action that loses work (hard resets, deleting unmerged branches)
- `bd init --force` - erases beads database

### Allowed Without Approval

- Merging to **origin/main** (idvorkin-ai-tools fork) - this is the agent working repo
- Deleting unused code/files (preserved in git history)

### Session Start

```bash
git fetch origin
git checkout -b feature/your-feature-name  # or checkout existing
git rebase origin/main
just dev  # EVERY Claude instance runs its own server
```

### Session End

```bash
git status && git add <files>
bd sync
git commit -m "..."
bd sync
git push
```

---

## Git Workflow

### Remote Setup

| Remote     | Repo                     | Who Can Merge             |
| ---------- | ------------------------ | ------------------------- |
| `origin`   | idvorkin-ai-tools (fork) | Agents directly           |
| `upstream` | idvorkin                 | Humans only (PR required) |

### Branch Naming

```bash
# Good - describes the work
feature/pose-download
fix/rep-detection-one-hand
refactor/skeleton-rendering

# Avoid - doesn't describe the work
agent/swing-1
```

### Daily Workflow

```bash
# Before starting work
git fetch origin && git rebase origin/main

# During work (commit → push immediately)
git add <specific-files>  # NOT git add -A
git commit -m "..."
git push origin feature/your-branch

# Stay current (rebase every 15 min during active work)
git fetch origin main && git rebase origin/main
git push origin feature/your-branch --force-with-lease
```

### Git Rules (Non-Negotiable)

| Rule                 | Why                                               |
| -------------------- | ------------------------------------------------- |
| **No force push**    | Can destroy others' work. Messy history is OK.    |
| **No --no-verify**   | Hooks exist for a reason.                         |
| **Lint first**       | Commit lint fixes separately, BEFORE your change. |
| **Rebase often**     | Multiple agents push constantly. Stay current.    |
| **Specific adds**    | Use `git add <files>` not `git add -A`.           |
| **git status first** | Always review staged files before committing.     |

### Merging to Main

**Before merging any feature branch:**

1. `git fetch origin && git rebase origin/main`
2. Run PR review: `/code-review:code-review` or `/pr-review-toolkit:review-pr`
3. Fix all issues found (do NOT skip)
4. `npx playwright test && npx tsc --noEmit`
5. `git checkout main && git merge feature-branch && git push`

**For big architectural changes**, run comprehensive review:

```bash
/pr-review-toolkit:review-pr all
```

**If merge conflicts occur:**

1. Resolve conflicts carefully
2. Run full test suite before pushing
3. If tests fail, fix before pushing

**If main breaks after merge:**

```bash
git revert HEAD && git push origin main  # Quick rollback
# Fix on your branch, then re-merge
```

### Rebase vs Merge

When rebase has many conflicts due to PR squash creating duplicate commits (same message, different hash), **merge is cleaner than rebase**.

---

## Task Tracking (Beads)

This project uses [beads](https://github.com/steveyegge/beads). Run `bd prime` at session start.

### Quick Commands

```bash
bd ready                    # Show unblocked work
bd list                     # List all issues
bd show swing-abc           # View issue details
bd update swing-abc --status in_progress --assignee claude-orbstack-swing-6
bd close swing-abc --reason "Done in PR #42"
bd sync                     # Push to remote (run at session end)
```

### Creating & Linking Issues

```bash
bd create --title="Fix memory leak" --type=bug
bd dep add swing-new swing-old                     # blocks (default)
bd dep add swing-new swing-old --type discovered-from  # audit trail
```

**Dependency types:**

| Type              | Use When                              |
| ----------------- | ------------------------------------- |
| `blocks`          | Work cannot start until blocker done  |
| `related`         | Issues share context but don't block  |
| `parent-child`    | Epic/subtask hierarchy                |
| `discovered-from` | Found during other work (audit trail) |

### Multi-Clone Coordination

All swing directories share the SAME beads database via `beads-metadata` branch.

- Same issue ID appears in ALL clones - it's ONE issue
- Run `bd sync` from ONE directory at a time
- Before claiming: `bd show ISSUE_ID` to verify not already assigned
- **Assignee format**: `claude-machinename-directoryname` (e.g., `claude-orbstack-swing-2`)

### Troubleshooting

```bash
bd doctor             # Diagnose issues
bd doctor --fix       # Auto-fix common issues
```

| Problem                       | Fix                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| Database not found            | `bd sync` to pull from remote                                                        |
| beads-metadata branch missing | `git fetch origin beads-metadata && git branch beads-metadata origin/beads-metadata` |
| Sync permission errors        | `git branch --set-upstream-to=origin/beads-metadata beads-metadata`                  |

---

## Testing

### Philosophy

1. **Fast tests for CI** - Seeded data, ~1-3s each
2. **Realistic tests for releases** - Mock detector with timing, ~30-60s each
3. **Tests > Code** - Users should never find bugs tests could have caught

### Test Commands

```bash
just e2e              # Run all E2E tests
just e2e-ui           # Playwright UI mode
just e2e-debug        # Debug mode
just e2e-report       # View HTML report with traces
just test-unit        # Run unit tests
```

### When to Run Tests

- **Unit tests**: After any code changes
- **E2E tests**: After pipeline/transformer/UI changes, before PRs

### Bug Investigation Protocol

See [chop-conventions/dev-inner-loop/bug-investigation.md](https://github.com/idvorkin/chop-conventions/blob/main/dev-inner-loop/bug-investigation.md).

**Quick version:** Before fixing ANY bug:

1. **Spec**: Is this actually a bug? Ask if unclear.
2. **Test**: Add missing test BEFORE fixing.
3. **Arch**: Deeper problem? Create beads issue.

### E2E Test Files

| File                      | Type      | Purpose                            |
| ------------------------- | --------- | ---------------------------------- |
| `user-journey.spec.ts`    | Fast      | UI journey tests (seeded data)     |
| `extraction-flow.spec.ts` | Realistic | Full extraction with mock detector |
| `swing-analyzer.spec.ts`  | Fast      | Core app functionality             |

### Fixture Hash Errors

When tests fail with hash mismatch:

```bash
just check-fixture-hashes   # Check if videos changed
just update-fixture-hashes  # Update hashes
just e2e                    # Re-run tests
```

### SessionRecorder

The app captures detailed logs via `SessionRecorder` (`src/services/SessionRecorder.ts`).

**In browser console:**

```javascript
swingDebug.getCurrentSession(); // Get current recording
swingDebug.downloadSession(); // Download as JSON
swingDebug.getCrashLogs(); // Get persisted sessions
```

**In E2E tests:**

```typescript
const session = await page.evaluate(() => (window as any).swingDebug.getCurrentSession());
const repEvents = session.stateChanges.filter((e: any) => e.type === 'rep_detected');
```

---

## Architecture

### Pipeline Flow

```
VideoFileSkeletonSource
    ↓ (extracts poses, caches to IndexedDB)
LivePoseCache (streaming) ──────────────────┐
    ↓                                       │
CachedPoseSkeletonTransformer               │ OR  PoseSkeletonTransformer
    ↓ (instant lookup)                      │     (real-time ML inference)
Pipeline.processSkeletonEvent()             │
    ├── ExerciseDetector (auto-detect)      │
    ├── FormAnalyzer.processFrame()         │
    └── Rep counting + thumbnails           │
    ↓                                       │
UI (hooks consume results)                  │
```

### Plugin System: ExerciseRegistry

Exercises are plugins registered in `src/analyzers/ExerciseRegistry.ts`:

| Exercise         | Analyzer                      | Phases                                     |
| ---------------- | ----------------------------- | ------------------------------------------ |
| Kettlebell Swing | `KettlebellSwingFormAnalyzer` | top → connect → bottom → release           |
| Pistol Squat     | `PistolSquatFormAnalyzer`     | standing → descending → bottom → ascending |

To add a new exercise:

1. Create analyzer extending `FormAnalyzerBase`
2. Register in `EXERCISE_REGISTRY`
3. Add to `DetectedExercise` type

### Key Components

| Component                       | Purpose                                            |
| ------------------------------- | -------------------------------------------------- |
| `Pipeline`                      | Orchestrates frame → skeleton → form → rep         |
| `InputSession`                  | State machine for video input lifecycle            |
| `VideoFileSkeletonSource`       | Extracts poses, caches to IndexedDB                |
| `LivePoseCache`                 | Streaming cache for concurrent extraction/playback |
| `PoseSkeletonTransformer`       | Real-time BlazePose ML inference                   |
| `CachedPoseSkeletonTransformer` | Fast lookup from cache (no ML)                     |
| `ExerciseDetector`              | Auto-detects exercise type from movement           |
| `FormAnalyzerBase`              | Abstract base for all exercise analyzers           |
| `Skeleton`                      | Angle calculations (spine, hip, knee, arm)         |
| `BiomechanicsAnalyzer`          | Quality scoring, coaching cues                     |

### Key Files

- `src/pipeline/Pipeline.ts` - Main orchestrator
- `src/pipeline/InputSession.ts` - Video input state machine
- `src/pipeline/VideoFileSkeletonSource.ts` - Extraction + caching
- `src/pipeline/LivePoseCache.ts` - Streaming pose cache
- `src/analyzers/FormAnalyzerBase.ts` - Base class for analyzers
- `src/analyzers/ExerciseRegistry.ts` - Plugin registry
- `src/models/Skeleton.ts` - Angle calculations
- `src/models/BiomechanicsAnalyzer.ts` - Quality scoring

### Architectural Patterns (Follow These)

| Pattern                     | Why                                                         |
| --------------------------- | ----------------------------------------------------------- |
| **Streaming over batching** | Everything should stream through                            |
| **Precomputed only**        | Never compute on phone - precompute on disk or at same time |
| **React over DOM**          | No DOM manipulation - use React components                  |
| **Humble objects**          | External system interactions behind managers for testing    |
| **Plugin analyzers**        | New exercises via registry, not modifying core              |

### Current Model: BlazePose

- MediaPipe BlazePose-33 keypoint format (33 keypoints)
- Variants: Lite (default), Full, Heavy
- Configured in `src/config/modelConfig.ts`

### Future Roadmap

1. **More Exercises** - Pull-ups, Barbell Squats (plugin pattern ready)
2. **Model Selection UI** - BlazePose variant selection in settings
3. **Camera Source** - `CameraSkeletonSource` for live webcam

---

## Development Setup

### Multi-Agent Clone Setup

```bash
git clone https://github.com/idvorkin-ai-tools/swing-analyzer.git swing-N
cd swing-N && just setup
git remote add upstream https://github.com/idvorkin/swing-analyzer.git
```

Use **full clones**, not worktrees (worktrees cause issues with parallel agents).

### Server Management

**EVERY Claude instance runs its own server.** Vite auto-finds available port (5173, 5174, etc.).

```bash
just dev  # Start dev server
```

**Verify server is from YOUR directory:**

```bash
for pid in $(lsof -ti :5173 -ti :5174 2>/dev/null); do
  echo "PID $pid: $(readlink -f /proc/$pid/cwd)"
done
```

### Agent Dashboard

Monitor all agents at **http://localhost:9999** (or via Tailscale).

```bash
cd ~/gits/agent-dashboard && npm run dev
# Or: just dashboard
```

Shows: branch/PR status, GitHub links, running servers, beads status.

### Collaborative Feature Branches

When a feature needs multiple agents:

```bash
# Agent 1 creates branch
git checkout -b feature/skeleton-rendering
git push -u origin feature/skeleton-rendering
bd create --title="Help needed: optimize skeleton math" --type=task

# Agent 2 picks up work
bd ready
bd update swing-xyz --status=in_progress
git checkout feature/skeleton-rendering
```

---

## Maintenance

### Branch Hygiene (Every Few Days)

```bash
# List remote branches by date with behind/ahead counts
for branch in $(git branch -r | grep -v HEAD | head -20); do
  behind=$(git rev-list --count origin/main ^$branch 2>/dev/null || echo "?")
  ahead=$(git rev-list --count $branch ^origin/main 2>/dev/null || echo "?")
  date=$(git log -1 --format='%ci' $branch 2>/dev/null | cut -d' ' -f1)
  echo "$date | $branch | +$ahead -$behind"
done | sort -r
```

**Delete**: 100+ commits behind with 0 unique, 200+ commits behind, stale exploration branches
**Keep**: Active feature branches, branches with open PRs, `main`, `beads-metadata`

### Clone Health Check (Weekly)

```bash
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

### Post-PR: Check CodeRabbit

```bash
gh api repos/idvorkin/swing-analyzer/pulls/PR_NUMBER/comments \
  --jq '.[] | "File: \(.path):\(.line // .original_line)\n\(.body[0:300])\n---"' | head -100
```

### Retros

Run weekly (or when user says "retro"). See [chop-conventions/dev-inner-loop/retros.md](https://github.com/idvorkin/chop-conventions/blob/main/dev-inner-loop/retros.md).

**Storage:** `retros/`

---

## Before Implementing

See [chop-conventions/dev-inner-loop/before-implementing.md](https://github.com/idvorkin/chop-conventions/blob/main/dev-inner-loop/before-implementing.md).

**Quick version:**

1. **Spec first** - Understand what success looks like
2. **Confirm understanding** - Ask if unsure
3. **Read existing code** - Understand context
4. **Plan in beads** - So work continues if context clears

---

## Convention Updates

**Last reviewed:** 2025-12-05 (chop-conventions @ 2a6b6e6)

Projects using [chop-conventions](https://github.com/idvorkin/chop-conventions) should periodically pull updates and push improvements.

---

## CLI Tips

- Git output truncated: `git --no-pager diff`
- head/cat errors: `unset PAGER`
- Check justfile before writing new commands
- Auto-approved: `just test`, `just fast-test`
