import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsModal } from '../SettingsModal';

// Helper to wrap component with Router for Link support
const renderWithRouter = (ui: React.ReactElement) => {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
};

// Mock the generated_version module
vi.mock('../../generated_version', () => ({
  BUILD_TIMESTAMP: '2024-01-15T12:00:00Z',
  GIT_BRANCH: 'main',
  GIT_COMMIT_URL: 'https://github.com/test/repo/commit/abc123',
  GIT_SHA_SHORT: 'abc123',
}));

// Mock DeviceService
vi.mock('../../services/DeviceService', () => ({
  DeviceService: {
    isMobileDevice: vi.fn(() => false),
  },
}));

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock the SwingAnalyzerContext for GeneralTab
vi.mock('../../contexts/SwingAnalyzerContext', () => ({
  useSwingAnalyzerContext: vi.fn(() => ({
    appState: { displayMode: 'both' },
    setDisplayMode: vi.fn(),
  })),
}));

// Mock SessionRecorder for DebugTab
vi.mock('../../services/SessionRecorder', () => ({
  sessionRecorder: {
    getStats: vi.fn(() => ({
      duration: 60000,
      interactions: 5,
      snapshots: 10,
      stateChanges: 20,
      errors: 0,
    })),
    downloadRecording: vi.fn(),
  },
}));

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  shakeEnabled: false,
  onShakeEnabledChange: vi.fn(),
  isShakeSupported: false,
  onRequestShakePermission: vi.fn().mockResolvedValue(true),
  onOpenBugReporter: vi.fn(),
  shortcut: 'Cmd+I',
  lastCheckTime: null,
  onCheckForUpdate: vi.fn().mockResolvedValue(undefined),
  isCheckingUpdate: false,
  updateAvailable: false,
  onReload: vi.fn(),
};

describe('SettingsModal', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders when isOpen is true', () => {
    renderWithRouter(<SettingsModal {...defaultProps} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    renderWithRouter(<SettingsModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    renderWithRouter(<SettingsModal {...defaultProps} onClose={onClose} />);

    fireEvent.click(screen.getByLabelText('Close settings'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when overlay is clicked', () => {
    const onClose = vi.fn();
    renderWithRouter(<SettingsModal {...defaultProps} onClose={onClose} />);

    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when modal content is clicked', () => {
    const onClose = vi.fn();
    renderWithRouter(<SettingsModal {...defaultProps} onClose={onClose} />);

    fireEvent.click(screen.getByRole('document'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose when Escape key is pressed', () => {
    const onClose = vi.fn();
    renderWithRouter(<SettingsModal {...defaultProps} onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  describe('Tab Navigation', () => {
    it('shows Settings tab by default with display and model options', () => {
      renderWithRouter(<SettingsModal {...defaultProps} />);
      expect(screen.getByText('Display')).toBeInTheDocument();
      expect(screen.getByText('Model')).toBeInTheDocument();
    });

    it('has three tabs: Settings, Developer, About', () => {
      renderWithRouter(<SettingsModal {...defaultProps} />);
      // Get all tab buttons
      const tabs = screen.getAllByRole('button').filter(btn =>
        btn.classList.contains('settings-tab')
      );
      expect(tabs).toHaveLength(3);
      expect(screen.getByText('Developer')).toBeInTheDocument();
      expect(screen.getByText('About')).toBeInTheDocument();
    });

    it('switches to Developer tab when clicked', () => {
      renderWithRouter(<SettingsModal {...defaultProps} />);

      fireEvent.click(screen.getByText('Developer'));
      expect(screen.getByText('Debug')).toBeInTheDocument();
    });

    it('switches to About tab when clicked', () => {
      renderWithRouter(<SettingsModal {...defaultProps} />);

      fireEvent.click(screen.getByText('About'));
      expect(screen.getByText('Version')).toBeInTheDocument();
    });
  });

  describe('Settings Tab', () => {
    it('shows display mode options in segmented control', () => {
      renderWithRouter(<SettingsModal {...defaultProps} />);
      expect(screen.getByText('Both')).toBeInTheDocument();
      expect(screen.getByText('Video')).toBeInTheDocument();
      expect(screen.getByText('Skeleton')).toBeInTheDocument();
    });

    it('shows BlazePose variant options in segmented control', () => {
      renderWithRouter(<SettingsModal {...defaultProps} />);
      expect(screen.getByText('Lite')).toBeInTheDocument();
      expect(screen.getByText('Full')).toBeInTheDocument();
      expect(screen.getByText('Heavy')).toBeInTheDocument();
    });
  });

  describe('About Tab', () => {
    it('displays version information', () => {
      renderWithRouter(<SettingsModal {...defaultProps} />);

      fireEvent.click(screen.getByText('About'));
      expect(screen.getByText('abc123')).toBeInTheDocument();
      expect(screen.getByText(/main/)).toBeInTheDocument();
    });

    it('displays external links', () => {
      renderWithRouter(<SettingsModal {...defaultProps} />);

      fireEvent.click(screen.getByText('About'));
      expect(screen.getByText(/GitHub/)).toBeInTheDocument();
      expect(screen.getByText(/Docs/)).toBeInTheDocument();
    });

    it('displays keyboard shortcut for bug report', () => {
      renderWithRouter(<SettingsModal {...defaultProps} />);
      fireEvent.click(screen.getByText('About'));
      expect(screen.getByText('Cmd+I')).toBeInTheDocument();
    });

    it('calls onOpenBugReporter and onClose when Report button is clicked', () => {
      const onClose = vi.fn();
      const onOpenBugReporter = vi.fn();
      renderWithRouter(
        <SettingsModal
          {...defaultProps}
          onClose={onClose}
          onOpenBugReporter={onOpenBugReporter}
        />
      );

      fireEvent.click(screen.getByText('About'));
      fireEvent.click(screen.getByText('Report'));
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onOpenBugReporter).toHaveBeenCalledTimes(1);
    });

    it('shows "Never" when lastCheckTime is null', () => {
      renderWithRouter(<SettingsModal {...defaultProps} />);

      fireEvent.click(screen.getByText('About'));
      expect(screen.getByText('Never')).toBeInTheDocument();
    });

    it('shows formatted date when lastCheckTime is set', () => {
      const lastCheckTime = new Date('2024-01-15T14:30:00');
      renderWithRouter(
        <SettingsModal {...defaultProps} lastCheckTime={lastCheckTime} />
      );

      fireEvent.click(screen.getByText('About'));
      // The formatted date should contain "Jan 15" - use getAllByText since it may appear multiple times
      const dateElements = screen.getAllByText(/Jan 15/);
      expect(dateElements.length).toBeGreaterThan(0);
    });

    it('shows update available banner when updateAvailable is true', () => {
      renderWithRouter(
        <SettingsModal {...defaultProps} updateAvailable={true} />
      );

      fireEvent.click(screen.getByText('About'));
      expect(screen.getByText(/Update available/)).toBeInTheDocument();
    });

    it('calls onReload when Reload button is clicked', () => {
      const onReload = vi.fn();
      renderWithRouter(
        <SettingsModal
          {...defaultProps}
          updateAvailable={true}
          onReload={onReload}
        />
      );

      fireEvent.click(screen.getByText('About'));
      fireEvent.click(screen.getByText('Reload'));
      expect(onReload).toHaveBeenCalledTimes(1);
    });

    it('calls onCheckForUpdate when Check button is clicked', async () => {
      const onCheckForUpdate = vi.fn().mockResolvedValue(undefined);
      renderWithRouter(
        <SettingsModal {...defaultProps} onCheckForUpdate={onCheckForUpdate} />
      );

      fireEvent.click(screen.getByText('About'));
      fireEvent.click(screen.getByText('Check'));
      expect(onCheckForUpdate).toHaveBeenCalledTimes(1);
    });

    it('shows ... when isCheckingUpdate is true', () => {
      renderWithRouter(
        <SettingsModal {...defaultProps} isCheckingUpdate={true} />
      );

      fireEvent.click(screen.getByText('About'));
      expect(screen.getByText('...')).toBeInTheDocument();
    });

  });

  describe('Developer Tab', () => {
    it('has debug and download buttons', () => {
      renderWithRouter(<SettingsModal {...defaultProps} />);

      fireEvent.click(screen.getByText('Developer'));
      expect(screen.getByText('Debug')).toBeInTheDocument();
      expect(screen.getByText('Download Log')).toBeInTheDocument();
    });
  });
});
