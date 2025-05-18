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
    <>
      <div className="metrics">
        <p>
          {' '}
          Reps: <span id="rep-counter">{repCount}</span> [angle]{' '}
          <span id="spine-angle">{spineAngle}°</span>{' '}
        </p>
        <div id="status">{status}</div>

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
                ◀ Previous
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
                Next ▶
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
    </>
  );
};

export default AnalysisSection;
