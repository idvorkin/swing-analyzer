/**
 * HelpTab - Touch controls guide shown in Settings modal
 */

export function HelpTab() {
  return (
    <div className="settings-section settings-section--compact">
      {/* Introduction */}
      <div className="settings-help-intro">
        Double-tap the video to control playback:
      </div>

      {/* Touch zones diagram */}
      <div className="settings-help-zones">
        <div className="settings-help-zone settings-help-zone--left">
          <div className="settings-help-zone-icon">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
            </svg>
          </div>
          <div className="settings-help-zone-label">
            Previous
            <br />
            Checkpoint
          </div>
        </div>

        <div className="settings-help-zone settings-help-zone--right">
          <div className="settings-help-zone-icon">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
            </svg>
          </div>
          <div className="settings-help-zone-label">
            Next
            <br />
            Checkpoint
          </div>
        </div>
      </div>

      {/* Tip */}
      <div className="settings-help-note">
        <strong>Tip:</strong> Checkpoints are the key positions in each rep
        (Top, Connect, Bottom, Release).
      </div>
    </div>
  );
}
