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
- **Rep count should NOT change** - reps were already counted during extraction

## Key Insight

**Extraction is the source of truth.** Playback just visualizes cached data. We don't need to re-run form/rep analysis during playback.

## Current Architecture (Broken)

```
Extraction:
  PoseExtractor ──► keypoints only ──► SwingFormProcessor tries to capture from main video (WRONG FRAME)

Playback:
  VideoFrameAcquisition ──► CachedPoseSkeletonTransformer ──► SwingFormProcessor ──► SwingRepProcessor
                                                              (DUPLICATE rep counting!)
```

**Bugs:**
1. Filmstrip thumbnails show frame 0 (wrong frame)
2. Playing video after extraction counts reps AGAIN (doubles the count)

## Proposed Architecture

```
Extraction:
  PoseExtractor captures frameImage ──► Pipeline (full) ──► reps counted, thumbnails captured correctly

Playback:
  VideoFrameAcquisition ──► CachedPoseSkeletonTransformer ──► render skeleton ONLY
                                                              (NO form/rep processing)
```

**Key change:** Playback mode skips form/rep processing entirely. It just:
1. Looks up cached skeleton by video time
2. Renders skeleton to canvas
3. Updates angle displays

## Implementation Steps

### Step 1: Add frameImage to PoseTrackFrame type (runtime-only)

File: `src/types/posetrack.ts`

```typescript
export interface PoseTrackFrame {
  frameIndex: number;
  timestamp: number;
  videoTime: number;
  keypoints: PoseKeypoint[];
  score?: number;
  angles?: PrecomputedAngles;

  // RUNTIME ONLY - not serialized to PoseTrack files
  // Only populated during extraction for filmstrip thumbnails
  frameImage?: ImageData;
}
```

**Important:** This field is transient. It must be excluded from JSON serialization.

### Step 2: Add frameImage to FrameEvent interface

File: `src/pipeline/PipelineInterfaces.ts`

```typescript
export interface FrameEvent {
  frame: HTMLCanvasElement | HTMLVideoElement;
  timestamp: number;
  videoTime?: number;

  /**
   * Frame image captured during extraction.
   * Only populated in extraction mode by PoseExtractor.
   * Undefined during playback.
   */
  frameImage?: ImageData;
}
```

### Step 3: Capture frameImage in PoseExtractor

File: `src/services/PoseExtractor.ts`

In `extractPosesFromVideo()`, after drawing frame to canvas for ML:

```typescript
// After: ctx.drawImage(video, 0, 0, videoWidth, videoHeight);
// Before: const poses = await detector.estimatePoses(canvas);

// Capture frame for thumbnails (only needed for frames that might become checkpoints)
const frameImage = ctx.getImageData(0, 0, videoWidth, videoHeight);

// Later when building frame:
const frame: PoseTrackFrame = {
  frameIndex,
  timestamp: Math.round(videoTime * 1000),
  videoTime,
  keypoints,
  score: poses.length > 0 ? poses[0].score : undefined,
  frameImage,  // Passed to pipeline, cleared after thumbnail capture
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
        frameImage: frame.frameImage,  // Pass through for thumbnail capture
      },
    },
  };
}
```

### Step 5: Update SwingFormProcessor to use frameImage

File: `src/pipeline/SwingFormProcessor.ts`

```typescript
private currentFrameImage?: ImageData;

processFrame(skeletonEvent: SkeletonEvent): Observable<FormEvent> {
  // Store frameImage temporarily for use in updatePositionCandidate
  this.currentFrameImage = skeletonEvent.poseEvent.frameEvent.frameImage;

  // ... existing processing code ...

  // Clear after processing to prevent stale data
  this.currentFrameImage = undefined;

  return result;
}
```

Update `captureCurrentFrame`:

```typescript
private captureCurrentFrame(skeleton?: Skeleton): ImageData {
  // If we have a frame image from extraction, use it
  if (this.currentFrameImage) {
    return this.renderSkeletonOnFrame(this.currentFrameImage, skeleton);
  }

  // Fallback: capture from video element (for camera/live mode)
  // ... existing code ...
}

private renderSkeletonOnFrame(frameImage: ImageData, skeleton?: Skeleton): ImageData {
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = frameImage.width;
  tempCanvas.height = frameImage.height;
  const ctx = tempCanvas.getContext('2d');

  if (ctx) {
    ctx.putImageData(frameImage, 0, 0);

    // Render skeleton if available
    if (skeleton) {
      drawSkeletonToContext(ctx, skeleton);  // Use shared utility
    }

    // Crop around person
    const cropSize = this.calculatePersonCenteredCrop(skeleton, frameImage.width, frameImage.height);
    return ctx.getImageData(cropSize.x, cropSize.y, cropSize.size, cropSize.size);
  }

  return frameImage;
}
```

### Step 6: Create shared skeleton drawing utility

File: `src/utils/skeletonDrawing.ts` (NEW)

Extract skeleton rendering logic that can be shared between `SkeletonRenderer` and `SwingFormProcessor`:

```typescript
import type { Skeleton } from '../models/Skeleton';

export interface SkeletonDrawOptions {
  keypointRadius?: number;
  lineWidth?: number;
  keypointColor?: string;
  lineColor?: string;
}

const DEFAULT_OPTIONS: SkeletonDrawOptions = {
  keypointRadius: 4,
  lineWidth: 2,
  keypointColor: '#00ff00',
  lineColor: '#00ff00',
};

export function drawSkeletonToContext(
  ctx: CanvasRenderingContext2D,
  skeleton: Skeleton,
  options: SkeletonDrawOptions = {}
): void {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const keypoints = skeleton.getKeypoints();

  // Draw connections
  const connections = skeleton.getConnections();
  ctx.strokeStyle = opts.lineColor!;
  ctx.lineWidth = opts.lineWidth!;

  for (const [startIdx, endIdx] of connections) {
    const start = keypoints[startIdx];
    const end = keypoints[endIdx];
    if (start && end && start.score > 0.3 && end.score > 0.3) {
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    }
  }

  // Draw keypoints
  ctx.fillStyle = opts.keypointColor!;
  for (const kp of keypoints) {
    if (kp.score > 0.3) {
      ctx.beginPath();
      ctx.arc(kp.x, kp.y, opts.keypointRadius!, 0, 2 * Math.PI);
      ctx.fill();
    }
  }
}
```

### Step 7: Simplify Playback Pipeline - Skip Form/Rep Processing

This is the key architectural change. When using cached poses, playback should ONLY render skeletons.

**Option A: Separate Playback Pipeline (Recommended)**

Create a simpler pipeline for playback that doesn't include form/rep processors:

File: `src/pipeline/PlaybackPipeline.ts` (NEW)

```typescript
export class PlaybackPipeline {
  private skeletonSubject = new Subject<SkeletonEvent>();

  constructor(
    private frameAcquisition: FrameAcquisition,
    private skeletonTransformer: SkeletonTransformer  // CachedPoseSkeletonTransformer
  ) {}

  start(): Observable<SkeletonEvent> {
    // Just frame acquisition → skeleton lookup → emit
    // NO form processing, NO rep processing
    return this.frameAcquisition.start().pipe(
      switchMap(frame => this.skeletonTransformer.transformToSkeleton(frame)),
      tap(skeletonEvent => this.skeletonSubject.next(skeletonEvent))
    );
  }

  getSkeletonEvents(): Observable<SkeletonEvent> {
    return this.skeletonSubject.asObservable();
  }
}
```

**Option B: Flag in Existing Pipeline**

Add a `playbackOnly` mode to the existing Pipeline:

```typescript
class Pipeline {
  constructor(
    private frameAcquisition: FrameAcquisition,
    private skeletonTransformer: SkeletonTransformer,
    private formProcessor: FormProcessor,
    private repProcessor: RepProcessor,
    private playbackOnly: boolean = false  // NEW
  ) {}

  start(): Observable<PipelineResult> {
    return this.frameAcquisition.start().pipe(
      switchMap(frame => this.skeletonTransformer.transformToSkeleton(frame)),
      tap(skeletonEvent => this.skeletonSubject.next(skeletonEvent)),

      // SKIP form/rep processing in playback mode
      ...(this.playbackOnly ? [] : [
        switchMap(skeletonEvent => this.formProcessor.processFrame(skeletonEvent)),
        switchMap(formEvent => this.repProcessor.updateRepCount(formEvent)),
      ])
    );
  }
}
```

### Step 8: Update PipelineFactory

File: `src/pipeline/PipelineFactory.ts`

```typescript
export interface PipelineOptions {
  cachedPoseTrack?: PoseTrackFile;
  livePoseCache?: LivePoseCache;
  playbackOnly?: boolean;  // NEW: skip form/rep processing
}

export function createPipeline(
  videoElement: HTMLVideoElement,
  canvasElement: HTMLCanvasElement,
  options: PipelineOptions = {}
): Pipeline {
  // If using cached poses, default to playback-only mode
  const playbackOnly = options.playbackOnly ??
    (options.cachedPoseTrack !== undefined || options.livePoseCache !== undefined);

  // ... rest of factory logic ...

  return new Pipeline(
    frameAcquisition,
    skeletonTransformer,
    formProcessor,
    repProcessor,
    playbackOnly  // Pass the flag
  );
}
```

### Step 9: Ensure frameImage is NOT serialized

File: `src/services/PoseTrackService.ts`

Update serialization to strip runtime-only fields:

```typescript
export function serializePoseTrack(poseTrack: PoseTrackFile, pretty: boolean = false): string {
  // Strip runtime-only fields before serialization
  const cleanedFrames = poseTrack.frames.map(frame => {
    const { frameImage, ...serializableFrame } = frame;
    return serializableFrame;
  });

  const cleanedPoseTrack = {
    ...poseTrack,
    frames: cleanedFrames,
  };

  return JSON.stringify(cleanedPoseTrack, null, pretty ? 2 : undefined);
}
```

## Data Flow Summary

### Extraction Mode (Full Processing)
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
        └── SkeletonEvent with frameImage
              │
              ▼
Pipeline.processSkeletonEvent()
  ├── does NOT emit to skeletonSubject (no canvas rendering)
  ├── SwingFormProcessor uses frameImage for thumbnail
  └── SwingRepProcessor counts reps
        │
        ▼
resultSubject.next({ repCount }) → UI updates filmstrip & rep count
```

### Playback Mode (Visualization Only)
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
skeletonSubject.next(skeletonEvent)
  │
  ▼
Subscription in useSwingAnalyzer
  ├── updates angle displays
  └── skeletonRenderer.renderSkeleton() → CANVAS DRAW

*** NO form/rep processing ***
*** Rep count unchanged ***
*** Filmstrip unchanged ***
```

## UI Components & Data Sources

| Component | Extraction Mode | Playback Mode |
|-----------|-----------------|---------------|
| Rep Counter | Updates from resultSubject | Static (unchanged) |
| Filmstrip | Populates as reps complete | Static (already populated) |
| Skeleton Canvas | Not rendered | Renders from skeletonSubject |
| Angle Displays | Not updated | Updates from skeletonSubject |
| Progress Bar | Shows extraction % | Hidden |

## Files to Modify

1. `src/types/posetrack.ts` - Add `frameImage?: ImageData` (runtime-only)
2. `src/pipeline/PipelineInterfaces.ts` - Add `frameImage?: ImageData` to `FrameEvent`
3. `src/services/PoseExtractor.ts` - Capture `ImageData` after drawing frame
4. `src/pipeline/PipelineFactory.ts` - Pass `frameImage`, add `playbackOnly` option
5. `src/pipeline/SwingFormProcessor.ts` - Use `frameImage` if available
6. `src/utils/skeletonDrawing.ts` - NEW: shared skeleton rendering utility
7. `src/pipeline/Pipeline.ts` - Add `playbackOnly` mode to skip form/rep
8. `src/services/PoseTrackService.ts` - Strip `frameImage` from serialization

## Testing

After implementation:
1. Load a video file
2. Watch extraction progress - filmstrip should show correct frames with skeleton overlay
3. Rep count should update during extraction (e.g., shows "3 reps")
4. Press play - skeleton should render on main canvas
5. **Rep count should stay at 3** - NOT increase to 6
6. Click filmstrip thumbnail - should seek to correct video time
7. Save/load PoseTrack file - should work (no ImageData in JSON)
8. All existing E2E tests should pass

## Memory Considerations

- `frameImage` is ~8MB per frame at 1080p
- But it's only held briefly during processing of each frame
- Cleared immediately after thumbnail is created (cropped thumbnail is much smaller)
- Not stored in PoseTrack files
- No memory accumulation over time
