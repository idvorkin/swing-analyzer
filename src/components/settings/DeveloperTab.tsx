import { useCallback, useEffect, useState } from 'react';
import { sessionRecorder } from '../../services/SessionRecorder';
import { DownloadIcon } from './Icons';

export function DeveloperTab() {
  const [recordingStats, setRecordingStats] = useState(
    sessionRecorder.getStats()
  );
  const [hasPoseTrack, setHasPoseTrack] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setRecordingStats(sessionRecorder.getStats());
      // Check if pose track is available
      setHasPoseTrack(sessionRecorder.getPoseTrack() !== null);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
  };

  const handleDownloadPoseTrack = useCallback(async () => {
    // Use swingDebug to download (it has the download logic)
    const swingDebug = (
      window as unknown as {
        swingDebug?: { downloadPoseTrack: () => Promise<string | null> };
      }
    ).swingDebug;
    if (swingDebug?.downloadPoseTrack) {
      setIsDownloading(true);
      try {
        await swingDebug.downloadPoseTrack();
      } finally {
        setIsDownloading(false);
      }
    }
  }, []);

  return (
    <div className="settings-section settings-section--compact">
      {/* Action buttons row */}
      <div className="settings-actions-row">
        <button
          type="button"
          className="settings-action-btn settings-action-btn--green"
          onClick={() => sessionRecorder.downloadRecording()}
        >
          <DownloadIcon /> Download Log
        </button>
        <button
          type="button"
          className="settings-action-btn settings-action-btn--blue"
          onClick={handleDownloadPoseTrack}
          disabled={!hasPoseTrack || isDownloading}
          title={
            hasPoseTrack ? 'Download extracted pose data' : 'Load a video first'
          }
        >
          <DownloadIcon /> {isDownloading ? 'Compressing...' : 'Download Poses'}
        </button>
      </div>

      {/* Session stats inline */}
      <div className="settings-stats-row">
        <span className="settings-stat">
          {formatDuration(recordingStats.duration)}
        </span>
        <span className="settings-stat">
          {recordingStats.interactions} clicks
        </span>
        <span className="settings-stat">{recordingStats.snapshots} snaps</span>
        {recordingStats.errors > 0 && (
          <span className="settings-stat settings-stat--error">
            {recordingStats.errors} errors
          </span>
        )}
      </div>
    </div>
  );
}
