import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BugReportModal } from './BugReportModal';

// Mock DeviceService (used by BugReportModal for isMobileDevice + captureScreenshot)
vi.mock('../services/DeviceService', () => ({
  DeviceService: {
    isMobileDevice: vi.fn(() => false),
    captureScreenshot: vi.fn().mockResolvedValue('data:image/png;base64,mock'),
  },
}));

const baseProps = {
  isOpen: true,
  onClose: vi.fn(),
  onOpen: vi.fn(),
  onSubmit: vi.fn().mockResolvedValue({ success: true }),
  isSubmitting: false,
  defaultData: { title: '', description: '', includeMetadata: true },
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Mount a document-level keydown listener, mirroring the unguarded
// `useKeyboardNavigation` document listener that is live on the `/` route
// (and thus live whenever BugReportModal is open over the main view).
function mountDocShortcuts(cb: (key: string) => void) {
  const handler = (e: KeyboardEvent) => {
    if (e.key === ' ' || e.key === '.' || e.key === ',') {
      e.preventDefault();
      cb(e.key);
    }
  };
  document.addEventListener('keydown', handler);
  return () => document.removeEventListener('keydown', handler);
}

// Mount a document-level Escape listener, mirroring the document-level
// Escape dismissal path used by SettingsModal/RepGalleryModal/MediaSelectorDialog
// (which can be stacked beneath BugReportModal).
function mountDocEscape(cb: () => void) {
  const handler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') cb();
  };
  document.addEventListener('keydown', handler);
  return () => document.removeEventListener('keydown', handler);
}

describe('BugReportModal', () => {
  describe('rendering', () => {
    it('renders when isOpen is true', () => {
      render(<BugReportModal {...baseProps} />);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: 'Report a Bug' })
      ).toBeInTheDocument();
    });

    it('does not render when isOpen is false', () => {
      render(<BugReportModal {...baseProps} isOpen={false} />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  describe('dismissal — visible affordances (regression)', () => {
    it('calls onClose when the overlay is clicked', () => {
      const onClose = vi.fn();
      render(<BugReportModal {...baseProps} onClose={onClose} />);
      fireEvent.click(screen.getByRole('dialog'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not call onClose when the modal content is clicked', () => {
      const onClose = vi.fn();
      render(<BugReportModal {...baseProps} onClose={onClose} />);
      fireEvent.click(screen.getByRole('document'));
      expect(onClose).not.toHaveBeenCalled();
    });

    it('calls onClose when the Cancel button is clicked', () => {
      const onClose = vi.fn();
      render(<BugReportModal {...baseProps} onClose={onClose} />);
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when the close (×) header button is clicked', () => {
      const onClose = vi.fn();
      render(<BugReportModal {...baseProps} onClose={onClose} />);
      // The header × button has no aria-label; target it via its glyph text.
      const closeBtn = screen.getByText('×');
      fireEvent.click(closeBtn);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Escape dismissal — the bug fix', () => {
    it('calls onClose when Escape is pressed on the overlay directly', () => {
      const onClose = vi.fn();
      render(<BugReportModal {...baseProps} onClose={onClose} />);
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when Escape is pressed while the title input is focused', () => {
      const onClose = vi.fn();
      render(<BugReportModal {...baseProps} onClose={onClose} />);
      const title = screen.getByPlaceholderText('Brief description of the bug');
      title.focus();
      fireEvent.keyDown(title, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when Escape is pressed while the description textarea is focused', () => {
      const onClose = vi.fn();
      render(<BugReportModal {...baseProps} onClose={onClose} />);
      const desc = screen.getByPlaceholderText(
        'What happened? What did you expect?'
      );
      desc.focus();
      fireEvent.keyDown(desc, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when Escape is pressed while the Cancel button is focused', () => {
      const onClose = vi.fn();
      render(<BugReportModal {...baseProps} onClose={onClose} />);
      const cancel = screen.getByRole('button', { name: 'Cancel' });
      cancel.focus();
      fireEvent.keyDown(cancel, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not call onClose when a non-Escape key is pressed on the overlay', () => {
      const onClose = vi.fn();
      render(<BugReportModal {...baseProps} onClose={onClose} />);
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter' });
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('typing shield — preserves sealing from document-level video shortcuts', () => {
    it('does not let Space from the title input reach a document keydown listener', () => {
      const shortcuts = vi.fn();
      render(<BugReportModal {...baseProps} />);
      const release = mountDocShortcuts(shortcuts);
      const title = screen.getByPlaceholderText('Brief description of the bug');
      title.focus();
      fireEvent.keyDown(title, { key: ' ' });
      expect(shortcuts).not.toHaveBeenCalled();
      release();
    });

    it('does not let "." from the title input reach a document keydown listener', () => {
      const shortcuts = vi.fn();
      render(<BugReportModal {...baseProps} />);
      const release = mountDocShortcuts(shortcuts);
      const title = screen.getByPlaceholderText('Brief description of the bug');
      title.focus();
      fireEvent.keyDown(title, { key: '.' });
      expect(shortcuts).not.toHaveBeenCalled();
      release();
    });

    it('does not let "," from the description textarea reach a document keydown listener', () => {
      const shortcuts = vi.fn();
      render(<BugReportModal {...baseProps} />);
      const release = mountDocShortcuts(shortcuts);
      const desc = screen.getByPlaceholderText(
        'What happened? What did you expect?'
      );
      desc.focus();
      fireEvent.keyDown(desc, { key: ',' });
      expect(shortcuts).not.toHaveBeenCalled();
      release();
    });
  });

  describe('stacking — Escape does not double-close a sibling document-level modal', () => {
    it('closes BugReportModal once and does not reach a sibling document Escape listener', () => {
      const onClose = vi.fn();
      const siblingClose = vi.fn();
      render(<BugReportModal {...baseProps} onClose={onClose} />);
      const release = mountDocEscape(siblingClose);
      const title = screen.getByPlaceholderText('Brief description of the bug');
      title.focus();
      fireEvent.keyDown(title, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(siblingClose).not.toHaveBeenCalled();
      release();
    });

    it('does not leak non-Escape keys from the title input to a sibling Escape listener', () => {
      const siblingClose = vi.fn();
      render(<BugReportModal {...baseProps} />);
      const release = mountDocEscape(siblingClose);
      const title = screen.getByPlaceholderText('Brief description of the bug');
      title.focus();
      fireEvent.keyDown(title, { key: 'Enter' });
      expect(siblingClose).not.toHaveBeenCalled();
      release();
    });
  });
});
