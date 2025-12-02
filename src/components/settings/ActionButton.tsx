import { Button } from '@mantine/core';
import type { ReactNode } from 'react';

interface ActionButtonProps {
  variant: 'red' | 'blue' | 'green';
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}

const colorMap = {
  red: 'red',
  blue: 'blue',
  green: 'teal',
} as const;

export function ActionButton({
  variant,
  onClick,
  disabled = false,
  children,
}: ActionButtonProps) {
  return (
    <Button
      color={colorMap[variant]}
      onClick={onClick}
      disabled={disabled}
      fullWidth
      size="md"
    >
      {children}
    </Button>
  );
}
