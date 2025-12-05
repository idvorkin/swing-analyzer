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
// Mock pose detector helpers
export {
  clearMockPoseDetector,
  isMockPoseDetectorAvailable,
  setupMockPoseDetector,
  setupMockPoseDetectorWithData,
} from './mockPoseDetector';
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
// Video route interception for fast tests
export {
  serveLocalVideos,
  setupFastTestVideo,
  useShortTestVideo,
} from './video-route';
