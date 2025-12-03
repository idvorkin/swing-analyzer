import { useSwingAnalyzerContext } from '../../contexts/SwingAnalyzerContext';
import { MonitorIcon } from './Icons';
import { SettingsRow } from './SettingsRow';

export function GeneralTab() {
  const { appState, setDisplayMode } = useSwingAnalyzerContext();

  return (
    <div className="settings-section">
      <SettingsRow
        icon={<MonitorIcon />}
        iconVariant="blue"
        title="Display Mode"
        subtitle="Choose what to show on the video"
      />

      <div className="settings-radio-group">
        <label className="settings-radio-option">
          <input
            type="radio"
            name="display-mode"
            value="both"
            checked={appState.displayMode === 'both'}
            onChange={() => setDisplayMode('both')}
          />
          <span className="settings-radio-label">Both</span>
          <span className="settings-radio-desc">Video + skeleton overlay</span>
        </label>

        <label className="settings-radio-option">
          <input
            type="radio"
            name="display-mode"
            value="video"
            checked={appState.displayMode === 'video'}
            onChange={() => setDisplayMode('video')}
          />
          <span className="settings-radio-label">Video Only</span>
          <span className="settings-radio-desc">Hide skeleton overlay</span>
        </label>

        <label className="settings-radio-option">
          <input
            type="radio"
            name="display-mode"
            value="overlay"
            checked={appState.displayMode === 'overlay'}
            onChange={() => setDisplayMode('overlay')}
          />
          <span className="settings-radio-label">Overlay Only</span>
          <span className="settings-radio-desc">Show only skeleton</span>
        </label>
      </div>
    </div>
  );
}
