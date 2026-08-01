# Reliability Fix-Up: Design Spec

**Date:** 2026-07-20
**Status:** Approved by Igor (sections 1–3 approved in brainstorming session)
**Approach:** Test-gated hybrid — safety net first, then defect fixes with tests, then architecture paydown scoped to where the defects lived, then docs sync.

**Implementation status (2026-08-01):** Phase 0+1 shipped to `main`
(merge `a220869`), followed by a hardening pass from the pre-upstream
code review. Two deviations from this spec as written:

- **No 60fps E2E fixture was built** (Phase 0 item 2 and defect 6's
  "frame-step E2E" test line). The fps math is unit-covered in
  `src/services/PoseExtractor.test.ts` instead; the first success
  criterion below is unit-verified, not E2E-verified. See plan Task 11
  for the recorded decision.
- **Defect 2's cached burst is stop()-aware, not AbortSignal-aware** —
  a stopped flag plus a generation token checked when the burst fires.
  Abort paths reach `stop()` via the session, so behavior matches
  intent; only the mechanism differs.

## Context

A four-dimension code review (architecture, correctness, product surface, tests) of the full codebase found six user-felt defects, substantial silent-failure plumbing, ~1,700 lines of dead code, and a missing CI safety net. Igor's priority: the record-video-then-upload-on-phone flow at the gym must work reliably. The "camera selection" complaint was investigated: no camera capture code exists in the app (removed in commits `30435ae`/`9caa1f7`); the camera icon opens an OS file picker, and the likely real pain is defect 4 below (same-file reselect no-op) plus iOS re-encoding defeating the pose cache.

## Goal

Make the upload-on-phone flow reliable by fixing the six review defects, each protected by a test, then pay down only the architecture those fixes touch.

## Success criteria (the gym test)

- Load a 60fps iPhone video: correct rep counts and frame stepping; re-select the same file and it loads again instead of silently doing nothing.
- No "Storage full" errors from a normal week of videos; cache loads are fast.
- Switching videos mid-extraction never wedges the app ("Processing video…" forever) or pollutes rep counts across videos.
- Failures show a visible message instead of a vanishing spinner.
- CI blocks any PR that breaks the E2E suite.

## Phase 0 — Safety net (before touching any bug)

1. **E2E in CI.** Add Playwright (chromium project, fast seeded specs only) to the merge gate in `.github/workflows/build.yml` (or a parallel required workflow). Slow realistic-extraction specs stay local/nightly; CI target under ~5 minutes. Today no workflow runs Playwright at all, contradicting `docs/tech-pack/TEST_STRATEGY.md:110-118`.
2. **Real upload-journey E2E.** No spec calls `setInputFiles` today; the primary user flow is untested. Add an E2E that uploads a real fixture video file, waits for extraction (mock detector), and asserts rep count. Add a 60fps fixture variant for defect 6.
3. **Race regression harness.** Unit-level test rig for `InputSession` with a controllable slow mock source so the Phase 1 race fixes are written test-first.
4. **Fresh-clone papercut.** `just test-unit` fails on fresh clones because `src/generated_version.ts` is never generated (`just test` generates it). Make `test-unit` generate it too.

## Phase 1 — Defect fixes (test-first, one commit per fix)

### 1. Stop persisting per-frame `ImageData` (storage/memory bomb)

`PoseExtractor` attaches ~77KB `ImageData` to every frame (`src/services/PoseExtractor.ts:300-328`, comment claims "runtime only, not persisted") but `savePoseTrackToStorage` structured-clones it into IndexedDB (`src/services/PoseTrackService.ts:322-331`) — ~138MB per minute of 30fps video, persisted and retained in RAM. Root cause of quota errors, multi-second cache loads, mobile tab crashes.

- **Fix:** strip `frameImage` before `store.put()` (mirror `serializePoseTrack`, `PoseTrackService.ts:199-217`). Add load-time migration: when a loaded record contains `ImageData`, strip and re-save so existing installs recover without clearing caches. Rep-gallery thumbnails are produced separately by `ThumbnailGenerator` — no user-visible loss.
- **Test:** saved record contains zero `ImageData` + per-frame size ceiling; migration test on a seeded bloated record.

### 2. Video-switch races

`InputSession.startVideoFile`'s catch runs `cleanup()` against _current_ `this.source` when a stale load rejects (`src/pipeline/InputSession.ts:153-167`), disposing the new video's source → stuck "Processing video…". Separately, the hook resets the pipeline before the old source is torn down, with an up-to-10s metadata gap during which the old source streams frames into the new session (`src/hooks/useExerciseAnalyzer.tsx:1196-1219`). The cached-batch `setTimeout` burst also ignores abort (`src/pipeline/VideoFileSkeletonSource.ts:169-199`).

- **Fix:** generation guard — catch/cleanup only act if `this.source` is still the source this call created. Stop the old source before resetting the pipeline. Make the cached burst abort-aware.
- **Test:** race harness — start slow video A, switch to B mid-load; assert B survives A's late abort/error and no A-frames reach B's pipeline.

### 3. Make errors visible

`status` is set in 21 places in the hook but its only renderer (`AnalysisSection.tsx`) is never mounted; pipeline analyzer errors route to an `errorSubject` whose subscriber only `console.warn`s (`useExerciseAnalyzer.tsx:878-890`); the hook's degraded-mode counter (`:656-669`) is unreachable because `Pipeline` catches internally (`src/pipeline/Pipeline.ts:365-377`); `console.error` is monkeypatched into SessionRecorder (`SessionRecorder.ts:523-543`).

- **Fix:** new `StatusBanner` component (toast-style, mounted in `App`) rendering `status`. Wire `errorSubject` → banner with a consecutive-error threshold; delete the unreachable counter. SessionRecorder keeps recording; errors now also reach the screen.
- **Test:** component test; E2E force-failing an upload asserts the message appears.

### 4. Same-file reselect no-op

`handleVideoUpload` never resets `fileInputRef.current.value` (`useExerciseAnalyzer.tsx:1196-1219`), so selecting the same video twice fires no `change` event — the likely gym-time "camera selection" pain.

- **Fix:** reset the input's `value` after each selection. iOS re-encoding on every picker selection (different bytes → hash miss → full re-extraction) cannot be fixed client-side; document it as a known limitation. The StatusBanner at least makes the re-extraction visible.
- **Test:** two consecutive selections of the same `File` both fire the upload handler.

### 5. `batchComplete` asymmetry (typed)

Completion fields are smuggled past the `SkeletonSourceState` union via `as` casts (`VideoFileSkeletonSource.ts:193-198` vs union at `src/pipeline/SkeletonSource.ts:31-36`) and emitted only on the cached path — fresh extraction ends with plain `{type:'active'}` (`:389`), so the hook's completion branch (crop-region computation, counter resets, `useExerciseAnalyzer.tsx:758-821`) never runs on first load.

- **Fix:** add the completion fields to the union properly, delete the casts, emit completion state after fresh extraction too.
- **Test:** unit — source emits completion on both paths; E2E — zoom-to-person crop available on first extraction.

### 6. Real FPS detection

`estimateVideoFps` hardcodes 30 (`src/services/PoseExtractor.ts:524-533`); frame stepping uses `1/30` (`useExerciseAnalyzer.tsx:1381`). iPhones commonly record 60fps → wrong totalFrames, stepping, crop math.

- **Fix:** measure fps during extraction from frame timestamps; store in pose-track metadata; consumers read it. Cached tracks without fps fall back to 30.
- **Test:** unit with 30/60fps fixtures; frame-step E2E on the 60fps fixture.

### Ride-along small fixes

- Quota error after successful extraction currently fails the whole session (`VideoFileSkeletonSource.ts:387`, `:218-221`) even though poses are in memory — warn and continue instead.
- `getSkeletonAtTime` during live extraction matches with unlimited distance (`VideoFileSkeletonSource.ts:270-281`) vs the transformer's 0.1s tolerance — add the same tolerance so playback ahead of the extraction frontier doesn't render a stale skeleton as current.
- `loadVideo`'s early-return guard leaks the blob URL (`useExerciseAnalyzer.tsx:1152-1158`) — revoke it.

## Phase 2 — Architecture paydown (scoped to where the fixes lived)

1. **Extract `VideoLoaderService`** from `useExerciseAnalyzer` (~300 lines: `fetchWithProgress`, `loadVideoSafely`, blob-URL lifecycle, error-message mapping). The race fix rewrites this seam anyway; extraction makes it unit-testable and starts shrinking the 1,821-line hook where it is most dangerous.
2. **Unify spine-angle math into `Skeleton`.** Today `spineAngle` is injected via constructor (`src/models/Skeleton.ts:70-83`) and the trig is reimplemented in 4 places (`PoseSkeletonTransformer.ts:297` — with a unique face-orientation fallback at `:337`, `CachedPoseSkeletonTransformer.ts:177`, `PoseExtractor.ts:566`, `PipelineFactory.ts:172`). Skeleton computes it; the fallback moves in as an explicit strategy; the 4 copies die. Kills the cached-vs-live-disagreement bug class.
3. **HUD phase from the analyzer.** Delete the hook's hardcoded kettlebell thresholds (`useExerciseAnalyzer.tsx:605-618`, duplicating `KettlebellSwingFormAnalyzer.ts:70-86`); HUD asks the analyzer. Pistol-squat HUD becomes correct for free.
4. **Delete dead code (~1,700 lines):** `useVideoControls.ts` (528) + its 972-line test, `useInputSession.ts` (194), `Pipeline.start()` legacy path (`Pipeline.ts:92-179`) and `processFrameAsync()` (`:281-332`) after re-verifying zero callers, never-mounted `AnalysisSection.tsx` (superseded by StatusBanner) and `PoseTrackStatusBar.tsx`, the V1-compat no-op stubs in the hook return (`useExerciseAnalyzer.tsx:1728-1778`), deprecated `useSwingAnalyzerContext` aliases (`src/contexts/ExerciseAnalyzerContext.tsx:36-40`, update the 2 importers). Rename `VideoSectionV2` → `VideoSection` (no V1 exists).

## Phase 3 — Docs sync

- `docs/ARCHITECTURE.md`: rename `useSwingAnalyzerV2` → `useExerciseAnalyzer`; remove dead hooks from the hooks-layer table; remove `checkRepComplete` (doesn't exist); fix `PoseDetectorFactory` location (it's in `src/pipeline/`); spine-angle ownership moves to `Skeleton`; remove the dead `processFrameAsync` data-flow description; **replace the "cross-cutting concerns → add to useSwingAnalyzerV2" guidance** (`:96`) that instructs contributors to grow the God object.
- Project `CLAUDE.md`: fix the pipeline diagram (detection runs in `processSkeletonEvent`); drop `BiomechanicsAnalyzer` from key components or mark it unused.
- `README.md`: remove the camera-support claim (no camera code exists).
- `docs/USER_JOURNEY.md`: update or delete (describes UI that no longer exists, including a camera flow).

## Explicit non-goals (backlog as beads issues, not this program)

- Full decomposition of the remaining ~1,400-line hook.
- Displaying rep-quality scores / coaching cues (`RepQuality` and `BiomechanicsAnalyzer` are computed-but-unshown today).
- Extraction cancel button, seek bar, slow-motion playback.
- Camera/live mode.
- Height-setting no-op (`SettingsTab.tsx:93-102` saves a value nothing reads).
- SessionRecorder decomposition.

## Sequencing & delivery

Phases land as separate PRs in order 0 → 1 → 2 → 3, each behind green CI including the new E2E gate. Phase 1 fixes are individually small commits so a bad one reverts cleanly. Line numbers in this spec are as of commit `08bd568` and will drift; treat them as pointers, not gospel.
