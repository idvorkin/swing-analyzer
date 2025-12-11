# Skeleton Rendering Specification

> **Part of the [HUD](./HUD_SPEC.md)** - The skeleton is one component of the heads-up display that overlays the video.

## The One Rule

**Skeleton is visible when pose data exists for `video.currentTime`.**

That's it. No other conditions matter:

- Playing, paused, seeking? Doesn't matter - check if poses exist
- Extraction running? Doesn't matter - check if poses exist
- First frame or last frame? Doesn't matter - check if poses exist

## Progressive Playback

Extraction and playback are **decoupled**:

```
┌─────────────────────────────────────────────────────────────────┐
│  HIDDEN VIDEO (extraction)      VISIBLE VIDEO (user controls)  │
│  ┌─────────────────────┐        ┌─────────────────────────┐    │
│  │ ML model processes  │        │ User plays/pauses/seeks │    │
│  │ frame 0, 1, 2, 3... │        │ independently           │    │
│  │ Saves to cache      │───────→│ Reads from cache        │    │
│  └─────────────────────┘        └─────────────────────────┘    │
│                                                                 │
│  As extraction progresses, more frames become available.        │
│  User sees skeleton instantly for any frame already cached.     │
└─────────────────────────────────────────────────────────────────┘
```

**Result**: User gets immediate feedback. No waiting for extraction to finish.

## When Skeleton Updates

| Event             | What Happens                                              |
| ----------------- | --------------------------------------------------------- |
| Video plays       | `requestVideoFrameCallback` fires → lookup poses → render |
| Video paused      | Show skeleton at paused `currentTime`                     |
| User seeks        | `seeked` event fires → lookup poses → render              |
| Poses don't exist | Clear canvas (nothing to show)                            |

## Canvas Alignment

The skeleton canvas MUST overlay the video exactly:

1. Internal dimensions = video dimensions (`videoWidth` × `videoHeight`)
2. CSS position = video's rendered content area (accounting for letterboxing)
3. Works for both portrait and landscape video

```
Video with letterboxing:        Canvas positioned to match:
┌───────────────────────┐       ┌───────────────────────┐
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│       │                       │
│▓▓┌─────────────────┐▓▓│       │  ┌─────────────────┐  │
│▓▓│                 │▓▓│       │  │ CANVAS HERE     │  │
│▓▓│  VIDEO CONTENT  │▓▓│  -->  │  │ (matches video) │  │
│▓▓│                 │▓▓│       │  │                 │  │
│▓▓└─────────────────┘▓▓│       │  └─────────────────┘  │
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│       │                       │
└───────────────────────┘       └───────────────────────┘
```

## Architecture

```
video.currentTime
       │
       ▼
InputSession.getSkeletonAtTime(t)
       │
       ▼
SkeletonRenderer.renderSkeleton(skeleton, canvas)
```

All skeleton rendering goes through this path. Triggered by:

- `requestVideoFrameCallback` (during playback)
- `seeked` event (after user seeks)

## Troubleshooting

| Symptom               | Likely Cause                                  |
| --------------------- | --------------------------------------------- |
| Skeleton not visible  | Canvas dimensions wrong, or no poses in cache |
| Skeleton offset       | CSS doesn't account for letterboxing          |
| Skeleton not updating | Missing event handler for playback/seek       |
