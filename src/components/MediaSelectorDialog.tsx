/**
 * MediaSelectorDialog - Professional video source picker
 *
 * A modal dialog for selecting video sources with:
 * - Camera roll upload
 * - Sample video cards with thumbnails
 * - Coming soon placeholders
 * - Loading spinner with progress
 */

import type React from 'react';
import { useEffect, useRef } from 'react';

interface VideoOption {
  id: string;
  title: string;
  subtitle: string;
  thumbnail?: string;
  comingSoon?: boolean;
  onClick?: () => void;
}

interface MediaSelectorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onLoadSwingSample: () => void;
  onLoadPistolSample: () => void;
  isLoading?: boolean;
  loadingProgress?: number;
  loadingMessage?: string;
  fileInputRef: React.RefObject<HTMLInputElement>;
}

const VIDEO_OPTIONS: VideoOption[] = [
  {
    id: 'swing',
    title: 'Kettlebell Swing',
    subtitle: '7MB sample video',
    thumbnail: 'https://raw.githubusercontent.com/idvorkin-ai-tools/form-analyzer-samples/main/exercises/kettlebell-swing/good/swing-thumbnail.jpg',
  },
  {
    id: 'pistol',
    title: 'Pistol Squat',
    subtitle: '9MB sample video',
    thumbnail: 'https://raw.githubusercontent.com/idvorkin-ai-tools/form-analyzer-samples/main/exercises/pistols/pistol-thumbnail.jpg',
  },
  {
    id: 'pullup',
    title: 'Pull-ups',
    subtitle: 'Coming soon',
    comingSoon: true,
  },
  {
    id: 'pushup',
    title: 'Push-ups',
    subtitle: 'Coming soon',
    comingSoon: true,
  },
];

export const MediaSelectorDialog: React.FC<MediaSelectorDialogProps> = ({
  isOpen,
  onClose,
  onUpload,
  onLoadSwingSample,
  onLoadPistolSample,
  isLoading = false,
  loadingProgress,
  loadingMessage,
  fileInputRef,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isLoading) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, isLoading, onClose]);

  // Trap focus in dialog
  useEffect(() => {
    if (isOpen && dialogRef.current) {
      const firstFocusable = dialogRef.current.querySelector('button, input, [tabindex="0"]') as HTMLElement;
      firstFocusable?.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleVideoSelect = (id: string) => {
    if (isLoading) return;

    switch (id) {
      case 'swing':
        onLoadSwingSample();
        break;
      case 'pistol':
        onLoadPistolSample();
        break;
    }
  };

  const progressPercent = loadingProgress ?? 0;
  const circumference = 2 * Math.PI * 40; // radius = 40
  const strokeDashoffset = circumference - (progressPercent / 100) * circumference;

  return (
    <div
      className="media-dialog-backdrop"
      onClick={isLoading ? undefined : onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="media-dialog-title"
    >
      <div
        className="media-dialog"
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Loading overlay */}
        {isLoading && (
          <div className="media-dialog-loading">
            <div className="media-dialog-spinner">
              <svg viewBox="0 0 100 100" className="media-dialog-spinner-svg">
                {/* Background circle */}
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="6"
                  opacity="0.2"
                />
                {/* Progress circle */}
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={loadingProgress !== undefined ? strokeDashoffset : 0}
                  className={loadingProgress === undefined ? 'media-dialog-spinner-indeterminate' : ''}
                  transform="rotate(-90 50 50)"
                />
              </svg>
              {loadingProgress !== undefined && (
                <span className="media-dialog-spinner-text">{Math.round(progressPercent)}%</span>
              )}
            </div>
            <p className="media-dialog-loading-message">
              {loadingMessage || 'Loading video...'}
            </p>
          </div>
        )}

        {/* Header */}
        <div className="media-dialog-header">
          <h2 id="media-dialog-title" className="media-dialog-title">
            Select Video
          </h2>
          <button
            type="button"
            className="media-dialog-close"
            onClick={onClose}
            disabled={isLoading}
            aria-label="Close dialog"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Upload section */}
        <div className="media-dialog-upload">
          <input
            type="file"
            id="media-dialog-file"
            accept="video/*"
            ref={fileInputRef}
            onChange={onUpload}
            className="sr-only"
            disabled={isLoading}
          />
          <label
            htmlFor="media-dialog-file"
            className={`media-dialog-upload-btn ${isLoading ? 'media-dialog-upload-btn--disabled' : ''}`}
          >
            <div className="media-dialog-upload-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <div className="media-dialog-upload-text">
              <span className="media-dialog-upload-title">Upload from device</span>
              <span className="media-dialog-upload-subtitle">MP4, WebM, MOV supported</span>
            </div>
          </label>
        </div>

        {/* Divider */}
        <div className="media-dialog-divider">
          <span>or try a sample</span>
        </div>

        {/* Sample videos grid */}
        <div className="media-dialog-samples">
          {VIDEO_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`media-dialog-card ${option.comingSoon ? 'media-dialog-card--coming-soon' : ''}`}
              onClick={() => !option.comingSoon && handleVideoSelect(option.id)}
              disabled={isLoading || option.comingSoon}
            >
              <div className="media-dialog-card-thumbnail">
                {option.thumbnail ? (
                  <img
                    src={option.thumbnail}
                    alt=""
                    onError={(e) => {
                      // Hide broken images, show placeholder
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : null}
                <div className="media-dialog-card-icon">
                  {option.comingSoon ? (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                    </svg>
                  ) : (
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                </div>
                {option.comingSoon && (
                  <div className="media-dialog-card-badge">
                    Coming Soon
                  </div>
                )}
              </div>
              <div className="media-dialog-card-info">
                <span className="media-dialog-card-title">{option.title}</span>
                <span className="media-dialog-card-subtitle">{option.subtitle}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Footer hint */}
        <p className="media-dialog-hint">
          Videos are processed locally in your browser
        </p>
      </div>
    </div>
  );
};

export default MediaSelectorDialog;
