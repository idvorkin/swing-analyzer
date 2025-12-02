import type React from 'react';
import { useSwingAnalyzerContext } from '../contexts/SwingAnalyzerContext';

const AnalysisSection: React.FC = () => {
  const {
    status,
    repCount,
    spineAngle,
    armToSpineAngle,
    fps,
    modelType,
    analysisTime,
    switchModel,
  } = useSwingAnalyzerContext();

  return (
    <section className="analysis-section">
      <div className="metrics">
        <div className="metrics-header">
          <h2>Analysis Results</h2>
          <div className="status-indicator">{status}</div>
          <div className="model-switcher">
            <button
              type="button"
              onClick={() => switchModel('BlazePose')}
              className={modelType.includes('BlazePose') ? 'active' : ''}
              style={{
                padding: '4px 8px',
                fontSize: '11px',
                marginRight: '4px',
                backgroundColor: modelType.includes('BlazePose')
                  ? '#4CAF50'
                  : '#666',
                color: 'white',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer',
              }}
            >
              BlazePose
            </button>
            <button
              type="button"
              onClick={() => switchModel('MoveNet')}
              className={modelType.includes('MoveNet') ? 'active' : ''}
              style={{
                padding: '4px 8px',
                fontSize: '11px',
                backgroundColor: modelType.includes('MoveNet')
                  ? '#4CAF50'
                  : '#666',
                color: 'white',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer',
              }}
            >
              MoveNet
            </button>
          </div>
        </div>

        <div className="metrics-inline">
          <span className="metric-pill">
            <span className="metric-label">Reps</span>
            <span className="metric-value" id="rep-counter">
              {repCount}
            </span>
          </span>
          <span className="metric-pill">
            <span className="metric-label">Spine</span>
            <span className="metric-value" id="spine-angle">
              {spineAngle}°
            </span>
          </span>
          <span className="metric-pill">
            <span className="metric-label">Arm</span>
            <span className="metric-value" id="arm-angle">
              {armToSpineAngle}°
            </span>
          </span>
          <span className="metric-pill">
            <span className="metric-label">FPS</span>
            <span className="metric-value" id="fps-counter">
              {fps}
            </span>
          </span>
          <span className="metric-pill">
            <span className="metric-label">Latency</span>
            <span className="metric-value" id="analysis-time">
              {analysisTime}ms
            </span>
          </span>
          <span className="metric-pill">
            <span className="metric-label">Model</span>
            <span
              className="metric-value"
              id="model-type"
              style={{ fontSize: '10px' }}
            >
              {modelType}
            </span>
          </span>
        </div>
      </div>
    </section>
  );
};

export default AnalysisSection;
