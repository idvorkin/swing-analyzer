import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import VideoSectionV2 from './VideoSectionV2';

// Mock the SwingAnalyzerContext
const mockTogglePlayPause = vi.fn();
const mockClearPositionLabel = vi.fn();
const mockHandleVideoUpload = vi.fn();
const mockLoadHardcodedVideo = vi.fn();
const mockNextFrame = vi.fn();
const mockPreviousFrame = vi.fn();
const mockNavigateToPreviousRep = vi.fn();
const mockNavigateToNextRep = vi.fn();
const mockNavigateToPreviousCheckpoint = vi.fn();
const mockNavigateToNextCheckpoint = vi.fn();
const mockToggleCrop = vi.fn();

// Partial mock - only includes fields used by VideoSectionV2
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createMockContext = (overrides = {}): any => ({
  videoRef: { current: document.createElement('video') },
  canvasRef: { current: document.createElement('canvas') },
  fileInputRef: { current: document.createElement('input') },
  appState: { isModelLoaded: true, currentRepIndex: 0 },
  isPlaying: false,
  repCount: 0,
  handleVideoUpload: mockHandleVideoUpload,
  loadHardcodedVideo: mockLoadHardcodedVideo,
  togglePlayPause: mockTogglePlayPause,
  nextFrame: mockNextFrame,
  previousFrame: mockPreviousFrame,
  getVideoContainerClass: () => '',
  navigateToPreviousRep: mockNavigateToPreviousRep,
  navigateToNextRep: mockNavigateToNextRep,
  navigateToPreviousCheckpoint: mockNavigateToPreviousCheckpoint,
  navigateToNextCheckpoint: mockNavigateToNextCheckpoint,
  clearPositionLabel: mockClearPositionLabel,
  repThumbnails: new Map(),
  extractionProgress: null,
  isExtracting: false,
  currentVideoFile: null,
  hasCropRegion: false,
  isCropEnabled: false,
  toggleCrop: mockToggleCrop,
  spineAngle: 0,
  armToSpineAngle: 0,
  hasPosesForCurrentFrame: false,
  currentPosition: null,
  ...overrides,
});

vi.mock('../contexts/SwingAnalyzerContext', () => ({
  useSwingAnalyzerContext: vi.fn(() => createMockContext()),
}));

// Import the mock to access it
import { useSwingAnalyzerContext } from '../contexts/SwingAnalyzerContext';
const mockUseSwingAnalyzerContext = vi.mocked(useSwingAnalyzerContext);

describe('VideoSectionV2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSwingAnalyzerContext.mockReturnValue(createMockContext());
  });

  afterEach(() => {
    cleanup();
  });

  describe('Structure', () => {
    it('renders video element', () => {
      render(<VideoSectionV2 />);
      // Video elements don't have an implicit role, query by id
      expect(document.getElementById('video')).toBeInTheDocument();
      expect(document.getElementById('video')?.tagName).toBe('VIDEO');
    });

    it('renders canvas element for skeleton overlay', () => {
      render(<VideoSectionV2 />);
      const canvas = document.getElementById('output-canvas');
      expect(canvas).toBeInTheDocument();
      expect(canvas?.tagName).toBe('CANVAS');
    });

    it('canvas is positioned inside video-container', () => {
      render(<VideoSectionV2 />);
      const container = document.querySelector('.video-container');
      const canvas = document.getElementById('output-canvas');
      expect(container).toContainElement(canvas);
    });

    it('renders source picker buttons when no video', () => {
      render(<VideoSectionV2 />);
      // Source picker shows Camera Roll and Sample buttons
      expect(document.querySelector('.source-picker-btn.camera-roll-btn')).toBeInTheDocument();
      expect(document.querySelector('.source-picker-btn.sample-btn')).toBeInTheDocument();
    });

    it('renders video control buttons', () => {
      render(<VideoSectionV2 />);
      expect(screen.getByRole('button', { name: /play/i })).toBeInTheDocument();
    });
  });

  describe('HUD Overlay', () => {
    it('does not show HUD when no video is loaded', () => {
      mockUseSwingAnalyzerContext.mockReturnValue(createMockContext({
        currentVideoFile: null,
      }));
      render(<VideoSectionV2 />);
      expect(document.querySelector('.hud-overlay')).not.toBeInTheDocument();
    });

    it('shows HUD overlay when video is loaded', () => {
      mockUseSwingAnalyzerContext.mockReturnValue(createMockContext({
        currentVideoFile: new File([], 'test.mp4'),
      }));
      render(<VideoSectionV2 />);
      expect(document.querySelector('.hud-overlay')).toBeInTheDocument();
    });

    it('shows extraction progress when extracting', () => {
      mockUseSwingAnalyzerContext.mockReturnValue(createMockContext({
        currentVideoFile: new File([], 'test.mp4'),
        isExtracting: true,
        extractionProgress: { percentage: 50, currentFrame: 50, totalFrames: 100 },
      }));
      render(<VideoSectionV2 />);
      expect(screen.getByText('50%')).toBeInTheDocument();
      expect(screen.getByText('EXTRACTING')).toBeInTheDocument();
    });

    it('shows angles when poses exist for current frame', () => {
      mockUseSwingAnalyzerContext.mockReturnValue(createMockContext({
        currentVideoFile: new File([], 'test.mp4'),
        hasPosesForCurrentFrame: true,
        spineAngle: 45,
        armToSpineAngle: 120,
        repCount: 2,
        appState: { isModelLoaded: true, currentRepIndex: 0 },
      }));
      render(<VideoSectionV2 />);
      expect(screen.getByText('45°')).toBeInTheDocument();
      expect(screen.getByText('120°')).toBeInTheDocument();
      expect(screen.getByText('1/2')).toBeInTheDocument();
    });

    it('shows position label when navigating checkpoints', () => {
      mockUseSwingAnalyzerContext.mockReturnValue(createMockContext({
        currentVideoFile: new File([], 'test.mp4'),
        hasPosesForCurrentFrame: true,
        currentPosition: 'bottom',
      }));
      render(<VideoSectionV2 />);
      expect(screen.getByText('Bottom')).toBeInTheDocument();
    });
  });

  describe('Double-tap to Play/Pause', () => {
    it('does not toggle on single tap', () => {
      render(<VideoSectionV2 />);
      const container = document.querySelector('.video-container');

      fireEvent.click(container!);
      expect(mockTogglePlayPause).not.toHaveBeenCalled();
    });

    it('toggles play/pause on double-tap', () => {
      vi.useFakeTimers();
      render(<VideoSectionV2 />);
      const container = document.querySelector('.video-container');

      // First tap
      fireEvent.click(container!);
      // Second tap within 300ms
      vi.advanceTimersByTime(100);
      fireEvent.click(container!);

      expect(mockClearPositionLabel).toHaveBeenCalled();
      expect(mockTogglePlayPause).toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('does not toggle if second tap is too slow', () => {
      vi.useFakeTimers();
      render(<VideoSectionV2 />);
      const container = document.querySelector('.video-container');

      // First tap
      fireEvent.click(container!);
      // Wait too long
      vi.advanceTimersByTime(500);
      // Second tap
      fireEvent.click(container!);

      expect(mockTogglePlayPause).not.toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('shows play/pause overlay feedback on double-tap', async () => {
      vi.useFakeTimers();
      render(<VideoSectionV2 />);
      const container = document.querySelector('.video-container');

      // Double-tap
      fireEvent.click(container!);
      act(() => { vi.advanceTimersByTime(100); });
      fireEvent.click(container!);

      // Overlay should appear
      expect(document.querySelector('.video-tap-overlay')).toBeInTheDocument();

      // Overlay should disappear after 500ms
      act(() => { vi.advanceTimersByTime(600); });
      expect(document.querySelector('.video-tap-overlay')).not.toBeInTheDocument();
      vi.useRealTimers();
    });
  });

  describe('Button States', () => {
    it('disables play button when model not loaded', () => {
      mockUseSwingAnalyzerContext.mockReturnValue(createMockContext({
        appState: { isModelLoaded: false, currentRepIndex: 0 },
      }));
      render(<VideoSectionV2 />);
      expect(screen.getByRole('button', { name: /play/i })).toBeDisabled();
    });

    it('disables play button when no video loaded', () => {
      mockUseSwingAnalyzerContext.mockReturnValue(createMockContext({
        currentVideoFile: null,
      }));
      render(<VideoSectionV2 />);
      expect(screen.getByRole('button', { name: /play/i })).toBeDisabled();
    });

    it('enables play button when model loaded and video present', () => {
      mockUseSwingAnalyzerContext.mockReturnValue(createMockContext({
        appState: { isModelLoaded: true, currentRepIndex: 0 },
        currentVideoFile: new File([], 'test.mp4'),
      }));
      render(<VideoSectionV2 />);
      expect(screen.getByRole('button', { name: /play/i })).not.toBeDisabled();
    });

    it('hides rep-nav-strip when no reps', () => {
      mockUseSwingAnalyzerContext.mockReturnValue(createMockContext({
        appState: { isModelLoaded: true, currentRepIndex: 0 },
        currentVideoFile: new File([], 'test.mp4'),
        repCount: 0,
      }));
      render(<VideoSectionV2 />);
      expect(document.querySelector('.rep-nav-strip')).not.toBeInTheDocument();
    });
  });

  describe('Filmstrip', () => {
    it('shows empty message when no reps', () => {
      mockUseSwingAnalyzerContext.mockReturnValue(createMockContext({
        repCount: 0,
        repThumbnails: new Map(),
      }));
      render(<VideoSectionV2 />);
      expect(screen.getByText('Complete a rep to see checkpoints')).toBeInTheDocument();
    });

    it('shows rep navigation when reps exist', () => {
      const thumbnails = new Map();
      thumbnails.set(1, new Map([['top', { videoTime: 1.0 }]]));

      mockUseSwingAnalyzerContext.mockReturnValue(createMockContext({
        repCount: 2,
        repThumbnails: thumbnails,
        appState: { isModelLoaded: true, currentRepIndex: 0 },
        currentVideoFile: new File([], 'test.mp4'),
      }));
      render(<VideoSectionV2 />);
      expect(screen.getByText('Rep 1/2')).toBeInTheDocument();
    });
  });

  describe('Crop Toggle', () => {
    it('does not show crop button when no crop region', () => {
      mockUseSwingAnalyzerContext.mockReturnValue(createMockContext({
        hasCropRegion: false,
      }));
      render(<VideoSectionV2 />);
      expect(document.getElementById('crop-btn')).not.toBeInTheDocument();
    });

    it('shows crop button when crop region exists', () => {
      mockUseSwingAnalyzerContext.mockReturnValue(createMockContext({
        hasCropRegion: true,
        currentVideoFile: new File([], 'test.mp4'),
        appState: { isModelLoaded: true, currentRepIndex: 0 },
      }));
      render(<VideoSectionV2 />);
      expect(document.getElementById('crop-btn')).toBeInTheDocument();
    });
  });

  describe('Source Picker', () => {
    it('shows source picker when no video loaded', () => {
      mockUseSwingAnalyzerContext.mockReturnValue(createMockContext({
        currentVideoFile: null,
      }));
      render(<VideoSectionV2 />);
      expect(document.querySelector('.source-picker-overlay')).toBeInTheDocument();
      expect(screen.getByText('Camera Roll')).toBeInTheDocument();
      expect(document.querySelector('.source-picker-btn.sample-btn')).toBeInTheDocument();
    });

    it('hides source picker when video is loaded', () => {
      mockUseSwingAnalyzerContext.mockReturnValue(createMockContext({
        currentVideoFile: new File([], 'test.mp4'),
      }));
      render(<VideoSectionV2 />);
      expect(document.querySelector('.source-picker-overlay')).not.toBeInTheDocument();
    });

    it('shows source picker when show-source-picker event is dispatched', () => {
      mockUseSwingAnalyzerContext.mockReturnValue(createMockContext({
        currentVideoFile: new File([], 'test.mp4'),
      }));
      render(<VideoSectionV2 />);

      // Initially hidden when video loaded
      expect(document.querySelector('.source-picker-overlay')).not.toBeInTheDocument();

      // Dispatch event to show picker
      act(() => {
        window.dispatchEvent(new CustomEvent('show-source-picker'));
      });

      // Now visible
      expect(document.querySelector('.source-picker-overlay')).toBeInTheDocument();
    });

    it('hides source picker when clicking outside buttons', () => {
      mockUseSwingAnalyzerContext.mockReturnValue(createMockContext({
        currentVideoFile: new File([], 'test.mp4'),
      }));
      render(<VideoSectionV2 />);

      // Show the picker
      act(() => {
        window.dispatchEvent(new CustomEvent('show-source-picker'));
      });
      expect(document.querySelector('.source-picker-overlay')).toBeInTheDocument();

      // Click on the overlay background (outside buttons)
      const overlay = document.querySelector('.source-picker-overlay');
      fireEvent.click(overlay!);

      // Should be hidden
      expect(document.querySelector('.source-picker-overlay')).not.toBeInTheDocument();
    });

    it('keeps source picker open when clicking on buttons container', () => {
      mockUseSwingAnalyzerContext.mockReturnValue(createMockContext({
        currentVideoFile: new File([], 'test.mp4'),
      }));
      render(<VideoSectionV2 />);

      // Show the picker
      act(() => {
        window.dispatchEvent(new CustomEvent('show-source-picker'));
      });

      // Click on the buttons container (not the overlay background)
      const buttonsContainer = document.querySelector('.source-picker-buttons');
      fireEvent.click(buttonsContainer!);

      // Should still be visible (stopPropagation)
      expect(document.querySelector('.source-picker-overlay')).toBeInTheDocument();
    });
  });
});
