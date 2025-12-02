import { Switch } from '@mantine/core';

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
    <Switch
      checked={checked}
      onChange={onChange}
      aria-label={ariaLabel}
      size="md"
      color="teal"
    />
  );
}
