# Swing Analyzer User Journey

## Overview

Swing Analyzer is a web app that analyzes kettlebell swing form using computer vision. Users load a video, the app extracts poses, and provides real-time feedback on form and rep counting.

---

## User Journey Phases

### Phase 1: App Launch

**User opens the app**

| What User Sees                              | What's Happening               |
| ------------------------------------------- | ------------------------------ |
| Header with "Swing Analyzer" title          | React app mounting             |
| 4 input buttons: File, Sample, Camera, Swap | ML model loading in background |
| Empty video container (dark)                | Pipeline initializing          |
| Disabled playback controls                  | Waiting for video source       |
| Metrics showing zeros                       | Initial state                  |

**Success Criteria:**

- [ ] App loads without errors
- [ ] All 4 input buttons visible and styled
- [ ] Playback controls visible but disabled
- [ ] Settings gear icon in header

---

### Phase 2: Load Video

**Three paths available:**

#### Path A: Sample Video (Primary Test Path)

```
User clicks [Sample]
  → swing-sample.webm loads
  → Video appears in container
  → Pose extraction begins automatically
```

#### Path B: File Upload

```
User clicks [File]
  → File picker opens
  → User selects video
  → Video loads and extraction begins
```

#### Path C: Live Camera

```
User clicks [Camera]
  → Browser requests permission
  → Live stream appears
  → Real-time analysis begins
```

**Success Criteria:**

- [ ] Sample video loads within 2 seconds
- [ ] Video displays in container
- [ ] Pose extraction status bar appears
- [ ] Progress percentage updates

---

### Phase 3: Pose Extraction

**What happens after video loads:**

```
┌──────────────────────────────────────────────┐
│ Extracting poses... 45% ▓▓▓▓░░░░  [Cancel]   │
│ 54/120 frames • 2.3s elapsed • 23 fps        │
└──────────────────────────────────────────────┘
```

**Two scenarios:**

| Scenario           | Duration      | User Experience                 |
| ------------------ | ------------- | ------------------------------- |
| Cached poses exist | < 1 second    | "Pose track loaded" immediately |
| No cache           | 30-60 seconds | Progress bar with frame count   |

**Success Criteria:**

- [ ] Progress bar shows percentage
- [ ] Frame count updates
- [ ] Cancel button available
- [ ] Completion shows "Pose track ready"

---

### Phase 4: Video Playback

**User clicks Play button**

| Element        | Behavior                      |
| -------------- | ----------------------------- |
| Video          | Plays at normal speed         |
| Canvas overlay | Skeleton drawn on each frame  |
| Metrics        | Update in real-time           |
| Rep counter    | Increments on complete swings |

**Playback Controls:**

| Button     | Action               | Keyboard |
| ---------- | -------------------- | -------- |
| Play/Pause | Toggle playback      | Space    |
| Prev Frame | Step back 1 frame    | `,`      |
| Next Frame | Step forward 1 frame | `.`      |
| Stop       | Reset to beginning   | None     |

**Success Criteria:**

- [ ] Video plays smoothly
- [ ] Skeleton overlay visible
- [ ] Metrics update during playback
- [ ] Frame stepping works when paused

---

### Phase 5: Swing Analysis

**The pipeline detects 4 swing positions:**

```
TOP → CONNECT → BOTTOM → RELEASE → (back to TOP)
```

| Position | Description             | Visual Cue                  |
| -------- | ----------------------- | --------------------------- |
| Top      | Arms extended overhead  | Kettlebell at highest point |
| Connect  | Arms pulling back       | Transition to backswing     |
| Bottom   | Kettlebell between legs | Deepest hip hinge           |
| Release  | Explosive extension     | Power generation            |

**Rep Counting Logic:**

- Release → Top transition = 1 rep completed
- Each rep captures checkpoints for all 4 positions

**Success Criteria:**

- [ ] Position detection works
- [ ] Rep counter increments correctly
- [ ] Checkpoints captured for each position

---

### Phase 6: Filmstrip Review

**After first rep completes:**

```
┌─────────────────────────────────────────┐
│  [TOP]  [CONNECT]  [BOTTOM]  [RELEASE]  │
│           [<] Rep 1/5 [>]               │
└─────────────────────────────────────────┘
```

**Features:**

- Thumbnail images of each position
- Click thumbnail to seek video to that moment
- Arrow buttons navigate between reps
- Shows current rep / total reps

**Success Criteria:**

- [ ] Filmstrip appears after first rep
- [ ] 4 thumbnails with labels
- [ ] Clicking thumbnail seeks video
- [ ] Rep navigation arrows work

---

### Phase 7: Metrics Display

**Real-time feedback panel:**

| Metric      | Description            | Normal Range |
| ----------- | ---------------------- | ------------ |
| Reps        | Completed swing cycles | 0+           |
| Spine Angle | Back position          | 30° - 90°    |
| Arm Angle   | Arm-to-spine angle     | 120° - 180°  |

**Success Criteria:**

- [ ] Reps count matches actual swings
- [ ] Spine angle updates during playback
- [ ] Arm angle updates during playback

---

### Phase 8: Settings & Help

**Settings modal (gear icon):** Opens to About tab by default.

| Tab        | Purpose                                |
| ---------- | -------------------------------------- |
| About      | Version info, architecture (default)   |
| Display    | Toggle skeleton overlay, debug options |
| Bug Report | Submit issues with video excerpt       |
| Updates    | Check for new versions                 |

**Keyboard Shortcuts:**

| Shortcut     | Action            |
| ------------ | ----------------- |
| Ctrl/Cmd + I | Open bug reporter |
| `.`          | Next frame        |
| `,`          | Previous frame    |
| Esc          | Close modals      |

---

## Complete User Flow Diagram

```
┌─────────────┐
│  App Opens  │
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Sample    │────▶│    File     │────▶│   Camera    │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       └───────────────────┴───────────────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │ Pose Extraction │
                  │  (or cache hit) │
                  └────────┬────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │  Click Play     │
                  └────────┬────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │  Real-time Analysis    │
              │  • Skeleton overlay    │
              │  • Position detection  │
              │  • Rep counting        │
              │  • Metrics update      │
              └────────────┬───────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │  Filmstrip      │
                  │  appears after  │
                  │  first rep      │
                  └────────┬────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │  Review & Navigation   │
              │  • Click thumbnails    │
              │  • Navigate reps       │
              │  • Frame stepping      │
              └────────────────────────┘
```

---

## Error Scenarios

| Scenario                 | Expected Behavior                    |
| ------------------------ | ------------------------------------ |
| Invalid video file       | Error message, suggest sample video  |
| Camera permission denied | Camera button disabled, show message |
| ML model fails to load   | Use cached poses if available        |
| Browser crash            | Error boundary shows, reload option  |

---

## Mobile Considerations

- Touch-friendly button sizes (44px minimum)
- Vertical layout on narrow screens
- Horizontal scroll for filmstrip
- Icon-only buttons on mobile
- Shake-to-report bug feature

---

## Performance Benchmarks

| Metric                     | Target | Acceptable |
| -------------------------- | ------ | ---------- |
| App load                   | < 2s   | < 5s       |
| Sample video load          | < 1s   | < 3s       |
| Pose extraction (cached)   | < 1s   | < 2s       |
| Pose extraction (fresh)    | < 60s  | < 90s      |
| Frame rate during playback | 30fps  | 15fps      |
