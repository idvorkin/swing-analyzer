# Skeleton Rendering Specification

> **Part of the [HUD](./HUD_SPEC.md)** - The skeleton is one component of the heads-up display that overlays the video.

## Expected Behavior

### Visibility Rules
1. **Skeleton is visible whenever poses exist for the current video frame**
2. Skeleton updates on any frame change (playback, seek, step forward/backward)
3. Visibility is independent of play/pause state

### Timing

| State | Skeleton Behavior |
|-------|-------------------|
| Video playing | Updates on each video frame via `requestVideoFrameCallback` |
| Video paused | Shows pose at `video.currentTime` |
| Video seeked | Updates immediately after seek completes |
| No poses for current frame | No skeleton (canvas cleared or hidden) |

### Progressive Playback (Key Concept)

**The skeleton renders whenever poses exist for `video.currentTime`, regardless of extraction state.**

During extraction:
- Extraction runs on a **hidden** video element (for ML inference)
- The **visible** video is independent - user can play, pause, seek freely
- If user plays to a frame that's already extracted → skeleton renders
- If user plays to a frame not yet extracted → no skeleton (no data yet)

This means:
- User sees results **immediately** as frames are extracted
- No waiting for full extraction to complete
- Skeleton appears progressively as more frames become available

### Canvas Alignment

The skeleton canvas MUST:
1. Have internal dimensions (`canvas.width`, `canvas.height`) equal to video dimensions (`video.videoWidth`, `video.videoHeight`)
2. Be CSS-positioned to exactly overlay the video's rendered content area
3. Account for `object-fit: contain` letterboxing on video
4. Handle both portrait and landscape video orientations

**Note**: Canvas elements don't support `object-fit`. To align canvas with video:
- Calculate video's actual rendered position/size within container
- Set canvas CSS `width`, `height`, `left`, `top` to match
- Use internal canvas dimensions for coordinate space

### Filmstrip Thumbnails

Filmstrip thumbnails SHOULD include skeleton overlay:
- When generating thumbnails, draw skeleton on top of video frame
- Ensures visual consistency between filmstrip and main view

### Test Coverage Required

E2E tests must verify:
1. Canvas dimensions match video dimensions after load
2. Skeleton renders during playback (per-frame sync)
3. Skeleton renders when paused (at current frame)
4. Skeleton renders after seeking
5. Skeleton does NOT render during extraction
6. Skeleton position aligns with person in video

### Architecture

Single source of truth for skeleton rendering:
- All skeleton rendering goes through `SkeletonRenderer.renderSkeleton()`
- Skeleton lookup uses `InputSession.getSkeletonAtTime()`
- Rendering triggered by: `requestVideoFrameCallback` (playback) and `seeked` event (manual seek)

### Known Failure Modes

| Symptom | Likely Cause |
|---------|--------------|
| Skeleton not visible | Canvas dimensions not synced to video |
| Skeleton offset from person | CSS scaling mismatch, or canvas not positioned at (0,0) |
| Skeleton not updating | `video.paused` check blocking render, or cache miss |
| Skeleton during extraction only | `timeupdate` handler not connected |
