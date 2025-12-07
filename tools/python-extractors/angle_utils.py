# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "numpy>=1.24.0",
# ]
# ///
"""
Angle Utilities for Pose Analysis

Unified angle computation for swing/movement analysis.
Used by extract_poses.py, extract_poses_tflite.py, annotate_poses.py, etc.

All functions expect MediaPipe BlazePose-33 keypoints (by name lookup).
"""

import math
from typing import Optional

import numpy as np


def calculate_angle(p1: dict, p2: dict, p3: dict) -> float:
    """
    Calculate the angle at p2 formed by p1-p2-p3.

    Args:
        p1: First point (dict with 'x', 'y')
        p2: Vertex point (dict with 'x', 'y')
        p3: Third point (dict with 'x', 'y')

    Returns:
        Angle in degrees
    """
    v1 = np.array([p1["x"] - p2["x"], p1["y"] - p2["y"]])
    v2 = np.array([p3["x"] - p2["x"], p3["y"] - p2["y"]])

    cos_angle = np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2) + 1e-6)
    cos_angle = np.clip(cos_angle, -1, 1)
    return math.degrees(math.acos(cos_angle))


def compute_angles(keypoints: list[dict]) -> dict:
    """
    Compute pre-computed angles for swing/movement analysis.

    Expects MediaPipe BlazePose-33 format keypoints with 'name' field.
    Falls back to index-based lookup if names aren't available.

    Args:
        keypoints: List of keypoint dicts with 'x', 'y', and optionally 'name'

    Returns:
        Dict with computed angles:
        - spineAngle: Angle of spine from vertical (0=upright, 90=horizontal)
        - armToSpineAngle: Angle between arm and spine
        - armToVerticalAngle: Angle of arm from vertical
        - hipAngle: Knee-hip-shoulder angle (hip flexion)
        - kneeAngle: Hip-knee-ankle angle (knee bend)

    On error, returns dict with 0 values for spineAngle, armToSpineAngle, armToVerticalAngle.
    """
    # Build keypoint map by name
    kp_map = {kp.get("name", f"kp_{i}"): kp for i, kp in enumerate(keypoints)}

    # Also map by MediaPipe BlazePose-33 index for fallback
    # This allows using either named keypoints or positional keypoints
    mediapipe_names = {
        11: "left_shoulder", 12: "right_shoulder",
        13: "left_elbow", 14: "right_elbow",
        15: "left_wrist", 16: "right_wrist",
        23: "left_hip", 24: "right_hip",
        25: "left_knee", 26: "right_knee",
        27: "left_ankle", 28: "right_ankle",
    }
    for i, kp in enumerate(keypoints):
        if i in mediapipe_names and mediapipe_names[i] not in kp_map:
            kp_map[mediapipe_names[i]] = kp

    try:
        # Get required keypoints
        left_shoulder = kp_map["left_shoulder"]
        right_shoulder = kp_map["right_shoulder"]
        left_hip = kp_map["left_hip"]
        right_hip = kp_map["right_hip"]
        left_wrist = kp_map["left_wrist"]
        left_knee = kp_map["left_knee"]
        left_ankle = kp_map["left_ankle"]

        # Calculate midpoints
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

        # Vertical is negative Y in screen coords (up is negative)
        vertical = np.array([0, -1])

        # Spine angle from vertical
        cos_spine = np.dot(spine_vec, vertical) / (np.linalg.norm(spine_vec) + 1e-6)
        cos_spine = np.clip(cos_spine, -1, 1)
        spine_angle = math.degrees(math.acos(cos_spine))

        # Arm vector (shoulder to wrist)
        arm_vec = np.array([
            left_wrist["x"] - shoulder_mid["x"],
            left_wrist["y"] - shoulder_mid["y"]
        ])

        # Arm to vertical angle
        cos_arm_vert = np.dot(arm_vec, vertical) / (np.linalg.norm(arm_vec) + 1e-6)
        cos_arm_vert = np.clip(cos_arm_vert, -1, 1)
        arm_to_vertical = math.degrees(math.acos(cos_arm_vert))

        # Arm to spine angle
        cos_arm_spine = np.dot(arm_vec, spine_vec) / (np.linalg.norm(arm_vec) * np.linalg.norm(spine_vec) + 1e-6)
        cos_arm_spine = np.clip(cos_arm_spine, -1, 1)
        arm_to_spine = math.degrees(math.acos(cos_arm_spine))

        # Hip angle: knee-hip-shoulder (hip flexion angle)
        hip_angle = calculate_angle(left_knee, left_hip, left_shoulder)

        # Knee angle: hip-knee-ankle (knee bend)
        knee_angle = calculate_angle(left_hip, left_knee, left_ankle)

        return {
            "spineAngle": round(spine_angle, 2),
            "armToSpineAngle": round(arm_to_spine, 2),
            "armToVerticalAngle": round(arm_to_vertical, 2),
            "hipAngle": round(hip_angle, 2),
            "kneeAngle": round(knee_angle, 2),
        }
    except (KeyError, ZeroDivisionError, TypeError):
        return {
            "spineAngle": 0,
            "armToSpineAngle": 0,
            "armToVerticalAngle": 0,
        }


def compute_wrist_heights(keypoints: list[dict]) -> Optional[dict]:
    """
    Compute wrist heights relative to shoulder midpoint.

    Used for position detection in swing analysis.

    Args:
        keypoints: List of keypoint dicts

    Returns:
        Dict with leftWristHeight, rightWristHeight, avgWristHeight
        Or None if required keypoints are missing.
    """
    kp_map = {kp.get("name", f"kp_{i}"): kp for i, kp in enumerate(keypoints)}

    try:
        left_shoulder = kp_map["left_shoulder"]
        right_shoulder = kp_map["right_shoulder"]
        left_wrist = kp_map["left_wrist"]
        right_wrist = kp_map["right_wrist"]

        shoulder_mid_y = (left_shoulder["y"] + right_shoulder["y"]) / 2

        # In screen coords, lower Y = higher position
        # So shoulder_y - wrist_y = positive when wrist is above shoulder
        left_height = shoulder_mid_y - left_wrist["y"]
        right_height = shoulder_mid_y - right_wrist["y"]

        return {
            "leftWristHeight": left_height,
            "rightWristHeight": right_height,
            "avgWristHeight": (left_height + right_height) / 2,
        }
    except (KeyError, TypeError):
        return None
