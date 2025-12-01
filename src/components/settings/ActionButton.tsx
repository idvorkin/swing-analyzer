import type { ReactNode } from 'react';

interface ActionButtonProps {
  variant: 'red' | 'blue' | 'green';
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}

export function ActionButton({
  variant,
  onClick,
  disabled = false,
  children,
}: ActionButtonProps) {
  return (
    <button
      type="button"
      className={`settings-btn settings-btn--${variant}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
