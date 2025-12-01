interface ToggleProps {
  checked: boolean;
  onChange: () => void;
  'aria-label': string;
}

export function Toggle({
  checked,
  onChange,
  'aria-label': ariaLabel,
}: ToggleProps) {
  return (
    <button
      type="button"
      className={`settings-toggle ${checked ? 'settings-toggle--active' : ''}`}
      onClick={onChange}
      aria-pressed={checked}
      aria-label={ariaLabel}
    >
      <div className="settings-toggle-knob" />
    </button>
  );
}
