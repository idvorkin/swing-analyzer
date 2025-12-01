import { useCallback, useEffect, useState } from 'react';
import { AboutTab } from './settings/AboutTab';
import { BugReportTab } from './settings/BugReportTab';
import { CloseIcon, SettingsIcon } from './settings/Icons';
import './settings/Settings.css';
import { UpdatesTab } from './settings/UpdatesTab';

const TABS = [
  { id: 'bug' as const, label: 'Bug Report', icon: '🐛' },
  { id: 'updates' as const, label: 'Updates', icon: '🚀' },
  { id: 'about' as const, label: 'About', icon: '💡' },
] as const;

type TabId = (typeof TABS)[number]['id'];

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Bug reporting
  shakeEnabled: boolean;
  onShakeEnabledChange: (enabled: boolean) => void;
  isShakeSupported: boolean;
  onRequestShakePermission: () => Promise<boolean>;
  onOpenBugReporter: () => void;
  shortcut: string;
  // Version check
  lastCheckTime: Date | null;
  onCheckForUpdate: () => Promise<void>;
  isCheckingUpdate: boolean;
  updateAvailable: boolean;
  onReload: () => void;
}

export function SettingsModal({
  isOpen,
  onClose,
  shakeEnabled,
  onShakeEnabledChange,
  isShakeSupported,
  onRequestShakePermission,
  onOpenBugReporter,
  shortcut,
  lastCheckTime,
  onCheckForUpdate,
  isCheckingUpdate,
  updateAvailable,
  onReload,
}: SettingsModalProps) {
  const [activeSection, setActiveSection] = useState<TabId>('bug');

  const handleShakeToggle = useCallback(async () => {
    if (!shakeEnabled) {
      const granted = await onRequestShakePermission();
      if (granted) {
        onShakeEnabledChange(true);
      }
    } else {
      onShakeEnabledChange(false);
    }
  }, [shakeEnabled, onRequestShakePermission, onShakeEnabledChange]);

  const handleReportBug = useCallback(() => {
    onClose();
    onOpenBugReporter();
  }, [onClose, onOpenBugReporter]);

  // Global Escape key handler - divs aren't focusable by default
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="settings-overlay"
      onClick={onClose}
      onKeyDown={(e) => e.key === 'Enter' && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <div
        className="settings-modal"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="document"
      >
        {/* Header */}
        <div className="settings-header">
          <div className="settings-header-left">
            <div className="settings-header-icon">
              <SettingsIcon />
            </div>
            <h2 id="settings-title" className="settings-title">
              Settings
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="settings-close-btn"
            aria-label="Close settings"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="settings-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSection(tab.id)}
              className={`settings-tab ${activeSection === tab.id ? 'settings-tab--active' : ''}`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="settings-content">
          {activeSection === 'bug' && (
            <BugReportTab
              shakeEnabled={shakeEnabled}
              onShakeToggle={handleShakeToggle}
              isShakeSupported={isShakeSupported}
              shortcut={shortcut}
              onReportBug={handleReportBug}
            />
          )}

          {activeSection === 'updates' && (
            <UpdatesTab
              updateAvailable={updateAvailable}
              lastCheckTime={lastCheckTime}
              isCheckingUpdate={isCheckingUpdate}
              onCheckForUpdate={onCheckForUpdate}
              onReload={onReload}
            />
          )}

          {activeSection === 'about' && <AboutTab />}
        </div>
      </div>
    </div>
  );
}
