import { Badge, Box, Button, Group, Stack, Text, Title } from '@mantine/core';
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional trigger on rep changes only
  useEffect(() => {
    renderCheckpointGrid();
  }, [appState.currentRepIndex, repCount]);

  // Effect to log angle values when checkpoints change
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional trigger on rep changes only
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
            type="button"
            className="fullscreen-nav-btn"
            onClick={() => navigateFullscreen('prev')}
          >
            <svg
              className="icon"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
            </svg>
            <span className="button-text">Previous</span>
          </button>

          <button
            type="button"
            className="fullscreen-close-btn"
            onClick={closeFullscreen}
          >
            <span className="button-text">Close</span>
          </button>

          <button
            type="button"
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
              aria-hidden="true"
            >
              <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
            </svg>
          </button>
        </div>
      </div>
    );
  };

  return (
    <Box className="analysis-section">
      <Box
        p="xl"
        style={{
          backgroundColor: 'var(--mantine-color-dark-7)',
          borderRadius: 'var(--mantine-radius-md)',
          boxShadow: '0 6px 18px rgba(0, 0, 0, 0.08)',
        }}
      >
        <Group justify="space-between" mb="lg">
          <Title order={2} size="h3">
            Analysis Results
          </Title>
          <Badge variant="light" size="lg">
            {status}
          </Badge>
        </Group>

        <Group gap="md" mb="xl">
          <Badge
            size="xl"
            variant="gradient"
            gradient={{ from: 'blue', to: 'cyan' }}
            style={{ padding: '12px 20px' }}
          >
            <Group gap="xs">
              <Text size="xs" tt="uppercase" fw={500}>
                Reps
              </Text>
              <Text size="lg" fw={700} id="rep-counter">
                {repCount}
              </Text>
            </Group>
          </Badge>
          <Badge
            size="xl"
            variant="gradient"
            gradient={{ from: 'blue', to: 'cyan' }}
            style={{ padding: '12px 20px' }}
          >
            <Group gap="xs">
              <Text size="xs" tt="uppercase" fw={500}>
                Spine
              </Text>
              <Text size="lg" fw={700} id="spine-angle">
                {spineAngle}°
              </Text>
            </Group>
          </Badge>
          <Badge
            size="xl"
            variant="gradient"
            gradient={{ from: 'blue', to: 'cyan' }}
            style={{ padding: '12px 20px' }}
          >
            <Group gap="xs">
              <Text size="xs" tt="uppercase" fw={500}>
                Arm
              </Text>
              <Text size="lg" fw={700} id="arm-angle">
                {armToSpineAngle}°
              </Text>
            </Group>
          </Badge>
        </Group>

        <Stack
          gap="md"
          mt="xl"
          style={{
            paddingTop: '20px',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          <Group justify="space-between" align="center">
            <Title order={3} size="h4">
              Checkpoints
            </Title>
            <Group gap="sm">
              <Button
                variant="default"
                size="sm"
                disabled={appState.currentRepIndex <= 0}
                onClick={navigateToPreviousRep}
                leftSection={
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
                  </svg>
                }
              >
                <span className="button-text">Prev</span>
              </Button>
              <Badge
                size="lg"
                variant="light"
                style={{ minWidth: '60px', textAlign: 'center' }}
              >
                {appState.currentRepIndex + 1}/{repCount || 0}
              </Badge>
              <Button
                variant="default"
                size="sm"
                disabled={appState.currentRepIndex >= repCount - 1}
                onClick={navigateToNextRep}
                rightSection={
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
                  </svg>
                }
              >
                <span className="button-text">Next</span>
              </Button>
            </Group>
          </Group>
          <div
            id="checkpoint-grid-container"
            className="checkpoint-grid-container"
            ref={checkpointGridRef}
          />
        </Stack>
      </Box>

      {/* Fullscreen checkpoint modal */}
      {isFullscreen && (
        <div className="fullscreen-modal">{renderFullscreenCheckpoint()}</div>
      )}
    </Box>
  );
};

export default AnalysisSection;
