#!/usr/bin/env python3
"""Utilities for detecting the primary transparent hole in RGBA PNG images."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, Literal, Optional, Union

import numpy as np
from PIL import Image

BackendName = Literal["auto", "scipy", "opencv"]


def detect_primary_transparent_hole(
    image_path: Union[str, Path],
    *,
    alpha_threshold: int = 250,
    min_area: int = 500,
    backend: BackendName = "auto",
    connectivity: int = 8,
    overlay_output_path: Optional[Union[str, Path]] = None,
    mask_output_path: Optional[Union[str, Path]] = None,
) -> Optional[Dict[str, Any]]:
    """Detect the largest meaningful transparent region in an RGBA image.

    Args:
        image_path: Path to image file.
        alpha_threshold: Pixels with alpha < threshold are treated as transparent.
        min_area: Minimum component area to keep (filters transparent noise).
        backend: Connected components backend: "auto", "scipy", or "opencv".
        connectivity: Pixel connectivity for components: 4 or 8.
        overlay_output_path: Optional path to write a bright-green debug overlay.
        mask_output_path: Optional path to write a binary mask of the selected region.

    Returns:
        None if no transparent component passes min_area, otherwise a dict containing:
        - bbox: {x, y, width, height}
        - centroid: {x, y}
        - area: component area in pixels
        - backend: backend that produced the result
    """
    if connectivity not in (4, 8):
        raise ValueError("connectivity must be 4 or 8")
    if alpha_threshold <= 0 or alpha_threshold > 255:
        raise ValueError("alpha_threshold must be in the range 1..255")
    if min_area <= 0:
        raise ValueError("min_area must be greater than 0")

    image_path = Path(image_path)
    with Image.open(image_path) as img:
        rgba = np.array(img.convert("RGBA"), dtype=np.uint8)

    alpha = rgba[:, :, 3]
    transparent_mask = alpha < alpha_threshold

    selected = _find_largest_component(
        transparent_mask,
        min_area=min_area,
        backend=backend,
        connectivity=connectivity,
    )
    if selected is None:
        return None

    if overlay_output_path is not None:
        _write_overlay_image(rgba, selected["mask"], Path(overlay_output_path))
    if mask_output_path is not None:
        _write_mask_image(selected["mask"], Path(mask_output_path))

    return {
        "bbox": selected["bbox"],
        "centroid": selected["centroid"],
        "area": selected["area"],
        "backend": selected["backend"],
    }


def _find_largest_component(
    mask: np.ndarray,
    *,
    min_area: int,
    backend: BackendName,
    connectivity: int,
) -> Optional[Dict[str, Any]]:
    backends_to_try = _backend_order(backend)
    last_error: Optional[Exception] = None

    for backend_name in backends_to_try:
        try:
            if backend_name == "scipy":
                return _find_largest_component_scipy(mask, min_area=min_area, connectivity=connectivity)
            if backend_name == "opencv":
                return _find_largest_component_opencv(mask, min_area=min_area, connectivity=connectivity)
        except ImportError as exc:
            last_error = exc
            continue

    if last_error is None:
        return None
    raise ImportError(
        "No connected-components backend available. Install scipy or opencv-python."
    ) from last_error


def _backend_order(backend: BackendName) -> list[str]:
    if backend == "auto":
        return ["scipy", "opencv"]
    if backend == "scipy":
        return ["scipy"]
    if backend == "opencv":
        return ["opencv"]
    raise ValueError(f"Unsupported backend: {backend}")


def _find_largest_component_scipy(
    mask: np.ndarray,
    *,
    min_area: int,
    connectivity: int,
) -> Optional[Dict[str, Any]]:
    from scipy import ndimage

    structure = np.ones((3, 3), dtype=np.uint8) if connectivity == 8 else np.array(
        [[0, 1, 0], [1, 1, 1], [0, 1, 0]], dtype=np.uint8
    )

    labels, num_labels = ndimage.label(mask, structure=structure)
    if num_labels == 0:
        return None

    counts = np.bincount(labels.ravel())
    if counts.size <= 1:
        return None

    best_label = 0
    best_area = 0
    for label_index in range(1, counts.size):
        area = int(counts[label_index])
        if area >= min_area and area > best_area:
            best_label = label_index
            best_area = area

    if best_label == 0:
        return None

    component_mask = labels == best_label
    ys, xs = np.nonzero(component_mask)
    x_min = int(xs.min())
    x_max = int(xs.max())
    y_min = int(ys.min())
    y_max = int(ys.max())

    return {
        "bbox": {
            "x": x_min,
            "y": y_min,
            "width": x_max - x_min + 1,
            "height": y_max - y_min + 1,
        },
        "centroid": {
            "x": float(xs.mean()),
            "y": float(ys.mean()),
        },
        "area": int(component_mask.sum()),
        "mask": component_mask,
        "backend": "scipy",
    }


def _find_largest_component_opencv(
    mask: np.ndarray,
    *,
    min_area: int,
    connectivity: int,
) -> Optional[Dict[str, Any]]:
    import cv2

    binary = (mask.astype(np.uint8) * 255)
    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(
        binary,
        connectivity=connectivity,
        ltype=cv2.CV_32S,
    )
    if num_labels <= 1:
        return None

    best_label = 0
    best_area = 0
    for label_index in range(1, num_labels):
        area = int(stats[label_index, cv2.CC_STAT_AREA])
        if area >= min_area and area > best_area:
            best_label = label_index
            best_area = area

    if best_label == 0:
        return None

    x_min = int(stats[best_label, cv2.CC_STAT_LEFT])
    y_min = int(stats[best_label, cv2.CC_STAT_TOP])
    width = int(stats[best_label, cv2.CC_STAT_WIDTH])
    height = int(stats[best_label, cv2.CC_STAT_HEIGHT])
    centroid_x, centroid_y = centroids[best_label]
    component_mask = labels == best_label

    return {
        "bbox": {
            "x": x_min,
            "y": y_min,
            "width": width,
            "height": height,
        },
        "centroid": {
            "x": float(centroid_x),
            "y": float(centroid_y),
        },
        "area": int(best_area),
        "mask": component_mask,
        "backend": "opencv",
    }


def _write_overlay_image(rgba: np.ndarray, component_mask: np.ndarray, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    overlay = rgba.copy().astype(np.float32)

    # Blend selected region toward bright green for quick visual debugging.
    green = np.array([0, 255, 0], dtype=np.float32)
    overlay[component_mask, :3] = 0.35 * overlay[component_mask, :3] + 0.65 * green
    overlay_image = np.clip(overlay, 0, 255).astype(np.uint8)
    Image.fromarray(overlay_image, mode="RGBA").save(output_path)


def _write_mask_image(component_mask: np.ndarray, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    mask_image = (component_mask.astype(np.uint8) * 255)
    Image.fromarray(mask_image, mode="L").save(output_path)