import React from 'react';
import { AppState } from '../types';

interface AnalysisSectionProps {
  appState: AppState;
  status: string;
  repCount: number;
  spineAngle: number;
  checkpointGridRef: React.MutableRefObject<HTMLDivElement | null>;
  navigateToPreviousRep: () => void;
  navigateToNextRep: () => void;
  setDisplayMode: (mode: 'both' | 'video' | 'overlay') => void;
}

const AnalysisSection: React.FC<AnalysisSectionProps> = ({
  appState,
  status,
  repCount,
  spineAngle,
  checkpointGridRef,
  navigateToPreviousRep,
  navigateToNextRep,
  setDisplayMode
}) => {
  return (
    <>
      <div className="metrics">
          <p> Reps: <span id="rep-counter">{repCount}</span> [angle] <span id="spine-angle">{spineAngle}°</span> </p>
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
              >
                Next ▶
              </button>
            </div>
          </div>
          <div
            id="checkpoint-grid-container"
            className="checkpoint-grid-container"
            ref={checkpointGridRef}
          ></div>
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
