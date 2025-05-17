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

// Initialize app state
const appState: AppState = {
  usingCamera: false,
  cameraMode: 'environment', // Default to back camera
  isModelLoaded: false,
  isProcessing: false,
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

// Add camera devices tracking
let availableCameras: MediaDeviceInfo[] = [];
let currentCameraIndex = 0;

// Initialize the application
async function initApp() {
  updateStatus('Loading model...');
  
  // Setup video and canvas dimensions initially
  setupVideoCanvas();
  
  // Initialize listeners
  setupEventListeners();
  
  updateStatus('Ready. Upload a video or start camera.');
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
  
  // Camera switch button
  const switchCameraBtn = document.getElementById('switch-camera-btn');
  if (switchCameraBtn) {
    switchCameraBtn.addEventListener('click', switchCamera);
  }
  
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
      updateStatus('Loading model... Please wait.');
      await swingAnalyzer.initialize();
      
      appState.isModelLoaded = true;
      updateStatus('Model loaded. Ready to analyze.');
    } catch (error) {
      console.error('Error initializing analyzer:', error);
      updateStatus('Error loading model. Please refresh and try again.');
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

// Function to update visibility of switch camera button
function updateSwitchCameraButton() {
  const switchCameraBtn = document.getElementById('switch-camera-btn');
  if (!switchCameraBtn) return;

  // Only show switch camera button when camera is active
  if (appState.usingCamera) {
    // Check if we can enumerate devices (browser support)
    if ('mediaDevices' in navigator && 'enumerateDevices' in navigator.mediaDevices) {
      navigator.mediaDevices.enumerateDevices()
        .then(devices => {
          // Filter only video input devices (cameras)
          availableCameras = devices.filter(device => device.kind === 'videoinput');
          // Only show switch button if there are multiple cameras
          switchCameraBtn.style.display = availableCameras.length > 1 ? 'block' : 'none';
          
          // Log available cameras for debugging
          if (availableCameras.length > 0) {
            console.log(`Found ${availableCameras.length} cameras:`);
            availableCameras.forEach((camera, index) => {
              console.log(`Camera ${index}: ${camera.label || 'unnamed'} (ID: ${camera.deviceId})`);
            });
          }
        })
        .catch(err => {
          console.error('Error checking cameras:', err);
          switchCameraBtn.style.display = 'none';
        });
    } else {
      // If device enumeration is not supported, show button on mobile devices
      // This is a fallback for browsers that don't support enumeration
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      switchCameraBtn.style.display = isMobile ? 'block' : 'none';
    }
  } else {
    switchCameraBtn.style.display = 'none';
  }
}

// Function to switch between cameras
function switchCamera() {
  if (availableCameras.length > 1) {
    // Move to next camera in the list
    currentCameraIndex = (currentCameraIndex + 1) % availableCameras.length;
    
    // If the camera is currently active, restart it with the new camera
    if (appState.usingCamera) {
      // Stop current camera
      stopCamera();
      // Start new camera
      startCamera();
    }

    // Update status with camera info
    const cameraName = availableCameras[currentCameraIndex].label || `Camera ${currentCameraIndex + 1}`;
    updateStatus(`Switched to ${cameraName}`);
  } else {
    // Fallback to simple toggle between front/back if device enumeration didn't work
    appState.cameraMode = appState.cameraMode === 'environment' ? 'user' : 'environment';
    
    // If the camera is currently active, restart it with the new mode
    if (appState.usingCamera) {
      // Stop current camera
      stopCamera();
      // Start camera with new mode
      startCamera();
    }

    // Update status to reflect camera change
    updateStatus(`Switched to ${appState.cameraMode === 'environment' ? 'back' : 'front'} camera`);
  }
}

async function startCamera() {
  try {
    updateStatus('Accessing camera...');
    
    // Request camera permissions
    let constraints: MediaStreamConstraints;
    
    // If we have enumerated specific cameras, use the deviceId
    if (availableCameras.length > 0) {
      constraints = {
        video: {
          deviceId: { exact: availableCameras[currentCameraIndex].deviceId },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };
    } else {
      // Fallback to facingMode if no specific cameras are enumerated
      constraints = {
        video: {
          facingMode: appState.cameraMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };
    }
    
    // Get camera stream with selected constraints
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    
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
    
    // Update status message with camera info
    let cameraInfo = '';
    if (availableCameras.length > 0) {
      const currentCamera = availableCameras[currentCameraIndex];
      cameraInfo = currentCamera.label || `Camera ${currentCameraIndex + 1}`;
    } else {
      cameraInfo = appState.cameraMode === 'environment' ? 'back' : 'front';
    }
    updateStatus(`Camera active (${cameraInfo}). Analyzing motion...`);
    
    // Update switch camera button visibility
    updateSwitchCameraButton();
  } catch (error) {
    console.error('Error accessing camera:', error);
    updateStatus('Camera access denied or not available.');
  }
}

async function handleVideoUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files && input.files.length > 0) {
    const file = input.files[0];
    
    updateStatus(`Loading video: ${file.name}...`);
    
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
  
  // Hide the camera switch button
  const switchCameraBtn = document.getElementById('switch-camera-btn');
  if (switchCameraBtn) {
    switchCameraBtn.style.display = 'none';
  }
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
