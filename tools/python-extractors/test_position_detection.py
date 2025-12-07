#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "numpy>=1.24.0",
# ]
# ///
"""
Position Detection Algorithm Tester

Test swing position detection algorithms against annotated pose data.
This enables rapid iteration on detection logic without running the full app.

Usage:
    # Test algorithms against a posetrack file
    uv run tools/python-extractors/test_position_detection.py poses.posetrack.json

    # Run with ground truth annotations
    uv run tools/python-extractors/test_position_detection.py poses.posetrack.json --annotations annotations.json

    # Analyze arm angles to find Top position candidates
    uv run tools/python-extractors/test_position_detection.py poses.posetrack.json --find-tops

    # Export annotated frames for review
    uv run tools/python-extractors/test_position_detection.py poses.posetrack.json --export-csv
"""

import argparse
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import numpy as np

from angle_utils import compute_angles as compute_standard_angles, compute_wrist_heights


@dataclass
class DetectionResult:
    """Result of position detection for a frame"""
    frame_index: int
    video_time: float
    detected_position: Optional[str]
    confidence: float
    angles: dict
    # For peak detection
    is_arm_peak: bool = False
    is_spine_peak: bool = False


@dataclass
class GroundTruth:
    """Ground truth annotation for a frame"""
    frame_index: int
    position: str  # 'top', 'bottom', 'connect', 'release'
    notes: str = ""


@dataclass
class AlgorithmMetrics:
    """Metrics for evaluating algorithm performance"""
    true_positives: int = 0
    false_positives: int = 0
    false_negatives: int = 0
    total_frames: int = 0
    position_errors: list = field(default_factory=list)

    @property
    def precision(self) -> float:
        if self.true_positives + self.false_positives == 0:
            return 0.0
        return self.true_positives / (self.true_positives + self.false_positives)

    @property
    def recall(self) -> float:
        if self.true_positives + self.false_negatives == 0:
            return 0.0
        return self.true_positives / (self.true_positives + self.false_negatives)

    @property
    def f1(self) -> float:
        if self.precision + self.recall == 0:
            return 0.0
        return 2 * (self.precision * self.recall) / (self.precision + self.recall)


def compute_angles_from_keypoints(keypoints: list[dict]) -> dict:
    """
    Compute angles from MediaPipe BlazePose-33 keypoints.
    Returns dict with spine, hip, armToVertical, wristHeight, avgWristHeight angles.

    This is a thin wrapper around the shared angle_utils for backwards compatibility.
    """
    angles = {}

    # Get standard angles
    std_angles = compute_standard_angles(keypoints)
    if std_angles.get("spineAngle"):
        angles["spine"] = std_angles["spineAngle"]
    if std_angles.get("armToVerticalAngle"):
        angles["armToVertical"] = std_angles["armToVerticalAngle"]
    if std_angles.get("hipAngle"):
        angles["hip"] = std_angles["hipAngle"]

    # Get wrist heights
    wrist_info = compute_wrist_heights(keypoints)
    if wrist_info:
        angles["wristHeight"] = wrist_info["leftWristHeight"]
        angles["avgWristHeight"] = wrist_info["avgWristHeight"]

    return angles


class PositionDetector:
    """
    Swing position detector with configurable algorithms.

    The detector maintains state to track peaks and transitions.
    """

    def __init__(self, algorithm: str = "peak"):
        """
        Initialize detector.

        Args:
            algorithm: Detection algorithm - "threshold" or "peak"
        """
        self.algorithm = algorithm
        self.reset()

    def reset(self):
        """Reset detector state for new sequence"""
        self.prev_arm_angle = 0
        self.prev_spine_angle = 0
        self.arm_angle_history = []
        self.spine_angle_history = []
        self.direction = "unknown"  # "up" or "down"
        self.last_top_frame = -999
        self.last_bottom_frame = -999

    def detect(self, frame_index: int, video_time: float, keypoints: list[dict]) -> DetectionResult:
        """
        Detect position for a single frame.

        Returns DetectionResult with detected position and metadata.
        """
        angles = compute_angles_from_keypoints(keypoints)

        if self.algorithm == "threshold":
            return self._detect_threshold(frame_index, video_time, angles)
        elif self.algorithm == "peak":
            return self._detect_peak(frame_index, video_time, angles)
        else:
            raise ValueError(f"Unknown algorithm: {self.algorithm}")

    def _detect_threshold(self, frame_index: int, video_time: float, angles: dict) -> DetectionResult:
        """
        Threshold-based detection (current app behavior).

        Top = spine angle < 25
        Bottom = spine angle > 60
        """
        spine = angles.get("spine", 0)

        position = None
        confidence = 0.0

        if spine < 25:
            position = "top"
            confidence = 1.0 - (spine / 25)
        elif spine > 60:
            position = "bottom"
            confidence = min(1.0, (spine - 60) / 30)
        elif spine < 45:
            position = "release"
            confidence = 0.5
        else:
            position = "connect"
            confidence = 0.5

        return DetectionResult(
            frame_index=frame_index,
            video_time=video_time,
            detected_position=position,
            confidence=confidence,
            angles=angles,
        )

    def _detect_peak(self, frame_index: int, video_time: float, angles: dict) -> DetectionResult:
        """
        Peak-based detection (new algorithm).

        Top = arm reaches maximum height (local peak in wristHeight/armToVertical)
        Bottom = spine angle reaches maximum (local peak)
        """
        arm_height = angles.get("avgWristHeight", angles.get("wristHeight", 0))
        spine = angles.get("spine", 0)

        # Track history for peak detection
        self.arm_angle_history.append(arm_height)
        self.spine_angle_history.append(spine)

        # Keep last N frames for peak detection
        window = 5
        if len(self.arm_angle_history) > window * 2:
            self.arm_angle_history = self.arm_angle_history[-window * 2:]
            self.spine_angle_history = self.spine_angle_history[-window * 2:]

        position = None
        confidence = 0.0
        is_arm_peak = False
        is_spine_peak = False

        # Check for arm peak (Top position)
        # Arm peak = wrist height was increasing, now decreasing
        if len(self.arm_angle_history) >= 3:
            prev2 = self.arm_angle_history[-3]
            prev1 = self.arm_angle_history[-2]
            curr = self.arm_angle_history[-1]

            # Peak detection: prev1 > prev2 AND prev1 > curr (local maximum)
            if prev1 > prev2 and prev1 >= curr:
                is_arm_peak = True
                # Only mark as Top if enough frames since last top
                if frame_index - self.last_top_frame > 10:
                    position = "top"
                    confidence = 0.9
                    self.last_top_frame = frame_index

        # Check for spine peak (Bottom position)
        if len(self.spine_angle_history) >= 3:
            prev2 = self.spine_angle_history[-3]
            prev1 = self.spine_angle_history[-2]
            curr = self.spine_angle_history[-1]

            # Peak detection: prev1 > prev2 AND prev1 > curr (local maximum)
            if prev1 > prev2 and prev1 >= curr and prev1 > 50:  # Minimum threshold for bottom
                is_spine_peak = True
                if frame_index - self.last_bottom_frame > 10:
                    position = "bottom"
                    confidence = 0.9
                    self.last_bottom_frame = frame_index

        # If not a peak, detect connect/release based on direction
        if position is None:
            if len(self.spine_angle_history) >= 2:
                if spine > self.prev_spine_angle + 2:
                    position = "connect"  # Going down
                    confidence = 0.5
                elif spine < self.prev_spine_angle - 2:
                    position = "release"  # Coming up
                    confidence = 0.5

        self.prev_arm_angle = arm_height
        self.prev_spine_angle = spine

        return DetectionResult(
            frame_index=frame_index,
            video_time=video_time,
            detected_position=position,
            confidence=confidence,
            angles=angles,
            is_arm_peak=is_arm_peak,
            is_spine_peak=is_spine_peak,
        )


def load_posetrack(path: Path) -> dict:
    """Load a posetrack JSON file"""
    with open(path) as f:
        return json.load(f)


def load_annotations(path: Path) -> list[GroundTruth]:
    """Load ground truth annotations"""
    with open(path) as f:
        data = json.load(f)

    return [
        GroundTruth(
            frame_index=item["frame_index"],
            position=item["position"],
            notes=item.get("notes", "")
        )
        for item in data
    ]


def analyze_posetrack(posetrack: dict, algorithm: str = "peak") -> list[DetectionResult]:
    """Run detection algorithm on all frames"""
    detector = PositionDetector(algorithm=algorithm)
    results = []

    for frame in posetrack["frames"]:
        result = detector.detect(
            frame_index=frame["frameIndex"],
            video_time=frame.get("videoTime", frame["frameIndex"] / 30),
            keypoints=frame["keypoints"],
        )
        results.append(result)

    return results


def find_arm_peaks(posetrack: dict) -> list[dict]:
    """
    Find frames where arms are at peak height (Top position candidates).

    Returns list of frame info sorted by arm height.
    """
    frames_with_angles = []

    for frame in posetrack["frames"]:
        angles = compute_angles_from_keypoints(frame["keypoints"])
        if "avgWristHeight" in angles or "wristHeight" in angles:
            frames_with_angles.append({
                "frame_index": frame["frameIndex"],
                "video_time": frame.get("videoTime", frame["frameIndex"] / 30),
                "arm_height": angles.get("avgWristHeight", angles.get("wristHeight", 0)),
                "arm_to_vertical": angles.get("armToVertical", 0),
                "spine": angles.get("spine", 0),
            })

    # Sort by arm height (highest first)
    frames_with_angles.sort(key=lambda x: x["arm_height"], reverse=True)

    return frames_with_angles


def evaluate_algorithm(
    results: list[DetectionResult],
    ground_truth: list[GroundTruth],
    position: str = "top"
) -> AlgorithmMetrics:
    """
    Evaluate algorithm performance against ground truth.

    Args:
        results: Detection results from algorithm
        ground_truth: Annotated ground truth
        position: Which position to evaluate ("top", "bottom", etc.)

    Returns:
        AlgorithmMetrics with precision, recall, F1
    """
    metrics = AlgorithmMetrics(total_frames=len(results))

    # Build ground truth set
    gt_frames = {gt.frame_index for gt in ground_truth if gt.position == position}

    # Evaluate detections
    detected_frames = {r.frame_index for r in results if r.detected_position == position}

    # True positives: detected AND in ground truth
    # Allow 2 frame tolerance
    for detected in detected_frames:
        matched = False
        for gt in gt_frames:
            if abs(detected - gt) <= 2:
                matched = True
                break
        if matched:
            metrics.true_positives += 1
        else:
            metrics.false_positives += 1
            metrics.position_errors.append({
                "type": "false_positive",
                "frame": detected,
            })

    # False negatives: in ground truth but not detected (with tolerance)
    for gt in gt_frames:
        matched = any(abs(detected - gt) <= 2 for detected in detected_frames)
        if not matched:
            metrics.false_negatives += 1
            metrics.position_errors.append({
                "type": "false_negative",
                "frame": gt,
            })

    return metrics


def export_csv(posetrack: dict, results: list[DetectionResult], output_path: Path):
    """Export analysis results to CSV for review"""
    with open(output_path, "w") as f:
        f.write("frame_index,video_time,position,confidence,spine,arm_to_vertical,wrist_height,is_arm_peak,is_spine_peak\n")

        for result in results:
            f.write(
                f"{result.frame_index},"
                f"{result.video_time:.3f},"
                f"{result.detected_position or ''},"
                f"{result.confidence:.2f},"
                f"{result.angles.get('spine', 0):.1f},"
                f"{result.angles.get('armToVertical', 0):.1f},"
                f"{result.angles.get('avgWristHeight', result.angles.get('wristHeight', 0)):.1f},"
                f"{result.is_arm_peak},"
                f"{result.is_spine_peak}\n"
            )


def main():
    parser = argparse.ArgumentParser(
        description="Test swing position detection algorithms",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("posetrack", type=Path, help="Input posetrack JSON file")
    parser.add_argument("--annotations", type=Path, help="Ground truth annotations JSON")
    parser.add_argument("--algorithm", choices=["threshold", "peak"], default="peak",
                       help="Detection algorithm to use")
    parser.add_argument("--find-tops", action="store_true",
                       help="Find and list Top position candidates by arm height")
    parser.add_argument("--export-csv", type=Path,
                       help="Export results to CSV file")
    parser.add_argument("--compare", action="store_true",
                       help="Compare threshold vs peak algorithms")

    args = parser.parse_args()

    if not args.posetrack.exists():
        print(f"Error: File not found: {args.posetrack}", file=sys.stderr)
        sys.exit(1)

    print(f"Loading {args.posetrack}...")
    posetrack = load_posetrack(args.posetrack)
    print(f"  {len(posetrack['frames'])} frames, {posetrack['metadata'].get('fps', 30)} fps")

    if args.find_tops:
        print("\nFinding Top position candidates (by arm height)...")
        peaks = find_arm_peaks(posetrack)

        print("\nTop 10 frames by arm height:")
        print(f"{'Frame':>6} {'Time':>8} {'ArmHeight':>10} {'ArmToVert':>10} {'Spine':>8}")
        print("-" * 50)
        for p in peaks[:10]:
            print(
                f"{p['frame_index']:>6} "
                f"{p['video_time']:>7.2f}s "
                f"{p['arm_height']:>10.1f} "
                f"{p['arm_to_vertical']:>10.1f} "
                f"{p['spine']:>8.1f}"
            )
        return

    if args.compare:
        print("\nComparing algorithms...")

        for alg in ["threshold", "peak"]:
            results = analyze_posetrack(posetrack, algorithm=alg)

            # Count detections
            tops = sum(1 for r in results if r.detected_position == "top")
            bottoms = sum(1 for r in results if r.detected_position == "bottom")

            print(f"\n{alg.upper()} algorithm:")
            print(f"  Top detections: {tops}")
            print(f"  Bottom detections: {bottoms}")

            if alg == "peak":
                arm_peaks = sum(1 for r in results if r.is_arm_peak)
                spine_peaks = sum(1 for r in results if r.is_spine_peak)
                print(f"  Arm peaks: {arm_peaks}")
                print(f"  Spine peaks: {spine_peaks}")

        return

    # Run detection
    print(f"\nRunning {args.algorithm} detection...")
    results = analyze_posetrack(posetrack, algorithm=args.algorithm)

    # Summarize results
    positions = {}
    for r in results:
        pos = r.detected_position or "unknown"
        positions[pos] = positions.get(pos, 0) + 1

    print("\nPosition counts:")
    for pos, count in sorted(positions.items()):
        print(f"  {pos}: {count}")

    # Show detected tops
    tops = [r for r in results if r.detected_position == "top"]
    if tops:
        print(f"\nDetected Top positions ({len(tops)}):")
        for t in tops[:10]:
            print(
                f"  Frame {t.frame_index} ({t.video_time:.2f}s) - "
                f"arm_height={t.angles.get('avgWristHeight', t.angles.get('wristHeight', 0)):.1f}, "
                f"spine={t.angles.get('spine', 0):.1f}"
            )

    # Evaluate against ground truth if provided
    if args.annotations:
        print(f"\nLoading annotations from {args.annotations}...")
        ground_truth = load_annotations(args.annotations)
        print(f"  {len(ground_truth)} annotations")

        for position in ["top", "bottom"]:
            gt_count = sum(1 for gt in ground_truth if gt.position == position)
            if gt_count > 0:
                metrics = evaluate_algorithm(results, ground_truth, position)
                print(f"\n{position.upper()} detection metrics:")
                print(f"  Precision: {metrics.precision:.2%}")
                print(f"  Recall: {metrics.recall:.2%}")
                print(f"  F1 Score: {metrics.f1:.2%}")

                if metrics.position_errors:
                    print(f"  Errors ({len(metrics.position_errors)}):")
                    for err in metrics.position_errors[:5]:
                        print(f"    {err['type']} at frame {err['frame']}")

    # Export to CSV if requested
    if args.export_csv:
        print(f"\nExporting to {args.export_csv}...")
        export_csv(posetrack, results, args.export_csv)
        print("  Done")


if __name__ == "__main__":
    main()
