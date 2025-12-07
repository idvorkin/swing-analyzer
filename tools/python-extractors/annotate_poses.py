#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "numpy>=1.24.0",
# ]
# ///
"""
Pose Annotation Helper

Generate annotation templates and visualize pose data for manual labeling.
Creates JSON files with candidate frames that can be reviewed and corrected.

Usage:
    # Generate annotation template with Top/Bottom candidates
    uv run tools/python-extractors/annotate_poses.py poses.posetrack.json --generate

    # View specific frame angles
    uv run tools/python-extractors/annotate_poses.py poses.posetrack.json --frame 40

    # Plot arm height over time (requires matplotlib)
    uv run tools/python-extractors/annotate_poses.py poses.posetrack.json --plot
"""

import argparse
import json
import sys
from pathlib import Path

import numpy as np

from angle_utils import compute_angles as compute_standard_angles, compute_wrist_heights


def compute_angles(keypoints: list[dict]) -> dict:
    """
    Compute angles from keypoints for annotation purposes.

    Returns a dict with 'spine', 'armToVertical', and wrist height info.
    This is a thin wrapper around the shared angle_utils for backwards compatibility.
    """
    angles = {}

    # Get standard angles
    std_angles = compute_standard_angles(keypoints)
    if std_angles.get("spineAngle"):
        angles["spine"] = std_angles["spineAngle"]
    if std_angles.get("armToVerticalAngle"):
        angles["armToVertical"] = std_angles["armToVerticalAngle"]

    # Get wrist heights
    wrist_info = compute_wrist_heights(keypoints)
    if wrist_info:
        angles.update(wrist_info)

    return angles


def find_peaks(values: list[float], min_distance: int = 10, threshold: float = None) -> list[int]:
    """
    Find local maxima in a list of values.

    Args:
        values: List of values to search
        min_distance: Minimum frames between peaks
        threshold: Optional minimum value for a peak

    Returns:
        List of indices where peaks occur
    """
    if len(values) < 3:
        return []

    peaks = []
    last_peak = -min_distance

    for i in range(1, len(values) - 1):
        # Check if this is a local maximum
        if values[i] > values[i-1] and values[i] >= values[i+1]:
            # Check threshold
            if threshold is not None and values[i] < threshold:
                continue

            # Check distance from last peak
            if i - last_peak >= min_distance:
                peaks.append(i)
                last_peak = i

    return peaks


def find_valleys(values: list[float], min_distance: int = 10, threshold: float = None) -> list[int]:
    """Find local minima (inverse of peaks)"""
    inverted = [-v for v in values]
    inv_threshold = -threshold if threshold is not None else None
    return find_peaks(inverted, min_distance, inv_threshold)


def smooth(values: list[float], window: int = 3) -> list[float]:
    """Simple moving average smoothing"""
    result = []
    for i in range(len(values)):
        start = max(0, i - window // 2)
        end = min(len(values), i + window // 2 + 1)
        result.append(sum(values[start:end]) / (end - start))
    return result


def generate_annotations(posetrack: dict) -> dict:
    """
    Generate annotation template with candidate positions.

    Returns dict with:
    - candidates: Auto-detected position candidates
    - frames: All frames with computed angles
    """
    frames_data = []
    arm_heights = []
    spine_angles = []

    for frame in posetrack["frames"]:
        angles = compute_angles(frame["keypoints"])
        arm_heights.append(angles.get("avgWristHeight", 0))
        spine_angles.append(angles.get("spine", 0))

        frames_data.append({
            "frame_index": frame["frameIndex"],
            "video_time": round(frame.get("videoTime", frame["frameIndex"] / 30), 3),
            "angles": {k: round(v, 1) for k, v in angles.items()},
        })

    # Smooth the data
    arm_heights_smooth = smooth(arm_heights, window=5)
    spine_angles_smooth = smooth(spine_angles, window=5)

    # Find Top candidates (peaks in arm height, but only when spine is relatively upright)
    # Top = arms at maximum height when body is upright
    top_candidates = []
    arm_peaks = find_peaks(arm_heights_smooth, min_distance=15)

    for peak_idx in arm_peaks:
        spine = spine_angles[peak_idx]
        arm_h = arm_heights[peak_idx]

        # Top should have upright spine (< 30) and arms elevated
        # Also check this is a significant peak
        if spine < 30 and arm_h > -80:  # -80 means wrists less than 80px below shoulder
            top_candidates.append({
                "frame_index": peak_idx,
                "video_time": frames_data[peak_idx]["video_time"],
                "position": "top",
                "confidence": "auto",
                "reason": f"arm_peak with spine={spine:.1f}, arm_h={arm_h:.1f}",
            })

    # Find Bottom candidates (peaks in spine angle)
    bottom_candidates = []
    spine_peaks = find_peaks(spine_angles_smooth, min_distance=15, threshold=50)

    for peak_idx in spine_peaks:
        spine = spine_angles[peak_idx]
        bottom_candidates.append({
            "frame_index": peak_idx,
            "video_time": frames_data[peak_idx]["video_time"],
            "position": "bottom",
            "confidence": "auto",
            "reason": f"spine_peak at {spine:.1f}",
        })

    return {
        "metadata": {
            "source": posetrack["metadata"].get("sourceVideoName", "unknown"),
            "frame_count": len(posetrack["frames"]),
            "fps": posetrack["metadata"].get("fps", 30),
        },
        "candidates": {
            "top": top_candidates,
            "bottom": bottom_candidates,
        },
        "annotations": [],  # To be filled in manually
        "frames": frames_data,
    }


def show_frame(posetrack: dict, frame_idx: int):
    """Display detailed info for a specific frame"""
    if frame_idx < 0 or frame_idx >= len(posetrack["frames"]):
        print(f"Frame {frame_idx} out of range (0-{len(posetrack['frames'])-1})")
        return

    frame = posetrack["frames"][frame_idx]
    angles = compute_angles(frame["keypoints"])

    print(f"\nFrame {frame_idx} (t={frame.get('videoTime', frame_idx/30):.3f}s)")
    print("-" * 40)

    print("\nAngles:")
    for name, value in sorted(angles.items()):
        print(f"  {name}: {value:.1f}")

    print("\nKeypoints:")
    for kp in frame["keypoints"]:
        name = kp.get("name", "?")
        print(f"  {name}: ({kp['x']:.1f}, {kp['y']:.1f}) score={kp.get('score', 0):.2f}")


def plot_angles(posetrack: dict, output_path: Path = None):
    """Plot arm height and spine angle over time"""
    try:
        import matplotlib.pyplot as plt
    except ImportError:
        print("matplotlib not available. Install with: pip install matplotlib")
        return

    times = []
    arm_heights = []
    spine_angles = []

    for frame in posetrack["frames"]:
        times.append(frame.get("videoTime", frame["frameIndex"] / 30))
        angles = compute_angles(frame["keypoints"])
        arm_heights.append(angles.get("avgWristHeight", 0))
        spine_angles.append(angles.get("spine", 0))

    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 8), sharex=True)

    ax1.plot(times, arm_heights, 'b-', label='Avg Wrist Height (px from shoulder)')
    ax1.axhline(y=0, color='gray', linestyle='--', alpha=0.5)
    ax1.set_ylabel('Wrist Height (higher = arms up)')
    ax1.legend()
    ax1.grid(True, alpha=0.3)
    ax1.set_title('Arm Height Over Time (peaks = Top positions)')

    ax2.plot(times, spine_angles, 'r-', label='Spine Angle (deg from vertical)')
    ax2.axhline(y=50, color='gray', linestyle='--', alpha=0.5, label='Bottom threshold')
    ax2.set_xlabel('Time (s)')
    ax2.set_ylabel('Spine Angle (higher = bent over)')
    ax2.legend()
    ax2.grid(True, alpha=0.3)
    ax2.set_title('Spine Angle Over Time (peaks = Bottom positions)')

    plt.tight_layout()

    if output_path:
        plt.savefig(output_path, dpi=150)
        print(f"Saved plot to {output_path}")
    else:
        plt.show()


def main():
    parser = argparse.ArgumentParser(description="Pose annotation helper")
    parser.add_argument("posetrack", type=Path, help="Input posetrack JSON file")
    parser.add_argument("--generate", action="store_true",
                       help="Generate annotation template")
    parser.add_argument("--frame", type=int, help="Show details for specific frame")
    parser.add_argument("--plot", action="store_true", help="Plot angles over time")
    parser.add_argument("--output", "-o", type=Path, help="Output file path")

    args = parser.parse_args()

    if not args.posetrack.exists():
        print(f"Error: File not found: {args.posetrack}", file=sys.stderr)
        sys.exit(1)

    with open(args.posetrack) as f:
        posetrack = json.load(f)

    if args.frame is not None:
        show_frame(posetrack, args.frame)
        return

    if args.plot:
        output = args.output or args.posetrack.with_suffix(".png")
        plot_angles(posetrack, output)
        return

    if args.generate:
        annotations = generate_annotations(posetrack)

        output = args.output or args.posetrack.with_suffix(".annotations.json")
        with open(output, "w") as f:
            json.dump(annotations, f, indent=2)

        print(f"Generated annotation template: {output}")
        print(f"\nCandidates found:")
        print(f"  Top positions: {len(annotations['candidates']['top'])}")
        for c in annotations['candidates']['top']:
            print(f"    Frame {c['frame_index']} ({c['video_time']}s) - {c['reason']}")
        print(f"  Bottom positions: {len(annotations['candidates']['bottom'])}")
        for c in annotations['candidates']['bottom']:
            print(f"    Frame {c['frame_index']} ({c['video_time']}s) - {c['reason']}")

        print(f"\nReview candidates and move confirmed ones to 'annotations' array.")
        return

    # Default: show summary
    print(f"Posetrack file: {args.posetrack}")
    print(f"  Frames: {len(posetrack['frames'])}")
    print(f"  Duration: {posetrack['metadata'].get('sourceVideoDuration', 'unknown')}s")
    print(f"\nUse --generate to create annotation template")
    print(f"Use --frame N to view specific frame")
    print(f"Use --plot to visualize angles")


if __name__ == "__main__":
    main()
