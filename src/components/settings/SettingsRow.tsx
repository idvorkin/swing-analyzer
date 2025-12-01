import type { ReactNode } from 'react';

interface SettingsRowProps {
  icon: ReactNode;
  iconVariant?: 'orange' | 'purple' | 'blue' | 'gradient';
  title: string;
  subtitle: string;
  action?: ReactNode;
}

export function SettingsRow({
  icon,
  iconVariant = 'blue',
  title,
  subtitle,
  action,
}: SettingsRowProps) {
  return (
    <div className="settings-row">
      <div className="settings-row-left">
        <div className={`settings-row-icon settings-row-icon--${iconVariant}`}>
          {icon}
        </div>
        <div className="settings-row-text">
          <div className="settings-row-title">{title}</div>
          <div className="settings-row-subtitle">{subtitle}</div>
        </div>
      </div>
      {action}
    </div>
  );
}
