/**
 * Video Hashing Utility
 *
 * Computes SHA-256 hash of video files for pose track matching.
 * Uses Web Crypto API for efficient, streaming hash computation.
 */

/**
 * Compute SHA-256 hash of a File or Blob
 * @param file - The file to hash
 * @returns Promise resolving to hex-encoded SHA-256 hash
 */
export async function computeVideoHash(file: File | Blob): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
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

  // Concatenate all buffers
  const combined = new Uint8Array(
    firstBuffer.byteLength + lastBuffer.byteLength + 8
  );
  combined.set(new Uint8Array(firstBuffer), 0);
  combined.set(new Uint8Array(lastBuffer), firstBuffer.byteLength);
  combined.set(
    new Uint8Array(sizeBuffer),
    firstBuffer.byteLength + lastBuffer.byteLength
  );

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
