import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExerciseDetectionBadge } from './ExerciseDetectionBadge';

describe('ExerciseDetectionBadge', () => {
  afterEach(() => {
    cleanup();
  });

  it('returns null when exercise is unknown and confidence is 0', () => {
    const { container } = render(
      <ExerciseDetectionBadge
        detectedExercise="unknown"
        confidence={0}
        isLocked={false}
        onOverride={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('displays exercise name and icon for kettlebell swing', () => {
    render(
      <ExerciseDetectionBadge
        detectedExercise="kettlebell-swing"
        confidence={85}
        isLocked={true}
        onOverride={vi.fn()}
      />
    );
    expect(screen.getByText('Kettlebell Swing')).toBeInTheDocument();
    expect(screen.getByText('85%')).toBeInTheDocument();
  });

  it('displays exercise name and icon for pistol squat', () => {
    render(
      <ExerciseDetectionBadge
        detectedExercise="pistol-squat"
        confidence={75}
        isLocked={true}
        onOverride={vi.fn()}
      />
    );
    expect(screen.getByText('Pistol Squat')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('displays working side when provided', () => {
    render(
      <ExerciseDetectionBadge
        detectedExercise="pistol-squat"
        confidence={80}
        isLocked={true}
        onOverride={vi.fn()}
        workingSide="left"
      />
    );
    expect(screen.getByText('left leg')).toBeInTheDocument();
  });

  it('displays right leg when workingSide is right', () => {
    render(
      <ExerciseDetectionBadge
        detectedExercise="pistol-squat"
        confidence={80}
        isLocked={true}
        onOverride={vi.fn()}
        workingSide="right"
      />
    );
    expect(screen.getByText('right leg')).toBeInTheDocument();
  });

  it('does not display working side when null', () => {
    render(
      <ExerciseDetectionBadge
        detectedExercise="pistol-squat"
        confidence={80}
        isLocked={true}
        onOverride={vi.fn()}
        workingSide={null}
      />
    );
    expect(screen.queryByText(/leg$/)).toBeNull();
  });

  it('shows override buttons when locked', () => {
    render(
      <ExerciseDetectionBadge
        detectedExercise="kettlebell-swing"
        confidence={90}
        isLocked={true}
        onOverride={vi.fn()}
      />
    );
    // Should show both Kettlebell and Pistol buttons
    expect(screen.getByText('Kettlebell')).toBeInTheDocument();
    expect(screen.getByText('Pistol')).toBeInTheDocument();
  });

  it('calls onOverride when switching exercise', () => {
    const onOverride = vi.fn();
    render(
      <ExerciseDetectionBadge
        detectedExercise="kettlebell-swing"
        confidence={90}
        isLocked={true}
        onOverride={onOverride}
      />
    );

    // Click on Pistol button to switch
    fireEvent.click(screen.getByText('Pistol'));
    expect(onOverride).toHaveBeenCalledWith('pistol-squat');
  });

  it('does not call onOverride when clicking current exercise', () => {
    const onOverride = vi.fn();
    render(
      <ExerciseDetectionBadge
        detectedExercise="kettlebell-swing"
        confidence={90}
        isLocked={true}
        onOverride={onOverride}
      />
    );

    // Click on Kettlebell button (already selected)
    fireEvent.click(screen.getByText('Kettlebell'));
    expect(onOverride).not.toHaveBeenCalled();
  });

  it('does not show override buttons when not locked', () => {
    render(
      <ExerciseDetectionBadge
        detectedExercise="kettlebell-swing"
        confidence={50}
        isLocked={false}
        onOverride={vi.fn()}
      />
    );
    // Should not show override buttons
    expect(screen.queryByText('Pistol')).toBeNull();
  });
});
