#!/usr/bin/env python3
"""Quick metadata generator for relay frames with any naming pattern."""

from __future__ import annotations

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from image_utils import detect_primary_transparent_hole

def main():
    frames_dir = Path(__file__).resolve().parent / "assets"
    output_dir = frames_dir / "json_final"
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Find all PNG files (any naming pattern)
    frame_paths = sorted(frames_dir.glob("*.png"))
    
    if not frame_paths:
        print(f"No PNG files found in {frames_dir}")
        sys.exit(1)
    
    total = len(frame_paths)
    hits = 0
    
    for idx, frame_path in enumerate(frame_paths):
        frame_name = frame_path.stem
        
        result = detect_primary_transparent_hole(
            frame_path,
            alpha_threshold=250,
            min_area=500,
            backend="auto",
            connectivity=8,
        )
        
        output_payload = {
            "frame_index": idx,
            "frame_name": frame_name,
        }
        
        if result is None:
            output_payload["bbox"] = None
            output_payload["has_mask"] = False
            output_payload["centroid"] = None
            output_payload["area"] = 0
        else:
            hits += 1
            x = int(result["bbox"]["x"])
            y = int(result["bbox"]["y"])
            w = int(result["bbox"]["width"])
            h = int(result["bbox"]["height"])
            output_payload["bbox"] = [x, y, x + w, y + h]
            output_payload["has_mask"] = True
            output_payload["centroid"] = result["centroid"]
            output_payload["area"] = int(result["area"])
            output_payload["backend"] = result["backend"]
        
        output_file = output_dir / f"{frame_name}.json"
        output_file.write_text(json.dumps(output_payload, indent=2), encoding="utf-8")
        print(f"[{idx+1}/{total}] {frame_name}: {'FOUND' if result else 'NOT FOUND'}")
    
    print(f"\nProcessed {total} frames. Detected hole in {hits} frames.")
    print(f"Metadata written to {output_dir}")

if __name__ == "__main__":
    main()
