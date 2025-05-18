import { PipelineFactory } from './pipeline/PipelineFactory';
import { SwingAnalyzerViewModel } from './viewmodels/SwingAnalyzerViewModel';
import { FormCheckpointViewModel } from './viewmodels/FormCheckpointViewModel';
import { FrameStage } from './pipeline/FrameStage';
import { AppState } from './types';
import { FormCheckpointChecker } from './FormCheckpointChecker';

// Main application class
class SwingAnalyzerApp {
  // DOM elements
  private video: HTMLVideoElement;
  private canvas: HTMLCanvasElement;
  private repCounter: HTMLElement;
  private spineAngle: HTMLElement;
  private statusEl: HTMLElement;
  
  // UI control elements
  private cameraBtn: HTMLButtonElement;
  private playPauseBtn: HTMLButtonElement;
  private stopBtn: HTMLButtonElement;
  private videoUpload: HTMLInputElement;
  private loadHardcodedBtn: HTMLButtonElement;
  private switchCameraBtn: HTMLButtonElement;
  private displayModeRadios: NodeListOf<HTMLInputElement>;
  private showKeypointsBtn: HTMLButtonElement;
  private prevRepBtn: HTMLButtonElement;
  private nextRepBtn: HTMLButtonElement;
  private currentRepEl: HTMLElement;
  private checkpointGridContainer: HTMLElement;
  private debugModeToggle: HTMLInputElement;
  
  // Component references
  private frameAcquisition!: FrameStage;
  private viewModel!: SwingAnalyzerViewModel;
  private formViewModel!: FormCheckpointViewModel;
  
  // Compatibility layer for legacy code
  private formCheckpointChecker!: FormCheckpointChecker;
  
  // Application state
  private appState: AppState = {
    usingCamera: false,
    cameraMode: 'environment',
    displayMode: 'both',
    isModelLoaded: false,
    isProcessing: false,
    repCounter: {
      count: 0,
      isHinge: false,
      lastHingeState: false,
      hingeThreshold: 45
    },
    showBodyParts: true,
    bodyPartDisplayTime: 0.5,
    currentRepIndex: 0
  };
  
  constructor() {
    // Find DOM elements
    this.video = document.getElementById('video') as HTMLVideoElement;
    this.canvas = document.getElementById('output-canvas') as HTMLCanvasElement;
    this.repCounter = document.getElementById('rep-counter') as HTMLElement;
    this.spineAngle = document.getElementById('spine-angle') as HTMLElement;
    this.statusEl = document.getElementById('status') as HTMLElement;
    
    this.cameraBtn = document.getElementById('camera-btn') as HTMLButtonElement;
    this.playPauseBtn = document.getElementById('play-pause-btn') as HTMLButtonElement;
    this.stopBtn = document.getElementById('stop-btn') as HTMLButtonElement;
    this.videoUpload = document.getElementById('video-upload') as HTMLInputElement;
    this.loadHardcodedBtn = document.getElementById('load-hardcoded-btn') as HTMLButtonElement;
    this.switchCameraBtn = document.getElementById('switch-camera-btn') as HTMLButtonElement;
    this.displayModeRadios = document.querySelectorAll('input[name="display-mode"]') as NodeListOf<HTMLInputElement>;
    this.showKeypointsBtn = document.getElementById('show-keypoints-btn') as HTMLButtonElement;
    
    this.prevRepBtn = document.getElementById('prev-rep-btn') as HTMLButtonElement;
    this.nextRepBtn = document.getElementById('next-rep-btn') as HTMLButtonElement;
    this.currentRepEl = document.getElementById('current-rep') as HTMLElement;
    this.checkpointGridContainer = document.getElementById('checkpoint-grid-container') as HTMLElement;
    this.debugModeToggle = document.getElementById('debug-mode-toggle') as HTMLInputElement;
    
    // Create components using factory
    this.initializeComponents();
    
    // Set up event listeners
    this.setupEventListeners();
    
    // Initialize the app
    this.initializeApp();
  }
  
  /**
   * Initialize application components
   */
  private initializeComponents(): void {
    // Create pipeline and view model
    const pipeline = PipelineFactory.createPipeline(this.video, this.canvas);
    
    this.viewModel = new SwingAnalyzerViewModel(
      pipeline,
      this.video,
      this.canvas,
      this.repCounter,
      this.spineAngle,
      this.appState
    );
    
    // Create form checkpoint view model
    this.formViewModel = new FormCheckpointViewModel(
      pipeline,
      this.video,
      this.canvas,
      this.checkpointGridContainer,
      this.appState
    );
    
    // Create compatibility layer for legacy code
    this.formCheckpointChecker = new FormCheckpointChecker(this.formViewModel);
    
    // Get frame acquisition component for direct media control
    this.frameAcquisition = PipelineFactory.createFrameAcquisition(
      this.video, 
      this.canvas
    ) as FrameStage;
  }
  
  /**
   * Set up all event listeners
   */
  private setupEventListeners(): void {
    // Camera button
    this.cameraBtn.addEventListener('click', () => this.startCamera());
    
    // Play/Pause toggle button
    this.playPauseBtn.addEventListener('click', () => this.togglePlayPause());
    
    // Stop button
    this.stopBtn.addEventListener('click', () => this.stopVideo());
    
    // Video upload
    this.videoUpload.addEventListener('change', (e) => this.handleVideoUpload(e));
    
    // Load hardcoded video button
    this.loadHardcodedBtn.addEventListener('click', () => this.loadHardcodedVideo());
    
    // Camera switch button
    this.switchCameraBtn.addEventListener('click', () => this.switchCamera());
    
    // Display mode radios
    this.displayModeRadios.forEach(radio => {
      radio.addEventListener('change', () => {
        if (radio.checked) {
          this.viewModel.setDisplayMode(radio.value as 'both' | 'video' | 'overlay');
        }
      });
    });
    
    // Debug mode toggle
    this.debugModeToggle?.addEventListener('change', () => {
      this.viewModel.setDebugMode(this.debugModeToggle.checked);
    });
    
    // Rep navigation buttons
    this.prevRepBtn.addEventListener('click', () => this.navigateToPreviousRep());
    this.nextRepBtn.addEventListener('click', () => this.navigateToNextRep());
    
    // Video events
    this.video.addEventListener('play', () => {
      if (this.appState.isModelLoaded) {
        this.viewModel.startProcessing();
        this.updateButtonStates(false, true, true);
        this.playPauseBtn.textContent = 'Pause';
      }
    });
    
    this.video.addEventListener('pause', () => {
      if (this.appState.isProcessing) {
        this.viewModel.stopProcessing();
        this.playPauseBtn.textContent = 'Play';
      }
    });
    
    this.video.addEventListener('ended', () => {
      this.viewModel.stopProcessing();
      this.playPauseBtn.textContent = 'Play';
      this.updateButtonStates(true, true, true);
    });
  }
  
  /**
   * Initialize the application
   */
  private async initializeApp(): Promise<void> {
    this.updateStatus('Loading model...');
    
    try {
      await this.viewModel.initialize();
      
      // Initialize form checkpoint view model
      this.formViewModel.initialize();
      
      this.updateStatus('Ready. Upload a video or start camera.');
      this.updateButtonStates(true, false, false);
    } catch (error) {
      console.error('Failed to initialize:', error);
      this.updateStatus('Error: Failed to initialize model.');
    }
  }
  
  /**
   * Update application status message
   */
  private updateStatus(message: string): void {
    if (this.statusEl) {
      this.statusEl.textContent = message;
    }
  }
  
  /**
   * Update button states
   */
  private updateButtonStates(
    canCamera: boolean, 
    canPlayPause: boolean, 
    canStop: boolean
  ): void {
    this.cameraBtn.disabled = !canCamera;
    this.playPauseBtn.disabled = !canPlayPause;
    this.stopBtn.disabled = !canStop;
  }
  
  /**
   * Start camera with current mode
   */
  private async startCamera(): Promise<void> {
    this.updateStatus('Starting camera...');
    this.updateButtonStates(false, false, false);
    
    try {
      await this.frameAcquisition.startCamera(this.appState.cameraMode);
      this.appState.usingCamera = true;
      
      // Update UI
      this.updateStatus('Camera active');
      this.updateButtonStates(false, true, true);
      this.switchCameraBtn.style.display = 'inline-block';
      
      // Start processing
      this.viewModel.startProcessing();
    } catch (error) {
      console.error('Camera error:', error);
      this.updateStatus('Error: Could not access camera');
      this.updateButtonStates(true, false, false);
    }
  }
  
  /**
   * Switch between front and back cameras
   */
  private async switchCamera(): Promise<void> {
    // Toggle camera mode
    this.appState.cameraMode = this.appState.cameraMode === 'environment' ? 'user' : 'environment';
    
    // Restart camera with new mode
    this.updateStatus('Switching camera...');
    
    try {
      await this.frameAcquisition.startCamera(this.appState.cameraMode);
      this.updateStatus('Camera switched');
    } catch (error) {
      console.error('Failed to switch camera:', error);
      this.updateStatus('Error: Failed to switch camera');
    }
  }
  
  /**
   * Handle video file upload
   */
  private async handleVideoUpload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    
    if (!input.files || input.files.length === 0) {
      return;
    }
    
    const file = input.files[0];
    this.updateStatus(`Loading video: ${file.name}`);
    this.updateButtonStates(false, false, false);
    
    try {
      await this.frameAcquisition.loadVideo(file);
      this.appState.usingCamera = false;
      
      // Update UI
      this.updateStatus('Video loaded, ready to play');
      this.updateButtonStates(true, true, true);
      this.switchCameraBtn.style.display = 'none';
      
      // Reset state
      this.viewModel.reset();
    } catch (error) {
      console.error('Error loading video:', error);
      this.updateStatus('Error: Failed to load video file');
      this.updateButtonStates(true, false, false);
    }
  }
  
  /**
   * Load a hardcoded video example
   */
  private async loadHardcodedVideo(): Promise<void> {
    this.updateStatus('Loading example video...');
    this.updateButtonStates(false, false, false);
    
    try {
      // Use a hardcoded video from the public folder
      await this.frameAcquisition.loadVideoFromURL('./videos/sample.mp4');
      this.appState.usingCamera = false;
      
      // Update UI
      this.updateStatus('Example video loaded, ready to play');
      this.updateButtonStates(true, true, true);
      this.switchCameraBtn.style.display = 'none';
      
      // Reset state
      this.viewModel.reset();
    } catch (error) {
      console.error('Error loading example video:', error);
      this.updateStatus('Error: Failed to load example video');
      this.updateButtonStates(true, false, false);
    }
  }
  
  /**
   * Toggle video play/pause
   */
  private togglePlayPause(): void {
    if (this.video.paused) {
      this.video.play();
      this.playPauseBtn.textContent = 'Pause';
    } else {
      this.video.pause();
      this.playPauseBtn.textContent = 'Play';
    }
  }
  
  /**
   * Stop video or camera
   */
  private stopVideo(): void {
    // Stop processing
    this.viewModel.stopProcessing();
    
    if (this.appState.usingCamera) {
      // Stop camera stream
      this.frameAcquisition.stopCamera();
      this.appState.usingCamera = false;
      this.switchCameraBtn.style.display = 'none';
    } else {
      // Reset video
      this.video.pause();
      this.video.currentTime = 0;
    }
    
    // Update UI
    this.playPauseBtn.textContent = 'Play';
    this.updateButtonStates(true, false, false);
    this.updateStatus('Stopped');
    
    // Reset state
    this.viewModel.reset();
  }
  
  /**
   * Navigate to the previous rep
   */
  private navigateToPreviousRep(): void {
    const currentIndex = this.appState.currentRepIndex;
    if (currentIndex > 0) {
      if (this.formViewModel.navigateToRep(currentIndex - 1)) {
        this.appState.currentRepIndex--;
        this.updateRepNavigationUI();
      }
    }
  }
  
  /**
   * Navigate to the next rep
   */
  private navigateToNextRep(): void {
    const currentIndex = this.appState.currentRepIndex;
    const totalReps = this.formViewModel.getRepCount();
    if (currentIndex < totalReps - 1) {
      if (this.formViewModel.navigateToRep(currentIndex + 1)) {
        this.appState.currentRepIndex++;
        this.updateRepNavigationUI();
      }
    }
  }
  
  /**
   * Update rep navigation UI
   */
  private updateRepNavigationUI(): void {
    const currentIndex = this.appState.currentRepIndex;
    const totalReps = this.formViewModel.getRepCount();
    
    this.currentRepEl.textContent = totalReps > 0 ? 
      `${currentIndex + 1} / ${totalReps}` : 
      '0 / 0';
    
    this.prevRepBtn.disabled = currentIndex <= 0;
    this.nextRepBtn.disabled = currentIndex >= totalReps - 1;
  }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
  new SwingAnalyzerApp();
}); 