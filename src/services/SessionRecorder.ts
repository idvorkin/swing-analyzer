/**
 * SessionRecorder
 *
 * Records user interactions and pipeline state for debugging.
 * Always active, stores everything in memory, downloadable from Settings.
 *
 * Captures:
 * - User clicks/interactions with element info
 * - Pipeline state samples at 4 FPS
 * - Start/stop events (extraction, playback, etc.)
 * - Console errors
 * - Key state changes (rep count, extraction progress)
 */

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
    | 'error';
  timestamp: number;
  details?: Record<string, unknown>;
}

export interface SessionRecording {
  version: string;
  sessionId: string;
  startTime: number;
  endTime?: number;
  userAgent: string;
  screenSize: { width: number; height: number };
  interactions: InteractionEvent[];
  pipelineSnapshots: PipelineSnapshot[];
  stateChanges: StateChangeEvent[];
}

class SessionRecorderImpl {
  private recording: SessionRecording;
  private snapshotInterval: number | null = null;
  private pipelineStateGetter: (() => Partial<PipelineSnapshot>) | null = null;
  private maxSnapshots = 10000; // ~40 minutes at 4 FPS
  private maxInteractions = 5000;
  private maxStateChanges = 2000;

  constructor() {
    this.recording = this.createNewRecording();
    this.setupEventListeners();
    this.startSnapshotting();
  }

  private createNewRecording(): SessionRecording {
    return {
      version: '1.0.0',
      sessionId: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      startTime: Date.now(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      screenSize:
        typeof window !== 'undefined'
          ? { width: window.innerWidth, height: window.innerHeight }
          : { width: 0, height: 0 },
      interactions: [],
      pipelineSnapshots: [],
      stateChanges: [],
    };
  }

  private setupEventListeners(): void {
    if (typeof window === 'undefined') return;

    // Capture clicks
    window.addEventListener(
      'click',
      (e) => {
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
      },
      { capture: true }
    );

    // Capture key presses (for debugging keyboard shortcuts)
    window.addEventListener(
      'keydown',
      (e) => {
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
      },
      { capture: true }
    );

    // Capture console errors
    const originalError = console.error;
    console.error = (...args) => {
      this.recordStateChange({
        type: 'error',
        timestamp: Date.now(),
        details: {
          message: args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '),
        },
      });
      originalError.apply(console, args);
    };

    // Capture unhandled errors
    window.addEventListener('error', (e) => {
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
    });

    // Capture unhandled promise rejections
    window.addEventListener('unhandledrejection', (e) => {
      this.recordStateChange({
        type: 'error',
        timestamp: Date.now(),
        details: {
          message: `Unhandled rejection: ${e.reason}`,
        },
      });
    });
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
    const a = document.createElement('a');
    a.href = url;
    a.download = `swing-session-${this.recording.sessionId}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
   * Cleanup
   */
  dispose(): void {
    if (this.snapshotInterval) {
      clearInterval(this.snapshotInterval);
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
