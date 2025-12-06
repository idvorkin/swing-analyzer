import type React from 'react';
import { useSwingAnalyzerContext } from '../contexts/SwingAnalyzerContext';
import './AnalysisSection.css';

const AnalysisSection: React.FC = () => {
  const { status, repCount, spineAngle, armToSpineAngle } =
    useSwingAnalyzerContext();

  return (
    <section className="hud-section">
      <div className="hud-container">
        {/* Rep Counter - The Hero */}
        <div className="hud-reps">
          <div className="hud-reps-value" id="rep-counter">
            {repCount}
          </div>
          <div className="hud-reps-label">REPS</div>
        </div>

        {/* Divider */}
        <div className="hud-divider" />

        {/* Angle Gauges */}
        <div className="hud-gauges">
          <div className="hud-gauge">
            <div className="hud-gauge-label">SPINE</div>
            <div className="hud-gauge-value" id="spine-angle">
              {spineAngle}<span className="hud-gauge-unit">°</span>
            </div>
          </div>
          <div className="hud-gauge">
            <div className="hud-gauge-label">ARM</div>
            <div className="hud-gauge-value" id="arm-angle">
              {armToSpineAngle}<span className="hud-gauge-unit">°</span>
            </div>
          </div>
        </div>

        {/* Status Badge */}
        <div className="hud-status">
          <div className="hud-status-dot" />
          <div className="hud-status-text">{status}</div>
        </div>
      </div>
    </section>
  );
};

export default AnalysisSection;
