# HUD (Heads-Up Display) Specification

The HUD is the overlay layer rendered on top of the video. It provides real-time feedback without obscuring the main content.

## HUD Components

```
┌─────────────────────────────────────────────────────────────┐
│ ┌───────┐ ┌──────┐ ┌──────┐                                 │
│ │ 2/4   │ │SPINE │ │ ARM  │     ← Status Overlay            │
│ │ REPS  │ │ 45°  │ │ 12°  │                                 │
│ └───────┘ └──────┘ └──────┘                                 │
│                                                             │
│              ┌─────────────┐                                │
│              │    ╭─╮      │                                │
│              │   ╱   ╲     │     ← Skeleton Overlay         │
│              │  ╱     ╲    │       (pose visualization)     │
│              │ ╱   ●   ╲   │                                │
│              │╱    │    ╲  │                                │
│              │    ╱ ╲     │                                │
│              └─────────────┘                                │
│                                                             │
│                                      ┌───────────────────┐  │
│                                      │ ● Connect         │  │
│                                      └───────────────────┘  │
│                                            ↑                │
│                                     Position Indicator      │
└─────────────────────────────────────────────────────────────┘
```

| Component | Purpose | Updates When |
|-----------|---------|--------------|
| **Skeleton** | Visualizes detected pose keypoints and connections | Every video frame |
| **Status Overlay** | Shows rep count, spine angle, arm angle | Every video frame |
| **Position Indicator** | Shows current swing position (Top/Connect/Bottom/Release) | Position changes |

## Design Principles

### 1. HUD Follows the Frame

The HUD renders **on whatever is currently visible**. This means:

- During playback: HUD shows data for the current frame
- When paused: HUD shows data for the paused frame
- After seeking: HUD updates immediately to match new position
- During extraction: HUD is hidden (no valid frame to overlay)

### 2. Non-Intrusive

- Semi-transparent backgrounds with blur
- Positioned in corners to minimize content obstruction
- Small, readable typography
- No interaction required (informational only)

### 3. Single Source of Truth

All HUD elements derive from the same data source:
- `InputSession.getSkeletonAtTime(t)` → skeleton, angles, position
- Skeleton → visual overlay
- Skeleton.angles → status overlay numbers
- FormState → position indicator

## Component Specifications

### Skeleton Overlay

See [SKELETON_RENDERING_SPEC.md](./SKELETON_RENDERING_SPEC.md) for detailed skeleton behavior.

Key points:
- Canvas element positioned over video
- Matches video's rendered dimensions (accounting for letterboxing)
- Renders keypoints and bone connections
- Color-coded by body segment

### Status Overlay

Located: **Top-left corner** of video

```
┌───────┐ ┌──────┐ ┌──────┐
│ 2/4   │ │SPINE │ │ ARM  │
│ REPS  │ │ 45°  │ │ 12°  │
└───────┘ └──────┘ └──────┘
```

| Element | Shows | Format |
|---------|-------|--------|
| Reps | Current rep / Total reps | `{current}/{total}` |
| Spine | Spine angle from vertical | `{angle}°` |
| Arm | Arm-to-spine angle | `{angle}°` |

Styling:
- Background: `rgba(15, 20, 25, 0.85)` with `backdrop-filter: blur(8px)`
- Font: Monospace (JetBrains Mono)
- Accent color: `#00d4aa` (teal)

### Position Indicator

Located: **Bottom-right corner** of video (above controls)

```
┌───────────────────┐
│ ● Connect         │
└───────────────────┘
```

| Position | Meaning |
|----------|---------|
| Top | Arms at highest point, kettlebell overhead |
| Connect | Arms touching body/legs, beginning hinge |
| Bottom | Maximum hinge, kettlebell between legs |
| Release | Arms leaving body, beginning float |

Styling:
- Pulsing dot indicates active tracking
- Pill-shaped container
- Same styling as status overlay

## Visibility States

| App State | Skeleton | Status Overlay | Extraction % | Position |
|-----------|----------|----------------|--------------|----------|
| No video loaded | Hidden | Hidden | Hidden | Hidden |
| Video loading | Hidden | Hidden | Hidden | Hidden |
| Extraction in progress | Hidden | Visible | **Visible** | Visible |
| Playback (poses available) | Visible | Visible | Hidden | Visible |
| Paused (poses available) | Visible | Visible | Hidden | Visible |
| Playback (no poses at frame) | Hidden | Shows last known | Hidden | Shows last known |

**Key Rule**: The entire HUD overlay is only visible when `currentVideoFile` is set.

### E2E Test Coverage

Visibility rules are tested in `e2e-tests/swing-analyzer.spec.ts`:

- `HUD should be hidden before video loads`
- `HUD should appear after video loads`
- `HUD should show extraction progress during extraction`

## Z-Index Layering

```
z-index: 20  ─── Video Controls (buttons)
z-index: 15  ─── HUD Overlay (status, position)
z-index: 10  ─── Skeleton Canvas
z-index:  0  ─── Video Element
```

## Responsive Behavior

### Mobile (< 480px)

- Smaller fonts and padding
- Status overlay remains in corner
- Skeleton scales with video
- Position indicator moves closer to controls

### Desktop

- Full-size typography
- More padding and spacing
- Hover states on interactive elements (if any)

## Implementation Files

| Component | File |
|-----------|------|
| Skeleton rendering | `src/services/SkeletonRenderer.ts` |
| Status overlay | `src/components/VideoSectionV2.tsx` (`.hud-overlay-*` classes) |
| HUD styles | `src/components/App.css` (HUD OVERLAY section) |
| Angle calculations | `src/models/Skeleton.ts` |

## Future Considerations

1. **Configurable HUD** - Let users show/hide individual elements
2. **Color coding** - Change angle colors based on form quality (green=good, red=bad)
3. **Recording mode** - Option to include/exclude HUD in exported clips
4. **Compact mode** - Minimal HUD for small screens or focused viewing
