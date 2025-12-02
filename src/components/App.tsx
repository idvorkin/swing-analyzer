import type React from 'react';
import { useEffect, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { Route, Routes } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import { GIT_BRANCH } from '../generated_version';
import { SwingAnalyzerProvider } from '../contexts/SwingAnalyzerContext';
import AnalysisSection from './AnalysisSection';
import VideoSection from './VideoSection';
import './App.css';
import { useBugReporter } from '../hooks/useBugReporter';
import { useShakeDetector } from '../hooks/useShakeDetector';
import { useVersionCheck } from '../hooks/useVersionCheck';
import { BugReportModal } from './BugReportModal';
import { CrashFallback } from './CrashFallback';
import DebugModelLoaderPage from './DebugModelLoaderPage';
import { DebugPage } from './DebugPage';
import { SettingsModal } from './SettingsModal';
import { VersionNotification } from './VersionNotification';

// Settings icon for header
const SettingsIconSmall = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
  </svg>
);

// Component for the main application content (no header - moved to AppContent)
const MainApplication: React.FC = () => {
  return (
    <main>
      <VideoSection />
      <AnalysisSection />
    </main>
  );
};

// Detect if Mac for keyboard shortcut display
const isMac =
  typeof navigator !== 'undefined' &&
  navigator.platform.toUpperCase().indexOf('MAC') >= 0;
const bugReportShortcut = isMac ? 'Cmd+I' : 'Ctrl+I';

// Show branch name in title if not on main/master
const isFeatureBranch = GIT_BRANCH && !['main', 'master'].includes(GIT_BRANCH);
const branchDisplayName = isFeatureBranch ? GIT_BRANCH.replace(/^feature\//, '') : null;

// Header with navigation
interface HeaderProps {
  onOpenSettings: () => void;
}

const Header: React.FC<HeaderProps> = ({ onOpenSettings }) => {
  return (
    <header>
      <h1>
        Swing Analyzer
        {branchDisplayName && (
          <span className="branch-indicator" title={`Branch: ${GIT_BRANCH}`}>
            {' '}
            [{branchDisplayName}]
          </span>
        )}
      </h1>
      <nav>
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Open settings"
        >
          <SettingsIconSmall />
          <span>Settings</span>
        </button>
      </nav>
    </header>
  );
};

// Inner App component with bug reporting and settings integration
const AppContent: React.FC = () => {
  const bugReporter = useBugReporter();
  const versionCheck = useVersionCheck();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { isSupported: isShakeSupported, requestPermission } = useShakeDetector(
    {
      enabled: bugReporter.shakeEnabled,
      onShake: bugReporter.open,
    }
  );

  // Set document title with branch name if on feature branch
  useEffect(() => {
    if (branchDisplayName) {
      document.title = `Swing Analyzer [${branchDisplayName}]`;
    } else {
      document.title = 'Swing Analyzer';
    }
  }, []);

  // Keyboard shortcut: Ctrl+I or Cmd+I to open bug reporter
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
        e.preventDefault();
        bugReporter.open();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [bugReporter]);

  return (
    <SwingAnalyzerProvider>
      <Header onOpenSettings={() => setSettingsOpen(true)} />
      <Routes>
        <Route path="/" element={<MainApplication />} />
        <Route path="/debug" element={<DebugModelLoaderPage />} />
        <Route path="/debug-models" element={<DebugPage />} />
      </Routes>
      <VersionNotification />
      <BugReportModal
        isOpen={bugReporter.isOpen}
        onClose={bugReporter.close}
        onOpen={bugReporter.open}
        onSubmit={bugReporter.submit}
        isSubmitting={bugReporter.isSubmitting}
        defaultData={bugReporter.getDefaultData()}
      />
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        shakeEnabled={bugReporter.shakeEnabled}
        onShakeEnabledChange={bugReporter.setShakeEnabled}
        isShakeSupported={isShakeSupported}
        onRequestShakePermission={requestPermission}
        onOpenBugReporter={bugReporter.open}
        shortcut={bugReportShortcut}
        lastCheckTime={versionCheck.lastCheckTime}
        onCheckForUpdate={versionCheck.checkForUpdate}
        isCheckingUpdate={versionCheck.isChecking}
        updateAvailable={versionCheck.updateAvailable}
        onReload={versionCheck.reload}
      />
    </SwingAnalyzerProvider>
  );
};

// Main App component that sets up routing with error boundary
export const App: React.FC = () => {
  console.log('App: Component rendering started, setting up routes.');

  return (
    <MantineProvider>
      <ErrorBoundary FallbackComponent={CrashFallback}>
        <AppContent />
      </ErrorBoundary>
    </MantineProvider>
  );
};

// If you want to keep the existing export default, you can alias it or change it.
// For simplicity, if App is the main export, we can do:
export default App;
