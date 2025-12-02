import { Modal, Tabs } from '@mantine/core';
import { useCallback, useEffect, useState } from 'react';
import { AboutTab } from './settings/AboutTab';
import { BugReportTab } from './settings/BugReportTab';
import { DebugTab } from './settings/DebugTab';
import { BugIcon, InfoIcon, MonitorIcon, RocketIcon } from './settings/Icons';
import { UpdatesTab } from './settings/UpdatesTab';

const TABS = [
  { id: 'debug' as const, label: 'Display', Icon: MonitorIcon },
  { id: 'bug' as const, label: 'Bug Report', Icon: BugIcon },
  { id: 'updates' as const, label: 'Updates', Icon: RocketIcon },
  { id: 'about' as const, label: 'About', Icon: InfoIcon },
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
  const [activeSection, setActiveSection] = useState<TabId>('about');

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

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      title="Settings"
      size="lg"
      centered
    >
      <Tabs
        value={activeSection}
        onChange={(value) => setActiveSection(value as TabId)}
      >
        <Tabs.List>
          {TABS.map((tab) => (
            <Tabs.Tab key={tab.id} value={tab.id} leftSection={<tab.Icon />}>
              {tab.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>

        <Tabs.Panel value="debug" pt="md">
          <DebugTab onClose={onClose} />
        </Tabs.Panel>

        <Tabs.Panel value="bug" pt="md">
          <BugReportTab
            shakeEnabled={shakeEnabled}
            onShakeToggle={handleShakeToggle}
            isShakeSupported={isShakeSupported}
            shortcut={shortcut}
            onReportBug={handleReportBug}
          />
        </Tabs.Panel>

        <Tabs.Panel value="updates" pt="md">
          <UpdatesTab
            updateAvailable={updateAvailable}
            lastCheckTime={lastCheckTime}
            isCheckingUpdate={isCheckingUpdate}
            onCheckForUpdate={onCheckForUpdate}
            onReload={onReload}
          />
        </Tabs.Panel>

        <Tabs.Panel value="about" pt="md">
          <AboutTab />
        </Tabs.Panel>
      </Tabs>
    </Modal>
  );
}
