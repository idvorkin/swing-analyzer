import { ActionButton } from './ActionButton';
import { ClockIcon } from './Icons';
import { SettingsRow } from './SettingsRow';

interface UpdatesTabProps {
  updateAvailable: boolean;
  lastCheckTime: Date | null;
  isCheckingUpdate: boolean;
  onCheckForUpdate: () => void;
  onReload: () => void;
}

export function UpdatesTab({
  updateAvailable,
  lastCheckTime,
  isCheckingUpdate,
  onCheckForUpdate,
  onReload,
}: UpdatesTabProps) {
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
      {updateAvailable && (
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

      <SettingsRow
        icon={<ClockIcon />}
        iconVariant="blue"
        title="Last Check"
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
    </div>
  );
}
