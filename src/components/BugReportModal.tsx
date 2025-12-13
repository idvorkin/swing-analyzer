import { useCallback, useRef, useState } from 'react';
import type { BugReportData } from '../hooks/useBugReporter';
import { DeviceService } from '../services/DeviceService';

interface BugReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpen: () => void;
  onSubmit: (data: BugReportData) => Promise<{ success: boolean }>;
  isSubmitting: boolean;
  defaultData: BugReportData;
}

export function BugReportModal({
  isOpen,
  onClose,
  onOpen,
  onSubmit,
  isSubmitting,
  defaultData,
}: BugReportModalProps) {
  const [title, setTitle] = useState(defaultData.title);
  const [description, setDescription] = useState(defaultData.description);
  const [includeMetadata, setIncludeMetadata] = useState(
    defaultData.includeMetadata
  );
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [hasScreenshotOnClipboard, setHasScreenshotOnClipboard] =
    useState(false);
  const [wasOpen, setWasOpen] = useState(false);
  const isCapturingRef = useRef(false);

  // Reset form when modal opens (using wasOpen to detect transition)
  // Skip reset if we're just reopening after screenshot capture
  if (isOpen && !wasOpen) {
    setWasOpen(true);
    if (!isCapturingRef.current) {
      setTitle(defaultData.title);
      setDescription(defaultData.description);
      setIncludeMetadata(defaultData.includeMetadata);
      setScreenshot(null);
      setSubmitted(false);
    }
    isCapturingRef.current = false;
  } else if (!isOpen && wasOpen) {
    setWasOpen(false);
  }

  const handleSubmit = useCallback(async () => {
    const result = await onSubmit({
      title,
      description,
      includeMetadata,
      screenshot: screenshot ?? undefined,
    });
    if (result.success) {
      setSubmitted(true);
      setHasScreenshotOnClipboard(
        'hasScreenshotOnClipboard' in result &&
          !!result.hasScreenshotOnClipboard
      );
    }
  }, [title, description, includeMetadata, screenshot, onSubmit]);

  const handleCaptureScreenshot = useCallback(async () => {
    setIsCapturing(true);
    isCapturingRef.current = true;
    // Hide modal temporarily so it doesn't appear in screenshot
    onClose();
    // Small delay to let modal close animation complete
    await new Promise((resolve) => setTimeout(resolve, 150));
    const dataUrl = await DeviceService.captureScreenshot();
    setScreenshot(dataUrl);
    setIsCapturing(false);
    // Reopen modal - isCapturingRef will prevent form reset
    onOpen();
  }, [onClose, onOpen]);

  if (!isOpen) return null;

  const modalOverlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 250, // Above all other dialogs (media: 100, help: 150, settings: 200)
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    backdropFilter: 'blur(4px)',
  };

  const modalContentStyle: React.CSSProperties = {
    backgroundColor: '#111827',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    padding: '1.5rem',
    borderRadius: '1rem',
    width: '100%',
    maxWidth: '32rem',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    maxHeight: '90vh',
    overflowY: 'auto',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '0.5rem',
    padding: '0.5rem 0.75rem',
    color: 'white',
    outline: 'none',
  };

  const textareaStyle: React.CSSProperties = {
    ...inputStyle,
    fontFamily: 'monospace',
    fontSize: '0.875rem',
  };

  const buttonPrimaryStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem 1rem',
    backgroundColor: '#dc2626',
    color: 'white',
    borderRadius: '0.5rem',
    fontWeight: 500,
    border: 'none',
    cursor: 'pointer',
  };

  const buttonSecondaryStyle: React.CSSProperties = {
    padding: '0.5rem 1rem',
    color: '#9ca3af',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
  };

  return (
    <div
      style={modalOverlayStyle}
      onClick={onClose}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="bug-report-title"
    >
      <div
        style={modalContentStyle}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="document"
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.25rem' }}>🐛</span>
            <h2
              id="bug-report-title"
              style={{ fontSize: '1.25rem', fontWeight: 700, color: 'white' }}
            >
              Report a Bug
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              color: 'rgba(255, 255, 255, 0.5)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1.5rem',
            }}
          >
            &times;
          </button>
        </div>

        {submitted ? (
          /* Success State */
          <div style={{ textAlign: 'center', padding: '2rem 0' }}>
            <div
              style={{
                color: '#4ade80',
                fontSize: '2.5rem',
                marginBottom: '1rem',
              }}
            >
              ✓
            </div>
            <div
              style={{
                color: 'white',
                fontSize: '1.125rem',
                fontWeight: 500,
                marginBottom: '0.5rem',
              }}
            >
              GitHub opened!
            </div>
            {hasScreenshotOnClipboard ? (
              <div
                style={{
                  color: '#9ca3af',
                  fontSize: '0.875rem',
                  marginBottom: '1.5rem',
                }}
              >
                <strong style={{ color: '#facc15' }}>
                  Screenshot is on your clipboard!
                </strong>
                <br />
                Paste it in the GitHub issue with{' '}
                <kbd
                  style={{
                    padding: '0.125rem 0.375rem',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    borderRadius: '0.25rem',
                  }}
                >
                  Ctrl+V
                </kbd>{' '}
                /{' '}
                <kbd
                  style={{
                    padding: '0.125rem 0.375rem',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    borderRadius: '0.25rem',
                  }}
                >
                  Cmd+V
                </kbd>
              </div>
            ) : (
              <div
                style={{
                  color: '#9ca3af',
                  fontSize: '0.875rem',
                  marginBottom: '1.5rem',
                }}
              >
                Bug details copied to clipboard as backup.
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                color: 'white',
                borderRadius: '0.5rem',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        ) : (
          /* Form */
          <>
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
            >
              {/* Title */}
              <div>
                <label
                  htmlFor="bug-title"
                  style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    color: '#9ca3af',
                    marginBottom: '0.25rem',
                  }}
                >
                  Title
                </label>
                <input
                  id="bug-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  style={inputStyle}
                  placeholder="Brief description of the bug"
                />
              </div>

              {/* Description */}
              <div>
                <label
                  htmlFor="bug-description"
                  style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    color: '#9ca3af',
                    marginBottom: '0.25rem',
                  }}
                >
                  Description
                </label>
                <textarea
                  id="bug-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={8}
                  style={textareaStyle}
                  placeholder="What happened? What did you expect?"
                />
              </div>

              {/* Screenshot */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                }}
              >
                <span
                  style={{
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    color: '#9ca3af',
                  }}
                >
                  Screenshot
                </span>
                {DeviceService.isMobileDevice() ? (
                  <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    Take a screenshot on your device, then attach it to the
                    GitHub issue after submitting.
                  </p>
                ) : (
                  <>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                      }}
                    >
                      <button
                        type="button"
                        onClick={handleCaptureScreenshot}
                        disabled={isCapturing}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.375rem 0.75rem',
                          backgroundColor: 'rgba(255, 255, 255, 0.1)',
                          color: 'white',
                          borderRadius: '0.25rem',
                          fontSize: '0.875rem',
                          border: 'none',
                          cursor: isCapturing ? 'not-allowed' : 'pointer',
                          opacity: isCapturing ? 0.5 : 1,
                        }}
                      >
                        📷{' '}
                        {isCapturing
                          ? 'Capturing...'
                          : screenshot
                            ? 'Recapture'
                            : 'Capture'}
                      </button>
                    </div>
                    {screenshot && (
                      <div style={{ position: 'relative' }}>
                        <img
                          src={screenshot}
                          alt="Screenshot preview"
                          style={{
                            width: '100%',
                            borderRadius: '0.5rem',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => setScreenshot(null)}
                          style={{
                            position: 'absolute',
                            top: '0.5rem',
                            right: '0.5rem',
                            padding: '0.25rem',
                            backgroundColor: 'rgba(0, 0, 0, 0.5)',
                            borderRadius: '50%',
                            color: 'rgba(255, 255, 255, 0.7)',
                            border: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          &times;
                        </button>
                      </div>
                    )}
                    <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                      Your browser will ask which screen/tab to share. We'll
                      capture a single frame.
                    </p>
                  </>
                )}
              </div>

              {/* Options */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                }}
              >
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={includeMetadata}
                    onChange={(e) => setIncludeMetadata(e.target.checked)}
                    style={{ width: '1rem', height: '1rem' }}
                  />
                  <span style={{ fontSize: '0.875rem', color: '#d1d5db' }}>
                    Include technical details (browser, route, timestamp)
                  </span>
                </label>
              </div>
            </div>

            {/* Actions */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: '1.5rem',
                paddingTop: '1rem',
                borderTop: '1px solid rgba(255, 255, 255, 0.1)',
              }}
            >
              <button
                type="button"
                onClick={onClose}
                style={buttonSecondaryStyle}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting || !title.trim()}
                style={{
                  ...buttonPrimaryStyle,
                  opacity: isSubmitting || !title.trim() ? 0.5 : 1,
                  cursor:
                    isSubmitting || !title.trim() ? 'not-allowed' : 'pointer',
                }}
              >
                {isSubmitting ? (
                  'Opening GitHub...'
                ) : (
                  <>📋 Copy & Open GitHub ↗</>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
