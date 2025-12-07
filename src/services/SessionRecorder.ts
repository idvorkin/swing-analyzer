/**
 * SessionRecorder
 *
 * Records user interactions and pipeline state for debugging.
 * Always active, stores in memory AND IndexedDB for crash recovery.
 *
 * Captures:
 * - User clicks/interactions with element info
 * - Pipeline state samples at 4 FPS
 * - Start/stop events (extraction, playback, etc.)
 * - Console errors
 * - Key state changes (rep count, extraction progress)
 * - Environment info (browser, WebGL, codecs, build version)
 *
 * Persistence:
 * - Auto-saves to IndexedDB every 5 seconds
 * - Keeps last 10 sessions for crash debugging
 * - Use getPersistedSessions() to retrieve after crash
 */

import { GIT_SHA_SHORT, BUILD_TIMESTAMP, GIT_BRANCH } from '../generated_version';

// IndexedDB configuration
const SESSION_DB_NAME = 'swing-analyzer-sessions';
const SESSION_STORE_NAME = 'sessions';
const SESSION_DB_VERSION = 1;
const MAX_PERSISTED_SESSIONS = 10;
const AUTO_SAVE_INTERVAL_MS = 5000;

export interface InteractionEvent {
  type: 'click' | 'keydown' | 'keyup';
  timestamp: number;
  target: string; // CSS selector or element description
  details?: Record<string, unknown>;
}

export interface PipelineSnapshot {
  timestamp: number;
  repCount: number;
  isPlaying: boolean;
  videoTime: number;
  extractionProgress?: number;
  extractionFps?: number;
  skeletonAngles?: {
    spine: number;
    arm: number;
    hip: number;
    knee: number;
  };
  formPosition?: string;
}

export interface StateChangeEvent {
  type:
    | 'extraction_start'
    | 'extraction_complete'
    | 'extraction_cancel'
    | 'playback_start'
    | 'playback_pause'
    | 'playback_stop'
    | 'video_load'
    | 'pipeline_init'
    | 'pipeline_reinit'
    | 'rep_detected'
    | 'checkpoint_detected'
    | 'cache_load'
    | 'skeleton_processing_complete'
    | 'error';
  timestamp: number;
  details?: Record<string, unknown>;
}

export interface MemorySnapshot {
  timestamp: number;
  // From performance.memory (Chrome only)
  usedJSHeapSize?: number;      // JS heap currently in use (bytes)
  totalJSHeapSize?: number;     // Total allocated JS heap (bytes)
  jsHeapSizeLimit?: number;     // Max heap size (bytes)
  // Calculated
  usedMB?: number;              // usedJSHeapSize in MB
  totalMB?: number;             // totalJSHeapSize in MB
  limitMB?: number;             // jsHeapSizeLimit in MB
  percentUsed?: number;         // usedJSHeapSize / jsHeapSizeLimit * 100
}

/**
 * Environment/debug info captured at session start
 * Useful for bug reports to understand the user's setup
 */
export interface EnvironmentInfo {
  // Build info
  buildVersion?: string;        // App version from package.json
  buildCommit?: string;         // Git commit hash
  buildTime?: string;           // When the build was created

  // Browser/OS
  userAgent: string;
  platform: string;             // navigator.platform
  language: string;             // navigator.language
  cookiesEnabled: boolean;
  onLine: boolean;

  // Display
  screenWidth: number;
  screenHeight: number;
  windowWidth: number;
  windowHeight: number;
  devicePixelRatio: number;
  colorDepth: number;

  // Hardware/Performance
  hardwareConcurrency?: number; // CPU cores
  deviceMemory?: number;        // RAM in GB (Chrome only)

  // WebGL (for ML model debugging)
  webglRenderer?: string;
  webglVendor?: string;
  webglVersion?: string;

  // Video codec support
  videoCodecs: {
    h264: boolean;
    h265: boolean;
    vp8: boolean;
    vp9: boolean;
    av1: boolean;
    webm: boolean;
  };

  // App settings (set by the app)
  appSettings?: Record<string, unknown>;
}

export interface SessionRecording {
  version: string;
  sessionId: string;
  startTime: number;
  endTime?: number;
  environment: EnvironmentInfo;
  interactions: InteractionEvent[];
  pipelineSnapshots: PipelineSnapshot[];
  stateChanges: StateChangeEvent[];
  memorySnapshots: MemorySnapshot[];
}

// IndexedDB helpers
function openSessionDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SESSION_DB_NAME, SESSION_DB_VERSION);

    request.onerror = () => {
      reject(new Error('Failed to open session database'));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(SESSION_STORE_NAME)) {
        const store = db.createObjectStore(SESSION_STORE_NAME, {
          keyPath: 'sessionId',
        });
        store.createIndex('startTime', 'startTime', { unique: false });
      }
    };
  });
}

async function saveSessionToDB(recording: SessionRecording): Promise<void> {
  try {
    const db = await openSessionDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([SESSION_STORE_NAME], 'readwrite');

      transaction.onerror = () => {
        db.close();
        reject(new Error('Failed to save session'));
      };

      const store = transaction.objectStore(SESSION_STORE_NAME);
      const request = store.put(recording);

      request.onerror = () => {
        reject(new Error('Failed to save session record'));
      };

      request.onsuccess = () => {
        resolve();
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (e) {
    // Silently fail - don't break the app if IndexedDB fails
    console.warn('[SessionRecorder] Failed to persist session:', e);
  }
}

async function pruneOldSessions(): Promise<void> {
  try {
    const db = await openSessionDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([SESSION_STORE_NAME], 'readwrite');

      transaction.onerror = () => {
        db.close();
        reject(new Error('Failed to prune sessions'));
      };

      const store = transaction.objectStore(SESSION_STORE_NAME);
      const index = store.index('startTime');
      const request = index.openCursor(null, 'prev'); // Newest first

      let count = 0;
      const toDelete: string[] = [];

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          count++;
          if (count > MAX_PERSISTED_SESSIONS) {
            toDelete.push(cursor.value.sessionId);
          }
          cursor.continue();
        } else {
          // Done iterating, delete old sessions
          toDelete.forEach((id) => store.delete(id));
        }
      };

      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
    });
  } catch (e) {
    console.warn('[SessionRecorder] Failed to prune old sessions:', e);
  }
}

/**
 * Retrieve all persisted sessions from IndexedDB.
 * Use this after a crash to see what happened.
 */
export async function getPersistedSessions(): Promise<SessionRecording[]> {
  try {
    const db = await openSessionDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([SESSION_STORE_NAME], 'readonly');

      transaction.onerror = () => {
        db.close();
        reject(new Error('Failed to load sessions'));
      };

      const store = transaction.objectStore(SESSION_STORE_NAME);
      const index = store.index('startTime');
      const request = index.getAll();

      request.onerror = () => {
        reject(new Error('Failed to load session records'));
      };

      request.onsuccess = () => {
        // Return newest first
        const sessions = (request.result || []).reverse();
        resolve(sessions);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (e) {
    console.warn('[SessionRecorder] Failed to load persisted sessions:', e);
    return [];
  }
}

/**
 * Clear all persisted sessions from IndexedDB.
 */
export async function clearPersistedSessions(): Promise<void> {
  try {
    const db = await openSessionDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([SESSION_STORE_NAME], 'readwrite');

      transaction.onerror = () => {
        db.close();
        reject(new Error('Failed to clear sessions'));
      };

      const store = transaction.objectStore(SESSION_STORE_NAME);
      store.clear();

      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
    });
  } catch (e) {
    console.warn('[SessionRecorder] Failed to clear sessions:', e);
  }
}

class SessionRecorderImpl {
  private recording: SessionRecording;
  private snapshotInterval: number | null = null;
  private autoSaveInterval: number | null = null;
  private memoryInterval: number | null = null;
  private pipelineStateGetter: (() => Partial<PipelineSnapshot>) | null = null;
  private maxSnapshots = 10000; // ~40 minutes at 4 FPS
  private maxInteractions = 5000;
  private maxStateChanges = 2000;
  private maxMemorySnapshots = 1800; // ~1 hour at 2 second intervals

  // Event handler references for cleanup
  private clickHandler: ((e: MouseEvent) => void) | null = null;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private errorHandler: ((e: ErrorEvent) => void) | null = null;
  private rejectionHandler: ((e: PromiseRejectionEvent) => void) | null = null;
  private beforeUnloadHandler: (() => void) | null = null;
  private originalConsoleError: ((...args: unknown[]) => void) | null = null;

  constructor() {
    this.recording = this.createNewRecording();
    this.setupEventListeners();
    this.startSnapshotting();
    this.startAutoSave();
    this.startMemoryTracking();
  }

  private createNewRecording(): SessionRecording {
    return {
      version: '1.0.0',
      sessionId: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      startTime: Date.now(),
      environment: this.captureEnvironment(),
      interactions: [],
      pipelineSnapshots: [],
      stateChanges: [],
      memorySnapshots: [],
    };
  }

  /**
   * Capture environment/debug info at session start
   */
  private captureEnvironment(): EnvironmentInfo {
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    const win = typeof window !== 'undefined' ? window : null;
    const screen = typeof window !== 'undefined' ? window.screen : null;

    // Get WebGL info for ML debugging
    const webglInfo = this.getWebGLInfo();

    // Check video codec support
    const videoCodecs = this.checkVideoCodecs();

    // Get build info from generated version file
    const buildVersion = `1.0.0-${GIT_BRANCH}`;
    const buildCommit = GIT_SHA_SHORT;
    const buildTime = BUILD_TIMESTAMP;

    return {
      // Build info
      buildVersion,
      buildCommit,
      buildTime,

      // Browser/OS
      userAgent: nav?.userAgent ?? 'unknown',
      platform: nav?.platform ?? 'unknown',
      language: nav?.language ?? 'unknown',
      cookiesEnabled: nav?.cookieEnabled ?? false,
      onLine: nav?.onLine ?? true,

      // Display
      screenWidth: screen?.width ?? 0,
      screenHeight: screen?.height ?? 0,
      windowWidth: win?.innerWidth ?? 0,
      windowHeight: win?.innerHeight ?? 0,
      devicePixelRatio: win?.devicePixelRatio ?? 1,
      colorDepth: screen?.colorDepth ?? 24,

      // Hardware
      hardwareConcurrency: nav?.hardwareConcurrency,
      deviceMemory: (nav as Navigator & { deviceMemory?: number })?.deviceMemory,

      // WebGL
      ...webglInfo,

      // Video codecs
      videoCodecs,
    };
  }

  /**
   * Get WebGL renderer info for debugging ML model issues
   */
  private getWebGLInfo(): { webglRenderer?: string; webglVendor?: string; webglVersion?: string } {
    if (typeof document === 'undefined') return {};

    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) return {};

      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        webglRenderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : undefined,
        webglVendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : undefined,
        webglVersion: gl.getParameter(gl.VERSION),
      };
    } catch {
      return {};
    }
  }

  /**
   * Check which video codecs are supported
   */
  private checkVideoCodecs(): EnvironmentInfo['videoCodecs'] {
    if (typeof document === 'undefined') {
      return { h264: false, h265: false, vp8: false, vp9: false, av1: false, webm: false };
    }

    try {
      const video = document.createElement('video');
      return {
        h264: video.canPlayType('video/mp4; codecs="avc1.42E01E"') !== '',
        h265: video.canPlayType('video/mp4; codecs="hev1.1.6.L93.B0"') !== '',
        vp8: video.canPlayType('video/webm; codecs="vp8"') !== '',
        vp9: video.canPlayType('video/webm; codecs="vp9"') !== '',
        av1: video.canPlayType('video/mp4; codecs="av01.0.01M.08"') !== '',
        webm: video.canPlayType('video/webm') !== '',
      };
    } catch {
      return { h264: false, h265: false, vp8: false, vp9: false, av1: false, webm: false };
    }
  }

  private setupEventListeners(): void {
    if (typeof window === 'undefined') return;

    // Capture clicks
    this.clickHandler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      this.recordInteraction({
        type: 'click',
        timestamp: Date.now(),
        target: this.describeElement(target),
        details: {
          x: e.clientX,
          y: e.clientY,
          button: e.button,
        },
      });
    };
    window.addEventListener('click', this.clickHandler, { capture: true });

    // Capture key presses (for debugging keyboard shortcuts)
    this.keydownHandler = (e: KeyboardEvent) => {
      // Only capture non-typing keys or modifier combos
      if (e.key.length > 1 || e.ctrlKey || e.metaKey || e.altKey) {
        this.recordInteraction({
          type: 'keydown',
          timestamp: Date.now(),
          target: this.describeElement(e.target as HTMLElement),
          details: {
            key: e.key,
            code: e.code,
            ctrl: e.ctrlKey,
            meta: e.metaKey,
            alt: e.altKey,
            shift: e.shiftKey,
          },
        });
      }
    };
    window.addEventListener('keydown', this.keydownHandler, { capture: true });

    // Capture console errors
    this.originalConsoleError = console.error;
    console.error = (...args) => {
      this.recordStateChange({
        type: 'error',
        timestamp: Date.now(),
        details: {
          message: args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '),
        },
      });
      this.originalConsoleError?.apply(console, args);
    };

    // Capture unhandled errors
    this.errorHandler = (e: ErrorEvent) => {
      this.recordStateChange({
        type: 'error',
        timestamp: Date.now(),
        details: {
          message: e.message,
          filename: e.filename,
          lineno: e.lineno,
          colno: e.colno,
        },
      });
    };
    window.addEventListener('error', this.errorHandler);

    // Capture unhandled promise rejections
    this.rejectionHandler = (e: PromiseRejectionEvent) => {
      this.recordStateChange({
        type: 'error',
        timestamp: Date.now(),
        details: {
          message: `Unhandled rejection: ${e.reason}`,
        },
      });
    };
    window.addEventListener('unhandledrejection', this.rejectionHandler);
  }

  private describeElement(el: HTMLElement | null): string {
    if (!el) return 'unknown';

    const parts: string[] = [];

    // Tag name
    parts.push(el.tagName.toLowerCase());

    // ID if present
    if (el.id) {
      parts.push(`#${el.id}`);
    }

    // Classes (first 3)
    if (el.className && typeof el.className === 'string') {
      const classes = el.className.split(' ').filter(Boolean).slice(0, 3);
      if (classes.length > 0) {
        parts.push(`.${classes.join('.')}`);
      }
    }

    // Text content (truncated)
    const text = el.textContent?.trim().slice(0, 30);
    if (text) {
      parts.push(`"${text}${el.textContent && el.textContent.length > 30 ? '...' : ''}"`);
    }

    return parts.join('');
  }

  private startSnapshotting(): void {
    if (typeof window === 'undefined') return;

    // 4 FPS = 250ms interval
    this.snapshotInterval = window.setInterval(() => {
      this.captureSnapshot();
    }, 250);
  }

  private startAutoSave(): void {
    if (typeof window === 'undefined') return;

    // Auto-save to IndexedDB every 5 seconds
    this.autoSaveInterval = window.setInterval(() => {
      this.persistToStorage();
    }, AUTO_SAVE_INTERVAL_MS);

    // Also save on page unload (store reference for cleanup)
    this.beforeUnloadHandler = () => {
      this.persistToStorage();
    };
    window.addEventListener('beforeunload', this.beforeUnloadHandler);

    // Initial save after setup
    setTimeout(() => this.persistToStorage(), 1000);
  }

  private async persistToStorage(): Promise<void> {
    const recording = this.getRecording();
    await saveSessionToDB(recording);
    await pruneOldSessions();
  }

  private startMemoryTracking(): void {
    if (typeof window === 'undefined') return;

    // Check if performance.memory is available (Chrome only)
    const perf = performance as Performance & {
      memory?: {
        usedJSHeapSize: number;
        totalJSHeapSize: number;
        jsHeapSizeLimit: number;
      };
    };

    if (!perf.memory) {
      console.log('[SessionRecorder] Memory tracking not available (Chrome only)');
      return;
    }

    // Track memory every 2 seconds
    this.memoryInterval = window.setInterval(() => {
      this.captureMemorySnapshot();
    }, 2000);

    // Initial capture
    this.captureMemorySnapshot();
    console.log('[SessionRecorder] Memory tracking started (2s intervals)');
  }

  private captureMemorySnapshot(): void {
    const perf = performance as Performance & {
      memory?: {
        usedJSHeapSize: number;
        totalJSHeapSize: number;
        jsHeapSizeLimit: number;
      };
    };

    if (!perf.memory) return;

    const { usedJSHeapSize, totalJSHeapSize, jsHeapSizeLimit } = perf.memory;
    const usedMB = Math.round(usedJSHeapSize / 1024 / 1024 * 100) / 100;
    const totalMB = Math.round(totalJSHeapSize / 1024 / 1024 * 100) / 100;
    const limitMB = Math.round(jsHeapSizeLimit / 1024 / 1024 * 100) / 100;
    const percentUsed = Math.round(usedJSHeapSize / jsHeapSizeLimit * 10000) / 100;

    const snapshot: MemorySnapshot = {
      timestamp: Date.now(),
      usedJSHeapSize,
      totalJSHeapSize,
      jsHeapSizeLimit,
      usedMB,
      totalMB,
      limitMB,
      percentUsed,
    };

    this.recording.memorySnapshots.push(snapshot);

    // Trim old snapshots if over limit
    if (this.recording.memorySnapshots.length > this.maxMemorySnapshots) {
      this.recording.memorySnapshots = this.recording.memorySnapshots.slice(-this.maxMemorySnapshots);
    }

    // Log warning if memory usage is high
    if (percentUsed > 80) {
      console.warn(`[SessionRecorder] HIGH MEMORY: ${usedMB}MB / ${limitMB}MB (${percentUsed}%)`);
    }
  }

  private captureSnapshot(): void {
    if (!this.pipelineStateGetter) return;

    const state = this.pipelineStateGetter();

    // Only record if there's meaningful data
    if (state.repCount !== undefined || state.videoTime !== undefined) {
      const snapshot: PipelineSnapshot = {
        timestamp: Date.now(),
        repCount: state.repCount ?? 0,
        isPlaying: state.isPlaying ?? false,
        videoTime: state.videoTime ?? 0,
        extractionProgress: state.extractionProgress,
        extractionFps: state.extractionFps,
        skeletonAngles: state.skeletonAngles,
        formPosition: state.formPosition,
      };

      this.recording.pipelineSnapshots.push(snapshot);

      // Trim old snapshots if over limit
      if (this.recording.pipelineSnapshots.length > this.maxSnapshots) {
        this.recording.pipelineSnapshots = this.recording.pipelineSnapshots.slice(-this.maxSnapshots);
      }
    }
  }

  /**
   * Set the pipeline state getter function
   * Called by the app to provide access to current pipeline state
   */
  setPipelineStateGetter(getter: () => Partial<PipelineSnapshot>): void {
    this.pipelineStateGetter = getter;
  }

  // Pose track provider for debug downloads
  private poseTrackProvider: (() => unknown | null) | null = null;

  /**
   * Set the pose track provider function
   * Called by the app to provide access to current pose track data
   */
  setPoseTrackProvider(provider: () => unknown | null): void {
    this.poseTrackProvider = provider;
  }

  /**
   * Get current pose track data (if available)
   */
  getPoseTrack(): unknown | null {
    return this.poseTrackProvider?.() ?? null;
  }

  /**
   * Set app settings for debugging (e.g., model type, exercise type)
   * Called by the app to include current settings in bug reports
   */
  setAppSettings(settings: Record<string, unknown>): void {
    this.recording.environment.appSettings = settings;
  }

  /**
   * Get current environment info
   */
  getEnvironment(): EnvironmentInfo {
    return this.recording.environment;
  }

  /**
   * Record a user interaction
   */
  recordInteraction(event: InteractionEvent): void {
    this.recording.interactions.push(event);

    // Trim old interactions if over limit
    if (this.recording.interactions.length > this.maxInteractions) {
      this.recording.interactions = this.recording.interactions.slice(-this.maxInteractions);
    }
  }

  /**
   * Record a state change event
   */
  recordStateChange(event: StateChangeEvent): void {
    this.recording.stateChanges.push(event);

    // Also log to console for immediate visibility
    console.log(`[SessionRecorder] ${event.type}`, event.details || '');

    // Trim old state changes if over limit
    if (this.recording.stateChanges.length > this.maxStateChanges) {
      this.recording.stateChanges = this.recording.stateChanges.slice(-this.maxStateChanges);
    }
  }

  /**
   * Get the current recording
   */
  getRecording(): SessionRecording {
    return {
      ...this.recording,
      endTime: Date.now(),
    };
  }

  /**
   * Get recording as downloadable JSON
   */
  getRecordingAsBlob(): Blob {
    const recording = this.getRecording();
    const json = JSON.stringify(recording, null, 2);
    return new Blob([json], { type: 'application/json' });
  }

  /**
   * Download the recording
   */
  downloadRecording(): void {
    const blob = this.getRecordingAsBlob();
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = `swing-session-${this.recording.sessionId}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      // Always revoke URL, even if click/remove fails
      URL.revokeObjectURL(url);
    }
  }

  /**
   * Get recording stats
   */
  getStats(): {
    duration: number;
    interactions: number;
    snapshots: number;
    stateChanges: number;
    errors: number;
  } {
    const errors = this.recording.stateChanges.filter((e) => e.type === 'error').length;
    return {
      duration: Date.now() - this.recording.startTime,
      interactions: this.recording.interactions.length,
      snapshots: this.recording.pipelineSnapshots.length,
      stateChanges: this.recording.stateChanges.length,
      errors,
    };
  }

  /**
   * Clear and start a new recording
   */
  reset(): void {
    this.recording = this.createNewRecording();
  }

  /**
   * Cleanup - remove all event listeners and restore console.error
   */
  dispose(): void {
    if (this.snapshotInterval) {
      clearInterval(this.snapshotInterval);
      this.snapshotInterval = null;
    }

    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }

    if (this.memoryInterval) {
      clearInterval(this.memoryInterval);
      this.memoryInterval = null;
    }

    // Final save before disposing
    this.persistToStorage();

    if (typeof window !== 'undefined') {
      if (this.clickHandler) {
        window.removeEventListener('click', this.clickHandler, { capture: true });
        this.clickHandler = null;
      }
      if (this.keydownHandler) {
        window.removeEventListener('keydown', this.keydownHandler, { capture: true });
        this.keydownHandler = null;
      }
      if (this.errorHandler) {
        window.removeEventListener('error', this.errorHandler);
        this.errorHandler = null;
      }
      if (this.rejectionHandler) {
        window.removeEventListener('unhandledrejection', this.rejectionHandler);
        this.rejectionHandler = null;
      }
      if (this.beforeUnloadHandler) {
        window.removeEventListener('beforeunload', this.beforeUnloadHandler);
        this.beforeUnloadHandler = null;
      }
    }

    // Restore original console.error
    if (this.originalConsoleError) {
      console.error = this.originalConsoleError;
      this.originalConsoleError = null;
    }
  }
}

// Singleton instance
export const sessionRecorder = new SessionRecorderImpl();

// Convenience functions for recording state changes
export function recordExtractionStart(details?: Record<string, unknown>): void {
  sessionRecorder.recordStateChange({
    type: 'extraction_start',
    timestamp: Date.now(),
    details,
  });
}

export function recordExtractionComplete(details?: Record<string, unknown>): void {
  sessionRecorder.recordStateChange({
    type: 'extraction_complete',
    timestamp: Date.now(),
    details,
  });
}

export function recordExtractionCancel(details?: Record<string, unknown>): void {
  sessionRecorder.recordStateChange({
    type: 'extraction_cancel',
    timestamp: Date.now(),
    details,
  });
}

export function recordPlaybackStart(details?: Record<string, unknown>): void {
  sessionRecorder.recordStateChange({
    type: 'playback_start',
    timestamp: Date.now(),
    details,
  });
}

export function recordPlaybackPause(details?: Record<string, unknown>): void {
  sessionRecorder.recordStateChange({
    type: 'playback_pause',
    timestamp: Date.now(),
    details,
  });
}

export function recordPlaybackStop(details?: Record<string, unknown>): void {
  sessionRecorder.recordStateChange({
    type: 'playback_stop',
    timestamp: Date.now(),
    details,
  });
}

export function recordVideoLoad(details?: Record<string, unknown>): void {
  sessionRecorder.recordStateChange({
    type: 'video_load',
    timestamp: Date.now(),
    details,
  });
}

export function recordPipelineInit(details?: Record<string, unknown>): void {
  sessionRecorder.recordStateChange({
    type: 'pipeline_init',
    timestamp: Date.now(),
    details,
  });
}

export function recordPipelineReinit(details?: Record<string, unknown>): void {
  sessionRecorder.recordStateChange({
    type: 'pipeline_reinit',
    timestamp: Date.now(),
    details,
  });
}

export function recordRepDetected(repNumber: number, details?: Record<string, unknown>): void {
  sessionRecorder.recordStateChange({
    type: 'rep_detected',
    timestamp: Date.now(),
    details: { repNumber, ...details },
  });
}

export function recordCheckpointDetected(
  position: string,
  details?: Record<string, unknown>
): void {
  sessionRecorder.recordStateChange({
    type: 'checkpoint_detected',
    timestamp: Date.now(),
    details: { position, ...details },
  });
}

export function recordCacheLoad(details: {
  frameCount: number;
  videoHash: string;
  videoDuration?: number;
}): void {
  sessionRecorder.recordStateChange({
    type: 'cache_load',
    timestamp: Date.now(),
    details,
  });
}

export function recordSkeletonProcessingComplete(details: {
  framesProcessed: number;
  finalRepCount: number;
  dominantArm?: string | null;
  processingTimeMs?: number;
  totalFramesProcessed?: number;
}): void {
  sessionRecorder.recordStateChange({
    type: 'skeleton_processing_complete',
    timestamp: Date.now(),
    details,
  });
}

// Expose debug functions on window for easy console access
// Available in all environments - crash logs are useful in production too
if (typeof window !== 'undefined') {
  const swingDebug = {
    /**
     * Get all persisted sessions from IndexedDB.
     * Usage: await swingDebug.getCrashLogs()
     */
    getCrashLogs: getPersistedSessions,

    /**
     * Clear all persisted sessions from IndexedDB.
     * Usage: await swingDebug.clearCrashLogs()
     */
    clearCrashLogs: clearPersistedSessions,

    /**
     * Get the current session recording (in memory).
     * Usage: swingDebug.getCurrentSession()
     */
    getCurrentSession: () => sessionRecorder.getRecording(),

    /**
     * Download the current session as JSON file.
     * Usage: swingDebug.downloadSession()
     */
    downloadSession: () => sessionRecorder.downloadRecording(),

    /**
     * Get session stats.
     * Usage: swingDebug.getStats()
     */
    getStats: () => sessionRecorder.getStats(),

    /**
     * Get current memory usage (Chrome only).
     * Usage: swingDebug.getMemory()
     */
    getMemory: () => {
      const perf = performance as Performance & {
        memory?: {
          usedJSHeapSize: number;
          totalJSHeapSize: number;
          jsHeapSizeLimit: number;
        };
      };
      if (!perf.memory) return { error: 'Memory API not available (Chrome only)' };
      const { usedJSHeapSize, totalJSHeapSize, jsHeapSizeLimit } = perf.memory;
      return {
        usedMB: Math.round(usedJSHeapSize / 1024 / 1024 * 100) / 100,
        totalMB: Math.round(totalJSHeapSize / 1024 / 1024 * 100) / 100,
        limitMB: Math.round(jsHeapSizeLimit / 1024 / 1024 * 100) / 100,
        percentUsed: Math.round(usedJSHeapSize / jsHeapSizeLimit * 10000) / 100,
      };
    },

    /**
     * Get memory history from current session.
     * Usage: swingDebug.getMemoryHistory()
     */
    getMemoryHistory: () => sessionRecorder.getRecording().memorySnapshots,

    /**
     * Analyze memory trend (is it growing?).
     * Usage: swingDebug.analyzeMemory()
     */
    analyzeMemory: () => {
      const snapshots = sessionRecorder.getRecording().memorySnapshots;
      if (snapshots.length < 10) {
        return { error: 'Not enough data yet (need 10+ snapshots)' };
      }
      const recent = snapshots.slice(-30); // Last minute
      const first = recent[0];
      const last = recent[recent.length - 1];
      const growthMB = (last.usedMB ?? 0) - (first.usedMB ?? 0);
      const growthPercent = first.usedMB ? (growthMB / first.usedMB) * 100 : 0;
      const durationSec = (last.timestamp - first.timestamp) / 1000;
      const mbPerMinute = durationSec > 0 ? (growthMB / durationSec) * 60 : 0;

      return {
        currentMB: last.usedMB,
        limitMB: last.limitMB,
        percentUsed: last.percentUsed,
        growthMB: Math.round(growthMB * 100) / 100,
        growthPercent: Math.round(growthPercent * 100) / 100,
        mbPerMinute: Math.round(mbPerMinute * 100) / 100,
        trend: mbPerMinute > 1 ? 'GROWING (possible leak)' : mbPerMinute < -1 ? 'SHRINKING' : 'STABLE',
        samples: recent.length,
        durationSec: Math.round(durationSec),
      };
    },

    /**
     * Get environment/debug info (browser, WebGL, codecs, etc.).
     * Usage: swingDebug.getEnvironment()
     */
    getEnvironment: () => sessionRecorder.getEnvironment(),

    /**
     * Set app settings for bug reports.
     * Usage: swingDebug.setAppSettings({ model: 'blazepose', exercise: 'swing' })
     */
    setAppSettings: (settings: Record<string, unknown>) => sessionRecorder.setAppSettings(settings),

    /**
     * Get current pose track data (if available).
     * Usage: swingDebug.getPoseTrack()
     */
    getPoseTrack: () => sessionRecorder.getPoseTrack(),

    /**
     * Download current pose track as gzipped JSON file.
     * Uses CompressionStream API for efficient gzip compression.
     * Usage: swingDebug.downloadPoseTrack()
     */
    downloadPoseTrack: async () => {
      const poseTrack = sessionRecorder.getPoseTrack();
      if (!poseTrack) {
        console.warn('[swingDebug] No pose track data available');
        return null;
      }

      try {
        // Serialize in chunks to avoid string length limits
        const track = poseTrack as { metadata: unknown; frames: unknown[] };
        const chunks: string[] = [];
        chunks.push('{"metadata":');
        chunks.push(JSON.stringify(track.metadata));
        chunks.push(',"frames":[');

        // Add frames one by one to avoid huge string concatenation
        const frames = track.frames;
        for (let i = 0; i < frames.length; i++) {
          if (i > 0) chunks.push(',');
          chunks.push(JSON.stringify(frames[i]));
        }
        chunks.push(']}');

        // Create blob from chunks
        const jsonBlob = new Blob(chunks, { type: 'application/json' });
        const uncompressedSize = jsonBlob.size;

        // Compress with gzip using CompressionStream API
        const compressionStream = new CompressionStream('gzip');
        const compressedStream = jsonBlob.stream().pipeThrough(compressionStream);
        const compressedBlob = await new Response(compressedStream).blob();

        // Download the gzipped file
        const url = URL.createObjectURL(compressedBlob);
        const metadata = track.metadata as { sourceVideoName?: string };
        const videoName = metadata?.sourceVideoName || 'video';
        const filename = videoName.replace(/\.[^.]+$/, '') + '.posetrack.json.gz';
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        const compressedSize = compressedBlob.size;
        const ratio = ((1 - compressedSize / uncompressedSize) * 100).toFixed(1);
        console.log(`[swingDebug] Downloaded pose track: ${filename}`);
        console.log(`[swingDebug] Size: ${(compressedSize / 1024).toFixed(1)} KB (${ratio}% compression, was ${(uncompressedSize / 1024 / 1024).toFixed(2)} MB)`);
        return filename;
      } catch (error) {
        console.error('[swingDebug] Failed to download pose track:', error);
        return null;
      }
    },
  };

  (window as unknown as { swingDebug: typeof swingDebug }).swingDebug = swingDebug;
  console.log('[SessionRecorder] Debug functions available at window.swingDebug');
}
