import React from 'react';
import { useSwingAnalyzerContext } from '../contexts/SwingAnalyzerContext';

const AnalysisSection: React.FC = () => {
  const {
    appState,
    status,
    repCount,
    spineAngle,
    checkpointGridRef,
    navigateToPreviousRep,
    navigateToNextRep,
    setDisplayMode
  } = useSwingAnalyzerContext();

  return (
    <section className="analysis-section">
      <div className="metrics">
        <div className="metrics-header">
          <h2>Analysis Results</h2>
          <div className="status-indicator">{status}</div>
        </div>
        
        <div className="metrics-data">
          <div className="metric-card">
            <div className="metric-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z" />
              </svg>
            </div>
            <div className="metric-info">
              <div className="metric-label">Completed Reps</div>
              <div className="metric-value" id="rep-counter">{repCount}</div>
            </div>
          </div>
          
          <div className="metric-card">
            <div className="metric-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.8 10.7L4.2 5l-.7 1.9L17.6 12H5c-1.1 0-2 .9-2 2v4c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-5.5c0-.8-.5-1.6-1.2-1.8zM7 17H5v-2h2v2zm12 0H9v-2h10v2z" />
              </svg>
            </div>
            <div className="metric-info">
              <div className="metric-label">Spine Angle</div>
              <div className="metric-value" id="spine-angle">{spineAngle}°</div>
            </div>
          </div>
        </div>

        <div className="form-checkpoints">
          <div className="checkpoint-header">
            <h3>Checkpoints</h3>
            <div className="rep-navigation">
              <button
                id="prev-rep-btn"
                className="nav-btn"
                disabled={appState.currentRepIndex <= 0}
                onClick={navigateToPreviousRep}
                type="button"
              >
                <svg className="icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
                </svg>
                Previous
              </button>
              <span id="current-rep">
                Rep {appState.currentRepIndex + 1}/{repCount || 0}
              </span>
              <button
                id="next-rep-btn"
                className="nav-btn"
                disabled={appState.currentRepIndex >= repCount - 1}
                onClick={navigateToNextRep}
                type="button"
              >
                Next
                <svg className="icon icon-right" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
                </svg>
              </button>
            </div>
          </div>
          <div
            id="checkpoint-grid-container"
            className="checkpoint-grid-container"
            ref={checkpointGridRef}
          />
        </div>
      </div>

      <div className="debug-controls">
        <h3>Debug Options</h3>
        <div className="debug-options">
          <label>
            <input
              type="radio"
              name="display-mode"
              value="both"
              checked={appState.displayMode === 'both'}
              onChange={() => setDisplayMode('both')}
            />
            Show Video + Overlay
          </label>
          <label>
            <input
              type="radio"
              name="display-mode"
              value="video"
              checked={appState.displayMode === 'video'}
              onChange={() => setDisplayMode('video')}
            />
            Video Only
          </label>
          <label>
            <input
              type="radio"
              name="display-mode"
              value="overlay"
              checked={appState.displayMode === 'overlay'}
              onChange={() => setDisplayMode('overlay')}
            />
            Overlay Only
          </label>
        </div>
      </div>
    </section>
  );
};

export default AnalysisSection;
