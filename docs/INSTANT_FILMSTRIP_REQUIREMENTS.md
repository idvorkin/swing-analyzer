# Instant Filmstrip: Stream from Extraction

## User Story

**As a user, I want to see my rep analysis immediately after loading a video, without having to press play.**

### Current Experience (Friction)

1. User loads video
2. User sees "Extracting poses..." progress bar
3. Extraction completes
4. **User must press play and watch the video** to see reps detected
5. Filmstrip populates as video plays
6. User waits for entire video to play through before seeing all reps

### Desired Experience (Instant)

1. User loads video
2. User sees "Extracting poses..." progress bar
3. **As extraction progresses, filmstrip thumbnails appear** (every ~10-20 seconds a new rep shows up)
4. When extraction completes, all reps are visible
5. User can immediately click any thumbnail to jump to that moment
6. No play button required for analysis

## Key Insight: Same Pipeline, Different Source

We don't need batch processing. The streaming pipeline already exists:

```
SkeletonEvent → FormProcessor → RepProcessor → Filmstrip
```

Currently, the source is video playback:

```
Video playback → VideoFrameAcquisition → CachedPoseSkeletonTransformer → Pipeline
```

What we want - source is extraction:

```
Extraction (onFrameExtracted) → SkeletonEvent → Pipeline
```

**Same pipeline. Just feed it from extraction instead of from playback.**

## Current Flow

```typescript
// usePoseTrack.ts - extraction callback
onFrameExtracted: (frame) => {
  liveCache.addFrame(frame); // Just caches, doesn't analyze
};
```

The frame has everything we need:

- `frame.keypoints` - the pose data
- `frame.timestamp` - when in the video

We're throwing away the opportunity to analyze immediately.

## Proposed Flow

```typescript
// usePoseTrack.ts - extraction callback
onFrameExtracted: (frame) => {
  liveCache.addFrame(frame);

  // Build skeleton from extracted frame
  const skeleton = buildSkeletonFromKeypoints(frame.keypoints);

  // Stream through existing pipeline
  pipeline.processSkeletonEvent({
    skeleton,
    timestamp: frame.timestamp,
    videoTime: frame.timestamp,
  });
};
```

The form processor and rep processor are stateful - they track position sequences and count reps. Feeding them frames in order during extraction produces the same results as playback, just faster.

## Frame Capture Challenge

The filmstrip needs thumbnail images. Currently `SwingFormProcessor.captureCurrentFrame()` grabs from:

- Live video element (at current playback position)
- Canvas with skeleton overlay

During extraction, we need a different approach:

### Option 1: Hidden Video + Seek

- Keep a hidden `<video>` element
- When rep detected, seek to `frame.timestamp`
- Capture frame, draw skeleton, store thumbnail

### Option 2: Deferred Capture

- During extraction, just record timestamps of rep positions
- After extraction completes, seek through and capture all thumbnails
- Filmstrip shows placeholders, then fills in

### Option 3: Store Raw Frame Data

- During extraction, also capture video frames as ImageData
- Store with the pose data
- Draw skeleton overlay at display time

**Recommendation**: Option 1 (hidden video + seek) is cleanest. We already have a hidden video for filmstrip capture in PR #45.

## What's Already Built (PR #45)

PR #45 added:

- Hidden video element for filmstrip frame capture
- `useFilmstripCapture` hook
- Incremental capture during extraction

This is exactly what we need. The missing piece is streaming extracted frames through the pipeline.

## Implementation Steps

1. **During extraction, stream frames through pipeline**

   - In `onFrameExtracted`, build SkeletonEvent from frame
   - Feed to form processor → rep processor
   - Rep processor emits when rep completes

2. **Capture filmstrip frame when rep detected**

   - Seek hidden video to rep timestamp
   - Capture frame + draw skeleton
   - Add to filmstrip

3. **Update filmstrip UI progressively**
   - As reps are detected, filmstrip grows
   - User sees thumbnails appearing during extraction

## Timing Expectations

- Extraction runs at ~5-15 FPS (depends on model, hardware)
- A 60-second video with 10 reps = ~6 seconds per rep
- At 10 FPS extraction, first rep detected after ~60 frames = ~6 seconds
- User sees first thumbnail within ~10 seconds of starting extraction

## Success Criteria

- [ ] User loads video, sees first rep thumbnail within 10-15 seconds
- [ ] Rep count updates progressively during extraction
- [ ] Filmstrip fully populated when extraction completes
- [ ] No play button press required to see analysis
- [ ] Click any thumbnail to seek video to that moment

## Files to Modify

- `src/hooks/usePoseTrack.ts` - Stream extracted frames through pipeline
- `src/hooks/useSwingAnalyzer.tsx` - Expose pipeline for extraction feeding
- `src/components/VideoSection.tsx` - Wire up progressive filmstrip
- Leverage existing `useFilmstripCapture` from PR #45
