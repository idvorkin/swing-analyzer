import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toggle } from './Toggle';

describe('Toggle', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders with unchecked state', () => {
    render(
      <Toggle checked={false} onChange={vi.fn()} aria-label="Test toggle" />
    );
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).not.toHaveClass('settings-toggle--active');
  });

  it('renders with checked state', () => {
    render(
      <Toggle checked={true} onChange={vi.fn()} aria-label="Test toggle" />
    );
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveClass('settings-toggle--active');
  });

  it('calls onChange when clicked', () => {
    const onChange = vi.fn();
    render(
      <Toggle checked={false} onChange={onChange} aria-label="Test toggle" />
    );

    fireEvent.click(screen.getByRole('button'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('has correct aria-label', () => {
    render(
      <Toggle checked={false} onChange={vi.fn()} aria-label="Test toggle" />
    );
    expect(screen.getByLabelText('Test toggle')).toBeInTheDocument();
  });
});
