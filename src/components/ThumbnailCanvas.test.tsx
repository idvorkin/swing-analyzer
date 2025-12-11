import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { PositionCandidate } from '../types/exercise';
import { ThumbnailCanvas } from './ThumbnailCanvas';

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

beforeAll(() => {
  if (typeof globalThis.ImageData === 'undefined') {
    globalThis.ImageData = MockImageData as unknown as typeof ImageData;
  }
});

// Helper to create mock position candidates
function createMockCandidate(
  options: {
    position?: string;
    videoTime?: number;
    hasFrameImage?: boolean;
    width?: number;
    height?: number;
  } = {}
): PositionCandidate {
  const {
    position = 'top',
    videoTime = 1.5,
    hasFrameImage = true,
    width = 10,
    height = 10,
  } = options;

  return {
    position,
    timestamp: Date.now(),
    videoTime,
    angles: { spine: 45, arm: 30 },
    score: 0.9,
    frameImage: hasFrameImage
      ? (new MockImageData(
          new Uint8ClampedArray(4 * width * height),
          width,
          height
        ) as unknown as ImageData)
      : undefined,
  };
}

describe('ThumbnailCanvas', () => {
  let mockPutImageData: ReturnType<typeof vi.fn>;
  let mockGetContext: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockPutImageData = vi.fn();
    mockGetContext = vi.fn(() => ({
      putImageData: mockPutImageData,
      getImageData: vi.fn(),
      drawImage: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
    }));
    HTMLCanvasElement.prototype.getContext =
      mockGetContext as unknown as typeof HTMLCanvasElement.prototype.getContext;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe('Canvas Rendering', () => {
    it('renders canvas element when frameImage exists', () => {
      const { container } = render(
        <ThumbnailCanvas
          candidate={createMockCandidate()}
          phase="top"
          size="small"
          onClick={vi.fn()}
        />
      );

      const canvas = container.querySelector('canvas.rep-gallery-canvas');
      expect(canvas).toBeInTheDocument();
    });

    it('calls putImageData with frameImage data', () => {
      const candidate = createMockCandidate();
      render(
        <ThumbnailCanvas
          candidate={candidate}
          phase="top"
          size="small"
          onClick={vi.fn()}
        />
      );

      expect(mockGetContext).toHaveBeenCalledWith('2d');
      expect(mockPutImageData).toHaveBeenCalledWith(candidate.frameImage, 0, 0);
    });

    it('updates canvas dimensions when frameImage dimensions differ', () => {
      const candidate = createMockCandidate({ width: 100, height: 80 });
      const { container } = render(
        <ThumbnailCanvas
          candidate={candidate}
          phase="top"
          size="small"
          onClick={vi.fn()}
        />
      );

      const canvas = container.querySelector('canvas') as HTMLCanvasElement;
      expect(canvas.width).toBe(100);
      expect(canvas.height).toBe(80);
    });

    it('handles putImageData errors gracefully', () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      mockPutImageData.mockImplementation(() => {
        throw new Error('Canvas rendering failed');
      });

      // Should not throw
      expect(() => {
        render(
          <ThumbnailCanvas
            candidate={createMockCandidate()}
            phase="top"
            size="small"
            onClick={vi.fn()}
          />
        );
      }).not.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to render thumbnail:',
        expect.any(Error)
      );
    });

    it('does not render when frameImage is missing', () => {
      const candidate = createMockCandidate({ hasFrameImage: false });
      render(
        <ThumbnailCanvas
          candidate={candidate}
          phase="top"
          size="small"
          onClick={vi.fn()}
        />
      );

      // getContext should be called but putImageData should not
      expect(mockPutImageData).not.toHaveBeenCalled();
    });

    it('handles null canvas context gracefully', () => {
      mockGetContext.mockReturnValue(null);

      // Should not throw
      expect(() => {
        render(
          <ThumbnailCanvas
            candidate={createMockCandidate()}
            phase="top"
            size="small"
            onClick={vi.fn()}
          />
        );
      }).not.toThrow();

      expect(mockPutImageData).not.toHaveBeenCalled();
    });
  });

  describe('Double-tap Detection', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('calls onClick on single tap', () => {
      const onClick = vi.fn();
      const onDoubleTap = vi.fn();
      const { container } = render(
        <ThumbnailCanvas
          candidate={createMockCandidate()}
          phase="top"
          size="small"
          onClick={onClick}
          onDoubleTap={onDoubleTap}
        />
      );

      const canvas = container.querySelector('canvas') as HTMLCanvasElement;
      fireEvent.click(canvas);

      expect(onClick).toHaveBeenCalledTimes(1);
      expect(onDoubleTap).not.toHaveBeenCalled();
    });

    it('calls onDoubleTap when two clicks within 300ms', () => {
      const onClick = vi.fn();
      const onDoubleTap = vi.fn();
      const { container } = render(
        <ThumbnailCanvas
          candidate={createMockCandidate()}
          phase="top"
          size="small"
          onClick={onClick}
          onDoubleTap={onDoubleTap}
        />
      );

      const canvas = container.querySelector('canvas') as HTMLCanvasElement;

      // First click at time 0
      fireEvent.click(canvas);
      expect(onClick).toHaveBeenCalledTimes(1);

      // Advance by 200ms (within threshold)
      vi.advanceTimersByTime(200);

      // Second click - should trigger double tap
      fireEvent.click(canvas);
      expect(onDoubleTap).toHaveBeenCalledTimes(1);
      // onClick should NOT be called again for double-tap
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('calls onClick twice when clicks are > 300ms apart', () => {
      const onClick = vi.fn();
      const onDoubleTap = vi.fn();
      const { container } = render(
        <ThumbnailCanvas
          candidate={createMockCandidate()}
          phase="top"
          size="small"
          onClick={onClick}
          onDoubleTap={onDoubleTap}
        />
      );

      const canvas = container.querySelector('canvas') as HTMLCanvasElement;

      // First click
      fireEvent.click(canvas);
      expect(onClick).toHaveBeenCalledTimes(1);

      // Advance by 350ms (beyond threshold)
      vi.advanceTimersByTime(350);

      // Second click - should be new single tap
      fireEvent.click(canvas);
      expect(onClick).toHaveBeenCalledTimes(2);
      expect(onDoubleTap).not.toHaveBeenCalled();
    });

    it('handles exactly 300ms boundary as single taps', () => {
      const onClick = vi.fn();
      const onDoubleTap = vi.fn();
      const { container } = render(
        <ThumbnailCanvas
          candidate={createMockCandidate()}
          phase="top"
          size="small"
          onClick={onClick}
          onDoubleTap={onDoubleTap}
        />
      );

      const canvas = container.querySelector('canvas') as HTMLCanvasElement;

      // First click
      fireEvent.click(canvas);

      // Advance by exactly 300ms (at boundary - should NOT be double tap)
      vi.advanceTimersByTime(300);

      // Second click
      fireEvent.click(canvas);

      // Both should be single taps since delay is NOT < 300ms
      expect(onClick).toHaveBeenCalledTimes(2);
      expect(onDoubleTap).not.toHaveBeenCalled();
    });

    it('works without onDoubleTap prop (only onClick fires)', () => {
      const onClick = vi.fn();
      const { container } = render(
        <ThumbnailCanvas
          candidate={createMockCandidate()}
          phase="top"
          size="small"
          onClick={onClick}
          // No onDoubleTap provided
        />
      );

      const canvas = container.querySelector('canvas') as HTMLCanvasElement;

      // Two quick clicks
      fireEvent.click(canvas);
      vi.advanceTimersByTime(100);
      fireEvent.click(canvas);

      // Both should trigger onClick since no onDoubleTap handler
      expect(onClick).toHaveBeenCalledTimes(2);
    });
  });

  describe('Timestamp Display', () => {
    it('shows timestamp when showTimestamp=true and videoTime exists', () => {
      render(
        <ThumbnailCanvas
          candidate={createMockCandidate({ videoTime: 2.5 })}
          phase="top"
          size="small"
          onClick={vi.fn()}
          showTimestamp
        />
      );

      expect(screen.getByText('2.50s')).toBeInTheDocument();
    });

    it('hides timestamp when showTimestamp=false', () => {
      render(
        <ThumbnailCanvas
          candidate={createMockCandidate({ videoTime: 2.5 })}
          phase="top"
          size="small"
          onClick={vi.fn()}
          showTimestamp={false}
        />
      );

      expect(screen.queryByText('2.50s')).not.toBeInTheDocument();
    });

    it('hides timestamp when videoTime is undefined', () => {
      const candidate = createMockCandidate();
      candidate.videoTime = undefined;

      render(
        <ThumbnailCanvas
          candidate={candidate}
          phase="top"
          size="small"
          onClick={vi.fn()}
          showTimestamp
        />
      );

      expect(screen.queryByText(/\d+\.\d+s/)).not.toBeInTheDocument();
    });

    it('formats timestamp to 2 decimal places', () => {
      render(
        <ThumbnailCanvas
          candidate={createMockCandidate({ videoTime: 3.14567 })}
          phase="top"
          size="small"
          onClick={vi.fn()}
          showTimestamp
        />
      );

      expect(screen.getByText('3.15s')).toBeInTheDocument();
    });
  });

  describe('CSS Classes', () => {
    it('applies size variant class', () => {
      const { container, rerender } = render(
        <ThumbnailCanvas
          candidate={createMockCandidate()}
          phase="top"
          size="small"
          onClick={vi.fn()}
        />
      );

      expect(
        container.querySelector('.thumbnail-canvas--small')
      ).toBeInTheDocument();

      rerender(
        <ThumbnailCanvas
          candidate={createMockCandidate()}
          phase="top"
          size="large"
          onClick={vi.fn()}
        />
      );

      expect(
        container.querySelector('.thumbnail-canvas--large')
      ).toBeInTheDocument();

      rerender(
        <ThumbnailCanvas
          candidate={createMockCandidate()}
          phase="top"
          size="mini"
          onClick={vi.fn()}
        />
      );

      expect(
        container.querySelector('.thumbnail-canvas--mini')
      ).toBeInTheDocument();
    });

    it('applies focused class when isFocused=true', () => {
      const { container } = render(
        <ThumbnailCanvas
          candidate={createMockCandidate()}
          phase="top"
          size="small"
          onClick={vi.fn()}
          isFocused
        />
      );

      expect(
        container.querySelector('.thumbnail-canvas--focused')
      ).toBeInTheDocument();
    });

    it('applies minimized class when isMinimized=true', () => {
      const { container } = render(
        <ThumbnailCanvas
          candidate={createMockCandidate()}
          phase="top"
          size="small"
          onClick={vi.fn()}
          isMinimized
        />
      );

      expect(
        container.querySelector('.thumbnail-canvas--minimized')
      ).toBeInTheDocument();
    });

    it('uses custom className when provided', () => {
      const { container } = render(
        <ThumbnailCanvas
          candidate={createMockCandidate()}
          phase="top"
          size="small"
          onClick={vi.fn()}
          className="custom-thumbnail"
        />
      );

      expect(container.querySelector('.custom-thumbnail')).toBeInTheDocument();
      // Should still have size modifier
      expect(
        container.querySelector('.thumbnail-canvas--small')
      ).toBeInTheDocument();
    });
  });

  describe('Title/Tooltip', () => {
    it('shows phase label with timestamp in title', () => {
      const { container } = render(
        <ThumbnailCanvas
          candidate={createMockCandidate({ videoTime: 1.5 })}
          phase="top"
          size="small"
          onClick={vi.fn()}
        />
      );

      const wrapper = container.querySelector('[title]');
      expect(wrapper).toHaveAttribute('title', 'Top at 1.50s');
    });

    it('shows only phase label when videoTime is undefined', () => {
      const candidate = createMockCandidate();
      candidate.videoTime = undefined;

      const { container } = render(
        <ThumbnailCanvas
          candidate={candidate}
          phase="top"
          size="small"
          onClick={vi.fn()}
        />
      );

      const wrapper = container.querySelector('[title]');
      expect(wrapper).toHaveAttribute('title', 'Top');
    });

    it('falls back to raw phase name for unknown phases', () => {
      const { container } = render(
        <ThumbnailCanvas
          candidate={createMockCandidate({ videoTime: 1.5 })}
          phase="unknown_phase"
          size="small"
          onClick={vi.fn()}
        />
      );

      const wrapper = container.querySelector('[title]');
      expect(wrapper).toHaveAttribute('title', 'unknown_phase at 1.50s');
    });
  });

  describe('Cursor Style', () => {
    it('shows pointer cursor when videoTime exists', () => {
      const { container } = render(
        <ThumbnailCanvas
          candidate={createMockCandidate({ videoTime: 1.5 })}
          phase="top"
          size="small"
          onClick={vi.fn()}
        />
      );

      const canvas = container.querySelector('canvas');
      expect(canvas).toHaveStyle({ cursor: 'pointer' });
    });

    it('shows default cursor when videoTime is undefined', () => {
      const candidate = createMockCandidate();
      candidate.videoTime = undefined;

      const { container } = render(
        <ThumbnailCanvas
          candidate={candidate}
          phase="top"
          size="small"
          onClick={vi.fn()}
        />
      );

      const canvas = container.querySelector('canvas');
      expect(canvas).toHaveStyle({ cursor: 'default' });
    });
  });
});
