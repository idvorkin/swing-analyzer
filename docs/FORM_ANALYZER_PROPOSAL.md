# FormAnalyzer: Multi-Exercise Support Proposal

## Executive Summary

Transform SwingAnalyzer into a generic FormAnalyzer supporting multiple exercises (kettlebell swings, pull-ups, pistol squats) through a pluggable exercise definition architecture.

---

## User Research Insights

### Target User Personas

**1. The Self-Coached Athlete (Primary)**

```
┌─────────────────────────────────────────────────────────────┐
│  "I know form matters, but I can't see myself working out"  │
├─────────────────────────────────────────────────────────────┤
│  Name: Alex, 32                                              │
│  Experience: Intermediate (1-3 years)                        │
│  Exercises: Kettlebells at home, pull-up bar in garage       │
│  Pain points:                                                │
│    - Can't afford personal trainer regularly                 │
│    - Watches YouTube for form tips but can't check own form  │
│    - Worried about injury from bad habits                    │
│    - Wants to progress safely                                │
│  Goals:                                                      │
│    - Get real-time feedback on form                          │
│    - Track improvement over time                             │
│    - Build confidence in technique                           │
└─────────────────────────────────────────────────────────────┘
```

**2. The Personal Trainer**

```
┌─────────────────────────────────────────────────────────────┐
│  "I need objective data to show clients their progress"      │
├─────────────────────────────────────────────────────────────┤
│  Name: Jordan, 28                                            │
│  Role: Independent personal trainer                          │
│  Pain points:                                                │
│    - Hard to show clients subtle form issues                 │
│    - Clients forget corrections between sessions             │
│    - Need objective progress metrics for client reports      │
│  Goals:                                                      │
│    - Record client sessions for review                       │
│    - Compare "before and after" form                         │
│    - Export clips to send clients                            │
│    - Track client progress over weeks/months                 │
└─────────────────────────────────────────────────────────────┘
```

**3. The Physical Therapy Patient**

```
┌─────────────────────────────────────────────────────────────┐
│  "My PT gave me exercises but I'm not sure I'm doing them   │
│   right at home"                                             │
├─────────────────────────────────────────────────────────────┤
│  Name: Sam, 45                                               │
│  Situation: Recovering from injury, doing home exercises     │
│  Pain points:                                                │
│    - Only sees PT once a week                                │
│    - Afraid of re-injury from wrong form                     │
│    - Hard to remember all the cues                           │
│  Goals:                                                      │
│    - Get confidence during home practice                     │
│    - Record videos to show PT                                │
│    - Simple pass/fail feedback                               │
└─────────────────────────────────────────────────────────────┘
```

### User Jobs-to-be-Done

| Job                             | Current Solution               | Our Opportunity                |
| ------------------------------- | ------------------------------ | ------------------------------ |
| "Help me see my own form"       | Record video, watch back       | Overlay skeleton + angles      |
| "Tell me if I'm doing it right" | Ask trainer, hope for the best | Real-time form scoring         |
| "Show me what to fix"           | YouTube tutorials              | Specific angle corrections     |
| "Track my improvement"          | None / memory                  | Session history + trend graphs |
| "Share my form with coach"      | Text video file                | Export with annotations        |
| "Practice without a trainer"    | No feedback = bad habits       | Automated form checking        |

### Pain Points with Existing Solutions

**1. Most Fitness Apps**

- Count reps but ignore form quality
- "Good enough" attitude leads to injury
- No biomechanical analysis

**2. Human Coaching**

- Expensive ($50-150/session)
- Limited availability
- Subjective feedback varies

**3. Generic Video Recording**

- Raw video hard to analyze
- No reference angles or overlays
- Can't compare sessions side-by-side

**4. Complex Motion Capture**

- Requires special equipment
- Laboratory setting only
- Not practical for home use

### Key User Needs (Prioritized)

**Must-Have (MVP)**

1. Easy video capture (one-tap recording)
2. Clear skeleton overlay with key angles
3. Rep counting that actually works
4. Position feedback (am I in the right position?)
5. Works on phone (primary device for home workout)

**Should-Have** 6. Session history with searchable list 7. Before/after comparison view 8. Export annotated clips 9. Offline mode (gym may not have wifi) 10. Multiple exercise support

**Nice-to-Have** 11. Real-time audio cues ("straighten back") 12. Personal record tracking 13. Integration with workout apps 14. Social sharing 15. AI coaching suggestions

### User Journey: Primary Flow

```
┌─────────────────────────────────────────────────────────────┐
│  BEFORE WORKOUT                                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Open app (< 2 seconds to camera)                         │
│     └─ Key insight: Users won't wait. Minimize setup.        │
│                                                              │
│  2. Position camera                                          │
│     └─ Need: Visual guide showing where to place device      │
│     └─ Need: "Can you see me?" preview confirmation          │
│                                                              │
│  3. Select exercise (or auto-detect)                         │
│     └─ Key insight: Most users do same exercise often        │
│     └─ Feature: Remember last exercise, one-tap to reuse     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  DURING WORKOUT                                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  4. Record session                                           │
│     └─ Need: Large, visible rep counter                      │
│     └─ Need: Form score visible but not distracting          │
│     └─ Need: Audio cues optional (some users have music)     │
│                                                              │
│  5. Get live feedback                                        │
│     └─ Key insight: Users can't look at screen mid-rep       │
│     └─ Feature: Audio cues for major issues only             │
│     └─ Feature: Vibration for form warning                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  AFTER WORKOUT                                               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  6. Review session summary                                   │
│     └─ Need: Quick stats (reps, avg score, best/worst)       │
│     └─ Need: Filmstrip of key positions                      │
│     └─ Need: "Problem rep" highlighting                      │
│                                                              │
│  7. Deep dive into specific reps (optional)                  │
│     └─ Need: Side-by-side "your form vs ideal"               │
│     └─ Need: Slow motion replay                              │
│     └─ Need: Angle overlay with ideal ranges                 │
│                                                              │
│  8. Track progress                                           │
│     └─ Need: Compare today to last week                      │
│     └─ Need: Trend graph of form scores                      │
│                                                              │
│  9. Share/export                                             │
│     └─ Need: Export clip with annotations                    │
│     └─ Need: Send to trainer via link                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### UX Principles for FormAnalyzer

**1. Seconds to Value**

- App opens directly to camera (not menu)
- Last exercise pre-selected
- One tap to start recording

**2. Glanceable During Exercise**

- Large rep counter visible from 6+ feet
- Color-coded form feedback (green/yellow/red)
- Minimal on-screen clutter during recording

**3. Rich Review After Exercise**

- Detailed analysis available post-workout
- Filmstrip makes it easy to jump to any position
- Side-by-side comparison with ideal

**4. Actionable Feedback**

- "Your spine angle is 65° at bottom, try for 85°" not just "bad form"
- Specific cues: "Hinge more at hips" vs generic "improve form"
- One thing to focus on (don't overwhelm)

**5. Progress is Visible**

- Show improvement over sessions
- Celebrate personal bests
- Track consistency (sessions per week)

### Mobile-First Design Considerations

```
┌───────────────────────────────┐
│ Phone in Landscape (Primary)  │
├───────────────────────────────┤
│  ┌─────────────────────────┐  │
│  │                         │  │
│  │      VIDEO FEED         │  │  Key insight: Most users
│  │    (Full screen)        │  │  prop phone against wall
│  │                         │  │  in landscape mode
│  │  ┌────┐           [12]  │  │
│  │  │ 🦴 │     Rep count ──┘  │  Large rep counter
│  │  └────┘                 │  │  in corner
│  │   Skeleton visible      │  │
│  │   but subtle            │  │
│  └─────────────────────────┘  │
│                               │
│  [● REC]    Form: ████ 87%   │
│     ↑                   ↑     │
│  Record    Form score bar     │
│  indicator (color-coded)      │
└───────────────────────────────┘

┌───────────────────────────────┐
│  Phone in Portrait (Review)   │
├───────────────────────────────┤
│                               │
│  ┌─────────────────────────┐  │
│  │    Video playback       │  │
│  │    (16:9 or 4:3)        │  │
│  └─────────────────────────┘  │
│                               │
│  Summary                      │
│  ───────────────────────────  │
│  Reps: 12    Score: 87%       │
│                               │
│  ┌────┐┌────┐┌────┐┌────┐     │
│  │Top ││Conn││Bot ││Rel │     │  Filmstrip
│  └────┘└────┘└────┘└────┘     │
│                               │
│  Problem Areas                │
│  ───────────────────────────  │
│  ⚠️ Rep 7: Spine too flat     │
│  ⚠️ Rep 9: Early arm release  │
│                               │
│  [📤 Export] [📊 History]     │
│                               │
└───────────────────────────────┘
```

### Feature Recommendations from Research

**High Impact, Low Effort**

1. Camera positioning guide (overlay showing ideal placement)
2. Countdown timer before recording starts (3, 2, 1)
3. Large visible rep counter with audio "beep" option
4. Session summary screen after recording stops

**High Impact, Medium Effort** 5. "Highlight reel" of best and worst reps 6. One specific coaching cue after each session 7. Session comparison (side by side video) 8. Export clip with skeleton overlay baked in

**Medium Impact, Higher Effort** 9. Real-time audio cues during exercise 10. Progress graphs over time 11. Personal record tracking 12. Multi-angle recording (using multiple phones)

### Accessibility Considerations

1. **Audio feedback for vision impaired**

   - Announce rep counts
   - Voice feedback on form quality
   - Describe position errors

2. **High contrast mode**

   - Skeleton overlay colors configurable
   - Dark/light theme support
   - Larger text options

3. **One-handed operation**
   - All controls reachable with thumb
   - Swipe gestures for common actions
   - Voice commands (future)

---

## Current State

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Pipeline                                │
├─────────────────────────────────────────────────────────────┤
│  VideoFrameAcquisition → PoseSkeletonTransformer            │
│           ↓                        ↓                         │
│     Frame Events              Skeleton Events                │
│                                    ↓                         │
│                          SwingFormProcessor ←── SWING-SPECIFIC
│                                    ↓                         │
│                          SwingRepProcessor  ←── SWING-SPECIFIC
│                                    ↓                         │
│                              UI Components                   │
└─────────────────────────────────────────────────────────────┘
```

### What's Exercise-Specific (Needs Abstraction)

| Component            | Hardcoded Element                                           |
| -------------------- | ----------------------------------------------------------- |
| `SwingFormProcessor` | Position names: Top, Connect, Bottom, Release               |
| `SwingFormProcessor` | Ideal angles: spine=0°/45°/85°/35°, hip=165°/140°/100°/130° |
| `SwingFormProcessor` | Cycle detection: spine angle > 35° threshold                |
| `SwingFormProcessor` | Position scoring: per-position algorithms                   |
| `SwingRepProcessor`  | Rep definition: Release → Top transition                    |
| `SwingRepProcessor`  | Cycle validation: all 4 positions required                  |
| `SwingAnalyzer`      | Direction detection: spine angle velocity                   |

### What's Generic (Can Reuse)

| Component                 | Reusable Logic                                        |
| ------------------------- | ----------------------------------------------------- |
| `Skeleton`                | All angle calculations (spine, hip, knee, arm angles) |
| `Skeleton`                | Keypoint lookup, bounding box, confidence scoring     |
| `BiomechanicsAnalyzer`    | Angular velocity, temporal smoothing, calibration     |
| `Pipeline`                | RxJS streaming, frame processing, event emission      |
| `PoseSkeletonTransformer` | Pose detection (MoveNet/BlazePose)                    |
| Checkpoint concept        | Storing skeleton + image at key moments               |

## Proposed Architecture

### New Component Structure

```
┌─────────────────────────────────────────────────────────────┐
│                      Pipeline                                │
├─────────────────────────────────────────────────────────────┤
│  VideoFrameAcquisition → PoseSkeletonTransformer            │
│           ↓                        ↓                         │
│     Frame Events              Skeleton Events                │
│                                    ↓                         │
│                    ┌───────────────────────────┐            │
│                    │      FormAnalyzer         │ ← GENERIC  │
│                    │  (accepts ExerciseConfig) │            │
│                    └───────────────────────────┘            │
│                                    ↓                         │
│                    ┌───────────────────────────┐            │
│                    │      RepCounter           │ ← GENERIC  │
│                    │  (accepts RepCriteria)    │            │
│                    └───────────────────────────┘            │
│                                    ↓                         │
│                              UI Components                   │
└─────────────────────────────────────────────────────────────┘

Exercise Definitions (config files):
┌────────────────┐  ┌────────────────┐  ┌────────────────┐
│ KettlebellSwing │  │    PullUp      │  │  PistolSquat   │
│   Definition    │  │   Definition   │  │   Definition   │
└────────────────┘  └────────────────┘  └────────────────┘
```

### Core Interfaces

```typescript
// src/types/exercise.ts

/**
 * Defines an exercise with its positions, angles, and rep criteria
 */
interface ExerciseDefinition {
  id: ExerciseType;
  name: string;
  description: string;

  // Position configuration
  positions: PositionDefinition[];

  // Which angles matter for this exercise
  keyAngles: KeyAngleDefinition[];

  // How to detect movement direction/phase
  phaseDetection: PhaseDetectionConfig;

  // What constitutes a complete rep
  repCriteria: RepCriteria;

  // Recommended camera position
  cameraAngle: 'side' | 'front' | 'back' | 'any';
}

/**
 * Defines a key position in the exercise
 */
interface PositionDefinition {
  id: string; // e.g., 'top', 'bottom', 'deadHang'
  name: string; // Display name
  phase: 'concentric' | 'eccentric' | 'transition' | 'any';

  // Target angles for this position
  targetAngles: AngleTarget[];

  // How to score if we're at this position
  scoringWeights: ScoringWeight[];
}

/**
 * Defines an angle to track
 */
interface KeyAngleDefinition {
  id: string; // e.g., 'spineAngle', 'elbowAngle'
  name: string;

  // Which keypoints define this angle
  // null = use built-in Skeleton method
  keypointA?: string;
  keypointB?: string; // vertex
  keypointC?: string;

  // Or use a built-in calculation
  builtIn?: 'spine' | 'hip' | 'knee' | 'armToSpine' | 'armToVertical' | 'elbow';
}

/**
 * Target angle for a position
 */
interface AngleTarget {
  angleId: string;
  ideal: number;
  tolerance: number; // acceptable deviation
}

/**
 * Weight for scoring a position
 */
interface ScoringWeight {
  angleId: string;
  weight: number; // 0-1, should sum to 1
  invertScore?: boolean; // true if lower delta = better
}

/**
 * How to detect movement phases
 */
interface PhaseDetectionConfig {
  primaryAngle: string; // which angle determines phase
  concentricDirection: 'increasing' | 'decreasing';
  phaseChangeThreshold: number; // minimum angle change to switch phase
  cycleResetAngle?: number; // angle that marks cycle start
}

/**
 * What constitutes a complete rep
 */
interface RepCriteria {
  // Position that starts a rep
  startPosition: string;

  // Position that ends a rep (triggers count)
  endPosition: string;

  // All positions that must be hit (in order) for valid rep
  requiredSequence: string[];

  // Minimum time between reps (prevent double-counting)
  minRepDuration?: number;
}
```

### Exercise Definitions

#### Kettlebell Swing

```typescript
// src/exercises/kettlebellSwing.ts

export const KettlebellSwingDefinition: ExerciseDefinition = {
  id: 'kettlebell-swing',
  name: 'Kettlebell Swing',
  description: 'Hip hinge movement with kettlebell',

  positions: [
    {
      id: 'top',
      name: 'Top',
      phase: 'transition',
      targetAngles: [
        { angleId: 'spine', ideal: 0, tolerance: 15 },
        { angleId: 'armToVertical', ideal: 90, tolerance: 20 },
      ],
      scoringWeights: [
        { angleId: 'spine', weight: 0.5 },
        { angleId: 'armToVertical', weight: 0.5 },
      ],
    },
    {
      id: 'connect',
      name: 'Connect',
      phase: 'eccentric',
      targetAngles: [
        { angleId: 'spine', ideal: 45, tolerance: 15 },
        { angleId: 'hip', ideal: 140, tolerance: 20 },
      ],
      scoringWeights: [
        { angleId: 'spine', weight: 0.7 },
        { angleId: 'hip', weight: 0.3 },
      ],
    },
    {
      id: 'bottom',
      name: 'Bottom',
      phase: 'transition',
      targetAngles: [
        { angleId: 'spine', ideal: 85, tolerance: 15 },
        { angleId: 'hip', ideal: 100, tolerance: 20 },
      ],
      scoringWeights: [
        { angleId: 'spine', weight: 0.5 },
        { angleId: 'hip', weight: 0.5 },
      ],
    },
    {
      id: 'release',
      name: 'Release',
      phase: 'concentric',
      targetAngles: [
        { angleId: 'spine', ideal: 35, tolerance: 15 },
        { angleId: 'hip', ideal: 130, tolerance: 20 },
      ],
      scoringWeights: [
        { angleId: 'spine', weight: 0.7 },
        { angleId: 'hip', weight: 0.3 },
      ],
    },
  ],

  keyAngles: [
    { id: 'spine', name: 'Spine Angle', builtIn: 'spine' },
    { id: 'hip', name: 'Hip Angle', builtIn: 'hip' },
    { id: 'armToVertical', name: 'Arm Angle', builtIn: 'armToVertical' },
  ],

  phaseDetection: {
    primaryAngle: 'spine',
    concentricDirection: 'decreasing', // spine angle decreases on way up
    phaseChangeThreshold: 3,
    cycleResetAngle: 35,
  },

  repCriteria: {
    startPosition: 'top',
    endPosition: 'top',
    requiredSequence: ['top', 'connect', 'bottom', 'release', 'top'],
    minRepDuration: 500, // 500ms minimum
  },

  cameraAngle: 'side',
};
```

#### Pull-Up

```typescript
// src/exercises/pullUp.ts

export const PullUpDefinition: ExerciseDefinition = {
  id: 'pull-up',
  name: 'Pull-Up',
  description: 'Vertical pulling movement',

  positions: [
    {
      id: 'deadHang',
      name: 'Dead Hang',
      phase: 'transition',
      targetAngles: [
        { angleId: 'elbow', ideal: 170, tolerance: 15 }, // nearly straight
        { angleId: 'shoulder', ideal: 180, tolerance: 20 }, // arms overhead
      ],
      scoringWeights: [
        { angleId: 'elbow', weight: 0.7 },
        { angleId: 'shoulder', weight: 0.3 },
      ],
    },
    {
      id: 'midPull',
      name: 'Mid Pull',
      phase: 'concentric',
      targetAngles: [{ angleId: 'elbow', ideal: 90, tolerance: 20 }],
      scoringWeights: [{ angleId: 'elbow', weight: 1.0 }],
    },
    {
      id: 'top',
      name: 'Top',
      phase: 'transition',
      targetAngles: [
        { angleId: 'elbow', ideal: 45, tolerance: 20 },
        { angleId: 'chinAboveBar', ideal: 1, tolerance: 0 }, // boolean-ish
      ],
      scoringWeights: [
        { angleId: 'elbow', weight: 0.8 },
        { angleId: 'chinAboveBar', weight: 0.2 },
      ],
    },
    {
      id: 'descent',
      name: 'Descent',
      phase: 'eccentric',
      targetAngles: [{ angleId: 'elbow', ideal: 120, tolerance: 30 }],
      scoringWeights: [{ angleId: 'elbow', weight: 1.0 }],
    },
  ],

  keyAngles: [
    { id: 'elbow', name: 'Elbow Angle', builtIn: 'elbow' },
    {
      id: 'shoulder',
      name: 'Shoulder Angle',
      keypointA: 'hip',
      keypointB: 'shoulder',
      keypointC: 'elbow',
    },
    {
      id: 'chinAboveBar',
      name: 'Chin Height',
      // Custom calculation needed - compare nose.y to wrist.y
    },
  ],

  phaseDetection: {
    primaryAngle: 'elbow',
    concentricDirection: 'decreasing', // elbow angle decreases pulling up
    phaseChangeThreshold: 5,
    cycleResetAngle: 160, // near full extension
  },

  repCriteria: {
    startPosition: 'deadHang',
    endPosition: 'deadHang',
    requiredSequence: ['deadHang', 'top', 'deadHang'],
    minRepDuration: 1000,
  },

  cameraAngle: 'front', // or side
};
```

#### Pistol Squat

```typescript
// src/exercises/pistolSquat.ts

export const PistolSquatDefinition: ExerciseDefinition = {
  id: 'pistol-squat',
  name: 'Pistol Squat',
  description: 'Single-leg squat with other leg extended',

  positions: [
    {
      id: 'standing',
      name: 'Standing',
      phase: 'transition',
      targetAngles: [
        { angleId: 'knee', ideal: 175, tolerance: 10 },
        { angleId: 'hip', ideal: 170, tolerance: 15 },
      ],
      scoringWeights: [
        { angleId: 'knee', weight: 0.6 },
        { angleId: 'hip', weight: 0.4 },
      ],
    },
    {
      id: 'descent',
      name: 'Descent',
      phase: 'eccentric',
      targetAngles: [{ angleId: 'knee', ideal: 120, tolerance: 30 }],
      scoringWeights: [{ angleId: 'knee', weight: 1.0 }],
    },
    {
      id: 'bottom',
      name: 'Bottom',
      phase: 'transition',
      targetAngles: [
        { angleId: 'knee', ideal: 45, tolerance: 20 },
        { angleId: 'hip', ideal: 60, tolerance: 25 },
      ],
      scoringWeights: [
        { angleId: 'knee', weight: 0.6 },
        { angleId: 'hip', weight: 0.4 },
      ],
    },
    {
      id: 'ascent',
      name: 'Ascent',
      phase: 'concentric',
      targetAngles: [{ angleId: 'knee', ideal: 100, tolerance: 30 }],
      scoringWeights: [{ angleId: 'knee', weight: 1.0 }],
    },
  ],

  keyAngles: [
    { id: 'knee', name: 'Knee Angle', builtIn: 'knee' },
    { id: 'hip', name: 'Hip Angle', builtIn: 'hip' },
    {
      id: 'extendedLeg',
      name: 'Extended Leg Angle',
      // Custom: angle of non-standing leg to horizontal
    },
  ],

  phaseDetection: {
    primaryAngle: 'knee',
    concentricDirection: 'increasing', // knee angle increases standing up
    phaseChangeThreshold: 5,
    cycleResetAngle: 160,
  },

  repCriteria: {
    startPosition: 'standing',
    endPosition: 'standing',
    requiredSequence: ['standing', 'bottom', 'standing'],
    minRepDuration: 1500,
  },

  cameraAngle: 'side',
};
```

## Implementation Plan

### Phase 1: Create Foundation (Week 1)

1. **Create type definitions** (`src/types/exercise.ts`)

   - ExerciseDefinition interface
   - PositionDefinition interface
   - KeyAngleDefinition interface
   - RepCriteria interface

2. **Create exercise configs** (`src/exercises/`)

   - `kettlebellSwing.ts` - port existing logic
   - `pullUp.ts` - new definition
   - `pistolSquat.ts` - new definition
   - `index.ts` - registry/factory

3. **Add new angles to Skeleton** (`src/models/Skeleton.ts`)
   - `getElbowAngle()` - for pull-ups
   - `getGenericAngle(a, b, c)` - configurable 3-point angle

### Phase 2: Refactor Processors (Week 2)

4. **Create FormAnalyzer** (`src/pipeline/FormAnalyzer.ts`)

   - Generic version of SwingAnalyzer
   - Constructor accepts ExerciseDefinition
   - Position detection uses config
   - Phase detection uses config

5. **Create RepCounter** (`src/pipeline/RepCounter.ts`)

   - Generic version of SwingRepProcessor
   - Constructor accepts RepCriteria
   - Sequence validation from config

6. **Update Pipeline** (`src/pipeline/PipelineFactory.ts`)
   - Accept exercise type parameter
   - Instantiate correct analyzer

### Phase 3: UI Integration (Week 3)

7. **Exercise Selector Component**

   - Dropdown/toggle on main screen
   - Persists selection to localStorage
   - Updates pipeline on change

8. **Exercise-Specific Guidance**
   - Show camera angle recommendation
   - Display position names for selected exercise
   - Update filmstrip labels

### Phase 4: Testing & Polish (Week 4)

9. **Unit Tests**

   - FormAnalyzer with each exercise config
   - RepCounter sequence validation
   - Angle calculations

10. **E2E Tests**
    - Exercise selection flow
    - Rep counting for each exercise type

## Migration Strategy

### Backward Compatibility

1. **Default to Kettlebell Swing**

   - No breaking changes for existing users
   - Swing behavior identical to current

2. **Gradual Rollout**
   - Feature flag for new exercises initially
   - Gather feedback before full release

### Code Migration

```
Current → New
─────────────────────────────────
SwingAnalyzer → FormAnalyzer
  - Accept ExerciseDefinition in constructor
  - Use config for position scoring

SwingFormProcessor → FormProcessor
  - Delegate to FormAnalyzer
  - Use config for thresholds

SwingRepProcessor → RepCounter
  - Use RepCriteria from config
  - Generic sequence validation

SwingPositionName → Position (generic)
  - Dynamic based on exercise
```

## Technical Risks & Mitigations

| Risk                                             | Impact | Mitigation                                                 |
| ------------------------------------------------ | ------ | ---------------------------------------------------------- |
| Pull-up needs different keypoints (bar position) | High   | Add custom angle calculations; may need manual bar marking |
| Pistol squat needs left/right leg detection      | Medium | Add leg detection logic; track separately                  |
| Position scoring may not generalize              | Medium | Allow custom scoring functions per exercise                |
| Performance with multiple angle calculations     | Low    | Lazy calculation; only compute needed angles               |

## Success Metrics

1. **Functional**

   - [ ] Kettlebell swing works identically to current
   - [ ] Pull-up counts reps correctly
   - [ ] Pistol squat counts reps correctly

2. **Code Quality**

   - [ ] No swing-specific code in FormAnalyzer
   - [ ] Adding new exercise requires only config file
   - [ ] All exercises share same pipeline

3. **User Experience**
   - [ ] Exercise switch takes < 1 second
   - [ ] Clear guidance for camera positioning
   - [ ] Filmstrip shows correct positions

## UI Changes

### Exercise Selector (Main Screen)

```
┌─────────────────────────────────────────────────────────────┐
│  Form Analyzer                                    [⚙️]      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                     │   │
│  │                   VIDEO AREA                        │   │
│  │                                                     │   │
│  │              [Skeleton Overlay]                     │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Exercise:  [🏋️ Swing ▼]                            │   │
│  │             ├─ 🏋️ Kettlebell Swing                  │   │
│  │             ├─ 💪 Pull-Up                           │   │
│  │             └─ 🦵 Pistol Squat                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │   Top    │ │ Connect  │ │  Bottom  │ │ Release  │       │
│  │  [img]   │ │  [img]   │ │  [img]   │ │  [img]   │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│              ↑ Filmstrip (changes per exercise)             │
│                                                             │
│     Reps: 5        Spine: 45°        Hip: 120°             │
│                                                             │
│       [▶️ Play]    [⏸️ Pause]    [⏹️ Stop]                  │
└─────────────────────────────────────────────────────────────┘
```

### Filmstrip Per Exercise

**Kettlebell Swing:**

```
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│   TOP    │ │ CONNECT  │ │  BOTTOM  │ │ RELEASE  │
│  ┌────┐  │ │  ┌────┐  │ │  ┌────┐  │ │  ┌────┐  │
│  │ 🧍 │  │ │  │ 🏃 │  │ │  │ 🏋️ │  │ │  │ 🏃 │  │
│  └────┘  │ │  └────┘  │ │  └────┘  │ │  └────┘  │
│  0° spine│ │ 45° spine│ │ 85° spine│ │ 35° spine│
└──────────┘ └──────────┘ └──────────┘ └──────────┘
```

**Pull-Up:**

```
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│DEAD HANG │ │ MID PULL │ │   TOP    │ │ DESCENT  │
│  ┌────┐  │ │  ┌────┐  │ │  ┌────┐  │ │  ┌────┐  │
│  │ 🙆 │  │ │  │ 💪 │  │ │  │ 🙋 │  │ │  │ 🙆 │  │
│  └────┘  │ │  └────┘  │ │  └────┘  │ │  └────┘  │
│ 170° elb │ │ 90° elbow│ │ 45° elbow│ │ 120° elb │
└──────────┘ └──────────┘ └──────────┘ └──────────┘
```

**Pistol Squat:**

```
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ STANDING │ │ DESCENT  │ │  BOTTOM  │ │  ASCENT  │
│  ┌────┐  │ │  ┌────┐  │ │  ┌────┐  │ │  ┌────┐  │
│  │ 🧍 │  │ │  │ 🦵 │  │ │  │ 🧎 │  │ │  │ 🦵 │  │
│  └────┘  │ │  └────┘  │ │  └────┘  │ │  └────┘  │
│ 175° knee│ │ 120° knee│ │ 45° knee │ │ 100° knee│
│   LEFT   │ │   LEFT   │ │   LEFT   │ │   LEFT   │
└──────────┘ └──────────┘ └──────────┘ └──────────┘
```

### Camera Position Guidance

```
┌─────────────────────────────────────────────────────────────┐
│  📷 Camera Position                                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Kettlebell Swing:          Pull-Up:         Pistol Squat: │
│                                                             │
│       ←──📷                    📷                ←──📷     │
│          ↓                     ↓                   ↓       │
│       ┌─────┐              ┌─────┐             ┌─────┐     │
│       │  🧍 │              │  🙆 │             │  🧍 │     │
│       └─────┘              └─────┘             └─────┘     │
│        SIDE                 FRONT               SIDE       │
│                                                             │
│  "Position camera to your     "Face the       "Position    │
│   side, 6-10 feet away"       camera"         camera to    │
│                                               your side"   │
└─────────────────────────────────────────────────────────────┘
```

### Rep Counter Display

```
Current (Swing-specific):
┌────────────────────────┐
│  Reps: 5               │
│  Spine: 45°            │
│  Hip: 120°             │
└────────────────────────┘

Proposed (Exercise-aware):
┌────────────────────────┐
│  🏋️ Kettlebell Swing    │
│  ───────────────────── │
│  Reps: 5               │
│  Spine: 45° ✓          │  ← Green if in ideal range
│  Hip: 120° ⚠️          │  ← Yellow if marginal
└────────────────────────┘

┌────────────────────────┐
│  💪 Pull-Up             │
│  ───────────────────── │
│  Reps: 8               │
│  Elbow: 45° ✓          │
│  Shoulder: 165°        │
└────────────────────────┘

┌────────────────────────┐
│  🦵 Pistol Squat        │
│  ───────────────────── │
│  Left: 3 reps          │  ← Track legs separately
│  Right: 2 reps         │
│  Knee: 48° ✓           │
└────────────────────────┘
```

### Settings Modal - Exercise Tab

```
┌─────────────────────────────────────────────────────────────┐
│  Settings                                           [✕]    │
├────────────┬────────────────────────────────────────────────┤
│            │                                                │
│  General   │  Exercise Settings                             │
│            │  ─────────────────────────────────────────     │
│  Display   │                                                │
│            │  Default Exercise:                             │
│ [Exercise] │  ┌────────────────────────────────────────┐   │
│            │  │ 🏋️ Kettlebell Swing               [▼] │   │
│  Debug     │  └────────────────────────────────────────┘   │
│            │                                                │
│            │  ☑️ Show camera position guide                 │
│            │  ☑️ Show angle indicators                      │
│            │  ☐ Auto-detect exercise (experimental)         │
│            │                                                │
│            │  ─────────────────────────────────────────     │
│            │  Position Thresholds:                          │
│            │                                                │
│            │  Top tolerance:     [15°]                      │
│            │  Bottom tolerance:  [15°]                      │
│            │                                                │
└────────────┴────────────────────────────────────────────────┘
```

## Automatic Exercise Detection

When a user loads a video, the system should automatically detect which exercise is being performed and configure the pipeline accordingly.

### Detection Strategy

**Initial Analysis Phase (first 3-5 seconds):**

```
┌─────────────────────────────────────────────────────────────┐
│                  Video Load → Auto-Detection                 │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Extract first ~90-150 frames (3-5 sec at 30fps)         │
│                                                              │
│  2. Run pose detection on sample frames                      │
│                                                              │
│  3. Analyze movement patterns:                               │
│     ┌────────────────────────────────────────────────────┐  │
│     │  Primary motion axis:                              │  │
│     │    - Vertical (pull-up, pistol squat)              │  │
│     │    - Horizontal hinge (kettlebell swing)           │  │
│     │                                                    │  │
│     │  Key body positions:                               │  │
│     │    - Arms overhead + vertical motion = Pull-up     │  │
│     │    - Single leg bent + vertical = Pistol squat     │  │
│     │    - Hip hinge + horizontal arm = Swing            │  │
│     │                                                    │  │
│     │  Motion range:                                     │  │
│     │    - Wide spine angle range (0-85°) = Swing        │  │
│     │    - Wide elbow range (45-170°) = Pull-up          │  │
│     │    - Wide knee range (45-175°) = Pistol squat      │  │
│     └────────────────────────────────────────────────────┘  │
│                                                              │
│  4. Match against exercise signatures → Select exercise      │
│                                                              │
│  5. Initialize pipeline with detected exercise               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Exercise Signatures

Each exercise has a unique movement signature:

```typescript
interface ExerciseSignature {
  exerciseId: ExerciseType;

  // Primary motion characteristics
  primaryMotionAxis: 'vertical' | 'horizontal' | 'rotational';

  // Key angle ranges observed during exercise
  angleRanges: {
    angleId: string;
    minObserved: number;
    maxObserved: number;
    rangeThreshold: number; // minimum range to match
  }[];

  // Body position indicators
  positionIndicators: {
    armsOverhead?: boolean; // wrists above shoulders
    singleLegStance?: boolean; // one leg extended
    hipHingeDominant?: boolean; // large spine angle changes
    verticalTorso?: boolean; // spine stays near vertical
  };

  // Confidence threshold for match
  minConfidence: number;
}

// Example signatures
const SwingSignature: ExerciseSignature = {
  exerciseId: 'kettlebell-swing',
  primaryMotionAxis: 'horizontal',
  angleRanges: [
    { angleId: 'spine', minObserved: 0, maxObserved: 85, rangeThreshold: 60 },
    { angleId: 'hip', minObserved: 100, maxObserved: 165, rangeThreshold: 50 },
  ],
  positionIndicators: {
    hipHingeDominant: true,
    verticalTorso: false,
  },
  minConfidence: 0.7,
};

const PullUpSignature: ExerciseSignature = {
  exerciseId: 'pull-up',
  primaryMotionAxis: 'vertical',
  angleRanges: [{ angleId: 'elbow', minObserved: 45, maxObserved: 170, rangeThreshold: 100 }],
  positionIndicators: {
    armsOverhead: true,
    verticalTorso: true,
  },
  minConfidence: 0.7,
};

const PistolSquatSignature: ExerciseSignature = {
  exerciseId: 'pistol-squat',
  primaryMotionAxis: 'vertical',
  angleRanges: [{ angleId: 'knee', minObserved: 45, maxObserved: 175, rangeThreshold: 100 }],
  positionIndicators: {
    singleLegStance: true,
    verticalTorso: true,
  },
  minConfidence: 0.7,
};
```

### Detection Algorithm

```typescript
class ExerciseDetector {
  private signatures: ExerciseSignature[];

  async detectExercise(videoSource: VideoSource): Promise<DetectionResult> {
    // 1. Sample initial frames
    const sampleFrames = await this.sampleFrames(videoSource, {
      durationMs: 4000,
      sampleRate: 10, // every 10th frame
    });

    // 2. Run pose detection on samples
    const skeletons = await this.detectPoses(sampleFrames);

    // 3. Calculate angle statistics
    const angleStats = this.calculateAngleStats(skeletons);

    // 4. Analyze motion characteristics
    const motionProfile = this.analyzeMotion(skeletons);

    // 5. Match against signatures
    const matches = this.matchSignatures(angleStats, motionProfile);

    // 6. Return best match or ask user
    if (matches.length === 0 || matches[0].confidence < 0.5) {
      return { detected: false, suggestions: matches };
    }

    return {
      detected: true,
      exercise: matches[0].exerciseId,
      confidence: matches[0].confidence,
    };
  }
}
```

### User Experience Flow

```
┌─────────────────────────────────────────────────────────────┐
│  User loads video...                                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                     │   │
│  │            [Analyzing video...]                     │   │
│  │                                                     │   │
│  │         ████████████░░░░░░░░  60%                   │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘

               ↓ (after 2-4 seconds)

┌─────────────────────────────────────────────────────────────┐
│  Exercise Detected!                                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  We detected: 🏋️ Kettlebell Swing (87% confidence)         │
│                                                             │
│  ┌──────────────────────────┐  ┌──────────────────────────┐│
│  │      [✓ Use This]        │  │    [Choose Different]    ││
│  └──────────────────────────┘  └──────────────────────────┘│
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

If detection confidence is low:

```
┌─────────────────────────────────────────────────────────────┐
│  What exercise is this?                                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  We couldn't automatically detect the exercise.             │
│  Please select:                                             │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  🏋️ Kettlebell Swing                                │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │  💪 Pull-Up                                         │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │  🦵 Pistol Squat                                    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Integration with Pipeline

```typescript
// In video loading flow
async function loadVideoWithAutoDetect(file: File): Promise<void> {
  const videoSource = await createVideoSource(file);

  // Auto-detect exercise
  const detection = await exerciseDetector.detectExercise(videoSource);

  if (detection.detected && detection.confidence > 0.7) {
    // High confidence - auto-select
    setExercise(detection.exercise);
    showToast(`Detected: ${getExerciseName(detection.exercise)}`);
  } else if (detection.detected) {
    // Medium confidence - confirm with user
    const confirmed = await confirmExercise(detection.exercise);
    setExercise(confirmed ? detection.exercise : await showExerciseSelector());
  } else {
    // Low confidence - ask user
    setExercise(await showExerciseSelector(detection.suggestions));
  }

  // Initialize pipeline with selected exercise
  initializePipeline(currentExercise);
}
```

### Settings for Auto-Detection

```
┌─────────────────────────────────────────────────────────────┐
│  Auto-Detection Settings                                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ☑️ Enable auto-detection when loading videos               │
│                                                             │
│  Auto-detection behavior:                                   │
│  ○ Always confirm detected exercise                         │
│  ● Auto-select if confidence > 80%                          │
│  ○ Never auto-select, always ask                            │
│                                                             │
│  Detection timeout: [4] seconds                             │
│                                                             │
│  ☐ Remember corrections to improve detection                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Open Questions

1. **Pull-up bar detection**: How do we know where the bar is? Options:

   - User marks bar position on screen
   - Infer from wrist position at top
   - Skip bar detection, just use arm angles

2. **Pistol squat leg detection**: How do we know which leg is working?

   - Compare knee heights
   - User specifies before recording
   - Detect automatically from extended leg angle

3. **Exercise transitions**: Can user switch mid-session?

   - Probably not - require video reload
   - Auto-detection handles this on new video load

4. **Detection accuracy**: What if the auto-detection is wrong?
   - Always allow manual override
   - Learn from corrections (optional future feature)
   - Show "Change Exercise" button prominently during playback
