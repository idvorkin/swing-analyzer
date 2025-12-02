# Model Testing Guide

## Debug Page Access

Navigate to: `http://localhost:5174/debug-models`

## What the Debug Page Shows

### Real-time Information
- **Model Type**: Which model is currently active (BlazePose or MoveNet)
- **Keypoints Detected**: Total number of keypoints returned by the model
- **Visible Keypoints**: Number of keypoints above confidence threshold (0.2)
- **Spine Angle**: Calculated angle from vertical (0° = upright)
- **Arm Angle**: Calculated arm-to-vertical angle
- **Has Required Keypoints**: Whether all required keypoints for analysis are visible

### Sample Keypoints Display
Shows the first 5 keypoints (indices 0-4) with:
- Index number
- Keypoint name (model-specific)
- X, Y coordinates
- Confidence score/visibility

## Testing Workflow

### 1. Test BlazePose Model
1. Click "Load Sample Video"
2. Ensure "BlazePose" button is green (active)
3. Watch the video play and observe:
   - Are keypoints being detected? (count should be 33 for BlazePose)
   - Are visible keypoints reasonable? (should be >20 for good detection)
   - Do the angles make sense?
   - Is the skeleton being rendered correctly on the video?

### 2. Test MoveNet Model
1. Click "MoveNet" button to switch models
2. Logs will clear automatically
3. Observe:
   - Keypoints detected should be 17 for MoveNet
   - Are visible keypoints reasonable?
   - Do angles change (they shouldn't change much if mapping is correct)
   - Is the skeleton rendering correctly?

### 3. Download and Compare Logs
1. Let each model run for 10-20 seconds
2. Click "Download Logs" for each model
3. Compare the JSON files

## What to Look For

### Keypoint Index Mapping Issues
**BlazePose (MediaPipe indices):**
- Index 0: nose
- Index 11: left shoulder
- Index 12: right shoulder
- Index 23: left hip
- Index 24: right hip

**MoveNet (COCO indices):**
- Index 0: nose
- Index 5: left shoulder
- Index 6: right shoulder
- Index 11: left hip
- Index 12: right hip

**Check the sample keypoints in logs:**
- For BlazePose: index 11 should say "leftShoulder", index 12 "rightShoulder"
- For MoveNet: index 5 should say "leftShoulder", index 6 "rightShoulder"
- If names don't match indices, there's a mapping problem

### Detection Quality
- **Good detection**: 25-33 visible keypoints (BlazePose), 15-17 (MoveNet)
- **Poor detection**: <15 visible keypoints
- If detection is poor, the problem is with the model, not the mapping

### Skeleton Rendering
Watch the canvas overlay on the video:
- Should see white lines connecting body parts
- Red line for spine (mid-shoulders to mid-hips)
- Yellow/cyan lines for arm-vertical angle visualization

**If skeleton is rendered incorrectly:**
- Lines connecting wrong body parts = keypoint mapping issue
- No lines at all = rendering issue or no keypoints detected
- Lines in weird positions = coordinate issue

### Angle Calculations
- **Spine Angle**: Should be ~0-10° when standing, ~85° when fully hinged
- **Arm Angle**: Varies widely depending on swing position

**If angles are nonsensical** (e.g., 180° when clearly upright):
- Keypoint mapping issue - wrong keypoints being used for calculation
- Check which indices are being used in `calculateSpineVertical()`

## Common Problems and Diagnosis

### Problem: "0 keypoints detected"
- **Cause**: Model not loaded or initialization failed
- **Check**: Browser console for errors
- **Fix**: Reload page, check network tab for model file loading

### Problem: "Keypoints detected but 0 visible"
- **Cause**: All keypoints have low confidence
- **Check**: Video quality, lighting, is person in frame?
- **Fix**: Try different video or adjust confidence threshold

### Problem: "Skeleton rendering looks wrong"
- **Cause 1**: Keypoint index mapping incorrect
  - **Check**: Compare sample keypoints indices vs names
  - **Fix**: Update SkeletonRenderer or PoseSkeletonTransformer indices

- **Cause 2**: Canvas size mismatch
  - **Check**: Video and canvas dimensions
  - **Fix**: Adjust canvas sizing in CSS

### Problem: "Angles don't make sense"
- **Cause**: Wrong keypoints being used for calculation
- **Check**: Log files - which indices have valid data?
- **Fix**: Update `calculateSpineVertical()` to use correct indices

### Problem: "Switching models crashes"
- **Cause**: Model cleanup/initialization issue
- **Check**: Browser console for errors
- **Fix**: Check `switchModel()` and `reinitialize()` methods

## Log File Analysis

Download both log files and compare:

```json
{
  "timestamp": 12345.67,
  "modelType": "BlazePose",
  "keypointsDetected": 33,
  "visibleKeypoints": 28,
  "sampleKeypoints": [
    {
      "index": 0,
      "name": "nose",
      "x": 320,
      "y": 180,
      "visibility": 0.95
    },
    ...
  ],
  "spineAngle": 5.2,
  "armAngle": 45.3,
  "hasRequiredKeypoints": true
}
```

**Key comparisons:**
1. Are `keypointsDetected` correct? (33 vs 17)
2. Do `sampleKeypoints` names match indices?
3. Are `spineAngle` and `armAngle` similar between models?
4. Is `hasRequiredKeypoints` true for both?

## Expected Results (If Everything Works)

### BlazePose:
- 33 keypoints detected
- 25-30 visible keypoints (good lighting/pose)
- Sample index 11 = "leftShoulder"
- Sample index 12 = "rightShoulder"
- Spine angle reasonable (0-90°)
- Skeleton rendered correctly

### MoveNet:
- 17 keypoints detected
- 15-17 visible keypoints
- Sample index 5 = "leftShoulder"
- Sample index 6 = "rightShoulder"
- Spine angle similar to BlazePose
- Skeleton rendered correctly

### Both Models:
- Smooth skeleton rendering
- Similar spine angles (within 5-10°)
- Similar arm angles (within 5-10°)
- Both report `hasRequiredKeypoints: true`
