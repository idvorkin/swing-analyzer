import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SettingsRow } from './SettingsRow';

describe('SettingsRow', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders title and subtitle', () => {
    render(
      <SettingsRow
        icon="🔔"
        title="Test Title"
        subtitle="Test subtitle"
        action={<button type="button">Action</button>}
      />
    );

    expect(screen.getByText('Test Title')).toBeInTheDocument();
    expect(screen.getByText('Test subtitle')).toBeInTheDocument();
  });

  it('renders icon', () => {
    render(
      <SettingsRow
        icon="🎯"
        title="Title"
        subtitle="Subtitle"
        action={<span>Action</span>}
      />
    );

    expect(screen.getByText('🎯')).toBeInTheDocument();
  });

  it('renders action element', () => {
    render(
      <SettingsRow
        icon="📱"
        title="Title"
        subtitle="Subtitle"
        action={<button type="button">Custom Action</button>}
      />
    );

    expect(screen.getByText('Custom Action')).toBeInTheDocument();
  });

  it('applies correct icon variant class', () => {
    const { container } = render(
      <SettingsRow
        icon="🔥"
        iconVariant="orange"
        title="Title"
        subtitle="Subtitle"
        action={<span>Action</span>}
      />
    );

    const iconDiv = container.querySelector('.settings-row-icon--orange');
    expect(iconDiv).toBeInTheDocument();
  });

  it('defaults to blue icon variant', () => {
    const { container } = render(
      <SettingsRow
        icon="💧"
        title="Title"
        subtitle="Subtitle"
        action={<span>Action</span>}
      />
    );

    const iconDiv = container.querySelector('.settings-row-icon--blue');
    expect(iconDiv).toBeInTheDocument();
  });
});
