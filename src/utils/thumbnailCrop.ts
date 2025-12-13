/**
 * Shared utility for calculating person-centered crop regions for thumbnails.
 *
 * Used by both ThumbnailGenerator (lazy thumbnail generation) and
 * PoseExtractor (extraction-time thumbnail capture).
 */

/**
 * Keypoint with position and optional confidence score.
 * BlazePose keypoints are in pixel coordinates (not normalized).
 */
export interface CropKeypoint {
  x: number;
  y: number;
  score?: number;
}

/**
 * Crop region in pixel coordinates
 */
export interface ThumbnailCropRegion {
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
}

/**
 * Options for crop calculation
 */
export interface CropOptions {
  /** Target thumbnail width */
  thumbWidth: number;
  /** Target thumbnail height */
  thumbHeight: number;
  /** Video/source width in pixels */
  videoWidth: number;
  /** Video/source height in pixels */
  videoHeight: number;
  /** Minimum confidence score for keypoints (default: 0.3) */
  minConfidence?: number;
  /** Horizontal padding multiplier (default: 1.4 = 40% padding) */
  widthPadding?: number;
  /** Vertical padding multiplier (default: 1.3 = 30% padding) */
  heightPadding?: number;
  /** Minimum crop height as fraction of video height (default: 0.4) */
  minCropHeightFraction?: number;
  /** Fallback crop height as fraction of video height when no keypoints (default: 0.85) */
  fallbackCropHeightFraction?: number;
}

/**
 * Calculate a person-centered crop region for thumbnail generation.
 *
 * The algorithm:
 * 1. Filters keypoints by confidence score
 * 2. Calculates bounding box of confident keypoints
 * 3. Centers crop on person with padding
 * 4. Maintains target aspect ratio
 * 5. Ensures minimum crop size
 * 6. Clamps to video bounds
 *
 * @param keypoints - Array of keypoints in pixel coordinates (BlazePose format)
 * @param options - Crop configuration options
 * @returns Crop region in pixel coordinates
 */
export function calculatePersonCenteredCrop(
  keypoints: CropKeypoint[],
  options: CropOptions
): ThumbnailCropRegion {
  const {
    thumbWidth,
    thumbHeight,
    videoWidth,
    videoHeight,
    minConfidence = 0.3,
    widthPadding = 1.4,
    heightPadding = 1.3,
    minCropHeightFraction = 0.4,
    fallbackCropHeightFraction = 0.85,
  } = options;

  const targetAspect = thumbWidth / thumbHeight;

  let personCenterX = videoWidth / 2;
  let personCenterY = videoHeight / 2;
  let cropWidth: number;
  let cropHeight: number;

  // Filter to confident keypoints
  const confidentKeypoints = keypoints.filter(
    (kp) => (kp.score ?? 0) > minConfidence
  );

  if (confidentKeypoints.length > 0) {
    // Calculate bounding box of confident keypoints
    // Note: BlazePose keypoints are in pixel coordinates (not normalized)
    let minX = Infinity,
      maxX = -Infinity;
    let minY = Infinity,
      maxY = -Infinity;

    for (const kp of confidentKeypoints) {
      minX = Math.min(minX, kp.x);
      maxX = Math.max(maxX, kp.x);
      minY = Math.min(minY, kp.y);
      maxY = Math.max(maxY, kp.y);
    }

    // Center of person
    personCenterX = (minX + maxX) / 2;
    personCenterY = (minY + maxY) / 2;

    // Person dimensions with padding (ensure minimum of 1px to avoid division by zero)
    const personWidth = Math.max((maxX - minX) * widthPadding, 1);
    const personHeight = Math.max((maxY - minY) * heightPadding, 1);

    // Determine crop size to fit person while maintaining aspect ratio
    if (personWidth / personHeight > targetAspect) {
      // Person is wider than target aspect - fit width
      cropWidth = personWidth;
      cropHeight = cropWidth / targetAspect;
    } else {
      // Person is taller than target aspect - fit height
      cropHeight = personHeight;
      cropWidth = cropHeight * targetAspect;
    }

    // Ensure minimum crop size
    const minCropHeight = videoHeight * minCropHeightFraction;
    if (cropHeight < minCropHeight) {
      cropHeight = minCropHeight;
      cropWidth = cropHeight * targetAspect;
    }
  } else {
    // No keypoints - use center crop with fallback size
    cropHeight = videoHeight * fallbackCropHeightFraction;
    cropWidth = cropHeight * targetAspect;
  }

  // Ensure crop doesn't exceed video bounds while maintaining aspect ratio
  if (cropWidth > videoWidth) {
    cropWidth = videoWidth;
    cropHeight = cropWidth / targetAspect;
  }
  if (cropHeight > videoHeight) {
    cropHeight = videoHeight;
    cropWidth = cropHeight * targetAspect;
  }

  // Center crop on person, but clamp to video bounds
  const cropX = Math.max(
    0,
    Math.min(personCenterX - cropWidth / 2, videoWidth - cropWidth)
  );
  const cropY = Math.max(
    0,
    Math.min(personCenterY - cropHeight / 2, videoHeight - cropHeight)
  );

  return { cropX, cropY, cropWidth, cropHeight };
}
