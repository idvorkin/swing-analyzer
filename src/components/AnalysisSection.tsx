import type React from 'react';
import { useSwingAnalyzerContext } from '../contexts/SwingAnalyzerContext';

const AnalysisSection: React.FC = () => {
  const { status, repCount, spineAngle, armToSpineAngle } =
    useSwingAnalyzerContext();

  return (
    <section className="analysis-section">
      <div className="metrics">
        <div className="metrics-header">
          <h2>Analysis Results</h2>
          <div className="status-indicator">{status}</div>
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
        </div>
      </div>
    </section>
  );
};

export default AnalysisSection;
