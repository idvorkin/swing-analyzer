# Domain Model

This document defines the core terminology and concepts used in the swing analyzer codebase.

## Core Concepts

### Position

A **position** is a key point in a swing movement. There are 4 positions in a kettlebell swing:

| Position    | Description                             | Angle Range                        |
| ----------- | --------------------------------------- | ---------------------------------- |
| **Top**     | Standing upright, kettlebell at chest   | Spine < 15° from vertical          |
| **Connect** | Arms connected to body during backswing | Spine ~30-45° forward              |
| **Bottom**  | Deepest point of the hinge              | Spine > 55° forward                |
| **Release** | Ascending, arms releasing from body     | Spine ~30-45° returning to upright |

Positions are defined in `SwingPositionName` enum:

```typescript
export enum SwingPositionName {
  Top = 'top',
  Connect = 'connect',
  Bottom = 'bottom',
  Release = 'release',
}
```

### Rep (Repetition)

A **rep** is one complete swing movement. A rep is counted when the user completes the full position sequence:

```
top → connect → bottom → release → top
```

The second "top" position after "release" marks the completion of one rep. The rep counter increments at this point.

**Key insight**: The first time through the positions establishes the baseline. The rep counter only increments when returning to "top" after seeing "release".

### Skeleton

A **skeleton** is the pose data extracted from a video frame, consisting of 33 keypoints (MediaPipe BlazePose-33 format). The skeleton provides:

- Joint positions (x, y coordinates)
- Confidence scores per keypoint
- Calculated angles (spine, hip, knee, arm)

### Frame

A **frame** is a single video image at a specific timestamp. Frames are processed to extract skeletons.

### Extraction

**Extraction** is the process of analyzing video frames to detect poses. This happens:

1. When a video is first loaded
2. Frame-by-frame at ~15 FPS
3. Results are cached in IndexedDB for future playback

### Playback

**Playback** mode uses cached pose data instead of running ML inference. This enables:

- Instant skeleton overlay during video playback
- Consistent results (no ML variance)
- Lower CPU usage

## Processing Pipeline

```
Video Frame → Pose Detection → Skeleton → Position Detection → Rep Counting
     ↓              ↓              ↓              ↓                ↓
  FrameEvent    PoseEvent    SkeletonEvent   FormEvent        RepEvent
```

### FormAnalyzer

The **FormAnalyzer** is the core analysis component that:

1. Tracks which positions have been seen
2. Detects position transitions based on spine angle
3. Counts reps when the sequence completes
4. Captures position candidates for filmstrip thumbnails

### Filmstrip

The **filmstrip** shows thumbnail images for each position of each rep. During extraction:

1. FormAnalyzer tracks the "best" frame for each position (highest confidence)
2. When a cycle completes, thumbnails are emitted for all 4 positions
3. Thumbnails appear in the UI progressively as reps are detected

## Deprecated Terms

These terms should NOT be used in new code:

| Deprecated     | Use Instead | Reason                                   |
| -------------- | ----------- | ---------------------------------------- |
| checkpoint     | position    | "Checkpoint" was ambiguous               |
| cycle          | rep         | "Cycle" was redundant with rep detection |
| FormCheckpoint | (removed)   | Dead code, never used                    |
| RepData        | (removed)   | Dead code, never used                    |

## File References

| Concept              | Primary File                    |
| -------------------- | ------------------------------- |
| Position enum        | `src/types.ts`                  |
| Skeleton model       | `src/models/Skeleton.ts`        |
| FormAnalyzer         | `src/analyzers/FormAnalyzer.ts` |
| Pipeline             | `src/pipeline/Pipeline.ts`      |
| Exercise definitions | `src/exercises/index.ts`        |
