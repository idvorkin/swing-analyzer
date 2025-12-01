import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsModal } from '../SettingsModal';

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
    render(<SettingsModal {...defaultProps} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    render(<SettingsModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<SettingsModal {...defaultProps} onClose={onClose} />);

    fireEvent.click(screen.getByLabelText('Close settings'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when overlay is clicked', () => {
    const onClose = vi.fn();
    render(<SettingsModal {...defaultProps} onClose={onClose} />);

    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when modal content is clicked', () => {
    const onClose = vi.fn();
    render(<SettingsModal {...defaultProps} onClose={onClose} />);

    fireEvent.click(screen.getByRole('document'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose when Escape key is pressed', () => {
    const onClose = vi.fn();
    render(<SettingsModal {...defaultProps} onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  describe('Tab Navigation', () => {
    it('shows Bug Report tab by default', () => {
      render(<SettingsModal {...defaultProps} />);
      expect(screen.getByText(/Report a Bug/)).toBeInTheDocument();
    });

    it('switches to Updates tab when clicked', () => {
      render(<SettingsModal {...defaultProps} />);

      fireEvent.click(screen.getByText('Updates'));
      expect(screen.getByText(/Check for Updates/)).toBeInTheDocument();
    });

    it('switches to About tab when clicked', () => {
      render(<SettingsModal {...defaultProps} />);

      fireEvent.click(screen.getByText('About'));
      expect(screen.getByText('Swing Analyzer')).toBeInTheDocument();
    });
  });

  describe('Bug Report Tab', () => {
    it('displays keyboard shortcut', () => {
      render(<SettingsModal {...defaultProps} />);
      expect(screen.getByText('Cmd+I')).toBeInTheDocument();
    });

    it('calls onOpenBugReporter and onClose when Report a Bug is clicked', () => {
      const onClose = vi.fn();
      const onOpenBugReporter = vi.fn();
      render(
        <SettingsModal
          {...defaultProps}
          onClose={onClose}
          onOpenBugReporter={onOpenBugReporter}
        />
      );

      fireEvent.click(screen.getByText(/Report a Bug/));
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onOpenBugReporter).toHaveBeenCalledTimes(1);
    });
  });

  describe('Updates Tab', () => {
    it('shows "Never" when lastCheckTime is null', () => {
      render(<SettingsModal {...defaultProps} />);

      fireEvent.click(screen.getByText('Updates'));
      expect(screen.getByText('Never')).toBeInTheDocument();
    });

    it('shows formatted date when lastCheckTime is set', () => {
      const lastCheckTime = new Date('2024-01-15T14:30:00');
      render(<SettingsModal {...defaultProps} lastCheckTime={lastCheckTime} />);

      fireEvent.click(screen.getByText('Updates'));
      // The formatted date should contain "Jan 15"
      expect(screen.getByText(/Jan 15/)).toBeInTheDocument();
    });

    it('shows update available banner when updateAvailable is true', () => {
      render(<SettingsModal {...defaultProps} updateAvailable={true} />);

      fireEvent.click(screen.getByText('Updates'));
      expect(screen.getByText('New Version Available!')).toBeInTheDocument();
    });

    it('calls onReload when Reload to Update is clicked', () => {
      const onReload = vi.fn();
      render(
        <SettingsModal
          {...defaultProps}
          updateAvailable={true}
          onReload={onReload}
        />
      );

      fireEvent.click(screen.getByText('Updates'));
      fireEvent.click(screen.getByText('Reload to Update'));
      expect(onReload).toHaveBeenCalledTimes(1);
    });

    it('calls onCheckForUpdate when Check for Updates is clicked', async () => {
      const onCheckForUpdate = vi.fn().mockResolvedValue(undefined);
      render(
        <SettingsModal {...defaultProps} onCheckForUpdate={onCheckForUpdate} />
      );

      fireEvent.click(screen.getByText('Updates'));
      fireEvent.click(screen.getByText(/Check for Updates/));
      expect(onCheckForUpdate).toHaveBeenCalledTimes(1);
    });

    it('shows Checking... when isCheckingUpdate is true', () => {
      render(<SettingsModal {...defaultProps} isCheckingUpdate={true} />);

      fireEvent.click(screen.getByText('Updates'));
      expect(screen.getByText('Checking...')).toBeInTheDocument();
    });
  });

  describe('About Tab', () => {
    it('displays version information', () => {
      render(<SettingsModal {...defaultProps} />);

      fireEvent.click(screen.getByText('About'));
      expect(screen.getByText('abc123')).toBeInTheDocument();
      expect(screen.getByText('main')).toBeInTheDocument();
    });

    it('displays external links', () => {
      render(<SettingsModal {...defaultProps} />);

      fireEvent.click(screen.getByText('About'));
      expect(screen.getByText('GitHub')).toBeInTheDocument();
      expect(screen.getByText(/Learn More/)).toBeInTheDocument();
    });
  });
});
