# Form Checkpoints Feature

## Overview
Form Checkpoints is a feature that automatically captures and displays key frames from each repetition of an exercise. For each rep, the system identifies and captures images at four critical positions in the movement pattern. The checkpoints are captured in real-time during swing analysis and include the skeleton overlay to provide clear visual feedback on form.

## Key Positions
For each repetition, the system will capture frames at these four positions:

1. **Top** - The upright starting position
2. **Hinge** - The moment when hinging begins on the way down
3. **Bottom** - The point of maximum hip hinge (most horizontal)
4. **Release** - When the arms disconnect from the body during the upswing

## Technical Implementation

### Position Detection
- Utilize existing pose estimation data to identify position transitions
- Define angle thresholds and positional markers for each checkpoint
- Implement state machine to track movement through each position
- Positions are detected simultaneously with the swing analysis

### Frame Capture
- Capture frames with the skeleton overlay directly from the canvas
- When a key position is detected, save the corresponding frame with all visual aids
- Store frames with metadata (rep number, position type, timestamp, spine angle)

### User Interface
- Display a 2×2 grid of the key positions for each rep
- Allow users to navigate through previous reps
- Provide option to compare key positions across different reps
- Include angle measurements and skeleton overlay on each frame

## User Experience
1. User performs their exercise while being recorded
2. System counts reps and captures key frames automatically
3. After each rep, the four checkpoint frames are displayed with skeleton overlays
4. User can review their form at each critical position
5. User can navigate between different reps to compare form over time

## Success Metrics
- Accurate identification of all four positions in >90% of reps
- Frame capture within 100ms of the actual position occurrence
- Positive user feedback on form improvement
- Clear visual feedback with skeleton overlays at each checkpoint

## Future Enhancements
- AI-generated form feedback for each position
- Side-by-side comparison with ideal form templates
- Time-lapse view showing progress over multiple sessions
- Video export with checkpoint annotations 