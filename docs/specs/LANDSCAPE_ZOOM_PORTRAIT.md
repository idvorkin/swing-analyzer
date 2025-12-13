# Video Zoom Feature Spec

**Status:** In Progress
**Date:** 2025-12-13
**Branch:** feature/landscape-zoom-portrait

## Problem

When users record exercise videos in landscape mode, the person appears small on screen with wasted horizontal space. Users want to see their form clearly.

## Solution

**One button. Smart zoom. Bigger canvas.**

A "Zoom" button that:

1. Crops to the person (using ML-detected position if available, else center)
2. Expands the video container vertically to use more screen space
3. Only appears for landscape videos

## Behavior

### When Zoom is OFF

- Full video frame visible
- Standard container size
- Button shows "Zoom"

### When Zoom is ON

- Video cropped to portrait-like framing
- Container expands to ~90vh height (95vh on mobile)
- Skeleton overlay stays aligned
- Button shows "Full"

### Smart Cropping Logic

```
if (cropRegion from pose data exists) {
  // Use ML-detected person location (more accurate)
  crop to cropRegion
} else {
  // Fall back to geometric center crop
  crop to center of frame
}
```

## UI

- **Button location:** Video controls bar
- **Button label:** "Zoom" / "Full" (toggle)
- **Visibility:** Only for landscape videos (aspect ratio > 1.2)
- **Default state:** OFF

## Technical Notes

- Uses CSS transforms on both video and canvas elements
- Container uses `aspect-ratio` and `max-height` for sizing
- `overflow: hidden` on container clips zoomed content

## Test Cases

1. Landscape video: Zoom button visible
2. Portrait video: Zoom button hidden
3. Click Zoom: Container grows, video crops to person
4. Click Full: Returns to normal view
5. Skeleton overlay stays aligned when zoomed

## Out of Scope

- Adjustable zoom levels (fixed crop only)
- Pinch-to-zoom gestures
- Remembering preference across sessions
