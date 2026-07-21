import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import StatusBanner from './StatusBanner';

const mockContext = { status: 'Ready' };
vi.mock('../contexts/ExerciseAnalyzerContext', () => ({
  useExerciseAnalyzerContext: () => mockContext,
}));

describe('StatusBanner', () => {
  it('renders nothing for non-error status', () => {
    mockContext.status = 'Ready';
    const { container } = render(<StatusBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows error status with role=alert', () => {
    mockContext.status = 'Error: Video format not supported.';
    render(<StatusBanner />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Video format not supported'
    );
  });

  it('dismisses on click and reappears for a NEW error', async () => {
    mockContext.status = 'Error: first';
    const { rerender } = render(<StatusBanner />);
    await userEvent.click(screen.getByLabelText('Dismiss'));
    expect(screen.queryByRole('alert')).toBeNull();

    mockContext.status = 'Error: second';
    rerender(<StatusBanner />);
    expect(screen.getByRole('alert')).toHaveTextContent('second');
  });
});
