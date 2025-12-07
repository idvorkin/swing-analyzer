# Rep Gallery E2E Test Specification

## Overview

The Rep Gallery is a modal interface that allows users to browse and compare all reps captured during a video extraction session. It provides two view modes: **Grid View** (default) for browsing all reps organized by phase, and **Compare View** for side-by-side analysis of selected reps.

## Test Data Limitations

**Important:** Seeded test fixtures contain pose keypoint data but NOT `frameImage` data. Thumbnails are captured at runtime during live extraction. Tests that require actual thumbnail images are marked as **skipped** and should be run with realistic test mode (mock detector with timing) or manual testing.

Tests marked with `*` below require actual extraction and are currently skipped.

## Feature Requirements

### Grid View (Default)

| Requirement | Description | Test ID | Status |
|------------|-------------|---------|--------|
| Open Gallery | Gallery button appears below filmstrip when reps exist. Clicking opens modal. | RG-001 | PASS |
| Phase Headers | Dynamic phase columns based on detected phases (not hardcoded). | RG-002 | PASS |
| Rep Rows | Each row shows one rep with phase cells. | RG-003 | PASS |
| Current Rep Highlight | Current rep row has teal border/glow. | RG-004 | PASS |
| Phase Focus | Clicking phase header expands that column, shrinks others. | RG-005 | PASS |
| Phase Unfocus | Clicking focused phase header returns to normal view. | RG-006 | PASS |
| Thumbnail Seek* | Clicking thumbnail seeks video to that timestamp. | RG-007 | SKIP |
| Double-Tap Focus* | Double-tap thumbnail focuses that phase column. | RG-019 | SKIP |
| Double-Tap Unfocus* | Double-tap on already-focused phase unfocuses it. | RG-020 | SKIP |
| Rep Selection | Checkbox selects rep for comparison (max 4). | RG-008 | PASS |
| Compare Button | Appears when 2+ reps selected. | RG-009 | PASS |
| Empty State | Gallery button hidden when no reps exist. | RG-010 | PASS |

### Compare View

| Requirement | Description | Test ID | Status |
|------------|-------------|---------|--------|
| Enter Compare | Clicking Compare button shows selected reps side-by-side. | RG-011 | PASS |
| Back Button | Returns to grid view without losing selections. | RG-012 | PASS |
| Thumbnail Seek* | Clicking thumbnail seeks video (same as grid). | RG-013 | SKIP |
| Large Thumbnails* | Always shows large thumbnails in compare view. | RG-014 | SKIP |

### Modal Behavior

| Requirement | Description | Test ID | Status |
|------------|-------------|---------|--------|
| Close Button | X button closes modal. | RG-015 | PASS |
| Escape Key | Pressing Escape closes modal. | RG-016 | PASS |
| Overlay Click | Clicking outside modal closes it. | RG-017 | PASS |
| Reset on Close | Selection and view mode reset when modal closes. | RG-018 | PASS |

### Additional Tests

| Requirement | Description | Status |
|------------|-------------|--------|
| Timestamp Display* | Thumbnails show video time overlay. | SKIP |
| Grid View Hint | Footer shows grid-specific instructions. | PASS |
| Compare View Hint | Footer shows compare-specific instructions. | PASS |

## Test Data

Tests use the `swing-sample-4reps` fixture which provides:
- 4 detected reps with pose data
- 4 phases per rep: Top, Connect, Bottom, Release
- Pre-computed skeleton data for deterministic testing
- **No frameImage data** (thumbnails show "—" placeholder)

## Test Summary

- **Total tests:** 23
- **Passing:** 17
- **Skipped:** 6 (require actual extraction with frame images)

## Running Thumbnail Tests

To test thumbnail functionality manually or with realistic mode:

1. **Manual testing:** Load a video and complete extraction, then open gallery
2. **Realistic test mode:** Use `extraction-flow.spec.ts` pattern with mock detector

## Acceptance Criteria

### Must Have (P0) - All Tested

1. Gallery opens when button clicked
2. All reps display correctly in grid
3. Modal closes properly (button, Escape, overlay)
4. Compare view shows selected reps
5. Phase focus mode works

### Should Have (P1) - Partially Tested

1. Current rep is highlighted (tested)
2. Selection limited to 4 reps (tested)
3. Thumbnail click seeks video (skipped - requires extraction)
4. Video timestamp shown on thumbnails (skipped - requires extraction)

### Nice to Have (P2) - Not Tested

1. Accessibility (keyboard navigation) - partial via Escape key test
2. Mobile responsiveness
3. Animation smoothness
