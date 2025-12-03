#!/usr/bin/env python3
"""
PoseTrack Extractor - Extract pose data from videos using MediaPipe BlazePose

Generates .posetrack.json files compatible with the Swing Analyzer app.
This enables faster testing and batch processing without browser/WebGL.

Usage:
    python extract_poses.py video.mp4                    # Output to video.posetrack.json
    python extract_poses.py video.mp4 -o poses.json     # Custom output path
    python extract_poses.py video.mp4 --preview         # Show preview while extracting
    python extract_poses.py video.mp4 --full            # Output all 33 BlazePose keypoints

Requirements:
    pip install mediapipe opencv-python numpy
"""

import argparse
import hashlib
import json
import math
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import cv2
import mediapipe as mp
import numpy as np

# MediaPipe BlazePose indices (33 keypoints)
MEDIAPIPE_PARTS = {
    "NOSE": 0,
    "LEFT_EYE_INNER": 1,
    "LEFT_EYE": 2,
    "LEFT_EYE_OUTER": 3,
    "RIGHT_EYE_INNER": 4,
    "RIGHT_EYE": 5,
    "RIGHT_EYE_OUTER": 6,
    "LEFT_EAR": 7,
    "RIGHT_EAR": 8,
    "MOUTH_LEFT": 9,
    "MOUTH_RIGHT": 10,
    "LEFT_SHOULDER": 11,
    "RIGHT_SHOULDER": 12,
    "LEFT_ELBOW": 13,
    "RIGHT_ELBOW": 14,
    "LEFT_WRIST": 15,
    "RIGHT_WRIST": 16,
    "LEFT_PINKY": 17,
    "RIGHT_PINKY": 18,
    "LEFT_INDEX": 19,
    "RIGHT_INDEX": 20,
    "LEFT_THUMB": 21,
    "RIGHT_THUMB": 22,
    "LEFT_HIP": 23,
    "RIGHT_HIP": 24,
    "LEFT_KNEE": 25,
    "RIGHT_KNEE": 26,
    "LEFT_ANKLE": 27,
    "RIGHT_ANKLE": 28,
    "LEFT_HEEL": 29,
    "RIGHT_HEEL": 30,
    "LEFT_FOOT_INDEX": 31,
    "RIGHT_FOOT_INDEX": 32,
}

# BlazePose 33 keypoint names (full output)
BLAZEPOSE_NAMES = [
    "nose",
    "left_eye_inner",
    "left_eye",
    "left_eye_outer",
    "right_eye_inner",
    "right_eye",
    "right_eye_outer",
    "left_ear",
    "right_ear",
    "mouth_left",
    "mouth_right",
    "left_shoulder",
    "right_shoulder",
    "left_elbow",
    "right_elbow",
    "left_wrist",
    "right_wrist",
    "left_pinky",
    "right_pinky",
    "left_index",
    "right_index",
    "left_thumb",
    "right_thumb",
    "left_hip",
    "right_hip",
    "left_knee",
    "right_knee",
    "left_ankle",
    "right_ankle",
    "left_heel",
    "right_heel",
    "left_foot_index",
    "right_foot_index",
]

# COCO-17 keypoint names (what the app expects)
COCO_NAMES = [
    "nose",
    "left_eye",
    "right_eye",
    "left_ear",
    "right_ear",
    "left_shoulder",
    "right_shoulder",
    "left_elbow",
    "right_elbow",
    "left_wrist",
    "right_wrist",
    "left_hip",
    "right_hip",
    "left_knee",
    "right_knee",
    "left_ankle",
    "right_ankle",
]

# Mapping from MediaPipe indices to COCO indices
MEDIAPIPE_TO_COCO = [
    (0, 0),   # NOSE -> nose
    (2, 1),   # LEFT_EYE -> left_eye
    (5, 2),   # RIGHT_EYE -> right_eye
    (7, 3),   # LEFT_EAR -> left_ear
    (8, 4),   # RIGHT_EAR -> right_ear
    (11, 5),  # LEFT_SHOULDER -> left_shoulder
    (12, 6),  # RIGHT_SHOULDER -> right_shoulder
    (13, 7),  # LEFT_ELBOW -> left_elbow
    (14, 8),  # RIGHT_ELBOW -> right_elbow
    (15, 9),  # LEFT_WRIST -> left_wrist
    (16, 10), # RIGHT_WRIST -> right_wrist
    (23, 11), # LEFT_HIP -> left_hip
    (24, 12), # RIGHT_HIP -> right_hip
    (25, 13), # LEFT_KNEE -> left_knee
    (26, 14), # RIGHT_KNEE -> right_knee
    (27, 15), # LEFT_ANKLE -> left_ankle
    (28, 16), # RIGHT_ANKLE -> right_ankle
]


def compute_quick_video_hash(video_path: Path, chunk_size: int = 1024 * 1024) -> str:
    """
    Compute SHA-256 hash matching the app's computeQuickVideoHash function.
    Uses first 1MB + last 1MB + file size for large files.
    """
    file_size = video_path.stat().st_size

    # For small files, hash the whole thing
    if file_size <= chunk_size * 2:
        with open(video_path, "rb") as f:
            return hashlib.sha256(f.read()).hexdigest()

    # Read first chunk
    with open(video_path, "rb") as f:
        first_chunk = f.read(chunk_size)

        # Read last chunk
        f.seek(file_size - chunk_size)
        last_chunk = f.read(chunk_size)

    # Combine with file size (little-endian 64-bit)
    size_bytes = file_size.to_bytes(8, byteorder='little')

    # Hash the combined data
    combined = first_chunk + last_chunk + size_bytes
    return hashlib.sha256(combined).hexdigest()


def mediapipe_to_coco(landmarks, width: int, height: int) -> list[dict]:
    """Convert MediaPipe landmarks to COCO-17 format keypoints."""
    keypoints = []

    for mp_idx, coco_idx in MEDIAPIPE_TO_COCO:
        lm = landmarks[mp_idx]
        keypoints.append({
            "x": lm.x * width,
            "y": lm.y * height,
            "z": lm.z,
            "score": lm.visibility,
            "name": COCO_NAMES[coco_idx],
        })

    return keypoints


def mediapipe_to_blazepose(landmarks, width: int, height: int) -> list[dict]:
    """Convert MediaPipe landmarks to full BlazePose 33 keypoint format."""
    keypoints = []

    for idx, name in enumerate(BLAZEPOSE_NAMES):
        lm = landmarks[idx]
        keypoints.append({
            "x": lm.x * width,
            "y": lm.y * height,
            "z": lm.z,
            "score": lm.visibility,
            "name": name,
        })

    return keypoints


def calculate_angle(p1: dict, p2: dict, p3: dict) -> float:
    """Calculate angle at p2 given three points."""
    v1 = np.array([p1["x"] - p2["x"], p1["y"] - p2["y"]])
    v2 = np.array([p3["x"] - p2["x"], p3["y"] - p2["y"]])

    cos_angle = np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2) + 1e-6)
    cos_angle = np.clip(cos_angle, -1, 1)
    return math.degrees(math.acos(cos_angle))


def compute_angles(keypoints: list[dict]) -> dict:
    """Compute pre-computed angles for swing analysis."""
    # Get keypoints by name
    kp_map = {kp["name"]: kp for kp in keypoints}

    try:
        # Spine angle: angle between vertical and shoulder-hip line
        left_shoulder = kp_map["left_shoulder"]
        right_shoulder = kp_map["right_shoulder"]
        left_hip = kp_map["left_hip"]
        right_hip = kp_map["right_hip"]

        # Midpoints
        shoulder_mid = {
            "x": (left_shoulder["x"] + right_shoulder["x"]) / 2,
            "y": (left_shoulder["y"] + right_shoulder["y"]) / 2,
        }
        hip_mid = {
            "x": (left_hip["x"] + right_hip["x"]) / 2,
            "y": (left_hip["y"] + right_hip["y"]) / 2,
        }

        # Spine vector (hip to shoulder)
        spine_vec = np.array([
            shoulder_mid["x"] - hip_mid["x"],
            shoulder_mid["y"] - hip_mid["y"]
        ])

        # Vertical is negative Y in screen coords
        vertical = np.array([0, -1])

        cos_spine = np.dot(spine_vec, vertical) / (np.linalg.norm(spine_vec) + 1e-6)
        cos_spine = np.clip(cos_spine, -1, 1)
        spine_angle = math.degrees(math.acos(cos_spine))

        # Arm angle: use left wrist position relative to spine
        left_wrist = kp_map["left_wrist"]
        arm_vec = np.array([
            left_wrist["x"] - shoulder_mid["x"],
            left_wrist["y"] - shoulder_mid["y"]
        ])

        # Arm to vertical
        cos_arm_vert = np.dot(arm_vec, vertical) / (np.linalg.norm(arm_vec) + 1e-6)
        cos_arm_vert = np.clip(cos_arm_vert, -1, 1)
        arm_to_vertical = math.degrees(math.acos(cos_arm_vert))

        # Arm to spine
        cos_arm_spine = np.dot(arm_vec, spine_vec) / (np.linalg.norm(arm_vec) * np.linalg.norm(spine_vec) + 1e-6)
        cos_arm_spine = np.clip(cos_arm_spine, -1, 1)
        arm_to_spine = math.degrees(math.acos(cos_arm_spine))

        # Hip angle: knee-hip-shoulder
        left_knee = kp_map["left_knee"]
        hip_angle = calculate_angle(left_knee, left_hip, left_shoulder)

        # Knee angle: hip-knee-ankle
        left_ankle = kp_map["left_ankle"]
        knee_angle = calculate_angle(left_hip, left_knee, left_ankle)

        return {
            "spineAngle": round(spine_angle, 2),
            "armToSpineAngle": round(arm_to_spine, 2),
            "armToVerticalAngle": round(arm_to_vertical, 2),
            "hipAngle": round(hip_angle, 2),
            "kneeAngle": round(knee_angle, 2),
        }
    except (KeyError, ZeroDivisionError):
        return {
            "spineAngle": 0,
            "armToSpineAngle": 0,
            "armToVerticalAngle": 0,
        }


def extract_poses(
    video_path: Path,
    output_path: Optional[Path] = None,
    preview: bool = False,
    model_complexity: int = 1,
    full_keypoints: bool = False,
) -> dict:
    """
    Extract poses from video using MediaPipe BlazePose.

    Args:
        video_path: Path to input video
        output_path: Path for output JSON (default: video.posetrack.json)
        preview: Show preview window during extraction
        model_complexity: BlazePose complexity (0=lite, 1=full, 2=heavy)
        full_keypoints: Output all 33 BlazePose keypoints instead of COCO-17

    Returns:
        PoseTrack dictionary
    """
    video_path = Path(video_path)
    if output_path is None:
        output_path = video_path.with_suffix(".posetrack.json")

    # Open video
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {video_path}")

    # Get video properties
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps if fps > 0 else 0

    print(f"Video: {video_path.name}")
    print(f"  Resolution: {width}x{height}")
    print(f"  FPS: {fps:.2f}")
    print(f"  Duration: {duration:.2f}s ({total_frames} frames)")

    # Compute video hash
    print("Computing video hash...")
    video_hash = compute_quick_video_hash(video_path)
    print(f"  Hash: {video_hash[:16]}...")

    # Initialize MediaPipe
    mp_pose = mp.solutions.pose
    pose = mp_pose.Pose(
        static_image_mode=False,
        model_complexity=model_complexity,
        enable_segmentation=False,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    )

    if preview:
        mp_drawing = mp.solutions.drawing_utils

    # Extract frames
    frames = []
    frame_idx = 0
    start_time = time.time()

    print("Extracting poses...")

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        # Convert BGR to RGB
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        # Process frame
        results = pose.process(rgb_frame)

        # Calculate timing
        timestamp_ms = (frame_idx / fps) * 1000
        video_time = frame_idx / fps

        # Choose keypoint format
        keypoint_names = BLAZEPOSE_NAMES if full_keypoints else COCO_NAMES
        convert_fn = mediapipe_to_blazepose if full_keypoints else mediapipe_to_coco

        if results.pose_landmarks:
            keypoints = convert_fn(
                results.pose_landmarks.landmark, width, height
            )

            # Average visibility as score
            score = sum(kp["score"] for kp in keypoints) / len(keypoints)

            # Compute angles (always use COCO mapping for angle calculation)
            coco_keypoints = mediapipe_to_coco(
                results.pose_landmarks.landmark, width, height
            ) if full_keypoints else keypoints
            angles = compute_angles(coco_keypoints)

            frame_data = {
                "frameIndex": frame_idx,
                "timestamp": round(timestamp_ms, 2),
                "videoTime": round(video_time, 4),
                "keypoints": keypoints,
                "score": round(score, 4),
                "angles": angles,
            }
        else:
            # No pose detected - create empty frame with zero keypoints
            frame_data = {
                "frameIndex": frame_idx,
                "timestamp": round(timestamp_ms, 2),
                "videoTime": round(video_time, 4),
                "keypoints": [
                    {"x": 0, "y": 0, "z": 0, "score": 0, "name": name}
                    for name in keypoint_names
                ],
                "score": 0,
            }

        frames.append(frame_data)

        # Progress
        if frame_idx % 30 == 0 or frame_idx == total_frames - 1:
            elapsed = time.time() - start_time
            current_fps = frame_idx / elapsed if elapsed > 0 else 0
            pct = (frame_idx + 1) / total_frames * 100
            print(f"\r  Frame {frame_idx + 1}/{total_frames} ({pct:.1f}%) - {current_fps:.1f} fps", end="")

        # Preview
        if preview and results.pose_landmarks:
            mp_drawing.draw_landmarks(
                frame,
                results.pose_landmarks,
                mp_pose.POSE_CONNECTIONS,
            )
            cv2.imshow("Pose Extraction", frame)
            if cv2.waitKey(1) & 0xFF == ord('q'):
                print("\nAborted by user")
                break

        frame_idx += 1

    cap.release()
    pose.close()
    if preview:
        cv2.destroyAllWindows()

    elapsed = time.time() - start_time
    print(f"\n  Completed in {elapsed:.1f}s ({frame_idx / elapsed:.1f} fps)")

    # Build PoseTrack structure
    keypoint_format = "blazepose-33" if full_keypoints else "coco-17"
    posetrack = {
        "metadata": {
            "version": "1.0",
            "model": "blazepose",
            "modelVersion": f"mediapipe-{mp.__version__}",
            "keypointFormat": keypoint_format,
            "keypointCount": 33 if full_keypoints else 17,
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

    # Write output
    print(f"Writing {output_path}...")
    with open(output_path, "w") as f:
        json.dump(posetrack, f, indent=2)

    file_size = output_path.stat().st_size
    print(f"  Size: {file_size / 1024:.1f} KB")

    return posetrack


def main():
    parser = argparse.ArgumentParser(
        description="Extract pose data from videos using MediaPipe BlazePose",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s video.mp4                     Extract poses to video.posetrack.json
  %(prog)s video.mp4 -o poses.json       Custom output path
  %(prog)s video.mp4 --preview           Show preview during extraction
  %(prog)s video.mp4 --complexity 2      Use heavy model for better accuracy
  %(prog)s video.mp4 --full              Output all 33 BlazePose keypoints
        """
    )
    parser.add_argument("video", type=Path, help="Input video file")
    parser.add_argument("-o", "--output", type=Path, help="Output JSON path")
    parser.add_argument("--preview", action="store_true", help="Show preview window")
    parser.add_argument(
        "--complexity", type=int, choices=[0, 1, 2], default=1,
        help="Model complexity: 0=lite, 1=full (default), 2=heavy"
    )
    parser.add_argument(
        "--full", action="store_true",
        help="Output all 33 BlazePose keypoints instead of COCO-17"
    )

    args = parser.parse_args()

    if not args.video.exists():
        print(f"Error: Video not found: {args.video}", file=sys.stderr)
        sys.exit(1)

    try:
        extract_poses(
            args.video,
            output_path=args.output,
            preview=args.preview,
            model_complexity=args.complexity,
            full_keypoints=args.full,
        )
    except KeyboardInterrupt:
        print("\nAborted")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
