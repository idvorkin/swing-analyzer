import { useState } from 'react';
import type { BlazePoseVariant } from '../../config/modelConfig';
import { useSwingAnalyzerContext } from '../../contexts/SwingAnalyzerContext';
import { MonitorIcon, SparklesIcon } from './Icons';
import { SettingsRow } from './SettingsRow';

// Storage key for BlazePose variant
const BLAZEPOSE_VARIANT_KEY = 'swing-analyzer-blazepose-variant';

// Get saved BlazePose variant (with error handling for private browsing/quota issues)
export function getSavedBlazePoseVariant(): BlazePoseVariant {
  try {
    const saved = localStorage.getItem(BLAZEPOSE_VARIANT_KEY);
    if (saved === 'full' || saved === 'heavy') return saved;
    return 'lite';
  } catch (error) {
    console.warn('Failed to read BlazePose variant from localStorage:', error);
    return 'lite';
  }
}

// Save BlazePose variant (with error handling for private browsing/quota issues)
function saveBlazePoseVariant(variant: BlazePoseVariant): void {
  try {
    localStorage.setItem(BLAZEPOSE_VARIANT_KEY, variant);
  } catch (error) {
    console.error('Failed to save BlazePose variant:', error);
  }
}

export function SettingsTab() {
  const { appState, setDisplayMode } = useSwingAnalyzerContext();
  const [blazePoseVariant, setBlazePoseVariant] = useState<BlazePoseVariant>(
    getSavedBlazePoseVariant()
  );
  const [needsReload, setNeedsReload] = useState(false);

  const handleVariantChange = (variant: BlazePoseVariant) => {
    const previousVariant = getSavedBlazePoseVariant();
    setBlazePoseVariant(variant);
    saveBlazePoseVariant(variant);
    if (variant !== previousVariant) {
      setNeedsReload(true);
    }
  };

  return (
    <div className="settings-section">
      {/* Display Mode */}
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

      {/* Divider */}
      <div className="settings-divider" />

      {/* BlazePose Variant Selection */}
      <SettingsRow
        icon={<SparklesIcon />}
        iconVariant="orange"
        title="BlazePose Variant"
        subtitle="Trade-off between speed and accuracy"
      />

      <div className="settings-radio-group">
        <label className="settings-radio-option">
          <input
            type="radio"
            name="blazepose-variant"
            value="lite"
            checked={blazePoseVariant === 'lite'}
            onChange={() => handleVariantChange('lite')}
          />
          <span className="settings-radio-label">Lite</span>
          <span className="settings-radio-desc">Fastest, good accuracy</span>
        </label>

        <label className="settings-radio-option">
          <input
            type="radio"
            name="blazepose-variant"
            value="full"
            checked={blazePoseVariant === 'full'}
            onChange={() => handleVariantChange('full')}
          />
          <span className="settings-radio-label">Full</span>
          <span className="settings-radio-desc">Balanced speed/accuracy</span>
        </label>

        <label className="settings-radio-option">
          <input
            type="radio"
            name="blazepose-variant"
            value="heavy"
            checked={blazePoseVariant === 'heavy'}
            onChange={() => handleVariantChange('heavy')}
          />
          <span className="settings-radio-label">Heavy</span>
          <span className="settings-radio-desc">Best accuracy, slower</span>
        </label>
      </div>

      {/* Reload Banner */}
      {needsReload && (
        <div className="settings-reload-banner">
          <p className="settings-reload-text">
            Reload required to apply model change
          </p>
          <button
            type="button"
            className="settings-reload-btn"
            onClick={() => window.location.reload()}
          >
            Reload Now
          </button>
        </div>
      )}
    </div>
  );
}
