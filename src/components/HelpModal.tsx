/**
 * HelpModal - Shows touch gesture help for mobile users
 */

import type React from 'react';
import { useEffect } from 'react';
import './HelpModal.css';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  // Escape key to close
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="help-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-title"
    >
      <div
        className="help-modal"
        onClick={(e) => e.stopPropagation()}
        role="document"
      >
        <div className="help-header">
          <div className="help-header-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <h2 id="help-title" className="help-title">Touch Controls</h2>
          <button
            type="button"
            onClick={onClose}
            className="help-close-btn"
            aria-label="Close help"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="help-content">
          <p className="help-intro">Double-tap the video to control playback:</p>

          <div className="help-zones">
            <div className="help-zone help-zone--left">
              <div className="help-zone-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
                </svg>
              </div>
              <div className="help-zone-label">Previous<br />Checkpoint</div>
            </div>

            <div className="help-zone help-zone--right">
              <div className="help-zone-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
                </svg>
              </div>
              <div className="help-zone-label">Next<br />Checkpoint</div>
            </div>
          </div>

          <div className="help-note">
            <strong>Tip:</strong> Checkpoints are the key positions in each rep (Top, Connect, Bottom, Release).
          </div>
        </div>
      </div>
    </div>
  );
};
