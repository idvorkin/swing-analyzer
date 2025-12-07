/**
 * IndexedDB Helpers for E2E Tests
 *
 * Provides utilities for seeding and clearing IndexedDB during tests.
 */

import type { Page } from '@playwright/test';
import type { PoseTrackFile } from '../../src/types/posetrack';
import { type FixtureName, loadFixture } from '../fixtures';

const POSETRACK_DB_NAME = 'swing-analyzer-posetracks';
const POSETRACK_STORE_NAME = 'posetracks';

/**
 * Set the app's pose track storage mode.
 * Call this before seeding data if you need IndexedDB persistence.
 *
 * @returns true if storage mode was set, false if testSetup not available
 */
export async function setPoseTrackStorageMode(
  page: Page,
  mode: 'memory' | 'indexeddb'
): Promise<boolean> {
  return page.evaluate((storageMode) => {
    // Access the service through the test setup
    const testSetup = (window as unknown as { __testSetup?: { setPoseTrackStorageMode?: (mode: string) => void } }).__testSetup;
    if (testSetup?.setPoseTrackStorageMode) {
      testSetup.setPoseTrackStorageMode(storageMode);
      return true;
    }
    return false;
  }, mode);
}

/**
 * Seed a pose track fixture into IndexedDB
 *
 * @param page - Playwright page instance
 * @param fixtureName - Name of the fixture to load
 */
export async function seedPoseTrackFixture(
  page: Page,
  fixtureName: FixtureName
): Promise<void> {
  const fixture = await loadFixture(fixtureName);
  await seedPoseTrackData(page, fixture);
}

/**
 * Seed a pose track using the app's storage service via testSetup.
 * This respects the current storage mode (memory or indexeddb).
 *
 * @param page - Playwright page instance
 * @param poseTrack - The pose track data to seed
 */
export async function seedPoseTrackData(
  page: Page,
  poseTrack: PoseTrackFile
): Promise<void> {
  // First check if testSetup exposes a seeding function
  const hasTestSetup = await page.evaluate(() => {
    return !!(window as unknown as { __testSetup?: { seedPoseTrack?: unknown } }).__testSetup?.seedPoseTrack;
  });

  if (hasTestSetup) {
    // Use testSetup's seeding function (respects storage mode)
    await page.evaluate((data) => {
      const testSetup = (window as unknown as { __testSetup: { seedPoseTrack: (data: unknown) => Promise<void> } }).__testSetup;
      return testSetup.seedPoseTrack(data);
    }, poseTrack);
  } else {
    // Fallback to direct IndexedDB seeding
    await seedPoseTrackToIndexedDB(page, poseTrack);
  }
}

/**
 * Seed a pose track directly into IndexedDB (bypasses storage mode).
 * Use this only when you specifically need IndexedDB persistence.
 *
 * @param page - Playwright page instance
 * @param poseTrack - The pose track data to seed
 */
export async function seedPoseTrackToIndexedDB(
  page: Page,
  poseTrack: PoseTrackFile
): Promise<void> {
  await page.evaluate(
    async ({ data, dbName, storeName }) => {
      return new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains(storeName)) {
            const store = db.createObjectStore(storeName, {
              keyPath: 'videoHash',
            });
            store.createIndex('model', 'model', { unique: false });
            store.createIndex('createdAt', 'createdAt', { unique: false });
          }
        };

        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction([storeName], 'readwrite');
          const store = tx.objectStore(storeName);

          const record = {
            videoHash: data.metadata.sourceVideoHash,
            poseTrack: data,
            model: data.metadata.model,
            createdAt: data.metadata.extractedAt,
          };

          const putRequest = store.put(record);

          putRequest.onsuccess = () => {
            // Success - continue
          };

          putRequest.onerror = () => {
            reject(new Error(`Failed to put record: ${putRequest.error}`));
          };

          tx.oncomplete = () => {
            db.close();
            resolve();
          };

          tx.onerror = () => {
            reject(new Error(`Transaction failed: ${tx.error}`));
          };
        };

        request.onerror = () => {
          reject(new Error(`Failed to open database: ${request.error}`));
        };
      });
    },
    {
      data: poseTrack,
      dbName: POSETRACK_DB_NAME,
      storeName: POSETRACK_STORE_NAME,
    }
  );
}

/**
 * Clear all pose track data from IndexedDB
 *
 * @param page - Playwright page instance
 */
export async function clearPoseTrackDB(page: Page): Promise<void> {
  await page.evaluate(async (dbName) => {
    return new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase(dbName);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve(); // Ignore errors, DB might not exist
      request.onblocked = () => resolve(); // DB was blocked, ignore
    });
  }, POSETRACK_DB_NAME);
}

/**
 * Get a pose track from IndexedDB by video hash
 *
 * @param page - Playwright page instance
 * @param videoHash - The video hash to look up
 */
export async function getPoseTrackFromDB(
  page: Page,
  videoHash: string
): Promise<PoseTrackFile | null> {
  return page.evaluate(
    async ({ hash, dbName, storeName }) => {
      return new Promise<PoseTrackFile | null>((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);

        request.onerror = () => {
          reject(new Error(`Failed to open database: ${request.error}`));
        };

        request.onsuccess = () => {
          const db = request.result;

          if (!db.objectStoreNames.contains(storeName)) {
            db.close();
            resolve(null);
            return;
          }

          const tx = db.transaction([storeName], 'readonly');
          const store = tx.objectStore(storeName);
          const getRequest = store.get(hash);

          getRequest.onsuccess = () => {
            const result = getRequest.result;
            if (result?.poseTrack) {
              resolve(result.poseTrack);
            } else {
              resolve(null);
            }
          };

          getRequest.onerror = () => {
            reject(new Error(`Failed to get record: ${getRequest.error}`));
          };

          tx.oncomplete = () => {
            db.close();
          };
        };
      });
    },
    {
      hash: videoHash,
      dbName: POSETRACK_DB_NAME,
      storeName: POSETRACK_STORE_NAME,
    }
  );
}

/**
 * List all pose track hashes in IndexedDB
 *
 * @param page - Playwright page instance
 */
export async function listPoseTrackHashes(page: Page): Promise<string[]> {
  return page.evaluate(
    async ({ dbName, storeName }) => {
      return new Promise<string[]>((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);

        request.onerror = () => {
          reject(new Error(`Failed to open database: ${request.error}`));
        };

        request.onsuccess = () => {
          const db = request.result;

          if (!db.objectStoreNames.contains(storeName)) {
            db.close();
            resolve([]);
            return;
          }

          const tx = db.transaction([storeName], 'readonly');
          const store = tx.objectStore(storeName);
          const getAllRequest = store.getAllKeys();

          getAllRequest.onsuccess = () => {
            resolve(getAllRequest.result as string[]);
          };

          getAllRequest.onerror = () => {
            reject(new Error(`Failed to get keys: ${getAllRequest.error}`));
          };

          tx.oncomplete = () => {
            db.close();
          };
        };
      });
    },
    { dbName: POSETRACK_DB_NAME, storeName: POSETRACK_STORE_NAME }
  );
}
