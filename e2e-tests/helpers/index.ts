/**
 * E2E Test Helpers
 *
 * Central export for all test helper functions.
 */

// IndexedDB helpers
export {
  clearPoseTrackDB,
  getPoseTrackFromDB,
  listPoseTrackHashes,
  seedPoseTrackData,
  seedPoseTrackFixture,
} from './indexeddb';

// Video helpers
export {
  getVideoState,
  loadHardcodedVideo,
  loadHardcodedVideoAndPlay,
  pauseVideo,
  playVideo,
  playVideoToEnd,
  seekToTime,
  stopVideo,
  togglePlayPause,
  waitForCachedPoseTrack,
  waitForModelReady,
} from './video';

// Mock pose detector helpers
export {
  clearMockPoseDetector,
  isMockPoseDetectorAvailable,
  setupMockPoseDetector,
  setupMockPoseDetectorWithData,
} from './mockPoseDetector';
