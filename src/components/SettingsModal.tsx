import { useCallback, useEffect, useState } from 'react';
import {
  BUILD_TIMESTAMP,
  GIT_BRANCH,
  GIT_COMMIT_URL,
  GIT_SHA_SHORT,
} from '../generated_version';
import { DeviceService } from '../services/DeviceService';

// Tab configuration - extracted to avoid recreation on each render
const TABS = [
  { id: 'bug' as const, label: 'Bug Report', icon: '🐛' },
  { id: 'updates' as const, label: 'Updates', icon: '🚀' },
  { id: 'about' as const, label: 'About', icon: '💡' },
] as const;

type TabId = (typeof TABS)[number]['id'];

// Safe date formatting with fallback
function formatBuildDate(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return 'Unknown';
    }
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'Unknown';
  }
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Bug reporting
  shakeEnabled: boolean;
  onShakeEnabledChange: (enabled: boolean) => void;
  isShakeSupported: boolean;
  onRequestShakePermission: () => Promise<boolean>;
  onOpenBugReporter: () => void;
  shortcut: string;
  // Version check
  lastCheckTime: Date | null;
  onCheckForUpdate: () => Promise<void>;
  isCheckingUpdate: boolean;
  updateAvailable: boolean;
  onReload: () => void;
}

export function SettingsModal({
  isOpen,
  onClose,
  shakeEnabled,
  onShakeEnabledChange,
  isShakeSupported,
  onRequestShakePermission,
  onOpenBugReporter,
  shortcut,
  lastCheckTime,
  onCheckForUpdate,
  isCheckingUpdate,
  updateAvailable,
  onReload,
}: SettingsModalProps) {
  const [activeSection, setActiveSection] = useState<TabId>('bug');

  const handleShakeToggle = useCallback(async () => {
    if (!shakeEnabled) {
      const granted = await onRequestShakePermission();
      if (granted) {
        onShakeEnabledChange(true);
      }
    } else {
      onShakeEnabledChange(false);
    }
  }, [shakeEnabled, onRequestShakePermission, onShakeEnabledChange]);

  const handleReportBug = useCallback(() => {
    onClose();
    onOpenBugReporter();
  }, [onClose, onOpenBugReporter]);

  // Global Escape key handler - divs aren't focusable by default
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isMobile = DeviceService.isMobileDevice();
  const buildDate = formatBuildDate(BUILD_TIMESTAMP);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(8px)',
        animation: 'settings-fade-in 0.2s ease-out',
      }}
      onClick={onClose}
      onKeyDown={(e) => e.key === 'Enter' && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <div
        style={{
          background: 'linear-gradient(145deg, #0f172a 0%, #1e293b 100%)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '1.25rem',
          width: '100%',
          maxWidth: '28rem',
          boxShadow:
            '0 25px 50px -12px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
          maxHeight: '90vh',
          overflowY: 'auto',
          animation: 'settings-slide-up 0.3s ease-out',
          margin: '1rem',
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="document"
      >
        {/* Header */}
        <div
          style={{
            background: 'linear-gradient(135deg, #1a2a6c 0%, #2a4858 100%)',
            padding: '1.25rem 1.5rem',
            borderRadius: '1.25rem 1.25rem 0 0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div
            style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}
          >
            <div
              style={{
                width: '2.5rem',
                height: '2.5rem',
                borderRadius: '0.75rem',
                background: 'rgba(255, 255, 255, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.25rem',
              }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </div>
            <h2
              id="settings-title"
              style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: 'white',
                margin: 0,
                letterSpacing: '-0.02em',
              }}
            >
              Settings
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: '2rem',
              height: '2rem',
              borderRadius: '0.5rem',
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.7)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s',
            }}
            aria-label="Close settings"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              aria-hidden="true"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
            padding: '0 1rem',
            background: 'rgba(0, 0, 0, 0.2)',
          }}
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSection(tab.id)}
              style={{
                flex: 1,
                padding: '0.875rem 0.5rem',
                background: 'none',
                border: 'none',
                color:
                  activeSection === tab.id
                    ? 'white'
                    : 'rgba(255, 255, 255, 0.5)',
                cursor: 'pointer',
                fontSize: '0.8125rem',
                fontWeight: activeSection === tab.id ? 600 : 400,
                borderBottom:
                  activeSection === tab.id
                    ? '2px solid #4285f4'
                    : '2px solid transparent',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.375rem',
              }}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ padding: '1.25rem' }}>
          {/* Bug Reporting Section */}
          {activeSection === 'bug' && (
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
            >
              {/* Shake to Report */}
              {isShakeSupported && isMobile && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '1rem',
                    background: 'rgba(255, 255, 255, 0.03)',
                    borderRadius: '0.75rem',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                    }}
                  >
                    <div
                      style={{
                        width: '2.25rem',
                        height: '2.25rem',
                        borderRadius: '0.625rem',
                        background:
                          'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1rem',
                      }}
                    >
                      📱
                    </div>
                    <div>
                      <div
                        style={{
                          color: 'white',
                          fontWeight: 500,
                          fontSize: '0.9375rem',
                        }}
                      >
                        Shake to Report
                      </div>
                      <div
                        style={{
                          color: 'rgba(255, 255, 255, 0.5)',
                          fontSize: '0.8125rem',
                        }}
                      >
                        Shake device to open bug reporter
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleShakeToggle}
                    style={{
                      width: '3rem',
                      height: '1.75rem',
                      borderRadius: '1rem',
                      background: shakeEnabled
                        ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
                        : 'rgba(255, 255, 255, 0.1)',
                      border: 'none',
                      cursor: 'pointer',
                      position: 'relative',
                      transition: 'all 0.2s',
                    }}
                    aria-pressed={shakeEnabled}
                    aria-label="Toggle shake to report"
                  >
                    <div
                      style={{
                        width: '1.25rem',
                        height: '1.25rem',
                        borderRadius: '50%',
                        background: 'white',
                        position: 'absolute',
                        top: '0.25rem',
                        left: shakeEnabled ? 'calc(100% - 1.5rem)' : '0.25rem',
                        transition: 'all 0.2s',
                        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                      }}
                    />
                  </button>
                </div>
              )}

              {/* Keyboard Shortcut */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '1rem',
                  background: 'rgba(255, 255, 255, 0.03)',
                  borderRadius: '0.75rem',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                  }}
                >
                  <div
                    style={{
                      width: '2.25rem',
                      height: '2.25rem',
                      borderRadius: '0.625rem',
                      background:
                        'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1rem',
                    }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <rect x="2" y="4" width="20" height="16" rx="2" />
                      <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10" />
                    </svg>
                  </div>
                  <div>
                    <div
                      style={{
                        color: 'white',
                        fontWeight: 500,
                        fontSize: '0.9375rem',
                      }}
                    >
                      Keyboard Shortcut
                    </div>
                    <div
                      style={{
                        color: 'rgba(255, 255, 255, 0.5)',
                        fontSize: '0.8125rem',
                      }}
                    >
                      Quick access to bug reporter
                    </div>
                  </div>
                </div>
                <kbd
                  style={{
                    padding: '0.375rem 0.75rem',
                    background: 'rgba(255, 255, 255, 0.08)',
                    borderRadius: '0.375rem',
                    color: 'rgba(255, 255, 255, 0.8)',
                    fontSize: '0.8125rem',
                    fontFamily: 'inherit',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    boxShadow: '0 2px 0 rgba(0, 0, 0, 0.3)',
                  }}
                >
                  {shortcut}
                </kbd>
              </div>

              {/* Report Bug Button */}
              <button
                type="button"
                onClick={handleReportBug}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  padding: '0.875rem 1rem',
                  background:
                    'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                  border: 'none',
                  borderRadius: '0.75rem',
                  color: 'white',
                  fontWeight: 600,
                  fontSize: '0.9375rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: '0 4px 12px rgba(220, 38, 38, 0.3)',
                }}
              >
                🐛 Report a Bug
              </button>
            </div>
          )}

          {/* Updates Section */}
          {activeSection === 'updates' && (
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
            >
              {/* Update Available Banner */}
              {updateAvailable && (
                <div
                  style={{
                    padding: '1rem',
                    background:
                      'linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(22, 163, 74, 0.15) 100%)',
                    borderRadius: '0.75rem',
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                    animation: 'settings-pulse-subtle 2s infinite',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      marginBottom: '0.75rem',
                    }}
                  >
                    <span style={{ fontSize: '1.25rem' }}>✨</span>
                    <div
                      style={{
                        color: '#22c55e',
                        fontWeight: 600,
                        fontSize: '0.9375rem',
                      }}
                    >
                      New Version Available!
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onReload}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      background:
                        'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                      border: 'none',
                      borderRadius: '0.5rem',
                      color: 'white',
                      fontWeight: 600,
                      fontSize: '0.875rem',
                      cursor: 'pointer',
                    }}
                  >
                    Reload to Update
                  </button>
                </div>
              )}

              {/* Last Check Time */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '1rem',
                  background: 'rgba(255, 255, 255, 0.03)',
                  borderRadius: '0.75rem',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                  }}
                >
                  <div
                    style={{
                      width: '2.25rem',
                      height: '2.25rem',
                      borderRadius: '0.625rem',
                      background:
                        'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 6v6l4 2" />
                    </svg>
                  </div>
                  <div>
                    <div
                      style={{
                        color: 'white',
                        fontWeight: 500,
                        fontSize: '0.9375rem',
                      }}
                    >
                      Last Check
                    </div>
                    <div
                      style={{
                        color: 'rgba(255, 255, 255, 0.5)',
                        fontSize: '0.8125rem',
                      }}
                    >
                      {lastCheckTime
                        ? lastCheckTime.toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 'Never'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Check for Update Button */}
              <button
                type="button"
                onClick={onCheckForUpdate}
                disabled={isCheckingUpdate}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  padding: '0.875rem 1rem',
                  background: isCheckingUpdate
                    ? 'rgba(255, 255, 255, 0.1)'
                    : 'linear-gradient(135deg, #4285f4 0%, #1a73e8 100%)',
                  border: 'none',
                  borderRadius: '0.75rem',
                  color: 'white',
                  fontWeight: 600,
                  fontSize: '0.9375rem',
                  cursor: isCheckingUpdate ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: isCheckingUpdate
                    ? 'none'
                    : '0 4px 12px rgba(66, 133, 244, 0.3)',
                  opacity: isCheckingUpdate ? 0.7 : 1,
                }}
              >
                {isCheckingUpdate ? (
                  <>
                    <span
                      style={{
                        display: 'inline-block',
                        animation: 'settings-spin 1s linear infinite',
                      }}
                    >
                      ⟳
                    </span>
                    Checking...
                  </>
                ) : (
                  <>🔄 Check for Updates</>
                )}
              </button>
            </div>
          )}

          {/* About Section */}
          {activeSection === 'about' && (
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
            >
              {/* App Info */}
              <div
                style={{
                  textAlign: 'center',
                  padding: '1.5rem 1rem',
                  background: 'rgba(255, 255, 255, 0.03)',
                  borderRadius: '0.75rem',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                }}
              >
                <div
                  style={{
                    width: '4rem',
                    height: '4rem',
                    borderRadius: '1rem',
                    background:
                      'linear-gradient(135deg, #1a2a6c 0%, #2a4858 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '2rem',
                    margin: '0 auto 1rem',
                    boxShadow: '0 8px 24px rgba(26, 42, 108, 0.4)',
                  }}
                >
                  🏋️
                </div>
                <div
                  style={{
                    color: 'white',
                    fontWeight: 700,
                    fontSize: '1.25rem',
                    marginBottom: '0.25rem',
                  }}
                >
                  Swing Analyzer
                </div>
                <div
                  style={{
                    color: 'rgba(255, 255, 255, 0.5)',
                    fontSize: '0.8125rem',
                  }}
                >
                  Kettlebell form analysis powered by AI
                </div>
              </div>

              {/* Version Info */}
              <div
                style={{
                  padding: '1rem',
                  background: 'rgba(255, 255, 255, 0.03)',
                  borderRadius: '0.75rem',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span
                      style={{
                        color: 'rgba(255, 255, 255, 0.5)',
                        fontSize: '0.8125rem',
                      }}
                    >
                      Version
                    </span>
                    <a
                      href={GIT_COMMIT_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: '#60a5fa',
                        fontSize: '0.8125rem',
                        fontFamily: 'monospace',
                        textDecoration: 'none',
                      }}
                    >
                      {GIT_SHA_SHORT}
                    </a>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span
                      style={{
                        color: 'rgba(255, 255, 255, 0.5)',
                        fontSize: '0.8125rem',
                      }}
                    >
                      Branch
                    </span>
                    <span style={{ color: 'white', fontSize: '0.8125rem' }}>
                      {GIT_BRANCH}
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span
                      style={{
                        color: 'rgba(255, 255, 255, 0.5)',
                        fontSize: '0.8125rem',
                      }}
                    >
                      Built
                    </span>
                    <span style={{ color: 'white', fontSize: '0.8125rem' }}>
                      {buildDate}
                    </span>
                  </div>
                </div>
              </div>

              {/* Links */}
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <a
                  href="https://github.com/idvorkin/swing-analyzer"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    padding: '0.875rem',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '0.75rem',
                    color: 'white',
                    textDecoration: 'none',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    transition: 'all 0.2s',
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                  </svg>
                  GitHub
                </a>
                <a
                  href="https://idvork.in/kettlebell"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    padding: '0.875rem',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '0.75rem',
                    color: 'white',
                    textDecoration: 'none',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    transition: 'all 0.2s',
                  }}
                >
                  📖 Learn More
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
