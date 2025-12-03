# Extraction Architecture Plan

## Problem Statement

When a user loads a video, we extract poses in the background. During extraction:
- Filmstrip thumbnails need correct video frames (not from main video element which is at frame 0)
- Skeleton should NOT render on main canvas (video is paused)
- Rep count and filmstrip should update in real-time as extraction progresses

During playback:
- Skeleton SHOULD render on main canvas
- Use cached poses (no re-extraction needed)
- Filmstrip already populated from extraction

## Key Insight

**Extraction is the source of truth.** Playback just visualizes cached data. We don't need to re-run form/rep analysis during playback.

## Current Architecture (Broken)

```
Extraction:
  PoseExtractor ──► keypoints only ──► SwingFormProcessor tries to capture from main video (WRONG FRAME)

Playback:
  VideoFrameAcquisition ──► CachedPoseSkeletonTransformer ──► renders skeleton ──► re-runs form/rep (redundant)
```

## Proposed Architecture

```
Extraction:
  PoseExtractor captures frameImage ──► passes through pipeline ──► SwingFormProcessor uses frameImage for thumbnails

Playback:
  VideoFrameAcquisition ──► CachedPoseSkeletonTransformer ──► renders skeleton only (form/rep already done)
```

## Implementation Steps

### Step 1: Add frameImage to PoseTrackFrame type

File: `src/types/posetrack.ts`

```typescript
export interface PoseTrackFrame {
  frameIndex: number;
  timestamp: number;
  videoTime: number;
  keypoints: PoseKeypoint[];
  score?: number;
  angles?: PrecomputedAngles;
  frameImage?: ImageData;  // NEW: captured during extraction for thumbnails
}
```

### Step 2: Add frameImage to FrameEvent interface

File: `src/pipeline/PipelineInterfaces.ts`

```typescript
export interface FrameEvent {
  frame: HTMLCanvasElement | HTMLVideoElement;
  timestamp: number;
  videoTime?: number;
  frameImage?: ImageData;  // NEW: for extraction mode
}
```

### Step 3: Capture frameImage in PoseExtractor

File: `src/services/PoseExtractor.ts`

In `extractPosesFromVideo()`, after drawing frame to canvas for ML:

```typescript
// After: ctx.drawImage(video, 0, 0, videoWidth, videoHeight);
// Before: const poses = await detector.estimatePoses(canvas);

// Capture frame for thumbnails
const frameImage = ctx.getImageData(0, 0, videoWidth, videoHeight);

// Later when building frame:
const frame: PoseTrackFrame = {
  frameIndex,
  timestamp: Math.round(videoTime * 1000),
  videoTime,
  keypoints,
  score: poses.length > 0 ? poses[0].score : undefined,
  frameImage,  // NEW
};
```

### Step 4: Pass frameImage through buildSkeletonEventFromFrame

File: `src/pipeline/PipelineFactory.ts`

```typescript
export function buildSkeletonEventFromFrame(frame: PoseTrackFrame): SkeletonEvent {
  const skeleton = buildSkeletonFromFrame(frame);

  return {
    skeleton,
    poseEvent: {
      pose: skeleton
        ? { keypoints: frame.keypoints, score: frame.score }
        : null,
      frameEvent: {
        frame: null as unknown as HTMLVideoElement,
        timestamp: frame.timestamp,
        videoTime: frame.videoTime,
        frameImage: frame.frameImage,  // NEW: pass through
      },
    },
  };
}
```

### Step 5: Update SwingFormProcessor to use frameImage

File: `src/pipeline/SwingFormProcessor.ts`

Update `processFrame` to pass frameImage to capture method:

```typescript
processFrame(skeletonEvent: SkeletonEvent): Observable<FormEvent> {
  // ... existing code ...

  // Store frameImage for use in updatePositionCandidate
  this.currentFrameImage = skeletonEvent.poseEvent.frameEvent.frameImage;

  // ... rest of method ...
}
```

Update `captureCurrentFrame`:

```typescript
private captureCurrentFrame(skeleton?: Skeleton): ImageData {
  // If we have a frame image from extraction, use it
  if (this.currentFrameImage) {
    return this.renderSkeletonOnFrame(this.currentFrameImage, skeleton);
  }

  // Playback mode: capture from video element
  // ... existing code ...
}

private renderSkeletonOnFrame(frameImage: ImageData, skeleton?: Skeleton): ImageData {
  // Create temp canvas, draw frameImage, render skeleton on top, crop
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = frameImage.width;
  tempCanvas.height = frameImage.height;
  const ctx = tempCanvas.getContext('2d');

  if (ctx) {
    ctx.putImageData(frameImage, 0, 0);

    // Render skeleton if available
    if (skeleton) {
      this.renderSkeletonToContext(ctx, skeleton);
    }

    // Crop around person
    const cropSize = this.calculatePersonCenteredCrop(skeleton, frameImage.width, frameImage.height);
    return ctx.getImageData(cropSize.x, cropSize.y, cropSize.size, cropSize.size);
  }

  return frameImage;
}

private renderSkeletonToContext(ctx: CanvasRenderingContext2D, skeleton: Skeleton): void {
  // Draw skeleton connections and keypoints
  const keypoints = skeleton.getKeypoints();
  // ... render logic ...
}
```

### Step 6: Ensure Pipeline.processSkeletonEvent doesn't emit skeleton events

File: `src/pipeline/Pipeline.ts`

Already done - `processSkeletonEvent` does not call `skeletonSubject.next()`.

## Data Flow Summary

### Extraction Mode
```
PoseExtractor
  ├── draws frame to canvas
  ├── captures frameImage = ctx.getImageData()
  ├── runs ML inference → keypoints
  └── calls onFrameExtracted({ keypoints, videoTime, frameImage })
        │
        ▼
VideoSection.handleFrameExtracted()
  └── buildSkeletonEventFromFrame(frame)
        └── SkeletonEvent with frameImage in frameEvent
              │
              ▼
Pipeline.processSkeletonEvent()
  ├── does NOT emit to skeletonSubject (no rendering)
  └── passes to SwingFormProcessor
        │
        ▼
SwingFormProcessor.processFrame()
  ├── detects this.currentFrameImage is set
  └── uses it for thumbnail capture
        │
        ▼
Checkpoint created with correct thumbnail
  │
  ▼
resultSubject.next({ repCount }) → UI updates
```

### Playback Mode
```
Video.play()
  │
  ▼
VideoFrameAcquisition emits FrameEvents
  │
  ▼
CachedPoseSkeletonTransformer
  └── looks up cached pose by videoTime
        │
        ▼
Pipeline tap() operator
  └── skeletonSubject.next(skeletonEvent)
        │
        ▼
Subscription in useSwingAnalyzer
  ├── updates angle displays
  └── skeletonRenderer.renderSkeleton() → CANVAS DRAW
        │
        ▼
SwingFormProcessor.processFrame()
  ├── this.currentFrameImage is undefined
  └── captures from video element (correct position now)
```

## UI Components & Subscriptions

| Component | Data Source | Subscription |
|-----------|-------------|--------------|
| Rep Counter | `repCount` state | `resultSubject.subscribe()` |
| Filmstrip | `repProcessor.getAllReps()` | `useEffect([repCount])` triggers `renderFilmstrip()` |
| Skeleton Canvas | `skeletonEvent` | `skeletonSubject.subscribe()` → `skeletonRenderer.renderSkeleton()` |
| Angle Displays | `spineAngle`, `armAngle` state | `skeletonSubject.subscribe()` |
| Progress Bar | `poseTrackStatus` | `onProgress` callback in extraction |

## Files to Modify

1. `src/types/posetrack.ts` - Add `frameImage?: ImageData` to `PoseTrackFrame`
2. `src/pipeline/PipelineInterfaces.ts` - Add `frameImage?: ImageData` to `FrameEvent`
3. `src/services/PoseExtractor.ts` - Capture `ImageData` after drawing frame
4. `src/pipeline/PipelineFactory.ts` - Pass `frameImage` in `buildSkeletonEventFromFrame`
5. `src/pipeline/SwingFormProcessor.ts` - Use `frameImage` if available, add skeleton rendering helper

## Testing

After implementation:
1. Load a video file
2. Watch extraction progress - filmstrip should show correct frames with skeleton overlay
3. Rep count should update during extraction
4. Press play - skeleton should render on main canvas
5. Click filmstrip thumbnail - should seek to correct video time
6. All existing E2E tests should pass
