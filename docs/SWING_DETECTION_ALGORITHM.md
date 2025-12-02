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

| Position    | Phase            | Ideal Spine | Ideal Hip | Detection Window                 |
| ----------- | ---------------- | ----------- | --------- | -------------------------------- |
| **Top**     | Standing/lockout | 0-10°       | 160-175°  | Upswing only, lowest spine angle |
| **Connect** | Early downswing  | ~45°        | ~140°     | Downswing only, arm angle change |
| **Bottom**  | Max hinge        | 70-85°      | 90-120°   | Any phase, highest spine angle   |
| **Release** | Mid upswing      | ~35°        | ~130°     | Upswing only, arm angle change   |

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

Triggered by significant arm angle changes (arms connecting/disconnecting from body):

```
armAngleChange = |armToVertical[t] - armToVertical[t-1]|

if armAngleChange > ARM_ANGLE_THRESHOLD (15°):
    score = 100 / (armAngleChange + 1)  # Lower is better
else:
    score = 1000  # Poor candidate
```

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

### Thresholds

| Parameter                    | Value | Purpose                             |
| ---------------------------- | ----- | ----------------------------------- |
| `CYCLE_RESET_THRESHOLD`      | 35°   | Spine angle to detect return to top |
| `MIN_CYCLE_ANGLE`            | 35°   | Minimum spine angle for valid cycle |
| `ARM_ANGLE_CHANGE_THRESHOLD` | 15°   | Significant arm movement detection  |
| `DIRECTION_CHANGE_THRESHOLD` | 3°    | Minimum change to update direction  |

### Ideal Angles

| Position | Spine | Hip  | Notes                  |
| -------- | ----- | ---- | ---------------------- |
| Top      | 0°    | 165° | Lockout position       |
| Connect  | 45°   | 140° | Arms connect to body   |
| Bottom   | 85°   | 100° | Maximum hinge depth    |
| Release  | 35°   | 130° | Arms release from body |

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
- MoveNet pose estimation model
- COCO keypoint format (17 points)
