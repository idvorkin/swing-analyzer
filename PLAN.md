# BlazePose Integration Plan

## Overview

Add support for BlazePose as an alternative pose detection model alongside MoveNet.

## Current State

- `PoseSkeletonTransformer` hardcodes MoveNet Lightning
- `Skeleton.ts` already handles both COCO-17 and MediaPipe-33 keypoint formats
- `src/types.ts` already defines `MediaPipeBodyParts` (33 keypoints)
- `isPointVisible()` already checks both `score` and `visibility` properties

## Changes Required

### 1. Create Model Configuration (`src/config/modelConfig.ts`)

Define types and defaults for model selection:

```typescript
export type PoseModel = 'movenet' | 'blazepose';
export type MoveNetVariant = 'lightning' | 'thunder';
export type BlazePoseVariant = 'lite' | 'full' | 'heavy';
export type BlazePoseRuntime = 'tfjs' | 'mediapipe';

export interface ModelConfig {
  model: PoseModel;
  // MoveNet options
  moveNetVariant?: MoveNetVariant;
  // BlazePose options
  blazePoseVariant?: BlazePoseVariant;
  blazePoseRuntime?: BlazePoseRuntime;
  // Common options
  enableSmoothing?: boolean;
}

export const DEFAULT_CONFIG: ModelConfig = {
  model: 'movenet',
  moveNetVariant: 'lightning',
  enableSmoothing: true,
};
```

### 2. Create Keypoint Adapter (`src/pipeline/KeypointAdapter.ts`)

Map MediaPipe-33 keypoints to COCO-17 format for consistent downstream processing:

```typescript
// MediaPipe → COCO mapping (subset of 33 → 17)
const MEDIAPIPE_TO_COCO: Record<number, number> = {
  0: 0,   // NOSE → NOSE
  2: 1,   // LEFT_EYE → LEFT_EYE
  5: 2,   // RIGHT_EYE → RIGHT_EYE
  7: 3,   // LEFT_EAR → LEFT_EAR
  8: 4,   // RIGHT_EAR → RIGHT_EAR
  11: 5,  // LEFT_SHOULDER → LEFT_SHOULDER
  12: 6,  // RIGHT_SHOULDER → RIGHT_SHOULDER
  13: 7,  // LEFT_ELBOW → LEFT_ELBOW
  14: 8,  // RIGHT_ELBOW → RIGHT_ELBOW
  15: 9,  // LEFT_WRIST → LEFT_WRIST
  16: 10, // RIGHT_WRIST → RIGHT_WRIST
  23: 11, // LEFT_HIP → LEFT_HIP
  24: 12, // RIGHT_HIP → RIGHT_HIP
  25: 13, // LEFT_KNEE → LEFT_KNEE
  26: 14, // RIGHT_KNEE → RIGHT_KNEE
  27: 15, // LEFT_ANKLE → LEFT_ANKLE
  28: 16, // RIGHT_ANKLE → RIGHT_ANKLE
};

export function mediaPipeToCoco(keypoints: PoseKeypoint[]): PoseKeypoint[] {
  const cocoKeypoints: PoseKeypoint[] = new Array(17).fill(null);

  for (const [mpIdx, cocoIdx] of Object.entries(MEDIAPIPE_TO_COCO)) {
    const mpKeypoint = keypoints[Number(mpIdx)];
    if (mpKeypoint) {
      cocoKeypoints[cocoIdx] = {
        ...mpKeypoint,
        // BlazePose uses 'visibility', normalize to 'score' for consistency
        score: mpKeypoint.score ?? mpKeypoint.visibility,
      };
    }
  }

  return cocoKeypoints;
}
```

### 3. Create PoseDetectorFactory (`src/pipeline/PoseDetectorFactory.ts`)

Factory to instantiate the correct detector based on config:

```typescript
import * as poseDetection from '@tensorflow-models/pose-detection';
import type { ModelConfig } from '../config/modelConfig';

export class PoseDetectorFactory {
  static async create(config: ModelConfig): Promise<poseDetection.PoseDetector> {
    if (config.model === 'blazepose') {
      return this.createBlazePose(config);
    }
    return this.createMoveNet(config);
  }

  private static async createMoveNet(config: ModelConfig): Promise<poseDetection.PoseDetector> {
    const modelType = config.moveNetVariant === 'thunder'
      ? poseDetection.movenet.modelType.SINGLEPOSE_THUNDER
      : poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING;

    return poseDetection.createDetector(
      poseDetection.SupportedModels.MoveNet,
      {
        modelType,
        modelUrl: `/models/movenet-${config.moveNetVariant || 'lightning'}/model.json`,
        enableSmoothing: config.enableSmoothing ?? true,
      }
    );
  }

  private static async createBlazePose(config: ModelConfig): Promise<poseDetection.PoseDetector> {
    return poseDetection.createDetector(
      poseDetection.SupportedModels.BlazePose,
      {
        runtime: config.blazePoseRuntime || 'tfjs',
        modelType: config.blazePoseVariant || 'lite',
        enableSmoothing: config.enableSmoothing ?? true,
      }
    );
  }
}
```

### 4. Update PoseSkeletonTransformer

Modify to accept ModelConfig and use factory:

```typescript
export class PoseSkeletonTransformer implements SkeletonTransformer {
  private detector: poseDetection.PoseDetector | null = null;
  private config: ModelConfig;

  constructor(config: ModelConfig = DEFAULT_CONFIG) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    // ... TensorFlow setup ...
    this.detector = await PoseDetectorFactory.create(this.config);
    console.log(`Pose detector initialized: ${this.config.model}`);
  }

  private detectPose(frameEvent: FrameEvent): Observable<PoseEvent> {
    // ... existing detection code ...

    // Normalize keypoints if using BlazePose
    if (this.config.model === 'blazepose') {
      pose.keypoints = mediaPipeToCoco(pose.keypoints);
    }

    // ... rest of method ...
  }
}
```

### 5. Update Pipeline Factory (if needed)

Allow passing ModelConfig when creating pipelines.

## File Changes Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `src/config/modelConfig.ts` | **NEW** | Model configuration types and defaults |
| `src/pipeline/KeypointAdapter.ts` | **NEW** | MediaPipe ↔ COCO keypoint mapping |
| `src/pipeline/PoseDetectorFactory.ts` | **NEW** | Factory for creating pose detectors |
| `src/pipeline/PoseSkeletonTransformer.ts` | **MODIFY** | Accept config, use factory, normalize keypoints |
| `src/pipeline/PipelineFactory.ts` | **MODIFY** | Pass config to transformer |

## Testing Strategy

1. **Unit tests** for `KeypointAdapter` - verify mapping correctness
2. **Unit tests** for `PoseDetectorFactory` - verify detector creation
3. **Integration test** - verify BlazePose produces valid skeletons
4. **E2E test** (optional) - compare MoveNet vs BlazePose on same video

## Notes

- BlazePose models load from CDN by default (no local model files needed initially)
- MediaPipe runtime requires WASM files, TFJS runtime is simpler to start
- Start with `blazepose-lite` + `tfjs` runtime for simplicity
- `Skeleton.ts` and `SkeletonRenderer.ts` should work without changes since:
  - We normalize BlazePose keypoints to COCO format
  - `isPointVisible()` already handles both `score` and `visibility`

## Beads Issues

- SWING-joq: Phase 4 epic (parent)
- SWING-1ji: Create model configuration
- SWING-ama: Create PoseDetectorFactory
- SWING-hjq: Update PoseSkeletonTransformer
- (NEW): Create KeypointAdapter
