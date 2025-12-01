import { DeviceService } from '../../services/DeviceService';
import { ActionButton } from './ActionButton';
import { KeyboardIcon } from './Icons';
import { SettingsRow } from './SettingsRow';
import { Toggle } from './Toggle';

interface BugReportTabProps {
  shakeEnabled: boolean;
  onShakeToggle: () => void;
  isShakeSupported: boolean;
  shortcut: string;
  onReportBug: () => void;
}

export function BugReportTab({
  shakeEnabled,
  onShakeToggle,
  isShakeSupported,
  shortcut,
  onReportBug,
}: BugReportTabProps) {
  const isMobile = DeviceService.isMobileDevice();

  return (
    <div className="settings-section">
      {isShakeSupported && isMobile && (
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

      <SettingsRow
        icon={<KeyboardIcon />}
        iconVariant="purple"
        title="Keyboard Shortcut"
        subtitle="Quick access to bug reporter"
        action={<kbd className="settings-kbd">{shortcut}</kbd>}
      />

      <ActionButton variant="red" onClick={onReportBug}>
        🐛 Report a Bug
      </ActionButton>
    </div>
  );
}
