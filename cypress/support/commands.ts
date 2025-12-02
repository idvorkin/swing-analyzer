/// <reference types="cypress" />

// IndexedDB constants (must match PoseTrackService.ts)
const POSETRACK_DB_NAME = 'swing-analyzer-posetracks';
const POSETRACK_STORE_NAME = 'posetracks';
const POSETRACK_DB_VERSION = 1;

declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Load a pose track fixture into IndexedDB
       */
      loadPoseTrackFixture(fixtureName?: string): Chainable<void>;

      /**
       * Clear all pose tracks from IndexedDB
       */
      clearPoseTracks(): Chainable<void>;

      /**
       * Get the video element
       */
      getVideoElement(): Chainable<JQuery<HTMLVideoElement>>;

      /**
       * Get the canvas element
       */
      getCanvasElement(): Chainable<JQuery<HTMLCanvasElement>>;
    }
  }
}

// Load pose track fixture into IndexedDB
Cypress.Commands.add(
  'loadPoseTrackFixture',
  (fixtureName = 'sample-posetrack.json') => {
    cy.fixture(fixtureName).then((poseTrack) => {
      cy.window().then((win) => {
        return new Cypress.Promise((resolve, reject) => {
          const request = win.indexedDB.open(
            POSETRACK_DB_NAME,
            POSETRACK_DB_VERSION
          );

          request.onerror = () => {
            reject(new Error('Failed to open IndexedDB'));
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

          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction(POSETRACK_STORE_NAME, 'readwrite');
            const store = tx.objectStore(POSETRACK_STORE_NAME);

            const record = {
              videoHash: poseTrack.metadata.sourceVideoHash,
              poseTrack: poseTrack,
              model: poseTrack.metadata.model,
              createdAt: poseTrack.metadata.extractedAt,
            };

            const putRequest = store.put(record);

            putRequest.onsuccess = () => {
              db.close();
              resolve();
            };

            putRequest.onerror = () => {
              db.close();
              reject(new Error('Failed to store pose track'));
            };
          };
        });
      });
    });
  }
);

// Clear all pose tracks from IndexedDB
Cypress.Commands.add('clearPoseTracks', () => {
  cy.window().then((win) => {
    return new Cypress.Promise((resolve) => {
      const request = win.indexedDB.open(
        POSETRACK_DB_NAME,
        POSETRACK_DB_VERSION
      );

      request.onerror = () => {
        // DB doesn't exist, that's fine
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(POSETRACK_STORE_NAME)) {
          db.createObjectStore(POSETRACK_STORE_NAME, {
            keyPath: 'videoHash',
          });
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(POSETRACK_STORE_NAME, 'readwrite');
        const store = tx.objectStore(POSETRACK_STORE_NAME);
        store.clear();
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
      };
    });
  });
});

// Get the video element
Cypress.Commands.add('getVideoElement', () => {
  return cy.get('video#video');
});

// Get the overlay canvas element
Cypress.Commands.add('getCanvasElement', () => {
  return cy.get('canvas#output-canvas');
});

export {};
