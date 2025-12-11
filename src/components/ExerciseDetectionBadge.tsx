/**
 * Exercise Detection Badge
 *
 * Displays the auto-detected exercise type with confidence level.
 * Allows user to override the detection.
 */

import type { DetectedExercise } from '../analyzers';
import {
  EXERCISE_REGISTRY,
  getAvailableExercises,
  getExerciseDisplayName,
  getExerciseIcon,
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

  // Determine confidence class based on level
  const getConfidenceClass = () => {
    if (detectedExercise === 'unknown') return '';
    if (confidence >= 80) return 'exercise-detection-badge__confidence--high';
    if (confidence >= 60) return 'exercise-detection-badge__confidence--medium';
    return 'exercise-detection-badge__confidence--low';
  };

  const handleOverride = (e: React.MouseEvent, exercise: DetectedExercise) => {
    e.stopPropagation(); // Prevent video container from capturing the click
    if (exercise !== detectedExercise) {
      console.log(
        `[ExerciseDetectionBadge] Switching from ${detectedExercise} to ${exercise}`
      );
      onOverride(exercise);
    }
  };

  return (
    <div
      data-testid="exercise-detection-badge"
      className="exercise-detection-badge"
    >
      {/* Icon and label */}
      <span className="exercise-detection-badge__icon">{icon}</span>
      <span className="exercise-detection-badge__label">{label}</span>

      {/* Working side indicator (e.g., "Left leg" for pistol squats) */}
      {workingSide && (
        <span className="exercise-detection-badge__side">
          {workingSide} leg
        </span>
      )}

      {/* Confidence indicator */}
      {detectedExercise !== 'unknown' && (
        <span
          className={`exercise-detection-badge__confidence ${getConfidenceClass()}`}
        >
          {confidence}%
        </span>
      )}

      {/* Override buttons (only show when locked and not unknown) */}
      {isLocked && detectedExercise !== 'unknown' && (
        <div className="exercise-detection-badge__overrides">
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
                className={`exercise-detection-badge__override-btn ${isActive ? 'exercise-detection-badge__override-btn--active' : ''}`}
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
