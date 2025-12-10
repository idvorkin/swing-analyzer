# Video Controls Specification

## Button Layout

```
[Play/Pause] [< Frame] [Frame >] [<< Checkpoint] [Checkpoint >>] [Reset]
```

| #   | Button          | Icon  | Action                    | Keyboard |
| --- | --------------- | ----- | ------------------------- | -------- |
| 1   | Play/Pause      | ▶/⏸ | Start/stop playback       | Space    |
| 2   | Prev Frame      | <     | Step back one frame       | ,        |
| 3   | Next Frame      | >     | Step forward one frame    | .        |
| 4   | Prev Checkpoint | <<    | Jump to previous position | -        |
| 5   | Next Checkpoint | >>    | Jump to next position     | -        |
| 6   | Reset           | ■     | Return to start           | -        |

## Checkpoint Navigation

### Positions

A swing has 4 positions (checkpoints) per rep:

```
top → connect → bottom → release → (next rep's top)
```

### Navigation Behavior

- **Next Checkpoint**: Jump to the next position in time order

  - After `release`, jumps to next rep's `top`
  - At last checkpoint: no action (no wrap-around)

- **Previous Checkpoint**: Jump to the previous position in time order
  - Before first rep's `top`: no action (no wrap-around)

### Rep Index Updates

When checkpoint navigation crosses rep boundaries, the current rep index updates automatically:

- Navigating from rep 1's release to rep 2's top → rep index becomes 2
- Navigating from rep 2's top to rep 1's release → rep index becomes 1

## HUD Position Label

The position label (Top, Connect, Bottom, Release) appears in the HUD **only** during checkpoint navigation.

### When Position Label Shows

| Action                            | Show Position Label |
| --------------------------------- | :-----------------: |
| Playing video                     |         No          |
| Paused (idle)                     |         No          |
| Frame-by-frame (< >)              |         No          |
| **Checkpoint navigation (<< >>)** |       **Yes**       |
| Filmstrip thumbnail click         |         Yes         |

### How It Works

1. Checkpoint navigation sets `currentPosition` state
2. Play, frame-by-frame, or reset clears `currentPosition`
3. HUD shows position label only when `currentPosition` is set

## Implementation Notes

### Data Source

Checkpoint positions are sourced from `repThumbnails`:

- `Map<repNumber, Map<positionName, PositionCandidate>>`
- Each `PositionCandidate` has a `videoTime` for seeking

### Building Checkpoint List

```typescript
// Flatten all checkpoints sorted by time
const checkpoints = [];
for (const [repNum, positions] of repThumbnails.entries()) {
  for (const posName of ['top', 'connect', 'bottom', 'release']) {
    const candidate = positions.get(posName);
    if (candidate?.videoTime !== undefined) {
      checkpoints.push({ repNum, position: posName, videoTime: candidate.videoTime });
    }
  }
}
checkpoints.sort((a, b) => a.videoTime - b.videoTime);
```

### Files

- `src/hooks/useSwingAnalyzerV2.tsx` - Checkpoint navigation logic
- `src/components/VideoSectionV2.tsx` - Button UI and HUD display
