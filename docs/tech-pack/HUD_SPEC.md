# HUD (Heads-Up Display) Specification

The HUD overlays the video with real-time feedback: skeleton, angles, rep count, and position.

## The One Rule

**HUD elements are visible when pose data exists for `video.currentTime`.**

This applies to: skeleton, status overlay (reps/angles), and position indicator.

The only exception is **extraction %**, which shows when extraction is running (independent of pose availability).

## Visual Layout

```
┌─────────────────────────────────────────────────────────────┐
│ ┌───────┐ ┌──────┐ ┌──────┐                    ┌────────┐  │
│ │ 2/4   │ │SPINE │ │ ARM  │                    │  75%   │  │
│ │ REPS  │ │ 45°  │ │ 12°  │                    │EXTRACT │  │
│ └───────┘ └──────┘ └──────┘                    └────────┘  │
│            ↑ Status Overlay                  Extraction %  │
│                                                             │
│                    ┌─────────────┐                         │
│                    │    ╭─╮      │                         │
│                    │   ╱   ╲     │  ← Skeleton             │
│                    │  ╱     ╲    │                         │
│                    │ ╱   ●   ╲   │                         │
│                    │╱    │    ╲  │                         │
│                    │    ╱ ╲     │                         │
│                    └─────────────┘                         │
│                                                             │
│                                      ┌───────────────────┐ │
│                                      │ ● Connect         │ │
│                                      └───────────────────┘ │
│                                        ↑ Position Indicator│
└─────────────────────────────────────────────────────────────┘
```

## Two Independent Conditions

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│   1. Do poses exist for video.currentTime?                   │
│      YES → Show skeleton + status overlay + position         │
│      NO  → Hide them                                         │
│                                                              │
│   2. Is extraction running?                                  │
│      YES → Show extraction %                                 │
│      NO  → Hide extraction %                                 │
│                                                              │
│   These are INDEPENDENT. Both can be true at once.           │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Example during extraction:**

- User seeks to frame 50
- Frame 50 already extracted? → Skeleton + HUD + extraction % all visible
- Frame 50 not yet extracted? → Only extraction % visible

## Components

### Status Overlay (top-left)

| Element | Shows               | Source                             |
| ------- | ------------------- | ---------------------------------- |
| Reps    | `{current}/{total}` | Rep processor state                |
| Spine   | `{angle}°`          | `skeleton.getSpineAngle()`         |
| Arm     | `{angle}°`          | `skeleton.getArmToVerticalAngle()` |

### Position Indicator (bottom-right)

| Position | Meaning               |
| -------- | --------------------- |
| Top      | Arms at highest point |
| Connect  | Arms touching body    |
| Bottom   | Maximum hinge         |
| Release  | Arms leaving body     |

### Extraction % (top-right)

Shows `{percentage}% EXTRACTING` while extraction is in progress.

### Skeleton

See [SKELETON_RENDERING_SPEC.md](./SKELETON_RENDERING_SPEC.md) for details.

## Z-Index Layering

```
z-index: 20  ─── Video Controls (buttons)
z-index: 15  ─── HUD Overlay (status, position, extraction)
z-index: 10  ─── Skeleton Canvas
z-index:  0  ─── Video Element
```

## Styling

- Background: `rgba(15, 20, 25, 0.85)` with `backdrop-filter: blur(8px)`
- Font: Monospace (JetBrains Mono)
- Accent color: `#00d4aa` (teal)

## Implementation

| Component      | File                                |
| -------------- | ----------------------------------- |
| Skeleton       | `src/services/SkeletonRenderer.ts`  |
| Status overlay | `src/components/VideoSectionV2.tsx` |
| Styles         | `src/components/App.css`            |
| Angle math     | `src/models/Skeleton.ts`            |
