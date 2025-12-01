import type React from 'react';
import { useEffect, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { Link, Route, Routes } from 'react-router-dom';
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
import { SettingsModal } from './SettingsModal';
import { VersionNotification } from './VersionNotification';

// Component for the main application layout and functionality
const MainApplication: React.FC = () => {
  console.log('MainApplication: Component rendering started.');

  return (
    <>
      <header>
        <h1>Swing Analyzer</h1>
      </header>

      <main>
        <VideoSection />
        <AnalysisSection />
      </main>
    </>
  );
};

// Detect if Mac for keyboard shortcut display
const isMac =
  typeof navigator !== 'undefined' &&
  navigator.platform.toUpperCase().indexOf('MAC') >= 0;
const bugReportShortcut = isMac ? 'Cmd+I' : 'Ctrl+I';

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
      <Routes>
        <Route path="/" element={<MainApplication />} />
        <Route path="/debug" element={<DebugModelLoaderPage />} />
      </Routes>
      <footer>
        <nav>
          <Link to="/">Home</Link> | <Link to="/debug">Debug Model Loader</Link>{' '}
          |{' '}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            style={{
              background: 'none',
              border: 'none',
              color: 'white',
              cursor: 'pointer',
              padding: 0,
              font: 'inherit',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              verticalAlign: 'middle',
            }}
            aria-label="Open settings"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ verticalAlign: 'middle' }}
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            Settings
          </button>
        </nav>
        <div className="external-links">
          <a
            href="https://github.com/idvorkin/swing-analyzer"
            target="_blank"
            rel="noopener noreferrer"
          >
            Source Code on GitHub
          </a>{' '}
          |
          <a
            href="https://idvork.in/kettlebell"
            target="_blank"
            rel="noopener noreferrer"
          >
            What are Swings?
          </a>
        </div>
      </footer>
      <VersionNotification />
      <BugReportModal
        isOpen={bugReporter.isOpen}
        onClose={bugReporter.close}
        onOpen={bugReporter.open}
        onSubmit={bugReporter.submit}
        isSubmitting={bugReporter.isSubmitting}
        defaultData={bugReporter.getDefaultData()}
        shakeEnabled={bugReporter.shakeEnabled}
        onShakeEnabledChange={bugReporter.setShakeEnabled}
        isShakeSupported={isShakeSupported}
        onRequestShakePermission={requestPermission}
        isFirstTime={bugReporter.isFirstTime}
        onFirstTimeShown={bugReporter.markFirstTimeShown}
        shortcut={bugReportShortcut}
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
    <ErrorBoundary FallbackComponent={CrashFallback}>
      <AppContent />
    </ErrorBoundary>
  );
};

// If you want to keep the existing export default, you can alias it or change it.
// For simplicity, if App is the main export, we can do:
export default App;
