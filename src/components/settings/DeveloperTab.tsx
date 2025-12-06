import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { sessionRecorder } from '../../services/SessionRecorder';
import { WrenchIcon, DownloadIcon } from './Icons';

interface DeveloperTabProps {
  onClose?: () => void;
}

export function DeveloperTab({ onClose }: DeveloperTabProps) {
  const [recordingStats, setRecordingStats] = useState(sessionRecorder.getStats());

  useEffect(() => {
    const interval = setInterval(() => {
      setRecordingStats(sessionRecorder.getStats());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
  };

  return (
    <div className="settings-section settings-section--compact">
      {/* Action buttons row */}
      <div className="settings-actions-row">
        <Link to="/debug" className="settings-action-btn" onClick={onClose}>
          <WrenchIcon /> Debug
        </Link>
        <button
          type="button"
          className="settings-action-btn settings-action-btn--green"
          onClick={() => sessionRecorder.downloadRecording()}
        >
          <DownloadIcon /> Download Log
        </button>
      </div>

      {/* Session stats inline */}
      <div className="settings-stats-row">
        <span className="settings-stat">{formatDuration(recordingStats.duration)}</span>
        <span className="settings-stat">{recordingStats.interactions} clicks</span>
        <span className="settings-stat">{recordingStats.snapshots} snaps</span>
        {recordingStats.errors > 0 && (
          <span className="settings-stat settings-stat--error">{recordingStats.errors} errors</span>
        )}
      </div>
    </div>
  );
}
