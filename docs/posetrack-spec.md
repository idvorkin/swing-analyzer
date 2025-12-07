# PoseTrack Feature Specification

## Overview

PoseTrack enables offline pose analysis by pre-extracting pose data from videos. This allows:

- Fast testing without ML model loading
- Deterministic results for E2E tests
- Reusable pose data across sessions
- Offline analysis with cached pose data

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Video File     │────▶│  PoseExtractor   │────▶│  .posetrack.json│
│  (mp4, etc)     │     │  (TensorFlow.js) │     │  (pose data)    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                                          │
                                                          ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Main Analyzer  │◀────│  PoseTrackPipeline│◀────│  IndexedDB      │
│  (VideoSection) │     │  (playback)      │     │  (cache)        │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

## Key Components

### Services

- **PoseExtractor** (`src/services/PoseExtractor.ts`) - Extracts poses frame-by-frame using TensorFlow.js BlazePose models
- **PoseTrackService** (`src/services/PoseTrackService.ts`) - File I/O, IndexedDB storage, validation

### Pipeline

- **PoseTrackPipeline** (`src/pipeline/PoseTrackPipeline.ts`) - Replays pose data for analysis without ML inference

### React Integration

- **useSwingAnalyzerV2** (`src/hooks/useSwingAnalyzerV2.tsx`) - Main hook managing extraction and analysis
- **SwingAnalyzerContext** (`src/contexts/SwingAnalyzerContext.tsx`) - Context providing analyzer state

## File Format

`.posetrack.json` files contain:

- **metadata**: video hash (SHA-256), model used, dimensions, FPS, timestamps
- **frames**: array of keypoints with confidence scores per frame

Video matching uses SHA-256 hash of first/last 64KB chunks + file size.

## Supported Models

| Model          | Status    | Notes                        |
| -------------- | --------- | ---------------------------- |
| blazepose-lite | ✓ Default | Fast, good accuracy          |
| blazepose-full | ✓ Enabled | Balanced speed/accuracy      |
| blazepose-heavy| ✓ Enabled | Highest accuracy, slowest    |

## Main Page Integration

When a video loads on the main analyzer page:

1. `currentVideoFile` state is set in `useSwingAnalyzer`
2. `VideoSection` detects file change and calls `startExtraction()`
3. `PoseTrackStatusBar` shows progress
4. On completion, pose track is available for saving/caching

Works for both uploaded files and the "Sample" hardcoded video.

## Storage

- **IndexedDB**: `posetrack-db` database, `pose-tracks` store
- **Key**: video hash (SHA-256)
- Automatic cache lookup on video load
