// Import application components
import { SwingAnalyzer } from './SwingAnalyzer';
import { AppState, CocoBodyParts } from './types';

// Get DOM elements
const video = document.getElementById('video') as HTMLVideoElement;
const canvas = document.getElementById('output-canvas') as HTMLCanvasElement;
const cameraBtn = document.getElementById('camera-btn') as HTMLButtonElement;
const playPauseBtn = document.getElementById('play-pause-btn') as HTMLButtonElement;
const stopBtn = document.getElementById('stop-btn') as HTMLButtonElement;
const videoUpload = document.getElementById('video-upload') as HTMLInputElement;
const repCounter = document.getElementById('rep-counter') as HTMLSpanElement;
const status = document.getElementById('status') as HTMLDivElement;
const spineAngle = document.getElementById('spine-angle') as HTMLSpanElement;
const displayModeRadios = document.querySelectorAll('input[name="display-mode"]') as NodeListOf<HTMLInputElement>;
const showKeypointsBtn = document.getElementById('show-keypoints-btn') as HTMLButtonElement;
const keypointData = document.getElementById('keypoint-data') as HTMLDivElement;
const keypointContainer = document.getElementById('keypoint-container') as HTMLDivElement;
const loadingSpinner = document.getElementById('loading-spinner') as HTMLDivElement;
const loadingProgress = document.getElementById('loading-progress') as HTMLDivElement;
const loadingText = document.getElementById('loading-text') as HTMLDivElement;

// Loading state variables
let loadingTimer: number | null = null;
let progressValue = 0;
const ESTIMATED_LOADING_TIME = 15000; // 15 seconds estimated loading time
const PROGRESS_UPDATE_INTERVAL = 100; // Update progress every 100ms

// Application state
const appState: AppState = {
  isModelLoaded: false,
  isProcessing: false,
  usingCamera: false,
  repCounter: {
    count: 0,
    isHinge: false,
    lastHingeState: false,
    hingeThreshold: 45
  },
  showBodyParts: true,
  bodyPartDisplayTime: 0.5 // Show body part labels for 0.5 seconds
};

// Create swing analyzer
let swingAnalyzer: SwingAnalyzer | null = null;

// Create a global variable to store keypoint data
let latestKeypoints: any[] = [];

// Initialize the application
async function initApp() {
  updateStatus('Loading model...');
  
  // Show loading spinner with progress
  showLoadingSpinner(true);
  
  // Setup video and canvas dimensions initially
  setupVideoCanvas();
  
  // Initialize listeners
  setupEventListeners();
  
  updateStatus('Ready. Upload a video or start camera.');
}

// Show or hide the loading spinner
function showLoadingSpinner(show: boolean) {
  if (loadingSpinner) {
    loadingSpinner.classList.toggle('active', show);
    
    if (show) {
      // Reset and start progress simulation
      resetProgress();
      startProgressSimulation();
    } else {
      // Stop progress simulation
      stopProgressSimulation();
    }
  }
}

// Start simulating progress
function startProgressSimulation() {
  // Stop any existing timer
  stopProgressSimulation();
  
  // Reset progress
  progressValue = 0;
  updateProgressBar(0);
  
  // Start the timer
  loadingTimer = window.setInterval(() => {
    // Calculate next progress value using a curve that starts fast and slows down
    // This simulates real loading behavior better than linear progress
    progressValue += (100 - progressValue) / 100;
    
    if (progressValue >= 99) {
      progressValue = 99; // Cap at 99% until actually loaded
    }
    
    updateProgressBar(progressValue);
    
    // Calculate estimated time remaining
    const elapsedTime = (progressValue / 100) * ESTIMATED_LOADING_TIME;
    const estimatedTimeRemaining = Math.max(0, ESTIMATED_LOADING_TIME - elapsedTime);
    const secondsRemaining = Math.ceil(estimatedTimeRemaining / 1000);
    
    // Update loading text
    if (loadingText) {
      loadingText.textContent = `Loading model... ${Math.round(progressValue)}% (about ${secondsRemaining}s remaining)`;
    }
  }, PROGRESS_UPDATE_INTERVAL);
}

// Stop progress simulation
function stopProgressSimulation() {
  if (loadingTimer !== null) {
    clearInterval(loadingTimer);
    loadingTimer = null;
  }
  
  // Set to 100% when done
  if (loadingProgress) {
    loadingProgress.style.width = '100%';
  }
  
  // Update text
  if (loadingText) {
    loadingText.textContent = 'Loading complete!';
  }
}

// Reset progress bar to 0
function resetProgress() {
  progressValue = 0;
  if (loadingProgress) {
    loadingProgress.style.width = '0%';
  }
  if (loadingText) {
    loadingText.textContent = 'Loading model...';
  }
}

// Update progress bar
function updateProgressBar(percentage: number) {
  if (loadingProgress) {
    loadingProgress.style.width = `${percentage}%`;
  }
}

function setupVideoCanvas() {
  // Make sure canvas has the same dimensions as video
  function updateDimensions() {
    if (video.videoWidth && video.videoHeight) {
      // Set canvas dimensions to match video's intrinsic dimensions
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      // Check if video is portrait orientation (vertical)
      const isPortrait = video.videoHeight > video.videoWidth;
      
      // Update container class based on orientation
      const videoContainer = video.parentElement;
      if (videoContainer) {
        videoContainer.classList.remove('video-portrait', 'video-landscape');
        videoContainer.classList.add(isPortrait ? 'video-portrait' : 'video-landscape');
      }
      
      if (isPortrait) {
        // For vertical videos, ensure the canvas and video display with correct orientation
        // but maintain original dimensions for proper keypoint mapping
        const containerWidth = video.parentElement?.clientWidth || 640;
        const scale = containerWidth / video.videoWidth;
        
        // Set display size while maintaining aspect ratio
        video.style.width = `${containerWidth}px`;
        video.style.height = `${video.videoHeight * scale}px`;
        
        // Canvas should match the video's display size
        canvas.style.width = `${containerWidth}px`;
        canvas.style.height = `${video.videoHeight * scale}px`;
      } else {
        // For landscape videos, let the video and canvas fill the container width
        video.style.width = '100%';
        video.style.height = 'auto';
        canvas.style.width = '100%';
        canvas.style.height = 'auto';
      }
      
      // Make sure video and canvas are visible
      video.style.display = 'block';
      canvas.style.display = 'block';
      
      console.log(`Video dimensions set: ${video.videoWidth}x${video.videoHeight}, Portrait: ${isPortrait}`);
    }
  }
  
  // Add listeners for dimension updates
  video.addEventListener('loadedmetadata', updateDimensions);
  video.addEventListener('resize', updateDimensions);
  
  // Also update when window is resized
  window.addEventListener('resize', updateDimensions);
  
  // Set initial dimensions
  if (video.videoWidth && video.videoHeight) {
    updateDimensions();
  } else {
    // Set default dimensions
    canvas.width = 640;
    canvas.height = 480;
  }
}

function setupEventListeners() {
  // Camera button
  cameraBtn.addEventListener('click', startCamera);
  
  // Play/Pause toggle button
  playPauseBtn.addEventListener('click', togglePlayPause);
  
  // Stop button
  stopBtn.addEventListener('click', stopVideo);
  
  // Video upload
  videoUpload.addEventListener('change', handleVideoUpload);
  
  // Video events
  video.addEventListener('play', () => {
    if (swingAnalyzer) {
      swingAnalyzer.startProcessing();
      appState.isProcessing = true;
      // Update button text
      playPauseBtn.textContent = 'Pause';
    }
  });
  
  video.addEventListener('pause', () => {
    if (swingAnalyzer) {
      swingAnalyzer.stopProcessing();
      appState.isProcessing = false;
      // Update button text
      playPauseBtn.textContent = 'Play';
    }
  });
  
  video.addEventListener('ended', () => {
    if (swingAnalyzer) {
      swingAnalyzer.stopProcessing();
      appState.isProcessing = false;
      // Reset button
      playPauseBtn.textContent = 'Play';
    }
  });
  
  // Show/hide keypoint data button
  showKeypointsBtn.addEventListener('click', toggleKeypointData);
  
  // Add debug controls
  setupDebugControls();
}

function setupDebugControls() {
  displayModeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      const mode = target.value;
      
      console.log(`Display mode changed to: ${mode}`);
      
      switch (mode) {
        case 'both':
          video.style.opacity = '1';
          canvas.style.display = 'block';
          break;
        case 'video':
          video.style.opacity = '1';
          canvas.style.display = 'none';
          break;
        case 'overlay':
          // Make video transparent but still there for pose detection
          video.style.opacity = '0.1';
          canvas.style.display = 'block';
          // Set canvas background to black
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
          break;
      }
    });
  });
  
  // Debug mode toggle
  const debugModeToggle = document.getElementById('debug-mode-toggle') as HTMLInputElement;
  if (debugModeToggle) {
    debugModeToggle.addEventListener('change', () => {
      if (swingAnalyzer) {
        swingAnalyzer.setDebugMode(debugModeToggle.checked);
        
        // Force redraw if paused
        if (video.paused && swingAnalyzer) {
          // If we're paused, manually trigger a redraw
          const pose = { keypoints: latestKeypoints };
          swingAnalyzer.drawPose(pose, performance.now());
        }
      }
    });
  }
}

async function initializeAnalyzer() {
  if (!swingAnalyzer) {
    // Show loading spinner
    showLoadingSpinner(true);
    
    // Reset dimensions - make sure canvas matches video at initialization time
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    
    // Make sure canvas has the exact same size as video for correct positioning
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    
    swingAnalyzer = new SwingAnalyzer(
      video, 
      canvas, 
      appState.showBodyParts,
      appState.bodyPartDisplayTime,
      updateLatestKeypoints
    );
    
    try {
      // Record start time to measure actual loading time
      const startTime = performance.now();
      
      await swingAnalyzer.initialize();
      
      // Calculate actual loading time
      const loadingTime = performance.now() - startTime;
      console.log(`Model loaded in ${Math.round(loadingTime)}ms`);
      
      // Update our estimate for next time if significantly different
      if (Math.abs(loadingTime - ESTIMATED_LOADING_TIME) > 5000) {
        // Store in localStorage for future reference
        localStorage.setItem('modelLoadingTime', loadingTime.toString());
      }
      
      appState.isModelLoaded = true;
      updateStatus('Model loaded. Ready to analyze.');
      // Hide loading spinner
      showLoadingSpinner(false);
    } catch (error) {
      console.error('Error initializing analyzer:', error);
      updateStatus('Error loading model. Please refresh and try again.');
      // Hide loading spinner
      showLoadingSpinner(false);
    }
  }
}

function updateStatus(message: string) {
  if (status) {
    status.textContent = message;
  }
}

function updateButtonStates(
  canCamera: boolean, 
  canPlayPause: boolean, 
  canStop: boolean
) {
  cameraBtn.disabled = !canCamera;
  playPauseBtn.disabled = !canPlayPause;
  stopBtn.disabled = !canStop;
  
  // Update play/pause button text to match video state
  if (canPlayPause) {
    playPauseBtn.textContent = video.paused ? 'Play' : 'Pause';
  }
}

async function startCamera() {
  try {
    // Show loading spinner while setting up camera
    showLoadingSpinner(true);
    
    // Request camera permissions
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment', // Prefer rear camera on mobile
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });
    
    // Make sure video is visible
    video.style.display = 'block';
    
    // Set video source to camera stream
    video.srcObject = stream;
    appState.usingCamera = true;
    
    // Wait for video metadata to load
    await new Promise<void>((resolve) => {
      video.onloadedmetadata = () => {
        console.log(`Camera stream loaded: ${video.videoWidth}x${video.videoHeight}`);
        resolve();
      };
    });
    
    // Initialize analyzer if needed
    await initializeAnalyzer();
    
    // Start video
    await video.play();
    
    // Update UI
    updateButtonStates(false, true, true);
    updateStatus('Camera active. Analyzing motion...');
  } catch (error) {
    console.error('Error accessing camera:', error);
    updateStatus('Camera access denied or not available.');
    // Hide loading spinner
    showLoadingSpinner(false);
  }
}

async function handleVideoUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files && input.files.length > 0) {
    const file = input.files[0];
    
    // Show loading spinner while processing video
    showLoadingSpinner(true);
    
    // Stop camera if it's active
    if (appState.usingCamera) {
      stopCamera();
    }
    
    // Make sure video is visible
    video.style.display = 'block';
    
    // Create object URL for the video file
    const videoURL = URL.createObjectURL(file);
    video.src = videoURL;
    appState.usingCamera = false;
    
    // Force video to reload and prep for playing
    video.load();
    
    // Wait for video metadata to load
    await new Promise<void>((resolve) => {
      video.onloadedmetadata = () => {
        console.log(`Video loaded: ${video.videoWidth}x${video.videoHeight}`);
        resolve();
      };
    });
    
    // Initialize analyzer if needed
    await initializeAnalyzer();
    
    // Update UI
    updateButtonStates(true, true, false);
    updateStatus(`Loaded video: ${file.name}. Press Play to analyze.`);
    
    // Reset rep counter
    if (swingAnalyzer) {
      swingAnalyzer.reset();
    }
  }
}

// Replace the separate play and pause functions with a toggle function
function togglePlayPause() {
  if (video.paused) {
    // Currently paused, so play
    video.play();
    playPauseBtn.textContent = 'Pause';
    updateButtonStates(true, true, true);
  } else {
    // Currently playing, so pause
    video.pause();
    playPauseBtn.textContent = 'Play';
    updateButtonStates(true, true, true);
  }
}

function stopVideo() {
  video.pause();
  
  // Reset video position
  video.currentTime = 0;
  
  if (appState.usingCamera) {
    stopCamera();
  }
  
  updateButtonStates(true, true, false);
  playPauseBtn.textContent = 'Play';
  
  // Reset rep counter
  if (swingAnalyzer) {
    swingAnalyzer.reset();
  }
}

function stopCamera() {
  // Stop camera stream
  if (video.srcObject) {
    const stream = video.srcObject as MediaStream;
    const tracks = stream.getTracks();
    
    tracks.forEach(track => track.stop());
    video.srcObject = null;
  }
  
  appState.usingCamera = false;
  updateButtonStates(true, false, false);
  
  // Hide the loading spinner if it's still showing
  showLoadingSpinner(false);
}

// Toggle keypoint data visibility
function toggleKeypointData() {
  if (keypointData.style.display === 'none') {
    keypointData.style.display = 'block';
    showKeypointsBtn.textContent = 'Hide Keypoint Data';
    updateKeypointDisplay();
  } else {
    keypointData.style.display = 'none';
    showKeypointsBtn.textContent = 'Show Keypoint Data';
  }
}

// Update keypoint display with latest data
function updateKeypointDisplay() {
  if (!latestKeypoints.length || keypointData.style.display === 'none') {
    return;
  }
  
  // Clear previous data
  keypointContainer.innerHTML = '';
  
  // Create header
  const header = document.createElement('div');
  header.className = 'keypoint-row';
  header.innerHTML = `
    <span><strong>Name</strong></span>
    <span><strong>X</strong></span>
    <span><strong>Y</strong></span>
    <span><strong>Confidence</strong></span>
  `;
  keypointContainer.appendChild(header);
  
  // Add each keypoint row
  latestKeypoints.forEach(kp => {
    const row = document.createElement('div');
    row.className = 'keypoint-row';
    row.innerHTML = `
      <span>${kp.name || 'unknown'}</span>
      <span>${Math.round(kp.x)}</span>
      <span>${Math.round(kp.y)}</span>
      <span>${kp.confidence || 'N/A'}</span>
    `;
    keypointContainer.appendChild(row);
  });
}

// Add to the SwingAnalyzer class a method to update UI keypoints
// We need to update the SwingAnalyzer class to store and display keypoints

// In main.ts, create a function to pass to SwingAnalyzer
function updateLatestKeypoints(keypoints: any[]) {
  latestKeypoints = keypoints.map(kp => ({
    name: kp.name || 'unknown',
    x: kp.x,
    y: kp.y,
    confidence: kp.score?.toFixed(2) || 'N/A'
  }));
  
  // Update display if visible
  updateKeypointDisplay();
}

// Start the application
document.addEventListener('DOMContentLoaded', initApp);
