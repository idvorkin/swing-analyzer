import type React from 'react';
import { useEffect } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { Link, Route, Routes } from 'react-router-dom';
import { SwingAnalyzerProvider } from '../contexts/SwingAnalyzerContext';
import AnalysisSection from './AnalysisSection';
import VideoSection from './VideoSection';
import './App.css';
import { useBugReporter } from '../hooks/useBugReporter';
import { useShakeDetector } from '../hooks/useShakeDetector';
import { BugReportModal } from './BugReportModal';
import { CrashFallback } from './CrashFallback';
import DebugModelLoaderPage from './DebugModelLoaderPage';
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

// Inner App component with bug reporting integration
const AppContent: React.FC = () => {
  const bugReporter = useBugReporter();
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
          <Link to="/">Home</Link> | <Link to="/debug">Debug Model Loader</Link>
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
