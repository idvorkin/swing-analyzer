#!/usr/bin/env python3
"""
PoseTrack Extractor (TFLite) - Extract poses using BlazePose TFLite models

Uses raw TFLite models without MediaPipe SDK - works on CPU without OpenGL.
Downloads Google's BlazePose models automatically on first run.

Usage:
    uv run --with tflite-runtime --with opencv-python-headless --with numpy --with requests \
        scripts/extract_poses_tflite.py video.mp4

Requirements:
    tflite-runtime, opencv-python-headless, numpy, requests
"""

import argparse
import hashlib
import json
import math
import os
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import cv2
import numpy as np

# Try tflite-runtime first (lighter), fall back to full tensorflow
try:
    from tflite_runtime.interpreter import Interpreter
except ImportError:
    from tensorflow.lite.python.interpreter import Interpreter

# Model URLs from Google's MediaPipe
BLAZEPOSE_MODELS = {
    "detector": {
        "url": "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
        "fallback_url": "https://tfhub.dev/mediapipe/lite-model/blazepose_3d_pose/1?lite-format=tflite",
    },
    # BlazePose Full model - 33 landmarks
    "landmark_full": {
        "url": "https://storage.googleapis.com/mediapipe-assets/pose_landmark_full.tflite",
        "input_size": 256,
    },
    "landmark_lite": {
        "url": "https://storage.googleapis.com/mediapipe-assets/pose_landmark_lite.tflite",
        "input_size": 256,
    },
    "landmark_heavy": {
        "url": "https://storage.googleapis.com/mediapipe-assets/pose_landmark_heavy.tflite",
        "input_size": 256,
    },
}

# BlazePose 33 keypoint names
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

# COCO-17 keypoint names (for compatibility)
COCO_NAMES = [
    "nose", "left_eye", "right_eye", "left_ear", "right_ear",
    "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
    "left_wrist", "right_wrist", "left_hip", "right_hip",
    "left_knee", "right_knee", "left_ankle", "right_ankle",
]

# Mapping from BlazePose-33 to COCO-17
BLAZEPOSE_TO_COCO = [
    (0, 0),   # nose
    (2, 1),   # left_eye
    (5, 2),   # right_eye
    (7, 3),   # left_ear
    (8, 4),   # right_ear
    (11, 5),  # left_shoulder
    (12, 6),  # right_shoulder
    (13, 7),  # left_elbow
    (14, 8),  # right_elbow
    (15, 9),  # left_wrist
    (16, 10), # right_wrist
    (23, 11), # left_hip
    (24, 12), # right_hip
    (25, 13), # left_knee
    (26, 14), # right_knee
    (27, 15), # left_ankle
    (28, 16), # right_ankle
]


def get_model_path(model_name: str) -> Path:
    """Get path to model file, downloading if needed."""
    cache_dir = Path.home() / ".cache" / "blazepose"
    cache_dir.mkdir(parents=True, exist_ok=True)

    model_path = cache_dir / f"{model_name}.tflite"

    if not model_path.exists():
        url = BLAZEPOSE_MODELS[model_name]["url"]
        print(f"Downloading {model_name} model...")
        try:
            urllib.request.urlretrieve(url, model_path)
            print(f"  Saved to {model_path}")
        except Exception as e:
            print(f"  Failed to download: {e}")
            raise

    return model_path


def compute_quick_video_hash(video_path: Path, chunk_size: int = 1024 * 1024) -> str:
    """Compute SHA-256 hash matching the app's computeQuickVideoHash."""
    file_size = video_path.stat().st_size

    if file_size <= chunk_size * 2:
        with open(video_path, "rb") as f:
            return hashlib.sha256(f.read()).hexdigest()

    with open(video_path, "rb") as f:
        first_chunk = f.read(chunk_size)
        f.seek(file_size - chunk_size)
        last_chunk = f.read(chunk_size)

    size_bytes = file_size.to_bytes(8, byteorder='little')
    combined = first_chunk + last_chunk + size_bytes
    return hashlib.sha256(combined).hexdigest()


class BlazePoseDetector:
    """BlazePose detector using TFLite runtime."""

    def __init__(self, model_type: str = "landmark_full"):
        model_path = get_model_path(model_type)
        self.input_size = BLAZEPOSE_MODELS[model_type]["input_size"]

        self.interpreter = Interpreter(model_path=str(model_path))
        self.interpreter.allocate_tensors()

        self.input_details = self.interpreter.get_input_details()
        self.output_details = self.interpreter.get_output_details()

        print(f"Loaded BlazePose model: {model_type}")
        print(f"  Input shape: {self.input_details[0]['shape']}")
        print(f"  Outputs: {len(self.output_details)}")

    def preprocess(self, frame: np.ndarray) -> np.ndarray:
        """Preprocess frame for model input."""
        # Resize to model input size
        img = cv2.resize(frame, (self.input_size, self.input_size))
        # Convert BGR to RGB
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        # Normalize to [0, 1]
        img = img.astype(np.float32) / 255.0
        # Add batch dimension
        img = np.expand_dims(img, axis=0)
        return img

    def detect(self, frame: np.ndarray) -> Optional[dict]:
        """Detect pose in frame, return keypoints."""
        h, w = frame.shape[:2]

        # Preprocess
        input_data = self.preprocess(frame)

        # Run inference
        self.interpreter.set_tensor(self.input_details[0]['index'], input_data)
        self.interpreter.invoke()

        # Get landmarks output - shape (1, 195) = 39 landmarks × 5 (x, y, z, visibility, presence)
        # Coordinates are in input image space (0-256), need to scale to video dimensions
        # We only use first 33 landmarks (standard BlazePose body landmarks)
        output = self.interpreter.get_tensor(self.output_details[0]['index'])

        try:
            # Reshape to (39, 5) and take first 33 body landmarks
            landmarks = output.reshape(-1, 5)[:33]

            # Convert to keypoints list
            # x, y are in 256x256 input space - scale to video dimensions
            keypoints = []
            for i, name in enumerate(BLAZEPOSE_NAMES):
                if i < len(landmarks):
                    lm = landmarks[i]
                    # Scale from input size (256) to video dimensions
                    x_scaled = float(lm[0] / self.input_size * w)
                    y_scaled = float(lm[1] / self.input_size * h)
                    # Visibility is typically in logit space, apply sigmoid
                    visibility = 1.0 / (1.0 + np.exp(-float(lm[3])))
                    keypoints.append({
                        "x": x_scaled,
                        "y": y_scaled,
                        "z": float(lm[2]),
                        "score": visibility,
                        "name": name,
                    })
                else:
                    keypoints.append({
                        "x": 0, "y": 0, "z": 0, "score": 0, "name": name
                    })

            # Calculate overall score from visibility values
            score = sum(kp["score"] for kp in keypoints) / len(keypoints)

            return {
                "keypoints": keypoints,
                "score": score,
            }

        except Exception as e:
            print(f"Error parsing landmarks: {e}")
            return None


def blazepose_to_coco(keypoints: list[dict]) -> list[dict]:
    """Convert BlazePose-33 keypoints to COCO-17 format."""
    coco_keypoints = []
    kp_map = {kp["name"]: kp for kp in keypoints}

    for bp_idx, coco_idx in BLAZEPOSE_TO_COCO:
        bp_name = BLAZEPOSE_NAMES[bp_idx]
        coco_name = COCO_NAMES[coco_idx]

        if bp_name in kp_map:
            kp = kp_map[bp_name].copy()
            kp["name"] = coco_name
            coco_keypoints.append(kp)
        else:
            coco_keypoints.append({
                "x": 0, "y": 0, "z": 0, "score": 0, "name": coco_name
            })

    return coco_keypoints


def compute_angles(keypoints: list[dict]) -> dict:
    """Compute angles for swing analysis."""
    kp_map = {kp["name"]: kp for kp in keypoints}

    try:
        ls = kp_map["left_shoulder"]
        rs = kp_map["right_shoulder"]
        lh = kp_map["left_hip"]
        rh = kp_map["right_hip"]
        lw = kp_map["left_wrist"]
        lk = kp_map["left_knee"]
        la = kp_map["left_ankle"]

        # Midpoints
        shoulder_mid = {"x": (ls["x"] + rs["x"]) / 2, "y": (ls["y"] + rs["y"]) / 2}
        hip_mid = {"x": (lh["x"] + rh["x"]) / 2, "y": (lh["y"] + rh["y"]) / 2}

        # Spine angle (from vertical)
        spine_vec = np.array([shoulder_mid["x"] - hip_mid["x"], shoulder_mid["y"] - hip_mid["y"]])
        vertical = np.array([0, -1])
        cos_spine = np.dot(spine_vec, vertical) / (np.linalg.norm(spine_vec) + 1e-6)
        spine_angle = math.degrees(math.acos(np.clip(cos_spine, -1, 1)))

        # Arm angles
        arm_vec = np.array([lw["x"] - shoulder_mid["x"], lw["y"] - shoulder_mid["y"]])
        cos_arm_vert = np.dot(arm_vec, vertical) / (np.linalg.norm(arm_vec) + 1e-6)
        arm_to_vertical = math.degrees(math.acos(np.clip(cos_arm_vert, -1, 1)))

        cos_arm_spine = np.dot(arm_vec, spine_vec) / (np.linalg.norm(arm_vec) * np.linalg.norm(spine_vec) + 1e-6)
        arm_to_spine = math.degrees(math.acos(np.clip(cos_arm_spine, -1, 1)))

        # Hip angle (knee-hip-shoulder)
        v1 = np.array([lk["x"] - lh["x"], lk["y"] - lh["y"]])
        v2 = np.array([ls["x"] - lh["x"], ls["y"] - lh["y"]])
        cos_hip = np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2) + 1e-6)
        hip_angle = math.degrees(math.acos(np.clip(cos_hip, -1, 1)))

        # Knee angle (hip-knee-ankle)
        v1 = np.array([lh["x"] - lk["x"], lh["y"] - lk["y"]])
        v2 = np.array([la["x"] - lk["x"], la["y"] - lk["y"]])
        cos_knee = np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2) + 1e-6)
        knee_angle = math.degrees(math.acos(np.clip(cos_knee, -1, 1)))

        return {
            "spineAngle": round(spine_angle, 2),
            "armToSpineAngle": round(arm_to_spine, 2),
            "armToVerticalAngle": round(arm_to_vertical, 2),
            "hipAngle": round(hip_angle, 2),
            "kneeAngle": round(knee_angle, 2),
        }
    except (KeyError, ZeroDivisionError):
        return {"spineAngle": 0, "armToSpineAngle": 0, "armToVerticalAngle": 0}


def extract_poses(
    video_path: Path,
    output_path: Optional[Path] = None,
    model_type: str = "landmark_full",
    output_format: str = "coco",  # "coco" (17) or "blazepose" (33)
) -> dict:
    """Extract poses from video."""
    video_path = Path(video_path)
    if output_path is None:
        output_path = video_path.with_suffix(".posetrack.json")

    # Open video
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {video_path}")

    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps if fps > 0 else 0

    print(f"\nVideo: {video_path.name}")
    print(f"  Resolution: {width}x{height}, FPS: {fps:.2f}, Duration: {duration:.2f}s")

    # Compute hash
    print("Computing video hash...")
    video_hash = compute_quick_video_hash(video_path)
    print(f"  Hash: {video_hash[:16]}...")

    # Initialize detector
    detector = BlazePoseDetector(model_type)

    # Extract frames
    frames = []
    frame_idx = 0
    start_time = time.time()

    print("\nExtracting poses...")

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        result = detector.detect(frame)

        timestamp_ms = (frame_idx / fps) * 1000
        video_time = frame_idx / fps

        if result and result["score"] > 0.3:
            # Convert to COCO format if requested
            if output_format == "coco":
                keypoints = blazepose_to_coco(result["keypoints"])
            else:
                keypoints = result["keypoints"]

            angles = compute_angles(keypoints if output_format == "coco" else blazepose_to_coco(result["keypoints"]))

            frame_data = {
                "frameIndex": frame_idx,
                "timestamp": round(timestamp_ms, 2),
                "videoTime": round(video_time, 4),
                "keypoints": keypoints,
                "score": round(result["score"], 4),
                "angles": angles,
            }
        else:
            names = COCO_NAMES if output_format == "coco" else BLAZEPOSE_NAMES
            frame_data = {
                "frameIndex": frame_idx,
                "timestamp": round(timestamp_ms, 2),
                "videoTime": round(video_time, 4),
                "keypoints": [{"x": 0, "y": 0, "z": 0, "score": 0, "name": n} for n in names],
                "score": 0,
            }

        frames.append(frame_data)

        if frame_idx % 30 == 0:
            elapsed = time.time() - start_time
            current_fps = frame_idx / elapsed if elapsed > 0 else 0
            pct = (frame_idx + 1) / total_frames * 100
            print(f"\r  Frame {frame_idx + 1}/{total_frames} ({pct:.1f}%) - {current_fps:.1f} fps", end="")

        frame_idx += 1

    cap.release()

    elapsed = time.time() - start_time
    print(f"\n  Completed in {elapsed:.1f}s ({frame_idx / elapsed:.1f} fps)")

    # Build output
    keypoint_format = "blazepose-33" if output_format == "blazepose" else "coco-17"
    keypoint_count = 33 if output_format == "blazepose" else 17
    posetrack = {
        "metadata": {
            "version": "1.0",
            "model": "blazepose",
            "modelVersion": f"tflite-{model_type}",
            "keypointFormat": keypoint_format,
            "keypointCount": keypoint_count,
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
    parser = argparse.ArgumentParser(description="Extract poses using BlazePose TFLite (CPU-only)")
    parser.add_argument("video", type=Path, help="Input video file")
    parser.add_argument("-o", "--output", type=Path, help="Output JSON path")
    parser.add_argument(
        "--model", choices=["landmark_lite", "landmark_full", "landmark_heavy"],
        default="landmark_full", help="Model variant (default: landmark_full)"
    )
    parser.add_argument(
        "--format", choices=["coco", "blazepose"], default="coco",
        help="Output format: coco (17 keypoints) or blazepose (33 keypoints)"
    )
    parser.add_argument(
        "--full", action="store_true",
        help="Output all 33 BlazePose keypoints (alias for --format blazepose)"
    )

    args = parser.parse_args()

    # --full is alias for --format blazepose
    output_format = "blazepose" if args.full else args.format

    if not args.video.exists():
        print(f"Error: Video not found: {args.video}", file=sys.stderr)
        sys.exit(1)

    try:
        extract_poses(args.video, args.output, args.model, output_format)
    except KeyboardInterrupt:
        print("\nAborted")
        sys.exit(1)


if __name__ == "__main__":
    main()
