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
  seedPoseTrackToIndexedDB,
  setPoseTrackStorageMode,
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
  clearVideoTestId,
  clickPistolSampleButton,
  clickSwingSampleButton,
  generateTestId,
  getVideoState,
  loadHardcodedVideo,
  loadHardcodedVideoAndPlay,
  openMediaSelectorDialog,
  pauseVideo,
  playVideo,
  playVideoToEnd,
  seekToTime,
  setVideoTestId,
  stopVideo,
  togglePlayPause,
  waitForCachedPoseTrack,
  waitForModelReady,
} from './video';
// Video route interception for fast tests
export {
  serveLocalVideos,
  setupFastTestVideo,
  setupIgorTestVideo,
  useIgorTestVideo,
  useShortTestVideo,
} from './video-route';
