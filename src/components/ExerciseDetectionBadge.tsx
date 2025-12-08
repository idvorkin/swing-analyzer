/**
 * Exercise Detection Badge
 *
 * Displays the auto-detected exercise type with confidence level.
 * Allows user to override the detection.
 */

import type { DetectedExercise } from '../analyzers';
import {
  getExerciseDisplayName,
  getExerciseIcon,
  getAvailableExercises,
  EXERCISE_REGISTRY,
} from '../analyzers';

interface ExerciseDetectionBadgeProps {
  detectedExercise: DetectedExercise;
  confidence: number;
  isLocked: boolean;
  onOverride: (exercise: DetectedExercise) => void;
  /** For exercises that support side detection (e.g., pistol squat working leg) */
  workingSide?: 'left' | 'right' | null;
}

export function ExerciseDetectionBadge({
  detectedExercise,
  confidence,
  isLocked,
  onOverride,
  workingSide,
}: ExerciseDetectionBadgeProps) {
  // Don't show anything until we have some detection progress
  if (detectedExercise === 'unknown' && confidence === 0) {
    return null;
  }

  const label = getExerciseDisplayName(detectedExercise);
  const icon = getExerciseIcon(detectedExercise);

  // Determine badge color based on confidence
  const getConfidenceColor = () => {
    if (detectedExercise === 'unknown') return '#666';
    if (confidence >= 80) return '#22c55e'; // green
    if (confidence >= 60) return '#eab308'; // yellow
    return '#f97316'; // orange
  };

  const handleOverride = (e: React.MouseEvent, exercise: DetectedExercise) => {
    e.stopPropagation(); // Prevent video container from capturing the click
    if (exercise !== detectedExercise) {
      console.log(`[ExerciseDetectionBadge] Switching from ${detectedExercise} to ${exercise}`);
      onOverride(exercise);
    }
  };

  return (
    <div
      data-testid="exercise-detection-badge"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '6px 12px',
        background: 'rgba(0, 0, 0, 0.75)',
        borderRadius: '20px',
        fontSize: '13px',
        color: '#fff',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      }}
    >
      {/* Icon and label */}
      <span style={{ fontSize: '16px' }}>{icon}</span>
      <span style={{ fontWeight: 500 }}>{label}</span>

      {/* Working side indicator (e.g., "Left leg" for pistol squats) */}
      {workingSide && (
        <span
          style={{
            padding: '2px 6px',
            background: 'rgba(255, 255, 255, 0.15)',
            borderRadius: '10px',
            fontSize: '11px',
            textTransform: 'capitalize',
          }}
        >
          {workingSide} leg
        </span>
      )}

      {/* Confidence indicator */}
      {detectedExercise !== 'unknown' && (
        <span
          style={{
            padding: '2px 6px',
            background: getConfidenceColor(),
            borderRadius: '10px',
            fontSize: '11px',
            fontWeight: 600,
          }}
        >
          {confidence}%
        </span>
      )}

      {/* Override buttons (only show when locked and not unknown) */}
      {isLocked && detectedExercise !== 'unknown' && (
        <div
          style={{
            display: 'flex',
            gap: '4px',
            marginLeft: '8px',
            borderLeft: '1px solid rgba(255,255,255,0.2)',
            paddingLeft: '8px',
          }}
        >
          {getAvailableExercises().map((exerciseId) => {
            const exercise = EXERCISE_REGISTRY[exerciseId];
            const isActive = detectedExercise === exerciseId;
            // Create short label from display name (first word or abbreviation)
            const shortLabel = exercise.displayName.split(' ')[0];
            return (
              <button
                key={exerciseId}
                type="button"
                onClick={(e) => handleOverride(e, exerciseId)}
                disabled={isActive}
                style={{
                  padding: '2px 8px',
                  background: isActive ? '#3b82f6' : 'rgba(255,255,255,0.1)',
                  border: 'none',
                  borderRadius: '4px',
                  color: '#fff',
                  fontSize: '11px',
                  cursor: isActive ? 'default' : 'pointer',
                  opacity: isActive ? 1 : 0.7,
                }}
                title={`Switch to ${exercise.displayName}`}
              >
                {shortLabel}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
