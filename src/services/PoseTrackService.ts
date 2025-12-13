/**
 * PoseTrack Service
 *
 * Handles loading, saving, and managing pose track files.
 * Supports both file system and IndexedDB storage.
 */

import type {
  CropRegion,
  PoseModel,
  PoseTrackFile,
  PoseTrackMetadata,
  SavedPoseTrackInfo,
} from '../types/posetrack';
import { isValidSha256Hash } from '../utils/videoHash';

const POSETRACK_DB_NAME = 'swing-analyzer-posetracks';
const POSETRACK_STORE_NAME = 'posetracks';
const POSETRACK_DB_VERSION = 1;

/**
 * Storage mode for pose tracks
 * - 'memory': Session-only, cleared on page reload
 * - 'indexeddb': Persistent across page loads (default)
 */
export type PoseTrackStorageMode = 'memory' | 'indexeddb';

// In-memory storage for session-only mode
const memoryStore = new Map<string, PoseTrackFile>();

// Storage key for persisting the user's preference
const STORAGE_MODE_KEY = 'swing-analyzer-pose-cache-mode';

/**
 * Load storage mode preference from localStorage
 */
function loadStorageModePreference(): PoseTrackStorageMode {
  try {
    const saved = localStorage.getItem(STORAGE_MODE_KEY);
    if (saved === 'memory' || saved === 'indexeddb') {
      return saved;
    }
  } catch (error) {
    // localStorage not available (private browsing, etc.)
    console.warn(
      '[PoseTrackService] Failed to read storage mode preference. ' +
        'Defaulting to IndexedDB. This may occur in private browsing mode.',
      error
    );
  }
  return 'indexeddb'; // Default to persistent caching
}

/**
 * Save storage mode preference to localStorage
 */
function saveStorageModePreference(mode: PoseTrackStorageMode): void {
  try {
    localStorage.setItem(STORAGE_MODE_KEY, mode);
  } catch (error) {
    // localStorage not available (private browsing, quota exceeded, etc.)
    console.warn(
      '[PoseTrackService] Failed to save storage mode preference. ' +
        'The setting will not persist after page reload.',
      error
    );
  }
}

// Current storage mode - defaults to indexeddb (persistent caching)
let currentStorageMode: PoseTrackStorageMode = loadStorageModePreference();

/**
 * Set the storage mode for pose tracks
 * @param mode - The storage mode to use
 * @param persist - Whether to save the preference to localStorage (default: true)
 */
export function setPoseTrackStorageMode(
  mode: PoseTrackStorageMode,
  persist: boolean = true
): void {
  currentStorageMode = mode;
  if (persist) {
    saveStorageModePreference(mode);
  }
}

/**
 * Get the current storage mode
 */
export function getPoseTrackStorageMode(): PoseTrackStorageMode {
  return currentStorageMode;
}

/**
 * Clear the in-memory store (useful for tests)
 */
export function clearMemoryStore(): void {
  memoryStore.clear();
}

/**
 * File extension for pose track files
 */
export const POSETRACK_EXTENSION = '.posetrack.json';

/**
 * Generate a filename for a pose track
 */
export function generatePoseTrackFilename(
  videoName: string,
  model: PoseModel,
  timestamp?: Date
): string {
  const date = timestamp || new Date();
  const dateStr = date.toISOString().split('T')[0];
  const baseName = videoName.replace(/\.[^/.]+$/, ''); // Remove extension
  const safeName = baseName.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${safeName}_${model}_${dateStr}${POSETRACK_EXTENSION}`;
}

/**
 * Validate a pose track file structure
 */
export function validatePoseTrack(data: unknown): data is PoseTrackFile {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const file = data as Record<string, unknown>;

  // Check metadata
  if (!file.metadata || typeof file.metadata !== 'object') {
    return false;
  }

  const metadata = file.metadata as Record<string, unknown>;

  // Required metadata fields
  if (metadata.version !== '1.0') {
    return false;
  }

  if (metadata.model !== 'blazepose') {
    return false;
  }

  if (
    typeof metadata.sourceVideoHash !== 'string' ||
    !isValidSha256Hash(metadata.sourceVideoHash)
  ) {
    return false;
  }

  if (typeof metadata.frameCount !== 'number' || metadata.frameCount < 0) {
    return false;
  }

  if (typeof metadata.fps !== 'number' || metadata.fps <= 0) {
    return false;
  }

  // Check frames array
  if (!Array.isArray(file.frames)) {
    return false;
  }

  // Validate at least one frame if frames exist
  if (file.frames.length > 0) {
    const firstFrame = file.frames[0] as Record<string, unknown>;
    if (typeof firstFrame.frameIndex !== 'number') {
      return false;
    }
    if (!Array.isArray(firstFrame.keypoints)) {
      return false;
    }
  }

  return true;
}

/**
 * Parse a pose track from JSON string
 */
export function parsePoseTrack(json: string): PoseTrackFile {
  const data = JSON.parse(json);

  if (!validatePoseTrack(data)) {
    throw new Error('Invalid pose track file format');
  }

  return data;
}

/**
 * Serialize a pose track to JSON string.
 * Strips runtime-only fields (like frameImage) that cannot be serialized.
 */
export function serializePoseTrack(
  poseTrack: PoseTrackFile,
  pretty: boolean = false
): string {
  // Strip runtime-only fields from frames before serialization
  // frameImage is an ImageData object that cannot be serialized to JSON
  const cleanedFrames = poseTrack.frames.map((frame) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { frameImage, ...serializableFrame } = frame;
    return serializableFrame;
  });

  const cleanedPoseTrack = {
    ...poseTrack,
    frames: cleanedFrames,
  };

  return JSON.stringify(cleanedPoseTrack, null, pretty ? 2 : undefined);
}

/**
 * Load a pose track from a File
 */
export async function loadPoseTrackFromFile(
  file: File
): Promise<PoseTrackFile> {
  const text = await file.text();
  return parsePoseTrack(text);
}

/**
 * Download a pose track as a file
 */
export function downloadPoseTrack(
  poseTrack: PoseTrackFile,
  filename?: string
): void {
  const json = serializePoseTrack(poseTrack, true);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const finalFilename =
    filename ||
    generatePoseTrackFilename(
      poseTrack.metadata.sourceVideoName || 'video',
      poseTrack.metadata.model
    );

  const a = document.createElement('a');
  a.href = url;
  a.download = finalFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Open IndexedDB database
 */
function openPoseTrackDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(POSETRACK_DB_NAME, POSETRACK_DB_VERSION);

    request.onerror = () => {
      reject(new Error('Failed to open PoseTrack database'));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(POSETRACK_STORE_NAME)) {
        const store = db.createObjectStore(POSETRACK_STORE_NAME, {
          keyPath: 'videoHash',
        });
        store.createIndex('model', 'model', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
  });
}

/**
 * Save a pose track to storage (memory or IndexedDB based on current mode)
 */
export async function savePoseTrackToStorage(
  poseTrack: PoseTrackFile
): Promise<void> {
  const videoHash = poseTrack.metadata.sourceVideoHash;

  if (currentStorageMode === 'memory') {
    memoryStore.set(videoHash, poseTrack);
    return;
  }

  // IndexedDB mode
  const db = await openPoseTrackDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([POSETRACK_STORE_NAME], 'readwrite');

    transaction.onerror = () => {
      reject(
        new Error(
          `Transaction failed: ${transaction.error?.message || 'Unknown error'}`
        )
      );
    };

    transaction.onabort = () => {
      reject(
        new Error(
          'Transaction aborted. This may be due to storage quota limits.'
        )
      );
    };

    const store = transaction.objectStore(POSETRACK_STORE_NAME);

    const record = {
      videoHash: poseTrack.metadata.sourceVideoHash,
      poseTrack,
      model: poseTrack.metadata.model,
      createdAt: poseTrack.metadata.extractedAt,
    };

    const request = store.put(record);

    request.onerror = () => {
      reject(new Error('Failed to save pose track'));
    };

    request.onsuccess = () => {
      resolve();
    };

    transaction.oncomplete = () => {
      db.close();
    };
  });
}

/**
 * Load a pose track from storage by video hash
 */
export async function loadPoseTrackFromStorage(
  videoHash: string
): Promise<PoseTrackFile | null> {
  if (currentStorageMode === 'memory') {
    return memoryStore.get(videoHash) ?? null;
  }

  // IndexedDB mode
  const db = await openPoseTrackDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([POSETRACK_STORE_NAME], 'readonly');

    transaction.onerror = () => {
      reject(
        new Error(
          `Transaction failed: ${transaction.error?.message || 'Unknown error'}`
        )
      );
    };

    transaction.onabort = () => {
      reject(new Error('Transaction aborted while loading pose track.'));
    };

    const store = transaction.objectStore(POSETRACK_STORE_NAME);

    const request = store.get(videoHash);

    request.onerror = () => {
      reject(new Error('Failed to load pose track'));
    };

    request.onsuccess = () => {
      const result = request.result;
      if (result?.poseTrack) {
        resolve(result.poseTrack);
      } else {
        resolve(null);
      }
    };

    transaction.oncomplete = () => {
      db.close();
    };
  });
}

/**
 * Delete a pose track from storage
 */
export async function deletePoseTrackFromStorage(
  videoHash: string
): Promise<void> {
  if (currentStorageMode === 'memory') {
    memoryStore.delete(videoHash);
    return;
  }

  // IndexedDB mode
  const db = await openPoseTrackDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([POSETRACK_STORE_NAME], 'readwrite');

    transaction.onerror = () => {
      reject(
        new Error(
          `Transaction failed: ${transaction.error?.message || 'Unknown error'}`
        )
      );
    };

    transaction.onabort = () => {
      reject(new Error('Transaction aborted while deleting pose track.'));
    };

    const store = transaction.objectStore(POSETRACK_STORE_NAME);

    const request = store.delete(videoHash);

    request.onerror = () => {
      reject(new Error('Failed to delete pose track'));
    };

    request.onsuccess = () => {
      resolve();
    };

    transaction.oncomplete = () => {
      db.close();
    };
  });
}

/**
 * Clear all pose tracks from storage
 */
export async function clearAllPoseTracks(): Promise<void> {
  if (currentStorageMode === 'memory') {
    memoryStore.clear();
    return;
  }

  // IndexedDB mode - delete and recreate the database
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(POSETRACK_DB_NAME);

    request.onerror = () => {
      reject(new Error('Failed to clear pose track cache'));
    };

    request.onblocked = () => {
      console.warn(
        '[PoseTrackService] Database deletion blocked - other tabs may have it open.'
      );
      reject(
        new Error(
          'Cache clear blocked. Please close other tabs using this app and try again.'
        )
      );
    };

    request.onsuccess = () => {
      resolve();
    };
  });
}

/**
 * List all saved pose tracks
 */
export async function listSavedPoseTracks(): Promise<SavedPoseTrackInfo[]> {
  if (currentStorageMode === 'memory') {
    const infos: SavedPoseTrackInfo[] = [];
    for (const pt of memoryStore.values()) {
      const json = JSON.stringify(pt);
      infos.push({
        filename: generatePoseTrackFilename(
          pt.metadata.sourceVideoName || 'video',
          pt.metadata.model
        ),
        videoHash: pt.metadata.sourceVideoHash,
        videoName: pt.metadata.sourceVideoName,
        model: pt.metadata.model,
        frameCount: pt.metadata.frameCount,
        duration: pt.metadata.sourceVideoDuration,
        fileSize: new Blob([json]).size,
        createdAt: pt.metadata.extractedAt,
      });
    }
    return infos;
  }

  // IndexedDB mode
  const db = await openPoseTrackDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([POSETRACK_STORE_NAME], 'readonly');

    transaction.onerror = () => {
      reject(
        new Error(
          `Transaction failed: ${transaction.error?.message || 'Unknown error'}`
        )
      );
    };

    transaction.onabort = () => {
      reject(new Error('Transaction aborted while listing pose tracks.'));
    };

    const store = transaction.objectStore(POSETRACK_STORE_NAME);

    const request = store.getAll();

    request.onerror = () => {
      reject(new Error('Failed to list pose tracks'));
    };

    request.onsuccess = () => {
      const results = request.result || [];
      const infos: SavedPoseTrackInfo[] = results.map(
        (record: { poseTrack: PoseTrackFile; createdAt: string }) => {
          const pt = record.poseTrack;
          const json = JSON.stringify(pt);
          return {
            filename: generatePoseTrackFilename(
              pt.metadata.sourceVideoName || 'video',
              pt.metadata.model
            ),
            videoHash: pt.metadata.sourceVideoHash,
            videoName: pt.metadata.sourceVideoName,
            model: pt.metadata.model,
            frameCount: pt.metadata.frameCount,
            duration: pt.metadata.sourceVideoDuration,
            fileSize: new Blob([json]).size,
            createdAt: record.createdAt,
          };
        }
      );
      resolve(infos);
    };

    transaction.oncomplete = () => {
      db.close();
    };
  });
}

/**
 * Check if a pose track exists for a video hash
 */
export async function hasPoseTrackForVideo(
  videoHash: string
): Promise<boolean> {
  const poseTrack = await loadPoseTrackFromStorage(videoHash);
  return poseTrack !== null;
}

/**
 * Create pose track metadata
 */
export function createPoseTrackMetadata(params: {
  model: PoseModel;
  modelVersion: string;
  modelVariant?: 'lite' | 'full' | 'heavy';
  buildSha?: string;
  buildTimestamp?: string;
  sourceVideoHash: string;
  sourceVideoName?: string;
  sourceVideoDuration: number;
  frameCount: number;
  fps: number;
  videoWidth: number;
  videoHeight: number;
  cropRegion?: CropRegion;
}): PoseTrackMetadata {
  return {
    version: '1.0',
    model: params.model,
    modelVersion: params.modelVersion,
    modelVariant: params.modelVariant,
    buildSha: params.buildSha,
    buildTimestamp: params.buildTimestamp,
    sourceVideoHash: params.sourceVideoHash,
    sourceVideoName: params.sourceVideoName,
    sourceVideoDuration: params.sourceVideoDuration,
    extractedAt: new Date().toISOString(),
    frameCount: params.frameCount,
    fps: params.fps,
    videoWidth: params.videoWidth,
    videoHeight: params.videoHeight,
    cropRegion: params.cropRegion,
  };
}

/**
 * Estimate the file size of a pose track in bytes
 */
export function estimatePoseTrackSize(
  frameCount: number,
  keypointsPerFrame: number = 17
): number {
  // Rough estimate: ~100 bytes per keypoint + overhead
  const bytesPerFrame = keypointsPerFrame * 100 + 50; // angles + metadata
  const metadataBytes = 500;
  return metadataBytes + frameCount * bytesPerFrame;
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Result of fetching and caching a bundled pose track
 */
export interface FetchBundledPoseTrackResult {
  /** Whether the fetch was successful */
  success: boolean;
  /** Whether the pose track was loaded from cache (already existed) */
  fromCache: boolean;
  /** The loaded pose track (if successful) */
  poseTrack?: PoseTrackFile;
  /** Error message (if unsuccessful) */
  error?: string;
}

/**
 * Fetch a bundled pose track from a URL and store it in the cache.
 *
 * This enables instant loading of sample videos by pre-populating the
 * pose track cache before the video is processed.
 *
 * @param primaryUrl - Remote URL for the pose track (tried first)
 * @param localFallback - Local path to fallback to if remote fails
 * @param expectedVideoHash - Optional expected video hash to verify the pose track matches
 * @param signal - Optional AbortSignal for cancellation
 * @returns Result indicating success/failure and whether it was from cache
 */
export async function fetchAndCacheBundledPoseTrack(
  primaryUrl: string,
  localFallback?: string,
  expectedVideoHash?: string,
  signal?: AbortSignal
): Promise<FetchBundledPoseTrackResult> {
  // Check if we already have a cached pose track for this video hash
  if (expectedVideoHash) {
    try {
      const existing = await loadPoseTrackFromStorage(expectedVideoHash);
      if (existing) {
        console.log(
          '[PoseTrackService] Bundled pose track already in cache for hash:',
          expectedVideoHash.slice(0, 8)
        );
        return { success: true, fromCache: true, poseTrack: existing };
      }
    } catch (cacheError) {
      // IndexedDB may fail in private browsing mode or due to corruption
      console.warn(
        '[PoseTrackService] Failed to check cache, will fetch fresh:',
        cacheError
      );
      // Continue to fetch logic
    }
  }

  // Try to fetch from primary URL
  let json: string | null = null;

  try {
    console.log(
      '[PoseTrackService] Fetching bundled pose track from:',
      primaryUrl
    );
    const response = await fetch(primaryUrl, { signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    json = await response.text();
  } catch (error) {
    // Check for abort
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { success: false, fromCache: false, error: 'Aborted' };
    }

    console.warn(
      '[PoseTrackService] Failed to fetch from primary URL, trying fallback:',
      error
    );

    // Try local fallback if available
    if (localFallback) {
      try {
        console.log(
          '[PoseTrackService] Fetching bundled pose track from local:',
          localFallback
        );
        const response = await fetch(localFallback, { signal });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        json = await response.text();
      } catch (fallbackError) {
        if (
          fallbackError instanceof DOMException &&
          fallbackError.name === 'AbortError'
        ) {
          return { success: false, fromCache: false, error: 'Aborted' };
        }
        console.error(
          '[PoseTrackService] Failed to fetch from fallback:',
          fallbackError
        );
        return {
          success: false,
          fromCache: false,
          error: `Failed to fetch pose track: primary (${error}), fallback (${fallbackError})`,
        };
      }
    } else {
      return {
        success: false,
        fromCache: false,
        error: `Failed to fetch pose track: ${error}`,
      };
    }
  }

  // Parse and validate the pose track
  if (!json) {
    return {
      success: false,
      fromCache: false,
      error: 'No pose track data received',
    };
  }

  let poseTrack: PoseTrackFile;
  try {
    poseTrack = parsePoseTrack(json);
  } catch (parseError) {
    console.error('[PoseTrackService] Failed to parse pose track:', parseError);
    return {
      success: false,
      fromCache: false,
      error: `Invalid pose track format: ${parseError}`,
    };
  }

  // Verify video hash matches if expected hash was provided
  if (
    expectedVideoHash &&
    poseTrack.metadata.sourceVideoHash !== expectedVideoHash
  ) {
    console.warn(
      '[PoseTrackService] Pose track hash mismatch. Expected:',
      expectedVideoHash.slice(0, 8),
      'Got:',
      poseTrack.metadata.sourceVideoHash.slice(0, 8)
    );
    // Still save it - the hash in the pose track is the source of truth
    // This can happen if the video was re-encoded or if the expected hash was wrong
  }

  // Save to storage
  try {
    await savePoseTrackToStorage(poseTrack);
    console.log(
      '[PoseTrackService] Bundled pose track cached successfully:',
      poseTrack.metadata.frameCount,
      'frames for hash:',
      poseTrack.metadata.sourceVideoHash.slice(0, 8)
    );
  } catch (saveError) {
    console.error('[PoseTrackService] Failed to save pose track:', saveError);
    // Return success anyway - we have the pose track in memory
    return { success: true, fromCache: false, poseTrack };
  }

  return { success: true, fromCache: false, poseTrack };
}
