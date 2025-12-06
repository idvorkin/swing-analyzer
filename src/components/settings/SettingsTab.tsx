import { useState } from 'react';
import type { BlazePoseVariant } from '../../config/modelConfig';
import { useSwingAnalyzerContext } from '../../contexts/SwingAnalyzerContext';
import type { DisplayMode } from '../../types';
import { MonitorIcon, SparklesIcon } from './Icons';
import { SegmentedControl } from './SegmentedControl';

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

const DISPLAY_MODE_OPTIONS: { value: DisplayMode; label: string }[] = [
  { value: 'both', label: 'Both' },
  { value: 'video', label: 'Video' },
  { value: 'overlay', label: 'Skeleton' },
];

const BLAZEPOSE_OPTIONS: { value: BlazePoseVariant; label: string }[] = [
  { value: 'lite', label: 'Lite' },
  { value: 'full', label: 'Full' },
  { value: 'heavy', label: 'Heavy' },
];

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
    <div className="settings-section settings-section--compact">
      {/* Display Mode */}
      <div className="settings-compact-row">
        <div className="settings-compact-label">
          <div className="settings-compact-icon settings-compact-icon--blue">
            <MonitorIcon />
          </div>
          <span>Display</span>
        </div>
        <SegmentedControl
          options={DISPLAY_MODE_OPTIONS}
          value={appState.displayMode}
          onChange={setDisplayMode}
          name="display-mode"
        />
      </div>

      {/* BlazePose Variant */}
      <div className="settings-compact-row">
        <div className="settings-compact-label">
          <div className="settings-compact-icon settings-compact-icon--orange">
            <SparklesIcon />
          </div>
          <span>Model</span>
        </div>
        <SegmentedControl
          options={BLAZEPOSE_OPTIONS}
          value={blazePoseVariant}
          onChange={handleVariantChange}
          name="blazepose-variant"
        />
      </div>

      {/* Reload Banner */}
      {needsReload && (
        <div className="settings-reload-banner settings-reload-banner--compact">
          <span className="settings-reload-text">Reload to apply</span>
          <button
            type="button"
            className="settings-reload-btn settings-reload-btn--compact"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      )}
    </div>
  );
}
