import { FormCheckpoint, FormPosition, PoseKeypoint, RepData } from './types';

export class FormCheckpoints {
  private reps: RepData[] = [];
  private currentRep: RepData | null = null;
  private canvasContext: CanvasRenderingContext2D;
  private displayCanvasContext: CanvasRenderingContext2D;
  private displayGridCanvas: HTMLCanvasElement;
  private fullscreenOverlay: HTMLDivElement | null = null;
  private fullscreenCanvas: HTMLCanvasElement | null = null;
  private lastPosition = FormPosition.Top;
  private isRecording = true; // Always recording by default
  private currentFullscreenRep: number = 0;
  private currentFullscreenPosition: FormPosition = FormPosition.Top;

  // Angle thresholds for position detection
  private readonly HINGE_THRESHOLD = 20; // Degrees from vertical
  private readonly BOTTOM_THRESHOLD = 60; // Degrees from vertical 
  private readonly RELEASE_THRESHOLD = 45; // Degrees from vertical

  constructor(
    private videoElement: HTMLVideoElement,
    private canvasElement: HTMLCanvasElement,
    private checkpointGridElement: HTMLElement
  ) {
    // Get the canvas context for capturing frames
    const ctx = canvasElement.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas context');
    this.canvasContext = ctx;

    // Create a new canvas for the checkpoint grid display
    this.displayGridCanvas = document.createElement('canvas');
    this.displayGridCanvas.width = 640;
    this.displayGridCanvas.height = 480;
    this.displayGridCanvas.classList.add('checkpoint-grid-canvas');
    this.checkpointGridElement.appendChild(this.displayGridCanvas);

    const displayCtx = this.displayGridCanvas.getContext('2d');
    if (!displayCtx) throw new Error('Could not get display canvas context');
    this.displayCanvasContext = displayCtx;
    
    // Add click event listener for fullscreen viewing
    this.displayGridCanvas.addEventListener('click', this.handleGridClick.bind(this));
    
    // Create fullscreen overlay elements
    this.createFullscreenElements();
  }
  
  /**
   * Create fullscreen overlay elements
   */
  private createFullscreenElements(): void {
    // Create fullscreen overlay
    this.fullscreenOverlay = document.createElement('div');
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
    this.fullscreenCanvas = document.createElement('canvas');
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
   * Navigate between fullscreen checkpoints
   */
  private navigateFullscreen(direction: 'prev' | 'next'): void {
    if (!this.fullscreenOverlay || this.reps.length === 0) return;
    
    const positions = [
      FormPosition.Top,
      FormPosition.Hinge,
      FormPosition.Bottom,
      FormPosition.Release
    ];
    
    const currentPositionIndex = positions.indexOf(this.currentFullscreenPosition);
    
    if (direction === 'next') {
      // If we're at the last position, move to the next rep
      if (currentPositionIndex === positions.length - 1) {
        // If there's a next rep, move to it
        if (this.currentFullscreenRep < this.reps.length - 1) {
          this.currentFullscreenRep++;
          this.currentFullscreenPosition = positions[0];
        }
      } else {
        // Move to the next position
        this.currentFullscreenPosition = positions[currentPositionIndex + 1];
      }
    } else {
      // If we're at the first position, move to the previous rep
      if (currentPositionIndex === 0) {
        // If there's a previous rep, move to it
        if (this.currentFullscreenRep > 0) {
          this.currentFullscreenRep--;
          this.currentFullscreenPosition = positions[positions.length - 1];
        }
      } else {
        // Move to the previous position
        this.currentFullscreenPosition = positions[currentPositionIndex - 1];
      }
    }
    
    // Get the rep and checkpoint
    const rep = this.reps[this.currentFullscreenRep];
    if (!rep) return;
    
    const checkpoint = rep.checkpoints.get(this.currentFullscreenPosition);
    if (checkpoint) {
      this.displayFullscreenCheckpoint(checkpoint, rep.repNumber);
    } else {
      // If the checkpoint doesn't exist, try to find the next available one
      if (direction === 'next') {
        for (let i = currentPositionIndex + 1; i < positions.length; i++) {
          const nextCheckpoint = rep.checkpoints.get(positions[i]);
          if (nextCheckpoint) {
            this.currentFullscreenPosition = positions[i];
            this.displayFullscreenCheckpoint(nextCheckpoint, rep.repNumber);
            break;
          }
        }
      } else {
        for (let i = currentPositionIndex - 1; i >= 0; i--) {
          const prevCheckpoint = rep.checkpoints.get(positions[i]);
          if (prevCheckpoint) {
            this.currentFullscreenPosition = positions[i];
            this.displayFullscreenCheckpoint(prevCheckpoint, rep.repNumber);
            break;
          }
        }
      }
    }
  }
  
  /**
   * Display a checkpoint in fullscreen
   */
  private displayFullscreenCheckpoint(checkpoint: FormCheckpoint, repNumber: number): void {
    if (!this.fullscreenCanvas) return;
    
    // Set canvas size to match image
    this.fullscreenCanvas.width = checkpoint.image.width;
    this.fullscreenCanvas.height = checkpoint.image.height;
    
    // Draw the image
    const ctx = this.fullscreenCanvas.getContext('2d');
    if (ctx) {
      ctx.putImageData(checkpoint.image, 0, 0);
      
      // Add position and angle text with darker background for better visibility
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(10, 10, 380, 40);
      
      ctx.font = 'bold 20px Arial';
      ctx.fillStyle = 'white';
      ctx.fillText(
        `Rep #${repNumber} - ${this.formatPositionName(checkpoint.position)} - ${checkpoint.spineAngle.toFixed(1)}°`, 
        20, 
        38
      );
      
      // Add navigation hints at the bottom
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(10, this.fullscreenCanvas.height - 50, 500, 40);
      
      ctx.font = '16px Arial';
      ctx.fillStyle = 'white';
      ctx.fillText(
        '← Previous Position | → Next Position | ESC to Close', 
        20, 
        this.fullscreenCanvas.height - 25
      );
    }
  }
  
  /**
   * Handle click on the grid to show fullscreen view
   */
  private handleGridClick(event: MouseEvent): void {
    if (!this.currentRep) return;
    
    const rect = this.displayGridCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    // Convert to normalized coordinates
    const normX = x / rect.width;
    const normY = y / rect.height;
    
    // Determine which cell was clicked
    const cellX = normX >= 0.5 ? 1 : 0;
    const cellY = normY >= 0.5 ? 1 : 0;
    
    // Map to position
    let position: FormPosition;
    if (cellX === 0 && cellY === 0) position = FormPosition.Top;
    else if (cellX === 1 && cellY === 0) position = FormPosition.Hinge;
    else if (cellX === 0 && cellY === 1) position = FormPosition.Bottom;
    else position = FormPosition.Release;
    
    // Get the checkpoint for this position
    const checkpoint = this.currentRep.checkpoints.get(position);
    if (checkpoint) {
      this.showFullscreen(checkpoint);
    } else {
      // Provide visual feedback when the position isn't available
      const positionName = this.formatPositionName(position);
      const tempOverlay = document.createElement('div');
      tempOverlay.style.position = 'fixed';
      tempOverlay.style.top = '50%';
      tempOverlay.style.left = '50%';
      tempOverlay.style.transform = 'translate(-50%, -50%)';
      tempOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
      tempOverlay.style.color = 'white';
      tempOverlay.style.padding = '20px';
      tempOverlay.style.borderRadius = '10px';
      tempOverlay.style.zIndex = '1000';
      tempOverlay.style.textAlign = 'center';
      tempOverlay.textContent = `${positionName} position not captured for this rep`;
      
      document.body.appendChild(tempOverlay);
      
      // Remove after 2 seconds
      setTimeout(() => {
        document.body.removeChild(tempOverlay);
      }, 2000);
    }
  }
  
  /**
   * Show checkpoint in fullscreen
   */
  private showFullscreen(checkpoint: FormCheckpoint): void {
    if (!this.fullscreenOverlay || !this.fullscreenCanvas || !this.currentRep) return;
    
    // Save the current position and rep for navigation
    this.currentFullscreenPosition = checkpoint.position;
    
    // Find the rep index
    this.currentFullscreenRep = this.reps.findIndex(rep => rep.repNumber === this.currentRep?.repNumber);
    if (this.currentFullscreenRep === -1 && this.reps.length > 0) {
      // If the current rep isn't in the saved reps (likely the active rep),
      // use the last saved rep
      this.currentFullscreenRep = this.reps.length - 1;
    }
    
    // Display the checkpoint
    this.displayFullscreenCheckpoint(checkpoint, this.currentRep.repNumber);
    
    // Show the overlay
    this.fullscreenOverlay.style.display = 'flex';
    
    // Set focus for keyboard navigation
    this.fullscreenOverlay.tabIndex = 0;
    this.fullscreenOverlay.focus();
  }
  
  /**
   * Close fullscreen view
   */
  private closeFullscreen(): void {
    if (this.fullscreenOverlay) {
      this.fullscreenOverlay.style.display = 'none';
    }
  }

  /**
   * Reset all recorded data
   */
  reset(): void {
    this.reps = [];
    this.currentRep = null;
    this.lastPosition = FormPosition.Top;
    console.log('Reset form checkpoints');
    
    // Clear the display
    this.clearDisplay();
  }

  /**
   * Process the current frame and try to detect key positions
   */
  processFrame(keypoints: PoseKeypoint[], spineAngle: number, repCount: number): void {
    // Always recording 

    // Check if we're starting a new rep
    if (!this.currentRep || this.currentRep.repNumber !== repCount) {
      // If we have a current rep and it's different from the new rep count
      if (this.currentRep && this.currentRep.checkpoints.size > 0) {
        // Save the completed rep
        this.reps.push(this.currentRep);
      }

      // Create a new rep
      this.currentRep = {
        repNumber: repCount,
        checkpoints: new Map()
      };
      this.lastPosition = FormPosition.Top;

      // Capture the top position at the start of a new rep
      this.capturePosition(FormPosition.Top, keypoints, spineAngle);
    }

    // Determine current position based on spine angle and previous position
    this.detectAndCapturePositions(keypoints, spineAngle);
    
    // Update the display
    this.updateDisplay();
  }

  /**
   * Detect positions and capture frames when appropriate
   */
  private detectAndCapturePositions(keypoints: PoseKeypoint[], spineAngle: number): void {
    if (!this.currentRep) return;

    const absSpineAngle = Math.abs(spineAngle);

    // State machine for position detection
    switch (this.lastPosition) {
      case FormPosition.Top:
        // From Top, we can only go to Hinge
        if (absSpineAngle > this.HINGE_THRESHOLD && !this.currentRep.checkpoints.has(FormPosition.Hinge)) {
          this.capturePosition(FormPosition.Hinge, keypoints, spineAngle);
          this.lastPosition = FormPosition.Hinge;
        }
        break;

      case FormPosition.Hinge:
        // From Hinge, we can go to Bottom
        if (absSpineAngle > this.BOTTOM_THRESHOLD && !this.currentRep.checkpoints.has(FormPosition.Bottom)) {
          this.capturePosition(FormPosition.Bottom, keypoints, spineAngle);
          this.lastPosition = FormPosition.Bottom;
        }
        break;

      case FormPosition.Bottom:
        // From Bottom, we can go to Release
        // Release is detected when the spine angle starts decreasing from bottom position
        if (absSpineAngle < this.RELEASE_THRESHOLD && !this.currentRep.checkpoints.has(FormPosition.Release)) {
          this.capturePosition(FormPosition.Release, keypoints, spineAngle);
          this.lastPosition = FormPosition.Release;
        }
        break;

      case FormPosition.Release:
        // From Release, we go back to Top for the next rep
        // This happens automatically when the rep counter increases
        break;
    }
  }

  /**
   * Capture a frame for a specific position
   */
  private capturePosition(position: FormPosition, keypoints: PoseKeypoint[], spineAngle: number): void {
    if (!this.currentRep) return;

    console.log(`Capturing position: ${position}, spine angle: ${spineAngle.toFixed(2)}`);

    // Create a temporary canvas to blend video and skeleton
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = this.canvasElement.width;
    tempCanvas.height = this.canvasElement.height;
    const tempCtx = tempCanvas.getContext('2d');
    
    if (tempCtx) {
      // First draw the video frame
      tempCtx.drawImage(
        this.videoElement,
        0, 0,
        tempCanvas.width,
        tempCanvas.height
      );
      
      // Then draw the canvas with the skeleton overlay
      tempCtx.drawImage(
        this.canvasElement,
        0, 0,
        tempCanvas.width,
        tempCanvas.height
      );
      
      // Get the combined image data
      const imageData = tempCtx.getImageData(
        0, 0,
        tempCanvas.width,
        tempCanvas.height
      );
      
      // Create a checkpoint
      const checkpoint: FormCheckpoint = {
        position,
        timestamp: Date.now(),
        image: imageData,
        spineAngle
      };
  
      // Add to the current rep
      this.currentRep.checkpoints.set(position, checkpoint);
    }
  }

  /**
   * Update the checkpoint display
   */
  updateDisplay(): void {
    if (!this.currentRep) return;
    
    this.clearDisplay();
    
    // Set up the 2x2 grid
    const gridWidth = this.displayGridCanvas.width;
    const gridHeight = this.displayGridCanvas.height;
    const cellWidth = gridWidth / 2;
    const cellHeight = gridHeight / 2;
    
    // Draw each position in its cell
    const positions = [
      { pos: FormPosition.Top, x: 0, y: 0 },
      { pos: FormPosition.Hinge, x: cellWidth, y: 0 },
      { pos: FormPosition.Bottom, x: 0, y: cellHeight },
      { pos: FormPosition.Release, x: cellWidth, y: cellHeight }
    ];
    
    // Draw the grid lines
    this.displayCanvasContext.strokeStyle = 'white';
    this.displayCanvasContext.lineWidth = 2;
    this.displayCanvasContext.beginPath();
    // Vertical line
    this.displayCanvasContext.moveTo(cellWidth, 0);
    this.displayCanvasContext.lineTo(cellWidth, gridHeight);
    // Horizontal line
    this.displayCanvasContext.moveTo(0, cellHeight);
    this.displayCanvasContext.lineTo(gridWidth, cellHeight);
    this.displayCanvasContext.stroke();
    
    // Draw each position
    for (const { pos, x, y } of positions) {
      const checkpoint = this.currentRep.checkpoints.get(pos);
      if (checkpoint) {
        // Calculate the scale to fit in the cell while maintaining aspect ratio
        const scale = Math.min(
          cellWidth / checkpoint.image.width,
          cellHeight / checkpoint.image.height
        );
        
        const scaledWidth = checkpoint.image.width * scale;
        const scaledHeight = checkpoint.image.height * scale;
        
        // Center the image in the cell
        const xOffset = x + (cellWidth - scaledWidth) / 2;
        const yOffset = y + (cellHeight - scaledHeight) / 2;
        
        // Create a temporary canvas to draw the ImageData
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = checkpoint.image.width;
        tempCanvas.height = checkpoint.image.height;
        const tempCtx = tempCanvas.getContext('2d');
        if (tempCtx) {
          tempCtx.putImageData(checkpoint.image, 0, 0);
          
          // Draw the image to the grid
          this.displayCanvasContext.drawImage(
            tempCanvas, 
            xOffset, yOffset, 
            scaledWidth, scaledHeight
          );
        }
        
        // Add text label with background for better readability
        // Create a semi-transparent background for the text
        this.displayCanvasContext.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.displayCanvasContext.fillRect(x + 5, y + 5, cellWidth - 10, 30);
        
        // Add text label
        this.displayCanvasContext.fillStyle = 'white';
        this.displayCanvasContext.font = 'bold 16px Arial';
        this.displayCanvasContext.fillText(
          `${this.formatPositionName(pos)} (${checkpoint.spineAngle.toFixed(1)}°)`, 
          x + 10, 
          y + 25
        );
      } else {
        // Draw placeholder for missing position
        this.displayCanvasContext.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this.displayCanvasContext.fillRect(x, y, cellWidth, cellHeight);
        
        // Add text label with background
        this.displayCanvasContext.fillStyle = 'rgba(50, 50, 50, 0.8)';
        this.displayCanvasContext.fillRect(x + 5, y + 5, cellWidth - 10, 30);
        
        this.displayCanvasContext.fillStyle = 'white';
        this.displayCanvasContext.font = 'bold 16px Arial';
        this.displayCanvasContext.fillText(
          `${this.formatPositionName(pos)} - waiting...`, 
          x + 10, 
          y + 25
        );
      }
    }
    
    // Add rep number at the bottom
    this.displayCanvasContext.fillStyle = 'rgba(0, 0, 0, 0.7)';
    this.displayCanvasContext.fillRect(5, gridHeight - 35, 150, 30);
    
    this.displayCanvasContext.fillStyle = 'white';
    this.displayCanvasContext.font = 'bold 16px Arial';
    this.displayCanvasContext.fillText(
      `Repetition #${this.currentRep.repNumber}`, 
      15, 
      gridHeight - 15
    );
  }
  
  /**
   * Format position name for display (capitalize first letter)
   */
  private formatPositionName(position: FormPosition): string {
    return position.charAt(0).toUpperCase() + position.slice(1);
  }

  /**
   * Clear the display
   */
  private clearDisplay(): void {
    this.displayCanvasContext.fillStyle = 'black';
    this.displayCanvasContext.fillRect(
      0, 0, 
      this.displayGridCanvas.width, 
      this.displayGridCanvas.height
    );
    
    // If no current rep, show an instruction message
    if (!this.currentRep) {
      const width = this.displayGridCanvas.width;
      const height = this.displayGridCanvas.height;
      
      // Draw background for the message
      this.displayCanvasContext.fillStyle = 'rgba(0, 0, 0, 0.6)';
      this.displayCanvasContext.fillRect(width/4, height/2 - 40, width/2, 80);
      
      // Draw border
      this.displayCanvasContext.strokeStyle = '#0071e3';
      this.displayCanvasContext.lineWidth = 2;
      this.displayCanvasContext.strokeRect(width/4, height/2 - 40, width/2, 80);
      
      // Draw text
      this.displayCanvasContext.fillStyle = 'white';
      this.displayCanvasContext.font = 'bold 16px Arial';
      this.displayCanvasContext.textAlign = 'center';
      this.displayCanvasContext.fillText(
        'Perform your exercise', 
        width/2, 
        height/2 - 15
      );
      this.displayCanvasContext.fillText(
        'Checkpoints will be captured automatically', 
        width/2, 
        height/2 + 15
      );
      
      // Reset text alignment
      this.displayCanvasContext.textAlign = 'left';
    }
  }

  /**
   * Navigate to a specific rep
   */
  navigateToRep(repIndex: number): boolean {
    if (repIndex < 0 || repIndex >= this.reps.length) {
      return false;
    }

    this.currentRep = this.reps[repIndex];
    this.updateDisplay();
    return true;
  }

  /**
   * Get the total number of recorded reps
   */
  getRepCount(): number {
    return this.reps.length;
  }
} 