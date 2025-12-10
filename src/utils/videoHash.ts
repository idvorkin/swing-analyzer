/**
 * Video Hashing Utility
 *
 * Computes SHA-256 hash of video files for pose track matching.
 * Uses Web Crypto API for efficient, streaming hash computation.
 *
 * For E2E tests: Set window.__VIDEO_TEST_ID__ to add a unique suffix to hashes,
 * allowing parallel tests to avoid cache collisions while still testing the cache.
 */

/**
 * Get the test ID if running in E2E test mode.
 * Tests set window.__VIDEO_TEST_ID__ to isolate their cache entries.
 */
function getTestId(): string | null {
  if (typeof window !== 'undefined') {
    return (
      (window as unknown as { __VIDEO_TEST_ID__?: string }).__VIDEO_TEST_ID__ ??
      null
    );
  }
  return null;
}

/**
 * Compute SHA-256 hash of a File or Blob
 * @param file - The file to hash
 * @returns Promise resolving to hex-encoded SHA-256 hash
 */
export async function computeVideoHash(file: File | Blob): Promise<string> {
  const buffer = await file.arrayBuffer();

  // If test ID is set, include it in the hash for cache isolation
  const testId = getTestId();
  let dataToHash: ArrayBuffer;

  if (testId) {
    const testIdBytes = new TextEncoder().encode(testId);
    const combined = new Uint8Array(buffer.byteLength + testIdBytes.byteLength);
    combined.set(new Uint8Array(buffer), 0);
    combined.set(testIdBytes, buffer.byteLength);
    dataToHash = combined.buffer;
  } else {
    dataToHash = buffer;
  }

  const hashBuffer = await crypto.subtle.digest('SHA-256', dataToHash);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hashHex;
}

/**
 * Compute a quick hash using only the first and last chunks of the file.
 * Much faster for large videos while still being unique enough for matching.
 *
 * @param file - The file to hash
 * @param chunkSize - Size of each chunk to read (default 1MB)
 * @returns Promise resolving to hex-encoded SHA-256 hash
 */
export async function computeQuickVideoHash(
  file: File | Blob,
  chunkSize: number = 1024 * 1024
): Promise<string> {
  const size = file.size;

  // For small files, just hash the whole thing
  if (size <= chunkSize * 2) {
    return computeVideoHash(file);
  }

  // Read first chunk
  const firstChunk = file.slice(0, chunkSize);
  const firstBuffer = await firstChunk.arrayBuffer();

  // Read last chunk
  const lastChunk = file.slice(size - chunkSize, size);
  const lastBuffer = await lastChunk.arrayBuffer();

  // Combine with file size for uniqueness
  const sizeBuffer = new ArrayBuffer(8);
  const sizeView = new DataView(sizeBuffer);
  sizeView.setBigUint64(0, BigInt(size), true);

  // Check for test ID (E2E test isolation)
  const testId = getTestId();
  const testIdBytes = testId
    ? new TextEncoder().encode(testId)
    : new Uint8Array(0);

  // Concatenate all buffers (including test ID if present)
  const combined = new Uint8Array(
    firstBuffer.byteLength + lastBuffer.byteLength + 8 + testIdBytes.byteLength
  );
  combined.set(new Uint8Array(firstBuffer), 0);
  combined.set(new Uint8Array(lastBuffer), firstBuffer.byteLength);
  combined.set(
    new Uint8Array(sizeBuffer),
    firstBuffer.byteLength + lastBuffer.byteLength
  );
  if (testIdBytes.byteLength > 0) {
    combined.set(
      testIdBytes,
      firstBuffer.byteLength + lastBuffer.byteLength + 8
    );
  }

  // Hash the combined data
  const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return hashHex;
}

/**
 * Validate that a hash string is a valid SHA-256 hex string
 * @param hash - The hash string to validate
 * @returns true if valid SHA-256 hex string
 */
export function isValidSha256Hash(hash: string): boolean {
  return /^[a-f0-9]{64}$/i.test(hash);
}

/**
 * Truncate a hash for display purposes
 * @param hash - The full hash string
 * @param length - Number of characters to show (default 8)
 * @returns Truncated hash with ellipsis
 */
export function truncateHash(hash: string, length: number = 8): string {
  if (hash.length <= length) {
    return hash;
  }
  return `${hash.slice(0, length)}...`;
}
