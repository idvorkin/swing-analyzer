import { Observable, type Subscription } from 'rxjs';
import type { Pipeline } from '../pipeline/Pipeline';
import type { CheckpointEvent } from '../pipeline/PipelineInterfaces';
import { type AppState, type FormCheckpoint, FormPosition } from '../types';

/**
 * ViewModel for Form Checkpoint functionality
 * Handles UI interactions and displays for form checkpoints
 */
export class FormCheckpointViewModel {
  // Canvas for displaying the grid of checkpoints
  private displayGridCanvas: HTMLCanvasElement;
  private displayCtx: CanvasRenderingContext2D;

  // Fullscreen overlay elements
  private fullscreenOverlay: HTMLDivElement = document.createElement('div');
  private fullscreenCanvas: HTMLCanvasElement =
    document.createElement('canvas');

  // Current states
  private currentFullscreenRep = 0;
  private currentFullscreenPosition: FormPosition = FormPosition.Top;

  // Subscription to checkpoint events
  private checkpointSubscription: Subscription | null = null;

  // Rep checkpoints storage
  private checkpointsPerRep: Map<number, Map<FormPosition, FormCheckpoint>> =
    new Map();

  constructor(
    private pipeline: Pipeline,
    private videoElement: HTMLVideoElement,
    private canvasElement: HTMLCanvasElement,
    private checkpointGridElement: HTMLElement,
    private appState: AppState
  ) {
    // Create grid canvas
    this.displayGridCanvas = document.createElement('canvas');
    this.displayGridCanvas.width = 640;
    this.displayGridCanvas.height = 480;
    this.displayGridCanvas.classList.add('checkpoint-grid-canvas');
    this.checkpointGridElement.appendChild(this.displayGridCanvas);

    const displayCtx = this.displayGridCanvas.getContext('2d');
    if (!displayCtx) throw new Error('Could not get display canvas context');
    this.displayCtx = displayCtx;

    // Add click handler for fullscreen viewing
    this.displayGridCanvas.addEventListener(
      'click',
      this.handleGridClick.bind(this)
    );

    // Create fullscreen elements
    this.createFullscreenElements();
  }

  /**
   * Initialize event listeners for pipeline events
   */
  initialize(): void {
    // Subscribe to checkpoint events from the pipeline
    this.subscribeToCheckpointEvents();
  }

  /**
   * Subscribe to checkpoint events from the pipeline
   */
  private subscribeToCheckpointEvents(): void {
    // Stop any existing subscription
    if (this.checkpointSubscription) {
      this.checkpointSubscription.unsubscribe();
    }

    // Create new subscription to pipeline checkpoint events
    this.checkpointSubscription = this.pipeline.getCheckpointEvents().subscribe(
      (event: CheckpointEvent) => this.handleCheckpointEvent(event),
      (error: unknown) =>
        console.error('Error in checkpoint subscription:', error)
    );
  }

  /**
   * Handle checkpoint events from the pipeline
   */
  private handleCheckpointEvent(event: CheckpointEvent): void {
    // If there's a new checkpoint
    if (event.checkpoint && event.position) {
      const repCount = this.pipeline.getRepCount();

      // Get or create rep map
      if (!this.checkpointsPerRep.has(repCount)) {
        this.checkpointsPerRep.set(
          repCount,
          new Map<FormPosition, FormCheckpoint>()
        );
      }

      // Store checkpoint
      const repMap = this.checkpointsPerRep.get(repCount);
      if (repMap) {
        repMap.set(event.position, event.checkpoint);
      }

      // Update display
      this.updateDisplay();
    }
  }

  /**
   * Create fullscreen overlay elements
   */
  private createFullscreenElements(): void {
    // Create fullscreen overlay
    this.fullscreenOverlay.classList.add('checkpoint-fullscreen-overlay');
    this.fullscreenOverlay.style.display = 'none';
    this.fullscreenOverlay.style.position = 'fixed';
    this.fullscreenOverlay.style.top = '0';
    this.fullscreenOverlay.style.left = '0';
    this.fullscreenOverlay.style.width = '100%';
    this.fullscreenOverlay.style.height = '100%';
    this.fullscreenOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
    this.fullscreenOverlay.style.zIndex = '1000';
    this.fullscreenOverlay.style.display = 'none';
    this.fullscreenOverlay.style.justifyContent = 'center';
    this.fullscreenOverlay.style.alignItems = 'center';
    this.fullscreenOverlay.style.cursor = 'pointer';

    // Create close button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.position = 'absolute';
    closeBtn.style.top = '20px';
    closeBtn.style.right = '20px';
    closeBtn.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    closeBtn.style.color = 'white';
    closeBtn.style.border = 'none';
    closeBtn.style.borderRadius = '50%';
    closeBtn.style.width = '40px';
    closeBtn.style.height = '40px';
    closeBtn.style.fontSize = '20px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.zIndex = '1001';

    // Create fullscreen canvas
    this.fullscreenCanvas.style.maxWidth = '90%';
    this.fullscreenCanvas.style.maxHeight = '90%';
    this.fullscreenCanvas.style.objectFit = 'contain';
    this.fullscreenCanvas.style.border = '2px solid white';
    this.fullscreenCanvas.style.borderRadius = '5px';

    // Create navigation buttons
    const prevBtn = document.createElement('button');
    prevBtn.textContent = '←';
    prevBtn.style.position = 'absolute';
    prevBtn.style.left = '20px';
    prevBtn.style.top = '50%';
    prevBtn.style.transform = 'translateY(-50%)';
    prevBtn.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    prevBtn.style.color = 'white';
    prevBtn.style.border = 'none';
    prevBtn.style.borderRadius = '50%';
    prevBtn.style.width = '50px';
    prevBtn.style.height = '50px';
    prevBtn.style.fontSize = '24px';
    prevBtn.style.cursor = 'pointer';
    prevBtn.style.zIndex = '1001';

    const nextBtn = document.createElement('button');
    nextBtn.textContent = '→';
    nextBtn.style.position = 'absolute';
    nextBtn.style.right = '20px';
    nextBtn.style.top = '50%';
    nextBtn.style.transform = 'translateY(-50%)';
    nextBtn.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    nextBtn.style.color = 'white';
    nextBtn.style.border = 'none';
    nextBtn.style.borderRadius = '50%';
    nextBtn.style.width = '50px';
    nextBtn.style.height = '50px';
    nextBtn.style.fontSize = '24px';
    nextBtn.style.cursor = 'pointer';
    nextBtn.style.zIndex = '1001';

    // Add event listeners
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeFullscreen();
    });

    prevBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.navigateFullscreen('prev');
    });

    nextBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.navigateFullscreen('next');
    });

    this.fullscreenOverlay.addEventListener('click', () => {
      this.closeFullscreen();
    });

    this.fullscreenOverlay.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') {
        this.navigateFullscreen('prev');
      } else if (e.key === 'ArrowRight') {
        this.navigateFullscreen('next');
      } else if (e.key === 'Escape') {
        this.closeFullscreen();
      }
    });

    // Append elements
    this.fullscreenOverlay.appendChild(this.fullscreenCanvas);
    this.fullscreenOverlay.appendChild(closeBtn);
    this.fullscreenOverlay.appendChild(prevBtn);
    this.fullscreenOverlay.appendChild(nextBtn);
    document.body.appendChild(this.fullscreenOverlay);
  }

  /**
   * Handle grid click to show fullscreen
   */
  private handleGridClick(event: MouseEvent): void {
    // Get canvas dimensions
    const rect = this.displayGridCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Convert to relative coordinates
    const relX = x / rect.width;
    const relY = y / rect.height;

    // Get clicked position
    let clickedPosition: FormPosition | null = null;
    if (relY < 0.5) {
      if (relX < 0.5) {
        clickedPosition = FormPosition.Top;
      } else {
        clickedPosition = FormPosition.Hinge;
      }
    } else {
      if (relX < 0.5) {
        clickedPosition = FormPosition.Bottom;
      } else {
        clickedPosition = FormPosition.Release;
      }
    }

    // Get the rep checkpoints
    const repMap = this.checkpointsPerRep.get(this.appState.currentRepIndex);
    if (repMap && clickedPosition && repMap.has(clickedPosition)) {
      const checkpoint = repMap.get(clickedPosition);
      if (checkpoint) {
        this.showFullscreen(checkpoint);
        this.currentFullscreenRep = this.appState.currentRepIndex;
        this.currentFullscreenPosition = clickedPosition;
      }
    }
  }

  /**
   * Navigate between fullscreen checkpoints
   */
  private navigateFullscreen(direction: 'prev' | 'next'): void {
    const positions = [
      FormPosition.Top,
      FormPosition.Hinge,
      FormPosition.Bottom,
      FormPosition.Release,
    ];

    const currentPositionIndex = positions.indexOf(
      this.currentFullscreenPosition
    );
    let newPositionIndex: number;
    let newRep = this.currentFullscreenRep;

    if (direction === 'next') {
      if (currentPositionIndex === positions.length - 1) {
        // Move to next rep
        newRep++;
        newPositionIndex = 0;
      } else {
        // Move to next position
        newPositionIndex = currentPositionIndex + 1;
      }
    } else {
      if (currentPositionIndex === 0) {
        // Move to previous rep
        newRep--;
        newPositionIndex = positions.length - 1;
      } else {
        // Move to previous position
        newPositionIndex = currentPositionIndex - 1;
      }
    }

    // Check if new rep exists
    if (newRep < 0 || newRep >= this.checkpointsPerRep.size) {
      return; // Don't navigate out of bounds
    }

    const newPosition = positions[newPositionIndex];
    const repMap = this.checkpointsPerRep.get(newRep);

    if (repMap?.has(newPosition)) {
      // Update current position and rep
      this.currentFullscreenPosition = newPosition;
      this.currentFullscreenRep = newRep;

      // Show in fullscreen
      const checkpoint = repMap.get(newPosition);
      if (checkpoint) {
        this.displayFullscreenCheckpoint(checkpoint, newRep);
      }
    }
  }

  /**
   * Display a checkpoint in fullscreen
   */
  private displayFullscreenCheckpoint(
    checkpoint: FormCheckpoint,
    repNumber: number
  ): void {
    const ctx = this.fullscreenCanvas.getContext('2d');
    if (!ctx) return;

    // Set canvas dimensions
    this.fullscreenCanvas.width = checkpoint.image.width;
    this.fullscreenCanvas.height = checkpoint.image.height;

    // Draw the checkpoint image
    ctx.putImageData(checkpoint.image, 0, 0);

    // Draw info text
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, this.fullscreenCanvas.width, 40);

    ctx.fillStyle = 'white';
    ctx.font = '18px Arial';
    ctx.textAlign = 'center';
    const positionName = this.formatPositionName(checkpoint.position);
    ctx.fillText(
      `Rep ${repNumber + 1} - ${positionName} - Spine: ${Math.abs(checkpoint.spineAngle).toFixed(1)}°`,
      this.fullscreenCanvas.width / 2,
      25
    );
  }

  /**
   * Format position name for display
   */
  private formatPositionName(position: FormPosition): string {
    return position.charAt(0).toUpperCase() + position.slice(1);
  }

  /**
   * Show a checkpoint in fullscreen
   */
  private showFullscreen(checkpoint: FormCheckpoint): void {
    // Display the checkpoint
    this.displayFullscreenCheckpoint(checkpoint, this.currentFullscreenRep);

    // Show overlay
    this.fullscreenOverlay.style.display = 'flex';

    // Make it focusable for keyboard navigation
    this.fullscreenOverlay.tabIndex = 0;
    this.fullscreenOverlay.focus();
  }

  /**
   * Close fullscreen view
   */
  private closeFullscreen(): void {
    this.fullscreenOverlay.style.display = 'none';
  }

  /**
   * Update the checkpoint grid display
   */
  updateDisplay(): void {
    // Clear the canvas
    this.clearDisplay();

    // Get checkpoints for current rep
    const repMap = this.checkpointsPerRep.get(this.appState.currentRepIndex);
    if (!repMap) return;

    // Grid layout: 2x2 grid
    // Top Left: Top position
    // Top Right: Hinge position
    // Bottom Left: Bottom position
    // Bottom Right: Release position
    const positions = [
      { pos: FormPosition.Top, x: 0, y: 0 },
      { pos: FormPosition.Hinge, x: 1, y: 0 },
      { pos: FormPosition.Bottom, x: 0, y: 1 },
      { pos: FormPosition.Release, x: 1, y: 1 },
    ];

    const canvasWidth = this.displayGridCanvas.width;
    const canvasHeight = this.displayGridCanvas.height;
    const cellWidth = canvasWidth / 2;
    const cellHeight = canvasHeight / 2;

    // Draw grid lines
    this.displayCtx.strokeStyle = '#ccc';
    this.displayCtx.lineWidth = 2;
    this.displayCtx.beginPath();
    this.displayCtx.moveTo(cellWidth, 0);
    this.displayCtx.lineTo(cellWidth, canvasHeight);
    this.displayCtx.moveTo(0, cellHeight);
    this.displayCtx.lineTo(canvasWidth, cellHeight);
    this.displayCtx.stroke();

    // Draw each position
    for (const { pos, x, y } of positions) {
      const checkpoint = repMap.get(pos);
      const cellX = x * cellWidth;
      const cellY = y * cellHeight;

      // Draw position label
      this.displayCtx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      this.displayCtx.fillRect(cellX, cellY, cellWidth, 30);
      this.displayCtx.fillStyle = 'white';
      this.displayCtx.font = '16px Arial';
      this.displayCtx.textAlign = 'center';

      const posName = this.formatPositionName(pos);
      this.displayCtx.fillText(
        checkpoint
          ? `${posName} (${Math.abs(checkpoint.spineAngle).toFixed(1)}°)`
          : posName,
        cellX + cellWidth / 2,
        cellY + 20
      );

      // Draw the checkpoint image if available
      if (checkpoint) {
        // Create a temporary canvas for the image
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = checkpoint.image.width;
        tempCanvas.height = checkpoint.image.height;
        const tempCtx = tempCanvas.getContext('2d');
        if (tempCtx) {
          tempCtx.putImageData(checkpoint.image, 0, 0);

          // Scale and draw the image to fit the cell
          const aspectRatio = tempCanvas.width / tempCanvas.height;
          let drawWidth = cellWidth;
          let drawHeight = drawWidth / aspectRatio;

          // If height exceeds cell, adjust
          if (drawHeight > cellHeight - 30) {
            drawHeight = cellHeight - 30;
            drawWidth = drawHeight * aspectRatio;
          }

          // Center the image in the cell
          const drawX = cellX + (cellWidth - drawWidth) / 2;
          const drawY = cellY + 30; // Below the label

          this.displayCtx.drawImage(
            tempCanvas,
            drawX,
            drawY,
            drawWidth,
            drawHeight
          );
        }
      } else {
        // Draw placeholder if no checkpoint
        this.displayCtx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        this.displayCtx.fillRect(
          cellX + 10,
          cellY + 40,
          cellWidth - 20,
          cellHeight - 50
        );
        this.displayCtx.fillStyle = '#999';
        this.displayCtx.font = '14px Arial';
        this.displayCtx.fillText(
          'Not detected',
          cellX + cellWidth / 2,
          cellY + cellHeight / 2
        );
      }
    }
  }

  /**
   * Clear the display
   */
  private clearDisplay(): void {
    this.displayCtx.fillStyle = '#f5f5f7'; // Light gray background
    this.displayCtx.fillRect(
      0,
      0,
      this.displayGridCanvas.width,
      this.displayGridCanvas.height
    );
  }

  /**
   * Navigate to a specific rep
   */
  navigateToRep(repIndex: number): boolean {
    if (repIndex < 0 || repIndex >= this.checkpointsPerRep.size) {
      return false;
    }

    this.appState.currentRepIndex = repIndex;
    this.updateDisplay();
    return true;
  }

  /**
   * Get total number of reps
   */
  getRepCount(): number {
    return this.checkpointsPerRep.size;
  }

  /**
   * Reset view model
   */
  reset(): void {
    this.checkpointsPerRep.clear();
    this.appState.currentRepIndex = 0;
    this.clearDisplay();
  }

  /**
   * Clean up when component is destroyed
   */
  destroy(): void {
    if (this.checkpointSubscription) {
      this.checkpointSubscription.unsubscribe();
    }

    // Remove fullscreen overlay if it exists
    if (this.fullscreenOverlay?.parentNode) {
      this.fullscreenOverlay.parentNode.removeChild(this.fullscreenOverlay);
    }
  }
}
