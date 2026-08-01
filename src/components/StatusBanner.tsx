/**
 * StatusBanner — surfaces AppError reports (a channel separate from the
 * per-frame `status` HUD text, so progress updates can never clobber an
 * error). Stateless: dismissal clears the error in the hook, and a new
 * report (fresh id) re-shows the banner even for an identical message.
 */
import { useExerciseAnalyzerContext } from '../contexts/ExerciseAnalyzerContext';

export default function StatusBanner() {
  const { appError, dismissError } = useExerciseAnalyzerContext();

  if (!appError) {
    return null;
  }

  const isWarning = appError.severity === 'warning';
  return (
    <div
      className={`status-banner${isWarning ? ' status-banner-warning' : ''}`}
      // Warnings are a polite live region; only errors interrupt (alert).
      role={isWarning ? 'status' : 'alert'}
    >
      <span className="status-banner-message">
        {isWarning ? appError.message : `Error: ${appError.message}`}
      </span>
      <button
        type="button"
        className="status-banner-dismiss"
        aria-label="Dismiss"
        onClick={dismissError}
      >
        ×
      </button>
    </div>
  );
}
