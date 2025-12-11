import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useKeyboardNavigation } from './useKeyboardNavigation';

describe('useKeyboardNavigation', () => {
  let onNavigateToPreviousRepMock: ReturnType<typeof vi.fn>;
  let onNavigateToNextRepMock: ReturnType<typeof vi.fn>;
  let togglePlayPauseMock: ReturnType<typeof vi.fn>;
  let nextFrameMock: ReturnType<typeof vi.fn>;
  let previousFrameMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onNavigateToPreviousRepMock = vi.fn();
    onNavigateToNextRepMock = vi.fn();
    togglePlayPauseMock = vi.fn();
    nextFrameMock = vi.fn();
    previousFrameMock = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('rep navigation', () => {
    it('navigates to previous rep when not at start', () => {
      const { result } = renderHook(() =>
        useKeyboardNavigation({
          currentRepIndex: 2,
          repCount: 5,
          onNavigateToPreviousRep: onNavigateToPreviousRepMock,
          onNavigateToNextRep: onNavigateToNextRepMock,
          togglePlayPause: togglePlayPauseMock,
          nextFrame: nextFrameMock,
          previousFrame: previousFrameMock,
        })
      );

      result.current.navigateToPreviousRep();
      expect(onNavigateToPreviousRepMock).toHaveBeenCalledOnce();
    });

    it('does not navigate before first rep', () => {
      const { result } = renderHook(() =>
        useKeyboardNavigation({
          currentRepIndex: 0,
          repCount: 5,
          onNavigateToPreviousRep: onNavigateToPreviousRepMock,
          onNavigateToNextRep: onNavigateToNextRepMock,
          togglePlayPause: togglePlayPauseMock,
          nextFrame: nextFrameMock,
          previousFrame: previousFrameMock,
        })
      );

      result.current.navigateToPreviousRep();
      expect(onNavigateToPreviousRepMock).not.toHaveBeenCalled();
    });

    it('navigates to next rep when not at end', () => {
      const { result } = renderHook(() =>
        useKeyboardNavigation({
          currentRepIndex: 2,
          repCount: 5,
          onNavigateToPreviousRep: onNavigateToPreviousRepMock,
          onNavigateToNextRep: onNavigateToNextRepMock,
          togglePlayPause: togglePlayPauseMock,
          nextFrame: nextFrameMock,
          previousFrame: previousFrameMock,
        })
      );

      result.current.navigateToNextRep();
      expect(onNavigateToNextRepMock).toHaveBeenCalledOnce();
    });

    it('does not navigate past last rep', () => {
      const { result } = renderHook(() =>
        useKeyboardNavigation({
          currentRepIndex: 4,
          repCount: 5,
          onNavigateToPreviousRep: onNavigateToPreviousRepMock,
          onNavigateToNextRep: onNavigateToNextRepMock,
          togglePlayPause: togglePlayPauseMock,
          nextFrame: nextFrameMock,
          previousFrame: previousFrameMock,
        })
      );

      result.current.navigateToNextRep();
      expect(onNavigateToNextRepMock).not.toHaveBeenCalled();
    });

    it('handles single rep (no navigation possible)', () => {
      const { result } = renderHook(() =>
        useKeyboardNavigation({
          currentRepIndex: 0,
          repCount: 1,
          onNavigateToPreviousRep: onNavigateToPreviousRepMock,
          onNavigateToNextRep: onNavigateToNextRepMock,
          togglePlayPause: togglePlayPauseMock,
          nextFrame: nextFrameMock,
          previousFrame: previousFrameMock,
        })
      );

      result.current.navigateToPreviousRep();
      result.current.navigateToNextRep();
      expect(onNavigateToPreviousRepMock).not.toHaveBeenCalled();
      expect(onNavigateToNextRepMock).not.toHaveBeenCalled();
    });

    it('handles zero reps', () => {
      const { result } = renderHook(() =>
        useKeyboardNavigation({
          currentRepIndex: 0,
          repCount: 0,
          onNavigateToPreviousRep: onNavigateToPreviousRepMock,
          onNavigateToNextRep: onNavigateToNextRepMock,
          togglePlayPause: togglePlayPauseMock,
          nextFrame: nextFrameMock,
          previousFrame: previousFrameMock,
        })
      );

      result.current.navigateToPreviousRep();
      result.current.navigateToNextRep();
      expect(onNavigateToPreviousRepMock).not.toHaveBeenCalled();
      expect(onNavigateToNextRepMock).not.toHaveBeenCalled();
    });
  });

  describe('fullscreen state', () => {
    it('initializes with isFullscreen false', () => {
      const { result } = renderHook(() =>
        useKeyboardNavigation({
          currentRepIndex: 0,
          repCount: 5,
          onNavigateToPreviousRep: onNavigateToPreviousRepMock,
          onNavigateToNextRep: onNavigateToNextRepMock,
          togglePlayPause: togglePlayPauseMock,
          nextFrame: nextFrameMock,
          previousFrame: previousFrameMock,
        })
      );

      expect(result.current.isFullscreen).toBe(false);
    });

    it('updates isFullscreen on fullscreenchange event', () => {
      const { result, rerender } = renderHook(() =>
        useKeyboardNavigation({
          currentRepIndex: 0,
          repCount: 5,
          onNavigateToPreviousRep: onNavigateToPreviousRepMock,
          onNavigateToNextRep: onNavigateToNextRepMock,
          togglePlayPause: togglePlayPauseMock,
          nextFrame: nextFrameMock,
          previousFrame: previousFrameMock,
        })
      );

      // Simulate entering fullscreen
      act(() => {
        Object.defineProperty(document, 'fullscreenElement', {
          writable: true,
          configurable: true,
          value: document.createElement('div'),
        });
        document.dispatchEvent(new Event('fullscreenchange'));
        rerender();
      });

      expect(result.current.isFullscreen).toBe(true);

      // Simulate exiting fullscreen
      act(() => {
        Object.defineProperty(document, 'fullscreenElement', {
          writable: true,
          configurable: true,
          value: null,
        });
        document.dispatchEvent(new Event('fullscreenchange'));
        rerender();
      });

      expect(result.current.isFullscreen).toBe(false);
    });
  });

  describe('keyboard event handling', () => {
    it('calls togglePlayPause on Space key', () => {
      renderHook(() =>
        useKeyboardNavigation({
          currentRepIndex: 0,
          repCount: 5,
          onNavigateToPreviousRep: onNavigateToPreviousRepMock,
          onNavigateToNextRep: onNavigateToNextRepMock,
          togglePlayPause: togglePlayPauseMock,
          nextFrame: nextFrameMock,
          previousFrame: previousFrameMock,
        })
      );

      const event = new KeyboardEvent('keydown', { key: ' ' });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      document.dispatchEvent(event);

      expect(togglePlayPauseMock).toHaveBeenCalledOnce();
      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('calls nextFrame on period key', () => {
      renderHook(() =>
        useKeyboardNavigation({
          currentRepIndex: 0,
          repCount: 5,
          onNavigateToPreviousRep: onNavigateToPreviousRepMock,
          onNavigateToNextRep: onNavigateToNextRepMock,
          togglePlayPause: togglePlayPauseMock,
          nextFrame: nextFrameMock,
          previousFrame: previousFrameMock,
        })
      );

      const event = new KeyboardEvent('keydown', { key: '.' });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      document.dispatchEvent(event);

      expect(nextFrameMock).toHaveBeenCalledOnce();
      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('calls previousFrame on comma key', () => {
      renderHook(() =>
        useKeyboardNavigation({
          currentRepIndex: 0,
          repCount: 5,
          onNavigateToPreviousRep: onNavigateToPreviousRepMock,
          onNavigateToNextRep: onNavigateToNextRepMock,
          togglePlayPause: togglePlayPauseMock,
          nextFrame: nextFrameMock,
          previousFrame: previousFrameMock,
        })
      );

      const event = new KeyboardEvent('keydown', { key: ',' });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      document.dispatchEvent(event);

      expect(previousFrameMock).toHaveBeenCalledOnce();
      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('navigates to previous rep on ArrowLeft in fullscreen', () => {
      renderHook(() =>
        useKeyboardNavigation({
          currentRepIndex: 2,
          repCount: 5,
          onNavigateToPreviousRep: onNavigateToPreviousRepMock,
          onNavigateToNextRep: onNavigateToNextRepMock,
          togglePlayPause: togglePlayPauseMock,
          nextFrame: nextFrameMock,
          previousFrame: previousFrameMock,
        })
      );

      // Enter fullscreen
      Object.defineProperty(document, 'fullscreenElement', {
        writable: true,
        configurable: true,
        value: document.createElement('div'),
      });

      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowLeft' })
      );

      expect(onNavigateToPreviousRepMock).toHaveBeenCalledOnce();
    });

    it('navigates to next rep on ArrowRight in fullscreen', () => {
      renderHook(() =>
        useKeyboardNavigation({
          currentRepIndex: 2,
          repCount: 5,
          onNavigateToPreviousRep: onNavigateToPreviousRepMock,
          onNavigateToNextRep: onNavigateToNextRepMock,
          togglePlayPause: togglePlayPauseMock,
          nextFrame: nextFrameMock,
          previousFrame: previousFrameMock,
        })
      );

      // Enter fullscreen
      Object.defineProperty(document, 'fullscreenElement', {
        writable: true,
        configurable: true,
        value: document.createElement('div'),
      });

      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight' })
      );

      expect(onNavigateToNextRepMock).toHaveBeenCalledOnce();
    });

    it('does not navigate with arrow keys when not in fullscreen', () => {
      renderHook(() =>
        useKeyboardNavigation({
          currentRepIndex: 2,
          repCount: 5,
          onNavigateToPreviousRep: onNavigateToPreviousRepMock,
          onNavigateToNextRep: onNavigateToNextRepMock,
          togglePlayPause: togglePlayPauseMock,
          nextFrame: nextFrameMock,
          previousFrame: previousFrameMock,
        })
      );

      // Ensure we're not in fullscreen
      Object.defineProperty(document, 'fullscreenElement', {
        writable: true,
        configurable: true,
        value: null,
      });

      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowLeft' })
      );
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight' })
      );

      expect(onNavigateToPreviousRepMock).not.toHaveBeenCalled();
      expect(onNavigateToNextRepMock).not.toHaveBeenCalled();
    });

    it('cleans up event listeners on unmount', () => {
      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

      const { unmount } = renderHook(() =>
        useKeyboardNavigation({
          currentRepIndex: 0,
          repCount: 5,
          onNavigateToPreviousRep: onNavigateToPreviousRepMock,
          onNavigateToNextRep: onNavigateToNextRepMock,
          togglePlayPause: togglePlayPauseMock,
          nextFrame: nextFrameMock,
          previousFrame: previousFrameMock,
        })
      );

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'keydown',
        expect.any(Function)
      );
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'fullscreenchange',
        expect.any(Function)
      );
    });
  });
});
