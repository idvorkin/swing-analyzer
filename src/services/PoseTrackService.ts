/**
 * PoseTrack Service
 *
 * Handles loading, saving, and managing pose track files.
 * Supports both file system and IndexedDB storage.
 */

import type {
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

  if (
    !['movenet-lightning', 'movenet-thunder', 'blazepose'].includes(
      metadata.model as string
    )
  ) {
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
 * Serialize a pose track to JSON string
 */
export function serializePoseTrack(
  poseTrack: PoseTrackFile,
  pretty: boolean = false
): string {
  return JSON.stringify(poseTrack, null, pretty ? 2 : undefined);
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
 * Save a pose track to IndexedDB
 */
export async function savePoseTrackToStorage(
  poseTrack: PoseTrackFile
): Promise<void> {
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
 * Load a pose track from IndexedDB by video hash
 */
export async function loadPoseTrackFromStorage(
  videoHash: string
): Promise<PoseTrackFile | null> {
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
 * Delete a pose track from IndexedDB
 */
export async function deletePoseTrackFromStorage(
  videoHash: string
): Promise<void> {
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
 * List all saved pose tracks
 */
export async function listSavedPoseTracks(): Promise<SavedPoseTrackInfo[]> {
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
  sourceVideoHash: string;
  sourceVideoName?: string;
  sourceVideoDuration: number;
  frameCount: number;
  fps: number;
  videoWidth: number;
  videoHeight: number;
}): PoseTrackMetadata {
  return {
    version: '1.0',
    model: params.model,
    modelVersion: params.modelVersion,
    sourceVideoHash: params.sourceVideoHash,
    sourceVideoName: params.sourceVideoName,
    sourceVideoDuration: params.sourceVideoDuration,
    extractedAt: new Date().toISOString(),
    frameCount: params.frameCount,
    fps: params.fps,
    videoWidth: params.videoWidth,
    videoHeight: params.videoHeight,
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
