import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActionButton } from './ActionButton';

describe('ActionButton', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders with children', () => {
    render(
      <ActionButton variant="blue" onClick={vi.fn()}>
        Test Button
      </ActionButton>
    );
    expect(screen.getByText('Test Button')).toBeInTheDocument();
  });

  it('applies correct variant class', () => {
    render(
      <ActionButton variant="red" onClick={vi.fn()}>
        Red Button
      </ActionButton>
    );
    const button = screen.getByRole('button');
    expect(button).toHaveClass('settings-btn--red');
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(
      <ActionButton variant="blue" onClick={onClick}>
        Click Me
      </ActionButton>
    );

    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled when disabled prop is true', () => {
    const onClick = vi.fn();
    render(
      <ActionButton variant="green" onClick={onClick} disabled={true}>
        Disabled Button
      </ActionButton>
    );

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();

    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
