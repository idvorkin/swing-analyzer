import { useState } from 'react';
import type { BlazePoseVariant, PoseModel } from '../../config/modelConfig';
import { CpuIcon, SparklesIcon } from './Icons';
import { SettingsRow } from './SettingsRow';

// Storage keys for model preferences
const MODEL_STORAGE_KEY = 'swing-analyzer-pose-model';
const BLAZEPOSE_VARIANT_KEY = 'swing-analyzer-blazepose-variant';

// Get saved model preference (with error handling for private browsing/quota issues)
// Default: BlazePose Lite (33 keypoints, fast)
export function getSavedModelPreference(): PoseModel {
  try {
    const saved = localStorage.getItem(MODEL_STORAGE_KEY);
    return saved === 'movenet' ? 'movenet' : 'blazepose';
  } catch (error) {
    console.warn('Failed to read model preference from localStorage:', error);
    return 'blazepose';
  }
}

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

// Save model preference (with error handling for private browsing/quota issues)
function saveModelPreference(model: PoseModel): void {
  try {
    localStorage.setItem(MODEL_STORAGE_KEY, model);
  } catch (error) {
    console.error('Failed to save model preference:', error);
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

export function AnalysisTab() {
  const [selectedModel, setSelectedModel] = useState<PoseModel>(
    getSavedModelPreference()
  );
  const [blazePoseVariant, setBlazePoseVariant] = useState<BlazePoseVariant>(
    getSavedBlazePoseVariant()
  );
  const [needsReload, setNeedsReload] = useState(false);

  const handleModelChange = (model: PoseModel) => {
    const previousModel = getSavedModelPreference();
    setSelectedModel(model);
    saveModelPreference(model);
    setNeedsReload(model !== previousModel);
  };

  const handleVariantChange = (variant: BlazePoseVariant) => {
    const previousVariant = getSavedBlazePoseVariant();
    setBlazePoseVariant(variant);
    saveBlazePoseVariant(variant);
    if (selectedModel === 'blazepose' && variant !== previousVariant) {
      setNeedsReload(true);
    }
  };

  return (
    <div className="settings-section">
      {/* Pose Model Selection */}
      <SettingsRow
        icon={<CpuIcon />}
        iconVariant="purple"
        title="Pose Detection Model"
        subtitle="Choose ML model for pose estimation"
      />

      <div className="settings-radio-group">
        <label className="settings-radio-option">
          <input
            type="radio"
            name="pose-model"
            value="movenet"
            checked={selectedModel === 'movenet'}
            onChange={() => handleModelChange('movenet')}
          />
          <span className="settings-radio-label">MoveNet Lightning</span>
          <span className="settings-radio-desc">Fast, 17 keypoints</span>
        </label>

        <label className="settings-radio-option">
          <input
            type="radio"
            name="pose-model"
            value="blazepose"
            checked={selectedModel === 'blazepose'}
            onChange={() => handleModelChange('blazepose')}
          />
          <span className="settings-radio-label">BlazePose</span>
          <span className="settings-radio-desc">33 keypoints, 3D coords</span>
        </label>
      </div>

      {/* BlazePose Variant Selection - only show when BlazePose selected */}
      {selectedModel === 'blazepose' && (
        <>
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
              <span className="settings-radio-desc">
                Fastest, good accuracy
              </span>
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
              <span className="settings-radio-desc">
                Balanced speed/accuracy
              </span>
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
        </>
      )}

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
