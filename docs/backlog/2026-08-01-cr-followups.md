# Follow-ups from the pre-upstream code review (2026-08-01)

Deferred items from the five-agent review of the reliability program and
its hardening pass (branch `fix/cr-findings-error-channel`). These were
judged real but not blocking for the upstream sync.

> Intended for beads, but the installed `bd` (1.1.2, Dolt backend) cannot
> read this repo's JSONL/beads-metadata workflow — see the CLAUDE.md
> beads section, which documents the older tool. Migrate these into
> whatever issue store wins.

## 1. Split PoseTrackFrame into persisted vs runtime types

`frameImage` is documented runtime-only but lives on the persisted
`PoseTrackFrame` type — the ~77KB/frame IndexedDB bloat happened because
the illegal state was representable; `stripRuntimeFields` and the lazy
migration are boundary patches. Long-term:

```ts
PoseTrackFrame; // persisted
ExtractionFrame = PoseTrackFrame & { frameImage: ImageData }; // runtime
```

so save/serialize signatures cannot receive the image. Boundary
enforcement is solid today; this is debt, not a bug.

## 2. Legacy cached pose tracks keep pre-measurement fps forever

Tracks persisted before fps measurement (commit `e583ed3`) carry a
hardcoded `fps: 30` — including the bundled
`e2e-tests/fixtures/poses/pistol-squat-sample.posetrack.json` and any
user's IndexedDB records. Cache hits skip `estimateVideoFps`, so a
previously-extracted 60fps video keeps wrong frame stepping silently and
permanently, while a fresh extraction of the same file behaves
differently. Records are indistinguishable today; add
`fpsMeasured: true` (or bump `metadata.version`) so loads can detect
assumed-fps records and remeasure, and regenerate the bundled fixture.

## 3. Pre-existing realistic-tier E2E failure

`instant-rep-gallery.spec.ts` › "rep count stays stable after extraction
when playing video" fails on `main` (verified at `a220869` in a clean
worktree, in isolation): `#rep-counter` never becomes visible after
extraction (30s timeout at spec line ~316). Outside the CI gate, so it
was never caught by the merge suite. Needs a real investigation — HUD
visibility (`hasPosesForCurrentFrame`) after mock-detector extraction.
Separately, `extraction-flow.spec.ts` › "extraction runs and counts
reps" passes in isolation but can flake under the full-suite 3-worker
load — consider serializing the realistic tier.

## 4. CLAUDE.md beads workflow doesn't match the installed bd

`bd sync` / JSONL-based multi-clone coordination is documented, but
`bd` 1.1.2 (Homebrew) is Dolt-backend-only and has no `sync` command;
this clone has no usable beads database even after restoring
`.beads/config.yaml`. Either pin/install the bd version the workflow
expects or rewrite the CLAUDE.md beads section (and the beads-metadata
branch flow) for the Dolt era.
