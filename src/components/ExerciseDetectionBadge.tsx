/**
 * Exercise Detection Badge
 *
 * Displays the auto-detected exercise type with confidence level.
 * Allows user to override the detection.
 */

import type { DetectedExercise } from '../analyzers';

interface ExerciseDetectionBadgeProps {
  detectedExercise: DetectedExercise;
  confidence: number;
  isLocked: boolean;
  onOverride: (exercise: DetectedExercise) => void;
}

const EXERCISE_LABELS: Record<DetectedExercise, string> = {
  'kettlebell-swing': 'Kettlebell Swing',
  'pistol-squat': 'Pistol Squat',
  'unknown': 'Detecting...',
};

const EXERCISE_ICONS: Record<DetectedExercise, string> = {
  'kettlebell-swing': '\u{1F3CB}', // weight lifter
  'pistol-squat': '\u{1F9CE}', // kneeling person
  'unknown': '\u{1F50D}', // magnifying glass
};

export function ExerciseDetectionBadge({
  detectedExercise,
  confidence,
  isLocked,
  onOverride,
}: ExerciseDetectionBadgeProps) {
  // Don't show anything until we have some detection progress
  if (detectedExercise === 'unknown' && confidence === 0) {
    return null;
  }

  const label = EXERCISE_LABELS[detectedExercise];
  const icon = EXERCISE_ICONS[detectedExercise];

  // Determine badge color based on confidence
  const getConfidenceColor = () => {
    if (detectedExercise === 'unknown') return '#666';
    if (confidence >= 80) return '#22c55e'; // green
    if (confidence >= 60) return '#eab308'; // yellow
    return '#f97316'; // orange
  };

  const handleOverride = (exercise: DetectedExercise) => {
    if (exercise !== detectedExercise) {
      onOverride(exercise);
    }
  };

  return (
    <div
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
          <button
            onClick={() => handleOverride('kettlebell-swing')}
            disabled={detectedExercise === 'kettlebell-swing'}
            style={{
              padding: '2px 8px',
              background: detectedExercise === 'kettlebell-swing' ? '#3b82f6' : 'rgba(255,255,255,0.1)',
              border: 'none',
              borderRadius: '4px',
              color: '#fff',
              fontSize: '11px',
              cursor: detectedExercise === 'kettlebell-swing' ? 'default' : 'pointer',
              opacity: detectedExercise === 'kettlebell-swing' ? 1 : 0.7,
            }}
            title="Switch to Kettlebell Swing"
          >
            Swing
          </button>
          <button
            onClick={() => handleOverride('pistol-squat')}
            disabled={detectedExercise === 'pistol-squat'}
            style={{
              padding: '2px 8px',
              background: detectedExercise === 'pistol-squat' ? '#3b82f6' : 'rgba(255,255,255,0.1)',
              border: 'none',
              borderRadius: '4px',
              color: '#fff',
              fontSize: '11px',
              cursor: detectedExercise === 'pistol-squat' ? 'default' : 'pointer',
              opacity: detectedExercise === 'pistol-squat' ? 1 : 0.7,
            }}
            title="Switch to Pistol Squat"
          >
            Pistol
          </button>
        </div>
      )}
    </div>
  );
}
