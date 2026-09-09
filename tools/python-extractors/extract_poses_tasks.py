#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "mediapipe>=0.10.0",
#     "opencv-python-headless>=4.8.0",
#     "numpy>=1.24.0",
# ]
# ///
"""
PoseTrack Extractor (MediaPipe Tasks) - Extract pose data using the modern
MediaPipe Tasks ``PoseLandmarker`` API (BlazePose), headless on CPU.

Why this exists alongside ``extract_poses.py``:
    ``extract_poses.py`` uses the legacy ``mediapipe.solutions.pose`` API. On
    aarch64 / newer mediapipe builds (e.g. the 1.0.x wheel) the ``solutions``
    module is gone -- ``mp.solutions`` raises ``AttributeError`` -- so that
    script cannot run there. ``extract_poses_tflite.py`` runs the raw landmark
    model without the detector/ROI stage, which produces garbage on non-square
    or non-centred video (knee angles flip wildly frame to frame).

    The Tasks ``PoseLandmarker`` bundles detection + ROI alignment + landmark
    regression exactly like MediaPipe normally does, and runs on CPU without
    OpenGL. It downloads Google's ``.task`` model bundle on first run.

Output is byte-for-byte the same ``.posetrack.json`` schema as
``extract_poses.py`` (BlazePose-33 keypoints in pixel space).

Usage:
    uv run tools/python-extractors/extract_poses_tasks.py video.webm
    uv run tools/python-extractors/extract_poses_tasks.py video.webm -o out.json --model full
"""

import argparse
import hashlib
import json
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision

from angle_utils import compute_angles

# BlazePose-33 keypoint names, in MediaPipe landmark order.
BLAZEPOSE_NAMES = [
    "nose",
    "left_eye_inner", "left_eye", "left_eye_outer",
    "right_eye_inner", "right_eye", "right_eye_outer",
    "left_ear", "right_ear",
    "mouth_left", "mouth_right",
    "left_shoulder", "right_shoulder",
    "left_elbow", "right_elbow",
    "left_wrist", "right_wrist",
    "left_pinky", "right_pinky",
    "left_index", "right_index",
    "left_thumb", "right_thumb",
    "left_hip", "right_hip",
    "left_knee", "right_knee",
    "left_ankle", "right_ankle",
    "left_heel", "right_heel",
    "left_foot_index", "right_foot_index",
]

# MediaPipe->COCO index map, only used to feed compute_angles (COCO-17).
MEDIAPIPE_TO_COCO = [
    (0, 0), (2, 1), (5, 2), (7, 3), (8, 4), (11, 5), (12, 6), (13, 7),
    (14, 8), (15, 9), (16, 10), (23, 11), (24, 12), (25, 13), (26, 14),
    (27, 15), (28, 16),
]
COCO_NAMES = [
    "nose", "left_eye", "right_eye", "left_ear", "right_ear",
    "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
    "left_wrist", "right_wrist", "left_hip", "right_hip",
    "left_knee", "right_knee", "left_ankle", "right_ankle",
]

MODEL_URLS = {
    "lite": "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
    "full": "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
    "heavy": "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task",
}


def get_model_path(variant: str) -> Path:
    cache_dir = Path.home() / ".cache" / "blazepose"
    cache_dir.mkdir(parents=True, exist_ok=True)
    model_path = cache_dir / f"pose_landmarker_{variant}.task"
    if not model_path.exists():
        print(f"Downloading pose_landmarker_{variant}.task ...")
        urllib.request.urlretrieve(MODEL_URLS[variant], model_path)
        print(f"  Saved to {model_path}")
    return model_path


def compute_quick_video_hash(video_path: Path, chunk_size: int = 1024 * 1024) -> str:
    """SHA-256 matching the app's computeQuickVideoHash (first+last 1MB + size)."""
    file_size = video_path.stat().st_size
    if file_size <= chunk_size * 2:
        with open(video_path, "rb") as f:
            return hashlib.sha256(f.read()).hexdigest()
    with open(video_path, "rb") as f:
        first_chunk = f.read(chunk_size)
        f.seek(file_size - chunk_size)
        last_chunk = f.read(chunk_size)
    size_bytes = file_size.to_bytes(8, byteorder="little")
    return hashlib.sha256(first_chunk + last_chunk + size_bytes).hexdigest()


def landmarks_to_keypoints(landmarks, width: int, height: int) -> list[dict]:
    kps = []
    for idx, name in enumerate(BLAZEPOSE_NAMES):
        lm = landmarks[idx]
        # Round to keep fixture files lean; sub-pixel precision is noise anyway.
        kps.append({
            "x": round(lm.x * width, 2),
            "y": round(lm.y * height, 2),
            "z": round(lm.z, 4),
            "score": round(lm.visibility, 4),
            "name": name,
        })
    return kps


def extract_poses(
    video_path: Path,
    output_path: Optional[Path] = None,
    variant: str = "full",
    max_seconds: Optional[float] = None,
) -> dict:
    video_path = Path(video_path)
    if output_path is None:
        output_path = video_path.with_suffix(".posetrack.json")

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {video_path}")

    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps if fps > 0 else 0

    print(f"Video: {video_path.name}")
    print(f"  Resolution: {width}x{height}, FPS: {fps:.2f}, Duration: {duration:.2f}s ({total_frames} frames)")

    print("Computing video hash...")
    video_hash = compute_quick_video_hash(video_path)
    print(f"  Hash: {video_hash[:16]}...")

    model_path = get_model_path(variant)
    options = vision.PoseLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=str(model_path)),
        running_mode=vision.RunningMode.VIDEO,
        num_poses=1,
        min_pose_detection_confidence=0.5,
        min_pose_presence_confidence=0.5,
        min_tracking_confidence=0.5,
    )
    landmarker = vision.PoseLandmarker.create_from_options(options)

    frames = []
    frame_idx = 0
    start_time = time.time()
    print("Extracting poses...")

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        video_time = frame_idx / fps
        if max_seconds is not None and video_time > max_seconds:
            break
        timestamp_ms = int((frame_idx / fps) * 1000)

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        result = landmarker.detect_for_video(mp_image, timestamp_ms)

        if result.pose_landmarks and len(result.pose_landmarks) > 0:
            landmarks = result.pose_landmarks[0]
            keypoints = landmarks_to_keypoints(landmarks, width, height)
            score = sum(kp["score"] for kp in keypoints) / len(keypoints)
            coco = [None] * 17
            for mp_idx, coco_idx in MEDIAPIPE_TO_COCO:
                lm = landmarks[mp_idx]
                coco[coco_idx] = {
                    "x": lm.x * width, "y": lm.y * height, "z": lm.z,
                    "score": lm.visibility, "name": COCO_NAMES[coco_idx],
                }
            angles = compute_angles(coco)
            frame_data = {
                "frameIndex": frame_idx,
                "timestamp": round(timestamp_ms, 2),
                "videoTime": round(video_time, 4),
                "keypoints": keypoints,
                "score": round(score, 4),
                "angles": angles,
            }
        else:
            frame_data = {
                "frameIndex": frame_idx,
                "timestamp": round(timestamp_ms, 2),
                "videoTime": round(video_time, 4),
                "keypoints": [
                    {"x": 0, "y": 0, "z": 0, "score": 0, "name": name}
                    for name in BLAZEPOSE_NAMES
                ],
                "score": 0,
            }

        frames.append(frame_data)

        if frame_idx % 30 == 0:
            elapsed = time.time() - start_time
            cur = frame_idx / elapsed if elapsed > 0 else 0
            pct = (frame_idx + 1) / total_frames * 100
            print(f"\r  Frame {frame_idx + 1}/{total_frames} ({pct:.1f}%) - {cur:.1f} fps", end="")

        frame_idx += 1

    cap.release()
    landmarker.close()

    elapsed = time.time() - start_time
    print(f"\n  Completed in {elapsed:.1f}s ({frame_idx / elapsed:.1f} fps)")

    posetrack = {
        "metadata": {
            "version": "1.0",
            "model": "blazepose",
            "modelVersion": f"mediapipe-tasks-{mp.__version__}",
            "modelVariant": variant,
            "keypointFormat": "blazepose-33",
            "keypointCount": 33,
            "sourceVideoHash": video_hash,
            "sourceVideoName": video_path.name,
            "sourceVideoDuration": round(duration, 4),
            "extractedAt": datetime.now(timezone.utc).isoformat(),
            "frameCount": len(frames),
            "fps": round(fps, 2),
            "videoWidth": width,
            "videoHeight": height,
        },
        "frames": frames,
    }

    print(f"Writing {output_path}...")
    with open(output_path, "w") as f:
        json.dump(posetrack, f, indent=2)
    print(f"  Size: {output_path.stat().st_size / 1024:.1f} KB")
    return posetrack


def main():
    parser = argparse.ArgumentParser(
        description="Extract pose data using MediaPipe Tasks PoseLandmarker (CPU, headless)"
    )
    parser.add_argument("video", type=Path, help="Input video file")
    parser.add_argument("-o", "--output", type=Path, help="Output JSON path")
    parser.add_argument(
        "--model", choices=["lite", "full", "heavy"], default="full",
        help="Model variant (default: full)",
    )
    parser.add_argument(
        "--max-seconds", type=float, default=None,
        help="Only process the first N seconds (smoke testing)",
    )
    args = parser.parse_args()

    if not args.video.exists():
        print(f"Error: Video not found: {args.video}", file=sys.stderr)
        sys.exit(1)

    extract_poses(args.video, args.output, args.model, args.max_seconds)


if __name__ == "__main__":
    main()
