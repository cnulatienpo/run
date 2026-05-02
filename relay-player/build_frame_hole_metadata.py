#!/usr/bin/env python3
"""Build per-frame hole metadata from RGBA frames for relay-player.

This script wires the transparent-hole detector into the frame-processing
pipeline by scanning frame PNGs and writing one JSON metadata file per frame.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Dict, List, Optional


REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from image_utils import detect_primary_transparent_hole


def _frame_sort_key(path: Path) -> tuple[int, str]:
    stem = path.stem
    try:
        return (int(stem.split("_")[-1]), stem)
    except ValueError:
        return (10**9, stem)


def _bbox_xyxy(bbox: Dict[str, int]) -> List[int]:
    x = int(bbox["x"])
    y = int(bbox["y"])
    width = int(bbox["width"])
    height = int(bbox["height"])
    return [x, y, x + width, y + height]


def build_frame_hole_metadata(
    *,
    frames_dir: Path,
    output_dir: Path,
    alpha_threshold: int,
    min_area: int,
    backend: str,
    connectivity: int,
    write_debug_images: bool,
) -> None:
    frames_dir = frames_dir.resolve()
    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    debug_overlay_dir: Optional[Path] = None
    debug_mask_dir: Optional[Path] = None
    if write_debug_images:
        debug_overlay_dir = output_dir / "debug_overlay"
        debug_mask_dir = output_dir / "debug_mask"
        debug_overlay_dir.mkdir(parents=True, exist_ok=True)
        debug_mask_dir.mkdir(parents=True, exist_ok=True)

    frame_paths = sorted(frames_dir.glob("f_*.png"), key=_frame_sort_key)
    if not frame_paths:
        raise FileNotFoundError(f"No frame PNGs found in {frames_dir}")

    total = len(frame_paths)
    hits = 0

    for output_index, frame_path in enumerate(frame_paths):
        frame_name = frame_path.stem
        frame_index = int(frame_name.split("_")[-1])

        overlay_path = None
        mask_path = None
        if write_debug_images and debug_overlay_dir and debug_mask_dir:
            overlay_path = debug_overlay_dir / f"{frame_name}.png"
            mask_path = debug_mask_dir / f"{frame_name}.png"

        result = detect_primary_transparent_hole(
            frame_path,
            alpha_threshold=alpha_threshold,
            min_area=min_area,
            backend=backend,
            connectivity=connectivity,
            overlay_output_path=overlay_path,
            mask_output_path=mask_path,
        )

        output_payload: Dict[str, object] = {
            "frame_index": frame_index,
            "output_index": output_index,
        }

        if result is None:
            output_payload["bbox"] = None
            output_payload["has_mask"] = False
            output_payload["centroid"] = None
            output_payload["area"] = 0
        else:
            hits += 1
            output_payload["bbox"] = _bbox_xyxy(result["bbox"])
            output_payload["has_mask"] = True
            output_payload["centroid"] = result["centroid"]
            output_payload["area"] = int(result["area"])
            output_payload["backend"] = result["backend"]

        output_file = output_dir / f"{frame_name}.json"
        output_file.write_text(json.dumps(output_payload), encoding="utf-8")

    print(
        f"Processed {total} frames. Detected hole in {hits} frames. "
        f"Metadata written to {output_dir}"
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate per-frame hole metadata from RGBA frame PNGs."
    )
    parser.add_argument(
        "--frames-dir",
        type=Path,
        default=Path(__file__).resolve().parent / "assets",
        help="Directory containing input frame PNGs (default: relay-player/assets)",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path(__file__).resolve().parent / "assets" / "json_final",
        help="Directory to write frame JSON metadata (default: relay-player/assets/json_final)",
    )
    parser.add_argument(
        "--alpha-threshold",
        type=int,
        default=250,
        help="Transparent alpha threshold: alpha < threshold is transparent.",
    )
    parser.add_argument(
        "--min-area",
        type=int,
        default=500,
        help="Minimum connected-component area in pixels to ignore noise.",
    )
    parser.add_argument(
        "--backend",
        choices=["auto", "scipy", "opencv"],
        default="auto",
        help="Connected components backend.",
    )
    parser.add_argument(
        "--connectivity",
        choices=[4, 8],
        type=int,
        default=8,
        help="Connected-component connectivity.",
    )
    parser.add_argument(
        "--write-debug-images",
        action="store_true",
        help="Also write overlay and selected-region mask debug images.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    build_frame_hole_metadata(
        frames_dir=args.frames_dir,
        output_dir=args.output_dir,
        alpha_threshold=args.alpha_threshold,
        min_area=args.min_area,
        backend=args.backend,
        connectivity=args.connectivity,
        write_debug_images=args.write_debug_images,
    )


if __name__ == "__main__":
    main()
