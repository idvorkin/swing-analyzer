/**
 * StatusBanner — surfaces error statuses that previously went nowhere.
 * Renders only when the status text looks like an error; dismissible per
 * message (a new error message re-shows the banner).
 */
import { useEffect, useState } from 'react';
import { useExerciseAnalyzerContext } from '../contexts/ExerciseAnalyzerContext';

export default function StatusBanner() {
  const { status } = useExerciseAnalyzerContext();
  const [dismissed, setDismissed] = useState<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: status only triggers the reset (not read in the body); a new status should always clear a prior dismissal
  useEffect(() => {
    setDismissed(null);
  }, [status]);

  const isError = /error/i.test(status);
  if (!isError || dismissed === status) {
    return null;
  }

  return (
    <div className="status-banner" role="alert">
      <span className="status-banner-message">{status}</span>
      <button
        type="button"
        className="status-banner-dismiss"
        aria-label="Dismiss"
        onClick={() => setDismissed(status)}
      >
        ×
      </button>
    </div>
  );
}
