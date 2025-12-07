# Swing Detection Algorithm Specification

This document describes the algorithm used to detect and analyze kettlebell swing form. It can be modified independently of the code to iterate on detection logic.

---

## Overview

The swing analyzer uses a **cycle-based detection system** that:

1. Tracks body angles frame-by-frame
2. Identifies the best frame for each of 4 key positions within a swing cycle
3. Scores frames using biomechanical metrics
4. Emits checkpoints when a complete cycle is detected

---

## Key Angles Measured

### Primary Angles

| Angle               | Measurement                   | Range                               | Purpose                       |
| ------------------- | ----------------------------- | ----------------------------------- | ----------------------------- |
| **Spine Angle**     | Shoulder-Hip line vs vertical | 0° (upright) to 90° (horizontal)    | Primary swing phase indicator |
| **Hip Angle**       | Knee-Hip-Shoulder angle       | 180° (standing) to 90° (deep hinge) | Hinge vs squat detection      |
| **Knee Angle**      | Hip-Knee-Ankle angle          | 180° (straight) to 90° (squat)      | Squat fault detection         |
| **Arm-to-Vertical** | Shoulder-Elbow vs vertical    | 0° (down) to 180° (up)              | Arm position tracking         |

### Derived Metrics

| Metric               | Calculation                             | Range    | Meaning                          |
| -------------------- | --------------------------------------- | -------- | -------------------------------- |
| **Hinge Score**      | `(hipFlexion / totalFlexion - 0.5) * 2` | -1 to +1 | +1 = pure hinge, -1 = pure squat |
| **Angular Velocity** | `(angle[t] - angle[t-1]) / dt`          | °/sec    | Power/speed indicator            |

---

## Swing Positions

A complete swing cycle consists of 4 positions detected in sequence:

```
    TOP (start)
      │
      ▼ (downswing)
   CONNECT
      │
      ▼
   BOTTOM (max hinge)
      │
      ▼ (upswing)
   RELEASE
      │
      ▼
    TOP (cycle complete, rep counted)
```

### Position Definitions

| Position    | Phase                    | Detection Criteria                           | Purpose                              |
| ----------- | ------------------------ | -------------------------------------------- | ------------------------------------ |
| **Top**     | Standing/lockout         | Spine < 25°, Arms > 30° (raised)             | Completion of swing, rep counted     |
| **Connect** | Arms vertical, pre-hinge | \|Arm\| < 25° AND Spine < 25°                | Arms "connect" to body before folding |
| **Bottom**  | Max hinge                | Spine > 35° AND Hip < 140°                   | Deepest point of the hinge           |
| **Release** | Arms vertical, post-hinge| \|Arm\| < 25° AND Spine < 25°                | Arms "release" from body on upswing  |

**Key insight**: CONNECT and RELEASE use the **same thresholds** but are distinguished by state machine ordering. CONNECT happens on the way DOWN (after TOP), RELEASE happens on the way UP (after BOTTOM).

---

## Frame Selection Algorithm

For each position, we track the **best candidate frame** within the current cycle. The best frame is the one with the lowest **composite score**.

### Scoring Formula

#### Standard Positions (Top, Connect, Release)

```
score = spineDelta * 0.7 + hipDelta * 0.3

where:
  spineDelta = |currentSpineAngle - idealSpineAngle|
  hipDelta = |currentHipAngle - idealHipAngle|
```

#### Bottom Position (Enhanced for Hinge Detection)

```
score = spineDelta * 0.5 + hipDelta * 0.5

# Apply hinge quality modifier
if hingeScore > 0.3:
    score *= 0.8    # 20% bonus for good hinge
elif hingeScore < -0.3:
    score *= 1.3    # 30% penalty for squat pattern
```

### Special Cases

#### Top Position

Also considers arm-to-vertical angle to capture the moment when arms are highest:

```
normalizedSpineDelta = spineDelta / 90
normalizedArmAngle = armToVerticalAngle / 180
score = normalizedSpineDelta * 0.5 - normalizedArmAngle * 0.5
```

#### Connect & Release Positions

Detected when arms cross vertical (pointing straight down) while torso is still upright:

```
# Transition to CONNECT (from TOP):
if |armAngle| < 25° AND spineAngle < 25°:
    transition to CONNECT

# Transition to RELEASE (from BOTTOM):
if |armAngle| < 25° AND spineAngle < 25°:
    transition to RELEASE
```

**Why this matters for coaching**:
- CONNECT captures the moment just before the hinge - user should see arms vertical while standing tall
- RELEASE captures the moment just after the hinge - arms passing vertical on the way up
- Even imperfect form (arms not exactly at 0°) is captured so users can see what they're doing wrong
- The 25° threshold is relaxed to ensure we always capture these teaching moments

---

## Cycle Detection

### State Machine

```
┌─────────────────────────────────────────────────────┐
│                    TRACKING                          │
│                                                      │
│  For each frame:                                     │
│    1. Update direction (downswing/upswing)          │
│    2. Track maxSpineAngle in cycle                  │
│    3. Update best candidates for each position      │
│                                                      │
│  Cycle complete when:                               │
│    maxSpineAngle > MIN_CYCLE_ANGLE (35°)            │
│    AND currentSpineAngle < RESET_THRESHOLD (35°)    │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### Direction Detection

```
if |spineAngle[t] - spineAngle[t-1]| > 3°:
    isDownswing = spineAngle[t] > spineAngle[t-1]
```

### Cycle Completion

When cycle completes:

1. Process best candidates for all 4 positions
2. Create checkpoints with captured images and angles
3. Emit form events
4. Reset for next cycle

---

## Hinge vs Squat Detection

The **hinge score** distinguishes proper hip hinge from squatting:

### Calculation

```python
# Compare flexion at hip vs knee from standing position
hipFlexion = standingHipAngle - currentHipAngle      # How much hip bent
kneeFlexion = standingKneeAngle - currentKneeAngle   # How much knee bent

totalFlexion = hipFlexion + kneeFlexion

if totalFlexion < 5°:
    hingeScore = 0  # Not enough movement to classify
else:
    hingeRatio = hipFlexion / totalFlexion
    hingeScore = (hingeRatio - 0.5) * 2
```

### Interpretation

| Hinge Score  | Pattern         | Feedback                        |
| ------------ | --------------- | ------------------------------- |
| +0.6 to +1.0 | Excellent hinge | "Great hip drive!"              |
| +0.2 to +0.6 | Good hinge      | Normal, no feedback             |
| -0.2 to +0.2 | Mixed           | Transitional, monitor           |
| -0.6 to -0.2 | Squat tendency  | "Push hips back more"           |
| -1.0 to -0.6 | Strong squat    | "You're squatting, not hinging" |

### Visual Example

```
PROPER HINGE (score ~+0.7):        SQUAT PATTERN (score ~-0.5):

    Shoulders                          Shoulders
        \                                  |
         \  Hip pushes BACK               |  Knees push FORWARD
          \                                |
           ●───────                        ●
          / \                             /|\
         /   \  Knees stay back          / | \  Knees bend deeply
        /     \                         /  |  \
```

---

## Configuration Parameters

### Phase Transition Thresholds

| Parameter          | Value | Purpose                                      |
| ------------------ | ----- | -------------------------------------------- |
| `connectArmMax`    | 25°   | Max arm angle from vertical for CONNECT      |
| `connectSpineMax`  | 25°   | Max spine angle (must be upright) for CONNECT |
| `bottomSpineMin`   | 35°   | Min spine angle to enter BOTTOM (hinged)     |
| `bottomHipMax`     | 140°  | Max hip angle to enter BOTTOM (hip flexed)   |
| `releaseArmMax`    | 25°   | Max arm angle from vertical for RELEASE      |
| `releaseSpineMax`  | 25°   | Max spine angle (upright again) for RELEASE  |
| `topSpineMax`      | 25°   | Max spine angle for TOP                      |
| `topArmMin`        | 30°   | Min arm angle (raised) for TOP               |
| `minFramesInPhase` | 2     | Debounce: frames before allowing transition  |

### State Machine Transitions

```
TOP ──────────────────> CONNECT
  when: |arm| < 25° AND spine < 25°
  meaning: arms dropping toward vertical, still standing upright

CONNECT ──────────────> BOTTOM
  when: spine > 35° AND hip < 140°
  meaning: deep into the hinge

BOTTOM ───────────────> RELEASE
  when: |arm| < 25° AND spine < 25°
  meaning: rising from hinge, arms crossing vertical

RELEASE ──────────────> TOP (rep counted)
  when: spine < 25° AND arm > 30°
  meaning: standing tall with arms raised
```

---

## Temporal Smoothing

To reduce noise from pose estimation, angles are smoothed using an **exponential moving average**:

```
smoothed[t] = alpha * raw[t] + (1 - alpha) * smoothed[t-1]

where alpha = 0.3 (smoothing factor)
```

Buffer size: 10 frames (~333ms at 30fps)

---

## Future Improvements

### Planned Enhancements

- [ ] Adaptive thresholds based on user's body proportions
- [ ] Velocity-based power scoring
- [ ] Rep-to-rep consistency tracking
- [ ] Fatigue detection (form degradation over time)
- [ ] Left/right asymmetry detection

### Open Questions

1. Should hip angle weight be higher at Bottom position?
2. Is 35° the right cycle reset threshold for all users?
3. Should we penalize hyperextension at Top (negative spine angle)?

---

## References

- Kettlebell swing biomechanics studies
- BlazePose pose estimation model
- MediaPipe BlazePose-33 keypoint format (33 points)
