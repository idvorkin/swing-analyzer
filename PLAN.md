# Pistol Squat Support Implementation Plan

## Summary

Add support for pistol squats to the swing analyzer. This requires:
1. Creating a new `PistolSquatFormAnalyzer` implementing the `FormAnalyzer` interface
2. Adding exercise selection to the UI
3. Wiring up exercise selection to pipeline creation

## Current Architecture (Already Supports This!)

The codebase already has a clean plugin architecture for exercises:

```
FormAnalyzer (interface) ← KettlebellSwingFormAnalyzer (implementation)
                        ← PistolSquatFormAnalyzer (NEW)
```

Key files:
- `src/analyzers/FormAnalyzer.ts` - Interface definition
- `src/analyzers/KettlebellSwingFormAnalyzer.ts` - Reference implementation
- `src/pipeline/PipelineFactory.ts` - Accepts custom `FormAnalyzer` via `formAnalyzer` option
- `src/pipeline/Pipeline.ts` - Uses analyzer, defaults to kettlebell swing

## Pistol Squat Biomechanics

### Movement Pattern
A pistol squat (single-leg squat) involves:
1. Standing on one leg with the other leg extended forward
2. Descending into a deep single-leg squat
3. Bottom position: working leg fully flexed, torso leaning forward for balance
4. Ascending back to standing

### Key Angles to Track
- **Working leg knee angle** (hip-knee-ankle): 170-180° standing → 40-60° at bottom
- **Working leg hip angle** (knee-hip-shoulder): 170° standing → 60-80° at bottom
- **Spine angle**: ~0-15° standing → 30-50° at bottom (forward lean for balance)
- **Extended leg**: Should remain straight (~170-180° knee angle)

### Phases (State Machine)
```
STANDING → DESCENDING → BOTTOM → ASCENDING → STANDING (rep complete)
```

1. **STANDING**: Working knee > 160°, spine < 20°
2. **DESCENDING**: Knee decreasing, between standing and bottom thresholds
3. **BOTTOM**: Working knee < 70°, hip < 100°, spine > 25°
4. **ASCENDING**: Knee increasing from bottom toward standing

### Detecting Working vs Extended Leg
Unlike kettlebell swing (which uses arm position), pistol squats need leg detection:
- **Extended leg**: The leg with knee angle staying near 180° (straight)
- **Working leg**: The leg with knee angle changing (bending)

Can detect by comparing knee angles between frames - the working leg has larger variance.

## Implementation Steps

### Step 1: Create PistolSquatFormAnalyzer
Create `src/analyzers/PistolSquatFormAnalyzer.ts`:

```typescript
export type PistolSquatPhase = 'standing' | 'descending' | 'bottom' | 'ascending';

export interface PistolSquatThresholds {
  standingKneeMin: number;      // 160° - knee nearly straight
  standingSpineMax: number;     // 20° - upright posture
  bottomKneeMax: number;        // 70° - deep squat
  bottomHipMax: number;         // 100° - hips flexed
  bottomSpineMin: number;       // 25° - forward lean for balance
}

export class PistolSquatFormAnalyzer implements FormAnalyzer {
  // Phase state machine
  // Working leg detection (which leg is doing the squat)
  // Peak tracking for each phase
  // Quality metrics (depth, balance, extended leg position)
}
```

### Step 2: Add Skeleton Methods (if needed)
The `Skeleton` class already has:
- `getKneeAngle()` - but only for one side (right preferred, left fallback)
- `getHipAngle()` - same pattern

May need to add:
- `getLeftKneeAngle()` / `getRightKneeAngle()` - for independent leg tracking
- `getLeftHipAngle()` / `getRightHipAngle()` - same reason

### Step 3: Export from Analyzers Index
Update `src/analyzers/index.ts` to export `PistolSquatFormAnalyzer`.

### Step 4: Add Exercise Type Selection
Add exercise selection to the app:

Option A: **URL-based** (simple, bookmarkable)
- `/swing` for kettlebell swing
- `/pistol-squat` for pistol squat
- Use React Router to select analyzer

Option B: **Settings-based** (persistent)
- Add to `SettingsModal.tsx`
- Store in localStorage
- Update `useSwingAnalyzerV2` to accept exercise type

Option C: **Header dropdown** (quick switch)
- Add dropdown next to "Swing Analyzer" title
- State managed in App component

**Recommendation**: Option A (URL-based) for simplicity and shareability.

### Step 5: Wire Up Exercise Selection
Update `useSwingAnalyzerV2` or pipeline creation to:
1. Accept exercise type parameter
2. Create appropriate `FormAnalyzer` based on type
3. Pass to `createPipeline()`

### Step 6: Update UI Labels
- Title: "Swing Analyzer" → "Exercise Analyzer" or dynamic based on selection
- Position labels: Different phases for each exercise
- HUD: Different angles displayed per exercise

### Step 7: Add Tests
- Unit tests for `PistolSquatFormAnalyzer` state machine
- E2E tests with sample pistol squat video (need to acquire/create)

## File Changes Summary

| File | Change |
|------|--------|
| `src/analyzers/PistolSquatFormAnalyzer.ts` | **NEW** - Analyzer implementation |
| `src/analyzers/index.ts` | Export new analyzer |
| `src/models/Skeleton.ts` | Add per-leg angle methods |
| `src/components/App.tsx` | Add routing for exercise type |
| `src/hooks/useSwingAnalyzerV2.tsx` | Accept exercise type, create correct analyzer |
| `src/pipeline/PipelineFactory.ts` | No change (already supports custom analyzer) |

## Questions for User

1. **Exercise selection method**: URL-based routing or settings dropdown?
2. **Sample video**: Do you have a pistol squat video for testing, or should I use synthetic data first?
3. **Priority**: Full implementation or MVP (just the analyzer, manual exercise selection)?

## Estimated Scope

- **PistolSquatFormAnalyzer**: ~300 lines (similar to kettlebell swing)
- **Skeleton per-leg methods**: ~50 lines
- **Exercise selection UI**: ~100 lines
- **Tests**: ~200 lines

Total: ~650 lines of new/modified code
