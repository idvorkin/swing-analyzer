# Skeleton Rendering Specification

## Expected Behavior

### Visibility Rules
1. **Skeleton is visible whenever poses exist for the current video frame**
2. Skeleton updates on any frame change (playback, seek, step forward/backward)
3. Visibility is independent of play/pause state

### Timing

| State | Skeleton Behavior |
|-------|-------------------|
| Video playing | Updates on each `timeupdate` event |
| Video paused | Shows pose at `video.currentTime` |
| Video seeked | Updates immediately after seek completes |
| During extraction | Shows pose at current video frame as extraction progresses |
| No poses cached | No skeleton (canvas cleared or hidden) |

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
2. Skeleton renders during playback
3. Skeleton renders when paused (at current frame)
4. Skeleton renders after seeking
5. Skeleton renders during extraction
6. Skeleton position aligns with person in video

### Architecture

Single source of truth for skeleton rendering:
- All skeleton rendering goes through `SkeletonRenderer.renderSkeleton()`
- Skeleton lookup uses `InputSession.getSkeletonAtTime()`
- Rendering triggered by: `timeupdate`, `seeked`, and extraction events

### Known Failure Modes

| Symptom | Likely Cause |
|---------|--------------|
| Skeleton not visible | Canvas dimensions not synced to video |
| Skeleton offset from person | CSS scaling mismatch, or canvas not positioned at (0,0) |
| Skeleton not updating | `video.paused` check blocking render, or cache miss |
| Skeleton during extraction only | `timeupdate` handler not connected |
