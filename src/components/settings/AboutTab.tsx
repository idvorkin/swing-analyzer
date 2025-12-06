import {
  BUILD_TIMESTAMP,
  GIT_BRANCH,
  GIT_COMMIT_URL,
  GIT_SHA_SHORT,
} from '../../generated_version';
import { DeviceService } from '../../services/DeviceService';
import { ActionButton } from './ActionButton';
import { ClockIcon, GitHubIcon, KeyboardIcon } from './Icons';
import { SettingsRow } from './SettingsRow';
import { Toggle } from './Toggle';

function formatBuildDate(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return 'Unknown';
    }
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'Unknown';
  }
}

interface AboutTabProps {
  // Bug reporting
  shakeEnabled?: boolean;
  onShakeToggle?: () => void;
  isShakeSupported?: boolean;
  shortcut?: string;
  onReportBug?: () => void;
  // Version check
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
  onReportBug,
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
    <div className="settings-section">
      {/* App Info Card */}
      <div className="settings-about-card">
        <div className="settings-about-icon">🏋️</div>
        <div className="settings-about-title">Swing Analyzer</div>
        <div className="settings-about-subtitle">
          Kettlebell form analysis powered by AI
        </div>
      </div>

      {/* Version Info */}
      <div className="settings-version-card">
        <div className="settings-version-rows">
          <div className="settings-version-row">
            <span className="settings-version-label">Version</span>
            <a
              href={GIT_COMMIT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="settings-version-link"
            >
              {GIT_SHA_SHORT}
            </a>
          </div>
          <div className="settings-version-row">
            <span className="settings-version-label">Branch</span>
            <span className="settings-version-value">{GIT_BRANCH}</span>
          </div>
          <div className="settings-version-row">
            <span className="settings-version-label">Built</span>
            <span className="settings-version-value">{buildDate}</span>
          </div>
        </div>
      </div>

      {/* Update Available Banner */}
      {updateAvailable && onReload && (
        <div className="settings-update-banner">
          <div className="settings-update-banner-header">
            <span className="settings-update-banner-icon">✨</span>
            <div className="settings-update-banner-title">
              New Version Available!
            </div>
          </div>
          <button
            type="button"
            className="settings-update-banner-btn"
            onClick={onReload}
          >
            Reload to Update
          </button>
        </div>
      )}

      {/* Updates Check */}
      {onCheckForUpdate && (
        <>
          <SettingsRow
            icon={<ClockIcon />}
            iconVariant="blue"
            title="Last Update Check"
            subtitle={formattedLastCheck}
          />
          <ActionButton
            variant="blue"
            onClick={onCheckForUpdate}
            disabled={isCheckingUpdate}
          >
            {isCheckingUpdate ? (
              <>
                <span className="settings-spinner">⟳</span>
                Checking...
              </>
            ) : (
              <>🔄 Check for Updates</>
            )}
          </ActionButton>
        </>
      )}

      {/* Bug Report Section */}
      {isShakeSupported && isMobile && onShakeToggle && (
        <SettingsRow
          icon="📱"
          iconVariant="orange"
          title="Shake to Report"
          subtitle="Shake device to open bug reporter"
          action={
            <Toggle
              checked={shakeEnabled}
              onChange={onShakeToggle}
              aria-label="Toggle shake to report"
            />
          }
        />
      )}

      {shortcut && (
        <SettingsRow
          icon={<KeyboardIcon />}
          iconVariant="purple"
          title="Bug Report Shortcut"
          subtitle="Quick access to bug reporter"
          action={<kbd className="settings-kbd">{shortcut}</kbd>}
        />
      )}

      {onReportBug && (
        <ActionButton variant="red" onClick={onReportBug}>
          🐛 Report a Bug
        </ActionButton>
      )}

      {/* Links */}
      <div className="settings-links">
        <a
          href="https://github.com/idvorkin/swing-analyzer"
          target="_blank"
          rel="noopener noreferrer"
          className="settings-link"
        >
          <GitHubIcon />
          GitHub
        </a>
        <a
          href="https://idvork.in/kettlebell"
          target="_blank"
          rel="noopener noreferrer"
          className="settings-link"
        >
          📖 Learn More
        </a>
      </div>
    </div>
  );
}
