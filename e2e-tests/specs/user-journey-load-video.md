# User Journey: Load and Analyze Sample Video

## Overview

A user visits the Swing Analyzer app and loads a sample video to analyze their kettlebell swing form.

## Preconditions

- App is accessible at the base URL
- Sample video (`swing-sample.mp4`) is available in `/videos/`
- Pose detection model can be mocked via seeded IndexedDB data

## User Story

> As a user, I want to load a sample video and see my swing form analyzed, so that I can understand the app's capabilities before recording my own swings.

## Step-by-Step Journey

### 1. App Load

- **User action**: Navigate to the app URL
- **Expected result**:
  - Page title contains "Swing Analyzer"
  - Header shows "Swing Analyzer"
  - Video controls visible: File, Sample, Camera buttons
  - Analysis section visible with Reps, Spine, Arm metrics (initially 0)

### 2. Load Sample Video

- **User action**: Click the "Sample" button
- **Expected result**:
  - Video element appears and loads `swing-sample.mp4`
  - Status indicator shows video loaded
  - Play/Pause, Prev, Next, Stop buttons become enabled

### 3. Play Video

- **User action**: Click Play button (or video auto-plays)
- **Expected result**:
  - Video starts playing
  - Pose detection runs on each frame (mocked via seeded pose data)
  - Spine angle updates as poses are detected
  - Arm angle updates as poses are detected

### 4. Complete First Rep

- **User action**: Watch video progress through swing positions
- **Expected result**:
  - Position detection cycles through: Top → Connect → Bottom → Release → Top
  - When cycle completes (Release → Top), rep counter increments to 1
  - Filmstrip appears showing checkpoint thumbnails for each position

### 5. Complete Multiple Reps

- **User action**: Continue watching video
- **Expected result**:
  - Rep counter increases with each completed rep
  - Filmstrip shows checkpoints for current rep
  - Rep navigation (< Rep 1/N >) appears when multiple reps complete

### 6. Pause and Navigate

- **User action**: Click Pause, then use Prev/Next frame buttons
- **Expected result**:
  - Video pauses
  - Prev/Next buttons step through individual frames
  - Pose overlay updates on each frame

### 7. View Rep Details

- **User action**: Click on filmstrip thumbnail
- **Expected result**:
  - Video seeks to that checkpoint's timestamp
  - User can see the exact moment of that swing position

### 8. Navigate Between Reps

- **User action**: Use rep navigation arrows (< >)
- **Expected result**:
  - Filmstrip updates to show different rep's checkpoints
  - Rep indicator updates (e.g., "Rep 2/3")

## Test Data Requirements

### Mocked Pose Data

To test without ML model inference, seed IndexedDB with pose track data:

- Use `seedPoseTrackFixture(page, 'three-reps')` for multi-rep scenario
- Use `seedPoseTrackFixture(page, 'single-rep')` for single-rep scenario

### Expected Fixtures Available

| Fixture          | Description                 | Expected Reps |
| ---------------- | --------------------------- | ------------- |
| `single-rep`     | One complete swing cycle    | 1             |
| `three-reps`     | Three complete swing cycles | 3             |
| `poor-detection` | Low confidence poses        | varies        |

## Acceptance Criteria

1. [ ] Video loads successfully when Sample button clicked
2. [ ] Video playback controls (play/pause/stop) work correctly
3. [ ] Rep counter increments when swing cycle completes
4. [ ] Spine and arm angles update during playback
5. [ ] Filmstrip shows position checkpoints after rep completes
6. [ ] Frame-by-frame navigation works when paused
7. [ ] Rep navigation works with multiple completed reps

## Technical Notes

- Pose detection is mocked by pre-seeding IndexedDB with pose track data
- Video hash `SWING_SAMPLE_VIDEO_HASH` identifies the sample video
- Status indicator shows current app state (loading, ready, etc.)
- Filmstrip thumbnails are captured ImageData from video frames
