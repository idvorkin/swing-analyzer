import type React from 'react';
import { useEffect, useState } from 'react';
import { useSwingAnalyzerContext } from '../contexts/SwingAnalyzerContext';
import { SwingPositionName } from '../types';

// Interface for the selected checkpoint when in fullscreen mode
interface SelectedCheckpoint {
  repIndex: number;
  position: SwingPositionName;
}

const AnalysisSection: React.FC = () => {
  const {
    appState,
    status,
    repCount,
    spineAngle,
    armToSpineAngle,
    checkpointGridRef,
    navigateToPreviousRep,
    navigateToNextRep,
    pipelineRef,
    videoStartTime,
  } = useSwingAnalyzerContext();

  // State for fullscreen mode
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedCheckpoint, setSelectedCheckpoint] =
    useState<SelectedCheckpoint | null>(null);

  // Position order for navigation
  const defaultPositionOrder = [
    SwingPositionName.Top,
    SwingPositionName.Connect,
    SwingPositionName.Bottom,
    SwingPositionName.Release,
  ];

  // Position name mapping for display
  const positionNameMap: Record<SwingPositionName, string> = {
    [SwingPositionName.Top]: 'Top',
    [SwingPositionName.Connect]: 'Connect',
    [SwingPositionName.Bottom]: 'Bottom',
    [SwingPositionName.Release]: 'Release',
  };

  // Effect to render checkpoints when rep index changes
  useEffect(() => {
    renderCheckpointGrid();
  }, [appState.currentRepIndex, repCount]);

  // Effect to log angle values when checkpoints change
  useEffect(() => {
    if (!pipelineRef.current) return;

    const repProcessor = pipelineRef.current.getRepProcessor();
    if (!repProcessor) return;

    const completedReps = repProcessor.getAllReps();
    if (completedReps.length === 0) return;

    const currentRep = completedReps[appState.currentRepIndex];
    if (!currentRep) return;

    // Log all angles for the current rep
    console.log('Current rep checkpoint angles:');
    defaultPositionOrder.forEach((position) => {
      const checkpoint = currentRep.checkpoints.get(position);
      if (checkpoint) {
        console.log(
          `${position} - spine: ${checkpoint.spineAngle.toFixed(2)}°, arm-vertical: ${checkpoint.armToVerticalAngle.toFixed(2)}°`
        );
      } else {
        console.log(`${position} - not detected`);
      }
    });
  }, [appState.currentRepIndex, repCount]);

  // Render the checkpoint grid for the current rep
  const renderCheckpointGrid = () => {
    const gridContainer = checkpointGridRef.current;
    if (!gridContainer || !pipelineRef.current) return;

    // Clear previous content
    gridContainer.innerHTML = '';

    // Exit if no reps
    if (repCount === 0) {
      gridContainer.innerHTML =
        '<div class="no-checkpoints">Complete a rep to see checkpoints</div>';
      return;
    }

    // Get the rep processor from the pipeline
    const repProcessor = pipelineRef.current.getRepProcessor();
    if (!repProcessor) return;

    // Get completed reps
    const completedReps = repProcessor.getAllReps();

    // Check if we have reps
    if (completedReps.length === 0) return;

    // Get the current rep based on currentRepIndex
    const currentRep = completedReps[appState.currentRepIndex];
    if (!currentRep) return;

    // Create grid layout
    const gridLayout = document.createElement('div');
    gridLayout.className = 'checkpoint-grid';

    // Add each position to the grid
    defaultPositionOrder.forEach((position) => {
      const checkpoint = currentRep.checkpoints.get(position);
      const cell = document.createElement('div');
      cell.className = 'checkpoint-cell';

      if (checkpoint) {
        // Create a canvas and render the checkpoint image
        const canvas = document.createElement('canvas');
        canvas.width = checkpoint.image.width;
        canvas.height = checkpoint.image.height;
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.objectFit = 'contain';

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.putImageData(checkpoint.image, 0, 0);
        }

        cell.appendChild(canvas);

        // Add position label
        const label = document.createElement('div');
        label.className = 'position-label';
        label.textContent = positionNameMap[position];

        // Add angle info
        const angleLabel = document.createElement('div');
        angleLabel.className = 'angle-label';
        angleLabel.textContent = `Spine: ${Math.round(checkpoint.spineAngle)}°`;

        // Add arm-to-vertical angle info
        const armAngleLabel = document.createElement('div');
        armAngleLabel.className = 'angle-label arm-angle';
        armAngleLabel.textContent = `Arm: ${Math.round(checkpoint.armToVerticalAngle)}°`;

        cell.appendChild(label);
        cell.appendChild(angleLabel);
        cell.appendChild(armAngleLabel);

        // Add click handler for fullscreen
        cell.addEventListener('click', () => {
          setSelectedCheckpoint({
            repIndex: appState.currentRepIndex,
            position,
          });
          setIsFullscreen(true);
        });
      } else {
        // Empty cell with position name
        cell.textContent = `${positionNameMap[position]} - Not detected`;
        cell.style.display = 'flex';
        cell.style.alignItems = 'center';
        cell.style.justifyContent = 'center';
        cell.style.color = '#888';
        cell.style.fontSize = '12px';
      }

      gridLayout.appendChild(cell);
    });

    // Add grid to container
    gridContainer.appendChild(gridLayout);
  };

  // Fullscreen navigation
  const navigateFullscreen = (direction: 'next' | 'prev') => {
    if (!selectedCheckpoint || !pipelineRef.current) return;

    const repProcessor = pipelineRef.current.getRepProcessor();
    if (!repProcessor) return;

    const completedReps = repProcessor.getAllReps();
    if (completedReps.length === 0) return;

    const { repIndex, position } = selectedCheckpoint;
    const currentPosIndex = defaultPositionOrder.indexOf(position);

    let newPosIndex = currentPosIndex;
    let newRepIndex = repIndex;

    if (direction === 'next') {
      newPosIndex++;
      if (newPosIndex >= defaultPositionOrder.length) {
        newPosIndex = 0;
        newRepIndex = Math.min(repIndex + 1, completedReps.length - 1);
      }
    } else {
      newPosIndex--;
      if (newPosIndex < 0) {
        newPosIndex = defaultPositionOrder.length - 1;
        newRepIndex = Math.max(repIndex - 1, 0);
      }
    }

    // Update app state if rep changed
    if (newRepIndex !== repIndex) {
      if (newRepIndex > repIndex) {
        navigateToNextRep();
      } else {
        navigateToPreviousRep();
      }
    }

    setSelectedCheckpoint({
      repIndex: newRepIndex,
      position: defaultPositionOrder[newPosIndex],
    });
  };

  // Close fullscreen
  const closeFullscreen = () => {
    setIsFullscreen(false);
    setSelectedCheckpoint(null);
  };

  // Render fullscreen checkpoint
  const renderFullscreenCheckpoint = () => {
    if (!selectedCheckpoint || !pipelineRef.current) return null;

    const repProcessor = pipelineRef.current.getRepProcessor();
    if (!repProcessor) return null;

    const completedReps = repProcessor.getAllReps();
    if (
      completedReps.length === 0 ||
      selectedCheckpoint.repIndex >= completedReps.length
    )
      return null;

    const currentRep = completedReps[selectedCheckpoint.repIndex];
    const checkpoint = currentRep.checkpoints.get(selectedCheckpoint.position);

    if (!checkpoint)
      return <div className="fullscreen-message">Checkpoint not available</div>;

    // Create a canvas element to render the image data
    return (
      <div className="fullscreen-checkpoint">
        <div className="fullscreen-header">
          <div className="fullscreen-title">
            Rep {currentRep.repNumber} -{' '}
            {positionNameMap[selectedCheckpoint.position]} Position
          </div>
          <div className="fullscreen-angles">
            <div className="fullscreen-spine-angle">
              Spine Angle: {Math.round(checkpoint.spineAngle)}°
            </div>
            <div className="fullscreen-arm-angle">
              Arm-to-Vertical Angle: {Math.round(checkpoint.armToVerticalAngle)}
              °
            </div>
            <div className="fullscreen-timestamp">
              {videoStartTime
                ? (() => {
                    const totalMs = checkpoint.timestamp - videoStartTime;
                    const minutes = Math.floor(totalMs / 60000);
                    const seconds = Math.floor((totalMs % 60000) / 1000);
                    const ms = Math.floor((totalMs % 1000) / 10); // Get 2 digits of milliseconds
                    return `Video Time: ${minutes}:${seconds.toString().padStart(2, '0')}:${ms.toString().padStart(2, '0')}`;
                  })()
                : `Timestamp: ${new Date(checkpoint.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`}
            </div>
          </div>
        </div>

        <div className="fullscreen-image">
          <canvas
            ref={(canvas) => {
              if (canvas) {
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  canvas.width = checkpoint.image.width;
                  canvas.height = checkpoint.image.height;
                  ctx.putImageData(checkpoint.image, 0, 0);
                }
              }
            }}
            style={{
              maxWidth: '100%',
              maxHeight: 'calc(100vh - 150px)',
              objectFit: 'contain',
            }}
          />
        </div>

        <div className="fullscreen-controls">
          <button
            className="fullscreen-nav-btn"
            onClick={() => navigateFullscreen('prev')}
          >
            <svg
              className="icon"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
            </svg>
            <span className="button-text">Previous</span>
          </button>

          <button className="fullscreen-close-btn" onClick={closeFullscreen}>
            <span className="button-text">Close</span>
          </button>

          <button
            className="fullscreen-nav-btn"
            onClick={() => navigateFullscreen('next')}
          >
            <span className="button-text">Next</span>
            <svg
              className="icon-right"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
            </svg>
          </button>
        </div>
      </div>
    );
  };

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
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z" />
              </svg>
            </div>
            <div className="metric-info">
              <div className="metric-label">Completed Reps</div>
              <div className="metric-value" id="rep-counter">
                {repCount}
              </div>
            </div>
          </div>

          <div className="metric-card">
            <div className="metric-icon">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M19.8 10.7L4.2 5l-.7 1.9L17.6 12H5c-1.1 0-2 .9-2 2v4c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-5.5c0-.8-.5-1.6-1.2-1.8zM7 17H5v-2h2v2zm12 0H9v-2h10v2z" />
              </svg>
            </div>
            <div className="metric-info">
              <div className="metric-label">Spine Angle</div>
              <div className="metric-value" id="spine-angle">
                {spineAngle}°
              </div>
            </div>
          </div>

          <div className="metric-card">
            <div className="metric-icon">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M17 15l1.55 1.55c-.96 1.69-3.33 3.04-5.55 3.37V11h3V9h-3V7.82C14.16 7.4 15 6.3 15 5c0-1.65-1.35-3-3-3S9 3.35 9 5c0 1.3.84 2.4 2 2.82V9H8v2h3v8.92c-2.22-.33-4.59-1.68-5.55-3.37L7 15l-4-3v3c0 3.88 4.92 7 9 7s9-3.12 9-7v-3l-4 3zM12 4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1z" />
              </svg>
            </div>
            <div className="metric-info">
              <div className="metric-label">Arm-to-Vertical Angle</div>
              <div className="metric-value" id="arm-angle">
                {armToSpineAngle}°
              </div>
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
                <svg
                  className="icon"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
                </svg>
                <span className="button-text">Prev</span>
              </button>
              <span id="current-rep">
                {appState.currentRepIndex + 1}/{repCount || 0}
              </span>
              <button
                id="next-rep-btn"
                className="nav-btn"
                disabled={appState.currentRepIndex >= repCount - 1}
                onClick={navigateToNextRep}
                type="button"
              >
                <span className="button-text">Next</span>
                <svg
                  className="icon icon-right"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
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

      {/* Fullscreen checkpoint modal */}
      {isFullscreen && (
        <div className="fullscreen-modal">{renderFullscreenCheckpoint()}</div>
      )}
    </section>
  );
};

export default AnalysisSection;
