import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { RepGalleryWidget } from './RepGalleryWidget';
import type { PositionCandidate } from '../types/exercise';

// Mock ImageData for jsdom (not available in jsdom environment)
class MockImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  colorSpace: PredefinedColorSpace = 'srgb';

  constructor(data: Uint8ClampedArray, width: number, height: number) {
    this.data = data;
    this.width = width;
    this.height = height;
  }
}

// Mock scrollIntoView which isn't implemented in jsdom
Element.prototype.scrollIntoView = vi.fn();

// Mock canvas getContext for jsdom
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  putImageData: vi.fn(),
  getImageData: vi.fn(),
  drawImage: vi.fn(),
  clearRect: vi.fn(),
  fillRect: vi.fn(),
})) as unknown as typeof HTMLCanvasElement.prototype.getContext;

beforeAll(() => {
  if (typeof globalThis.ImageData === 'undefined') {
    globalThis.ImageData = MockImageData as unknown as typeof ImageData;
  }
});

// Helper to create mock position candidates
function createMockCandidate(
  position: string,
  videoTime: number,
  hasFrameImage = true
): PositionCandidate {
  return {
    position,
    timestamp: Date.now(),
    videoTime,
    angles: { spine: 45, arm: 30 },
    score: 0.9,
    frameImage: hasFrameImage
      ? new MockImageData(new Uint8ClampedArray(4 * 10 * 10), 10, 10) as unknown as ImageData
      : undefined,
  };
}

// Helper to create repThumbnails Map
function createRepThumbnails(
  repCount: number,
  phases: string[] = ['top', 'connect', 'bottom', 'release'],
  hasFrameImages = true
): Map<number, Map<string, PositionCandidate>> {
  const map = new Map<number, Map<string, PositionCandidate>>();
  for (let rep = 1; rep <= repCount; rep++) {
    const positions = new Map<string, PositionCandidate>();
    phases.forEach((phase, idx) => {
      positions.set(
        phase,
        createMockCandidate(phase, rep * 2 + idx * 0.5, hasFrameImages)
      );
    });
    map.set(rep, positions);
  }
  return map;
}

describe('RepGalleryWidget', () => {
  afterEach(() => {
    cleanup();
  });

  describe('Empty States', () => {
    it('shows "Complete a rep" message when repCount is 0', () => {
      render(
        <RepGalleryWidget
          repCount={0}
          repThumbnails={new Map()}
          currentRepIndex={0}
          currentPhases={['top', 'connect', 'bottom', 'release']}
          focusedPhase={null}
          onPhaseClick={vi.fn()}
          onThumbnailClick={vi.fn()}
        />
      );
      expect(screen.getByText('Complete a rep to see checkpoints')).toBeInTheDocument();
    });

    it('shows "Loading rep data" message when repCount > 0 but no thumbnails', () => {
      render(
        <RepGalleryWidget
          repCount={1}
          repThumbnails={new Map()}
          currentRepIndex={0}
          currentPhases={['top', 'connect', 'bottom', 'release']}
          focusedPhase={null}
          onPhaseClick={vi.fn()}
          onThumbnailClick={vi.fn()}
        />
      );
      expect(screen.getByText('Loading rep data...')).toBeInTheDocument();
    });
  });

  describe('Header Rendering', () => {
    it('renders phase headers for all phases', () => {
      const phases = ['top', 'connect', 'bottom', 'release'];
      render(
        <RepGalleryWidget
          repCount={1}
          repThumbnails={createRepThumbnails(1, phases)}
          currentRepIndex={0}
          currentPhases={phases}
          focusedPhase={null}
          onPhaseClick={vi.fn()}
          onThumbnailClick={vi.fn()}
        />
      );

      expect(screen.getByText('Top')).toBeInTheDocument();
      expect(screen.getByText('Connect')).toBeInTheDocument();
      expect(screen.getByText('Bottom')).toBeInTheDocument();
      expect(screen.getByText('Release')).toBeInTheDocument();
    });

    it('renders pistol squat phase headers correctly', () => {
      const phases = ['standing', 'descending', 'bottom', 'ascending'];
      render(
        <RepGalleryWidget
          repCount={1}
          repThumbnails={createRepThumbnails(1, phases)}
          currentRepIndex={0}
          currentPhases={phases}
          focusedPhase={null}
          onPhaseClick={vi.fn()}
          onThumbnailClick={vi.fn()}
        />
      );

      expect(screen.getByText('Standing')).toBeInTheDocument();
      expect(screen.getByText('Descending')).toBeInTheDocument();
      expect(screen.getByText('Ascending')).toBeInTheDocument();
    });

    it('calls onPhaseClick when header button is clicked', () => {
      const onPhaseClick = vi.fn();
      render(
        <RepGalleryWidget
          repCount={1}
          repThumbnails={createRepThumbnails(1)}
          currentRepIndex={0}
          currentPhases={['top', 'connect', 'bottom', 'release']}
          focusedPhase={null}
          onPhaseClick={onPhaseClick}
          onThumbnailClick={vi.fn()}
        />
      );

      fireEvent.click(screen.getByText('Top'));
      expect(onPhaseClick).toHaveBeenCalledWith('top');
    });
  });

  describe('Row Rendering', () => {
    it('renders one row per rep', () => {
      render(
        <RepGalleryWidget
          repCount={3}
          repThumbnails={createRepThumbnails(3)}
          currentRepIndex={0}
          currentPhases={['top', 'connect', 'bottom', 'release']}
          focusedPhase={null}
          onPhaseClick={vi.fn()}
          onThumbnailClick={vi.fn()}
        />
      );

      // Rep number labels
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('marks current rep row with --current class', () => {
      const { container } = render(
        <RepGalleryWidget
          repCount={3}
          repThumbnails={createRepThumbnails(3)}
          currentRepIndex={1}
          currentPhases={['top', 'connect', 'bottom', 'release']}
          focusedPhase={null}
          onPhaseClick={vi.fn()}
          onThumbnailClick={vi.fn()}
        />
      );

      const currentRow = container.querySelector('.rep-gallery-row--current');
      expect(currentRow).toBeInTheDocument();
      // Rep 2 (index 1) should be current
      expect(currentRow?.querySelector('.rep-gallery-row-rep')?.textContent).toBe('2');
    });
  });

  describe('Thumbnail Cells', () => {
    it('renders canvas for cells with frameImage', () => {
      const { container } = render(
        <RepGalleryWidget
          repCount={1}
          repThumbnails={createRepThumbnails(1, ['top'], true)}
          currentRepIndex={0}
          currentPhases={['top']}
          focusedPhase={null}
          onPhaseClick={vi.fn()}
          onThumbnailClick={vi.fn()}
        />
      );

      const canvas = container.querySelector('canvas.rep-gallery-canvas');
      expect(canvas).toBeInTheDocument();
    });

    it('renders placeholder for cells without frameImage', () => {
      const { container } = render(
        <RepGalleryWidget
          repCount={1}
          repThumbnails={createRepThumbnails(1, ['top'], false)}
          currentRepIndex={0}
          currentPhases={['top']}
          focusedPhase={null}
          onPhaseClick={vi.fn()}
          onThumbnailClick={vi.fn()}
        />
      );

      expect(container.querySelector('.rep-gallery-cell-empty')).toBeInTheDocument();
      expect(screen.getByText('—')).toBeInTheDocument();
    });

    it('calls onThumbnailClick when canvas is clicked', () => {
      const onThumbnailClick = vi.fn();
      const { container } = render(
        <RepGalleryWidget
          repCount={1}
          repThumbnails={createRepThumbnails(1, ['top'])}
          currentRepIndex={0}
          currentPhases={['top']}
          focusedPhase={null}
          onPhaseClick={vi.fn()}
          onThumbnailClick={onThumbnailClick}
        />
      );

      const canvas = container.querySelector('canvas.rep-gallery-canvas');
      expect(canvas).toBeInTheDocument();
      fireEvent.click(canvas!);

      // Should be called with videoTime and repNum
      expect(onThumbnailClick).toHaveBeenCalledWith(expect.any(Number), 1);
    });

    it('calls onPhaseClick when canvas is double-tapped', () => {
      const onPhaseClick = vi.fn();
      const onThumbnailClick = vi.fn();
      const { container } = render(
        <RepGalleryWidget
          repCount={1}
          repThumbnails={createRepThumbnails(1, ['top'])}
          currentRepIndex={0}
          currentPhases={['top']}
          focusedPhase={null}
          onPhaseClick={onPhaseClick}
          onThumbnailClick={onThumbnailClick}
        />
      );

      const canvas = container.querySelector('canvas.rep-gallery-canvas');
      expect(canvas).toBeInTheDocument();

      // Simulate double-tap by clicking twice quickly
      // First tap seeks (calls onThumbnailClick), second tap focuses (calls onPhaseClick)
      fireEvent.click(canvas!);
      fireEvent.click(canvas!);

      // First tap triggers seek
      expect(onThumbnailClick).toHaveBeenCalledTimes(1);
      // Second tap (within 300ms) triggers phase focus, not another seek
      expect(onPhaseClick).toHaveBeenCalledWith('top');
      expect(onPhaseClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('Focus State', () => {
    it('adds focused class to header when focusedPhase is set', () => {
      const { container } = render(
        <RepGalleryWidget
          repCount={1}
          repThumbnails={createRepThumbnails(1)}
          currentRepIndex={0}
          currentPhases={['top', 'connect', 'bottom', 'release']}
          focusedPhase="top"
          onPhaseClick={vi.fn()}
          onThumbnailClick={vi.fn()}
        />
      );

      const header = container.querySelector('.rep-gallery-header--focused');
      expect(header).toBeInTheDocument();
    });

    it('adds focused class to focused phase header button', () => {
      const { container } = render(
        <RepGalleryWidget
          repCount={1}
          repThumbnails={createRepThumbnails(1)}
          currentRepIndex={0}
          currentPhases={['top', 'connect', 'bottom', 'release']}
          focusedPhase="top"
          onPhaseClick={vi.fn()}
          onThumbnailClick={vi.fn()}
        />
      );

      const focusedButton = container.querySelector('.rep-gallery-header-phase--focused');
      expect(focusedButton).toBeInTheDocument();
      expect(focusedButton?.textContent).toBe('Top');
    });

    it('adds minimized class to non-focused phase headers', () => {
      const { container } = render(
        <RepGalleryWidget
          repCount={1}
          repThumbnails={createRepThumbnails(1)}
          currentRepIndex={0}
          currentPhases={['top', 'connect', 'bottom', 'release']}
          focusedPhase="top"
          onPhaseClick={vi.fn()}
          onThumbnailClick={vi.fn()}
        />
      );

      const minimizedButtons = container.querySelectorAll('.rep-gallery-header-phase--minimized');
      expect(minimizedButtons.length).toBe(3); // connect, bottom, release are minimized
    });

    it('adds focused class to focused cells', () => {
      const { container } = render(
        <RepGalleryWidget
          repCount={1}
          repThumbnails={createRepThumbnails(1)}
          currentRepIndex={0}
          currentPhases={['top', 'connect', 'bottom', 'release']}
          focusedPhase="top"
          onPhaseClick={vi.fn()}
          onThumbnailClick={vi.fn()}
        />
      );

      const focusedCell = container.querySelector('.rep-gallery-cell--focused');
      expect(focusedCell).toBeInTheDocument();
    });

    it('adds minimized class to non-focused cells', () => {
      const { container } = render(
        <RepGalleryWidget
          repCount={1}
          repThumbnails={createRepThumbnails(1)}
          currentRepIndex={0}
          currentPhases={['top', 'connect', 'bottom', 'release']}
          focusedPhase="top"
          onPhaseClick={vi.fn()}
          onThumbnailClick={vi.fn()}
        />
      );

      const minimizedCells = container.querySelectorAll('.rep-gallery-cell--minimized');
      expect(minimizedCells.length).toBe(3); // connect, bottom, release are minimized
    });
  });

  describe('Multiple Reps', () => {
    it('handles multiple reps correctly', () => {
      render(
        <RepGalleryWidget
          repCount={4}
          repThumbnails={createRepThumbnails(4)}
          currentRepIndex={2}
          currentPhases={['top', 'connect', 'bottom', 'release']}
          focusedPhase={null}
          onPhaseClick={vi.fn()}
          onThumbnailClick={vi.fn()}
        />
      );

      // All rep numbers should be visible
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('4')).toBeInTheDocument();
    });

    it('correctly identifies current rep among multiple', () => {
      const { container } = render(
        <RepGalleryWidget
          repCount={4}
          repThumbnails={createRepThumbnails(4)}
          currentRepIndex={2}
          currentPhases={['top', 'connect', 'bottom', 'release']}
          focusedPhase={null}
          onPhaseClick={vi.fn()}
          onThumbnailClick={vi.fn()}
        />
      );

      const currentRow = container.querySelector('.rep-gallery-row--current');
      expect(currentRow?.querySelector('.rep-gallery-row-rep')?.textContent).toBe('3');
    });
  });
});
