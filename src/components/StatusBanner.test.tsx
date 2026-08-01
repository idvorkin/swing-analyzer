import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppError } from '../hooks/useExerciseAnalyzer';
import StatusBanner from './StatusBanner';

const mockContext = {
  appError: null as AppError | null,
  dismissError: vi.fn(),
};
vi.mock('../contexts/ExerciseAnalyzerContext', () => ({
  useExerciseAnalyzerContext: () => mockContext,
}));

describe('StatusBanner', () => {
  beforeEach(() => {
    mockContext.appError = null;
    mockContext.dismissError = vi.fn();
  });

  it('renders nothing when there is no error', () => {
    const { container } = render(<StatusBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows an error with role=alert and an Error label', () => {
    mockContext.appError = {
      id: 1,
      message: 'Video format not supported.',
      severity: 'error',
    };
    render(<StatusBanner />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Error: Video format not supported.'
    );
  });

  it('shows a warning without the Error label, with warning styling, as a polite live region', () => {
    mockContext.appError = {
      id: 2,
      message: 'Analysis could not be saved — storage is full.',
      severity: 'warning',
    };
    render(<StatusBanner />);
    // role=status (polite), not role=alert (assertive): warnings must not
    // interrupt screen-reader output mid-sentence.
    const banner = screen.getByRole('status');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(banner).toHaveTextContent(
      'Analysis could not be saved — storage is full.'
    );
    expect(banner).not.toHaveTextContent('Error:');
    expect(banner.className).toContain('status-banner-warning');
  });

  it('dismiss button delegates to dismissError', async () => {
    mockContext.appError = { id: 3, message: 'first', severity: 'error' };
    render(<StatusBanner />);
    await userEvent.click(screen.getByLabelText('Dismiss'));
    expect(mockContext.dismissError).toHaveBeenCalledTimes(1);
  });

  it('re-renders for a new error after a dismissal cleared the previous one', () => {
    mockContext.appError = { id: 4, message: 'first', severity: 'error' };
    const { rerender } = render(<StatusBanner />);
    // Dismissal clears appError in the hook; the banner is stateless.
    mockContext.appError = null;
    rerender(<StatusBanner />);
    expect(screen.queryByRole('alert')).toBeNull();

    // A recurrence of the IDENTICAL message gets a fresh id and must re-show.
    mockContext.appError = { id: 5, message: 'first', severity: 'error' };
    rerender(<StatusBanner />);
    expect(screen.getByRole('alert')).toHaveTextContent('first');
  });
});
