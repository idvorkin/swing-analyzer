/**
 * Frame Hash Utilities
 *
 * Provides perceptual hashing for video frames to verify
 * pose track data matches the source video.
 *
 * Uses a simple but effective approach:
 * 1. Downscale frame to 8x8 grayscale
 * 2. Compute average luminance
 * 3. Generate 64-bit hash based on pixels above/below average
 *
 * Similar frames produce similar hashes (low Hamming distance).
 *
 * Hashes are indexed by time offset (seconds) for:
 * - Resilience to fps changes during re-encoding
 * - Easy lookup during verification
 * - Frame-accurate matching regardless of frame index
 */

/** Hash size options */
export const HASH_SIZES = {
  SMALL: 8, // 8x8 = 64 bits (16 hex chars) - compact, good for basic matching
  MEDIUM: 16, // 16x16 = 256 bits (64 hex chars) - better discrimination
  LARGE: 32, // 32x32 = 1024 bits (256 hex chars) - maximum detail
} as const;

/** Default hash size - 16x16 for good balance of detail and size */
export const DEFAULT_HASH_SIZE = HASH_SIZES.MEDIUM;

/**
 * Compute perceptual hash of a video frame
 *
 * @param video - Video element seeked to desired frame
 * @param canvas - Optional canvas to reuse (performance optimization)
 * @param hashSize - Grid size (8, 16, or 32). Default: 16 (256-bit hash)
 * @returns Hex string hash (length depends on size: 16/64/256 chars)
 */
export function computeFrameHash(
  video: HTMLVideoElement,
  canvas?: HTMLCanvasElement,
  hashSize: number = DEFAULT_HASH_SIZE
): string {
  const hashCanvas = canvas || document.createElement('canvas');

  hashCanvas.width = hashSize;
  hashCanvas.height = hashSize;

  const ctx = hashCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Failed to get canvas context for frame hash');
  }

  // Draw scaled-down grayscale version
  ctx.filter = 'grayscale(100%)';
  ctx.drawImage(video, 0, 0, hashSize, hashSize);
  // Reset filter to prevent affecting subsequent canvas operations
  ctx.filter = 'none';

  // Get pixel data
  const imageData = ctx.getImageData(0, 0, hashSize, hashSize);
  const pixels = imageData.data;

  // Extract luminance values (every 4th byte is R, but grayscale so R=G=B)
  const luminance: number[] = [];
  for (let i = 0; i < pixels.length; i += 4) {
    luminance.push(pixels[i]);
  }

  // Compute average
  const avg = luminance.reduce((a, b) => a + b, 0) / luminance.length;

  // Generate hash as byte array (more efficient for larger hashes)
  const totalBits = hashSize * hashSize;
  const bytes: number[] = [];

  for (let byteIdx = 0; byteIdx < Math.ceil(totalBits / 8); byteIdx++) {
    let byte = 0;
    for (let bitIdx = 0; bitIdx < 8; bitIdx++) {
      const pixelIdx = byteIdx * 8 + bitIdx;
      if (pixelIdx < totalBits && luminance[pixelIdx] > avg) {
        byte |= 1 << bitIdx;
      }
    }
    bytes.push(byte);
  }

  // Convert to hex string
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Compute Hamming distance between two hashes
 * Lower distance = more similar frames
 *
 * @param hash1 - First hash (hex string)
 * @param hash2 - Second hash (hex string)
 * @returns Number of differing bits
 */
export function hammingDistance(hash1: string, hash2: string): number {
  // Handle different length hashes by comparing byte-by-byte
  const bytes1 = hexToBytes(hash1);
  const bytes2 = hexToBytes(hash2);

  const maxLen = Math.max(bytes1.length, bytes2.length);
  let distance = 0;

  for (let i = 0; i < maxLen; i++) {
    const b1 = bytes1[i] ?? 0;
    const b2 = bytes2[i] ?? 0;
    let xor = b1 ^ b2;

    // Count set bits in this byte
    while (xor > 0) {
      distance += xor & 1;
      xor >>= 1;
    }
  }

  return distance;
}

/**
 * Convert hex string to byte array
 */
function hexToBytes(hex: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substring(i, i + 2), 16));
  }
  return bytes;
}

/**
 * Calculate similarity score between two hashes
 *
 * @param hash1 - First hash
 * @param hash2 - Second hash
 * @returns Similarity score (0-1, where 1 = identical)
 */
export function hashSimilarity(hash1: string, hash2: string): number {
  const distance = hammingDistance(hash1, hash2);
  // Total bits is based on the longer hash
  const totalBits = Math.max(hash1.length, hash2.length) * 4; // 4 bits per hex char
  return 1 - distance / totalBits;
}

/**
 * Compute hashes for multiple frames in a video
 *
 * @param video - Video element
 * @param timestamps - Array of timestamps (in seconds) to hash
 * @param onProgress - Optional progress callback
 * @returns Map of timestamp -> hash
 */
export async function computeFrameHashes(
  video: HTMLVideoElement,
  timestamps: number[],
  onProgress?: (completed: number, total: number) => void
): Promise<Map<number, string>> {
  const hashes = new Map<number, string>();
  const canvas = document.createElement('canvas');

  for (let i = 0; i < timestamps.length; i++) {
    const time = timestamps[i];

    // Seek to timestamp
    await seekToTime(video, time);

    // Compute hash
    const hash = computeFrameHash(video, canvas);
    hashes.set(time, hash);

    if (onProgress) {
      onProgress(i + 1, timestamps.length);
    }
  }

  return hashes;
}

/**
 * Seek video to specific time and wait for it to be ready
 */
function seekToTime(
  video: HTMLVideoElement,
  time: number,
  timeout = 5000
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (Math.abs(video.currentTime - time) < 0.01) {
      resolve();
      return;
    }

    const timeoutId = setTimeout(() => {
      video.removeEventListener('seeked', onSeeked);
      reject(new Error(`Seek to ${time}s timed out after ${timeout}ms`));
    }, timeout);

    const onSeeked = () => {
      clearTimeout(timeoutId);
      video.removeEventListener('seeked', onSeeked);
      resolve();
    };

    video.addEventListener('seeked', onSeeked);
    video.currentTime = time;
  });
}

/**
 * Verify pose track matches video by comparing frame hashes
 *
 * @param video - Video element
 * @param poseTrackHashes - Hashes stored in pose track (timestamp -> hash)
 * @param sampleCount - Number of frames to sample for verification
 * @returns Verification result with similarity scores
 */
export async function verifyPoseTrackMatch(
  video: HTMLVideoElement,
  poseTrackHashes: Map<number, string>,
  sampleCount = 10
): Promise<PoseTrackVerification> {
  const timestamps = Array.from(poseTrackHashes.keys());

  // Sample evenly distributed frames
  const step = Math.max(1, Math.floor(timestamps.length / sampleCount));
  const sampleTimestamps = timestamps.filter((_, i) => i % step === 0);

  const comparisons: FrameComparison[] = [];
  const canvas = document.createElement('canvas');

  for (const time of sampleTimestamps) {
    const storedHash = poseTrackHashes.get(time);
    if (!storedHash) continue;

    await seekToTime(video, time);
    const currentHash = computeFrameHash(video, canvas);

    const similarity = hashSimilarity(storedHash, currentHash);
    comparisons.push({
      timestamp: time,
      storedHash,
      currentHash,
      similarity,
    });
  }

  // Calculate overall match score (guard against empty comparisons)
  const avgSimilarity =
    comparisons.length > 0
      ? comparisons.reduce((sum, c) => sum + c.similarity, 0) /
        comparisons.length
      : 0;

  // Consider it a match if average similarity > 0.8 (allow for compression artifacts)
  const isMatch = comparisons.length > 0 && avgSimilarity > 0.8;

  return {
    isMatch,
    averageSimilarity: avgSimilarity,
    comparisons,
    sampledFrames: comparisons.length,
  };
}

/**
 * Result of comparing a single frame
 */
export interface FrameComparison {
  timestamp: number;
  storedHash: string;
  currentHash: string;
  similarity: number;
}

/**
 * Result of pose track verification
 */
export interface PoseTrackVerification {
  isMatch: boolean;
  averageSimilarity: number;
  comparisons: FrameComparison[];
  sampledFrames: number;
}

/**
 * Sample frame hashes at regular intervals for storage in pose track
 *
 * @param video - Video element
 * @param interval - Interval in seconds between hashes (default: 1 second)
 * @returns Array of {timestamp, hash} objects
 */
export async function sampleFrameHashes(
  video: HTMLVideoElement,
  interval = 1
): Promise<Array<{ timestamp: number; hash: string }>> {
  const duration = video.duration;
  const timestamps: number[] = [];

  for (let t = 0; t < duration; t += interval) {
    timestamps.push(t);
  }

  const hashMap = await computeFrameHashes(video, timestamps);

  return Array.from(hashMap.entries()).map(([timestamp, hash]) => ({
    timestamp,
    hash,
  }));
}
