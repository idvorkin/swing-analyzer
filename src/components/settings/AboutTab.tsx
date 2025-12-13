import {
  BUILD_TIMESTAMP,
  GIT_BRANCH,
  GIT_COMMIT_URL,
  GIT_SHA_SHORT,
} from '../../generated_version';
import { DeviceService } from '../../services/DeviceService';
import { GitHubIcon } from './Icons';
import { Toggle } from './Toggle';

function formatBuildDate(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '?';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '?';
  }
}

interface AboutTabProps {
  shakeEnabled?: boolean;
  onShakeToggle?: () => void;
  isShakeSupported?: boolean;
  shortcut?: string;
  updateAvailable?: boolean;
  lastCheckTime?: Date | null;
  isCheckingUpdate?: boolean;
  onCheckForUpdate?: () => void;
  onReload?: () => void;
}

export function AboutTab({
  shakeEnabled = false,
  onShakeToggle,
  isShakeSupported = false,
  shortcut = 'Ctrl+I',
  updateAvailable = false,
  lastCheckTime,
  isCheckingUpdate = false,
  onCheckForUpdate,
  onReload,
}: AboutTabProps) {
  const buildDate = formatBuildDate(BUILD_TIMESTAMP);
  const isMobile = DeviceService.isMobileDevice();

  const formattedLastCheck = lastCheckTime
    ? lastCheckTime.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Never';

  return (
    <div className="settings-section settings-section--compact">
      {/* Version Row */}
      <div className="settings-info-row">
        <span className="settings-info-label">Version</span>
        <span className="settings-info-value">
          <a
            href={GIT_COMMIT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="settings-info-link"
          >
            {GIT_SHA_SHORT}
          </a>
          <span className="settings-info-sep">·</span>
          {GIT_BRANCH}
          <span className="settings-info-sep">·</span>
          {buildDate}
        </span>
      </div>

      {/* Update Available Banner */}
      {updateAvailable && onReload && (
        <div className="settings-update-row">
          <span>✨ Update available</span>
          <button
            type="button"
            className="settings-inline-btn settings-inline-btn--green"
            onClick={onReload}
          >
            Reload
          </button>
        </div>
      )}

      {/* Update Check Row */}
      {onCheckForUpdate && (
        <div className="settings-info-row">
          <span className="settings-info-label">Last check</span>
          <span className="settings-info-value">
            {formattedLastCheck}
            <button
              type="button"
              className="settings-inline-btn"
              onClick={onCheckForUpdate}
              disabled={isCheckingUpdate}
            >
              {isCheckingUpdate ? '...' : 'Check'}
            </button>
          </span>
        </div>
      )}

      {/* Bug Report Shortcut Info */}
      <div className="settings-info-row">
        <span className="settings-info-label">Bug report</span>
        <span className="settings-info-value">
          <kbd className="settings-kbd-inline">{shortcut}</kbd>
          <span
            style={{
              color: 'var(--settings-text-tertiary)',
              fontSize: 'var(--settings-text-xs)',
            }}
          >
            or use header button
          </span>
        </span>
      </div>

      {/* Shake Toggle (Mobile Only) */}
      {isShakeSupported && isMobile && onShakeToggle && (
        <div className="settings-info-row">
          <span className="settings-info-label">Shake to report</span>
          <Toggle
            checked={shakeEnabled}
            onChange={onShakeToggle}
            aria-label="Toggle shake to report"
          />
        </div>
      )}

      {/* Links */}
      <div className="settings-links-compact">
        <a
          href="https://github.com/idvorkin/swing-analyzer"
          target="_blank"
          rel="noopener noreferrer"
          className="settings-link-compact"
        >
          <GitHubIcon /> GitHub
        </a>
        <a
          href="https://idvork.in/kettlebell"
          target="_blank"
          rel="noopener noreferrer"
          className="settings-link-compact"
        >
          📖 Docs
        </a>
      </div>
    </div>
  );
}
