# Rep Gallery

The Rep Gallery system provides two ways to view and explore rep thumbnails:

1. **Rep Gallery Widget** - Inline scrollable viewer below the video
2. **Rep Gallery Modal** - Full-screen modal with compare mode

Both share the same data source (`repThumbnails`) and interaction patterns.

## Rep Gallery Widget

An inline, scrollable multi-rep viewer displayed below the video.

### Layout

```
┌─────────────────────────────────────────────────────┐
│ Rep   Bottom   Release   Top   Connect              │ header (sticky)
├─────────────────────────────────────────────────────┤
│  1    [thumb]  [thumb]  [thumb] [thumb]  ← current  │ visible
│  2    [thumb]  [thumb]  [thumb] [thumb]             │ visible
│  3    [thumb]  [thumb]  [thu...                     │ half visible
├─────────────────────────────────────────────────────┤
│  4    [thumb]  [thumb]  [thumb] [thumb]             │ scroll to see
│  5    ...                                           │
└─────────────────────────────────────────────────────┘
```

### Features

| Feature          | Interaction            | Result                                |
| ---------------- | ---------------------- | ------------------------------------- |
| **Scroll**       | Vertical scroll        | View more reps, snaps to rows         |
| **Seek**         | Click thumbnail        | Video seeks to that timestamp         |
| **Select rep**   | Click thumbnail        | Sets current rep index                |
| **Dynamic zoom** | Click phase header     | Focused column expands, others shrink |
| **Dynamic zoom** | Double-click thumbnail | Same as clicking phase header         |
| **Auto-scroll**  | Navigate reps          | Current rep scrolls into view         |

### Dynamic Zoom (Wheel of Fortune Style)

Click any phase header (Bottom, Release, Top, Connect) to focus on that column:

**Before focus:**

```
Rep  Bottom  Release  Top  Connect
 1   [====]  [====]  [====] [====]
 2   [====]  [====]  [====] [====]
```

**After clicking "Top":**

```
Rep  Btm  Rel  [  Top  ]  Cnt
 1   [=]  [=]  [======]   [=]
 2   [=]  [=]  [======]   [=]
```

Click again to unfocus and return to normal view.

### CSS Classes

| Class                          | Purpose                   |
| ------------------------------ | ------------------------- |
| `.rep-gallery-section`         | Outer container           |
| `.rep-gallery-container`       | Scrollable area           |
| `.rep-gallery-header`          | Sticky header row         |
| `.rep-gallery-rows`            | Scrollable rows container |
| `.rep-gallery-row`             | Single rep row            |
| `.rep-gallery-row--current`    | Highlighted current rep   |
| `.rep-gallery-cell`            | Cell containing thumbnail |
| `.rep-gallery-cell--focused`   | Expanded column           |
| `.rep-gallery-cell--minimized` | Shrunk column             |
| `.rep-gallery-thumbnail`       | Thumbnail wrapper         |

## Rep Gallery Modal

Full-screen modal accessed via the gallery button (grid icon).

### Features

| Feature          | Interaction             | Result                          |
| ---------------- | ----------------------- | ------------------------------- |
| **Grid view**    | Default                 | All reps × phases in a grid     |
| **Seek**         | Click thumbnail         | Video seeks, modal stays open   |
| **Select reps**  | Click checkbox          | Select up to 4 reps for compare |
| **Compare mode** | Click "Compare (N)"     | Side-by-side comparison view    |
| **Dynamic zoom** | Click phase header      | Focus on single phase column    |
| **Close**        | Click X or press Escape | Returns to video view           |

### Compare Mode

Select 2-4 reps using checkboxes, then click "Compare" to see them side-by-side for form analysis.

## Shared Code

Both components share:

- **`repGalleryConstants.ts`** - Phase order, labels, CSS class names
- **`ThumbnailCanvas`** - React component for rendering thumbnails
- **CSS variables** - `--rep-gallery-*` design tokens

## Data Flow

```
SwingAnalyzer → repThumbnails Map → Widget / Modal
                                         ↓
                              Click thumbnail
                                         ↓
                              onSeek(videoTime)
                              setCurrentRepIndex(n)
```

## Files

| File                                    | Purpose                          |
| --------------------------------------- | -------------------------------- |
| `src/components/VideoSectionV2.tsx`     | Widget implementation (inline)   |
| `src/components/RepGalleryModal.tsx`    | Modal implementation             |
| `src/components/RepGalleryModal.css`    | Modal styles                     |
| `src/components/App.css`                | Widget styles (`.rep-gallery-*`) |
| `src/components/repGalleryConstants.ts` | Shared constants                 |

## Future Improvements

- [ ] Extract Widget to separate component file
- [ ] Share more CSS between Widget and Modal
- [ ] Add keyboard navigation (arrow keys)
- [ ] Add pinch-to-zoom on mobile
