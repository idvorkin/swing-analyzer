import { Group, Stack, Text, ThemeIcon } from '@mantine/core';
import type { ReactNode } from 'react';

interface SettingsRowProps {
  icon: ReactNode;
  iconVariant?: 'orange' | 'purple' | 'blue' | 'gradient';
  title: string;
  subtitle: string;
  action?: ReactNode;
}

const colorMap = {
  orange: 'orange',
  purple: 'grape',
  blue: 'blue',
  gradient: 'blue',
} as const;

export function SettingsRow({
  icon,
  iconVariant = 'blue',
  title,
  subtitle,
  action,
}: SettingsRowProps) {
  return (
    <Group
      justify="space-between"
      align="flex-start"
      p="md"
      wrap="nowrap"
      style={{
        background: 'rgba(255, 255, 255, 0.04)',
        borderRadius: '12px',
        border: '1px solid rgba(255, 255, 255, 0.08)',
      }}
    >
      <Group gap="md" wrap="nowrap">
        <ThemeIcon
          size="lg"
          color={colorMap[iconVariant]}
          radius="md"
          variant="gradient"
        >
          {icon}
        </ThemeIcon>
        <Stack gap={2}>
          <Text size="sm" fw={500}>
            {title}
          </Text>
          <Text size="xs" c="dimmed">
            {subtitle}
          </Text>
        </Stack>
      </Group>
      {action}
    </Group>
  );
}
