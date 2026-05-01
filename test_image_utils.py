from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

from image_utils import detect_primary_transparent_hole


def _has_scipy() -> bool:
    try:
        import scipy  # noqa: F401

        return True
    except Exception:
        return False


def _has_cv2() -> bool:
    try:
        import cv2  # noqa: F401

        return True
    except Exception:
        return False


class DetectPrimaryTransparentHoleTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self.tmp_dir.name)

    def tearDown(self) -> None:
        self.tmp_dir.cleanup()

    def _write_rgba(self, name: str, rgba: np.ndarray) -> Path:
        path = self.tmp_path / name
        Image.fromarray(rgba, mode="RGBA").save(path)
        return path

    def test_detects_largest_component_and_ignores_noise(self) -> None:
        rgba = np.full((120, 180, 4), 255, dtype=np.uint8)

        # Primary hole rectangle: x=40..89, y=30..69 (50x40 => 2000 px).
        rgba[30:70, 40:90, 3] = 0

        # Sparse transparent noise that should be filtered out by min_area.
        noise_points = [(3, 3), (10, 110), (170, 5), (160, 80)]
        for x, y in noise_points:
            rgba[y, x, 3] = 0

        image_path = self._write_rgba("main_with_noise.png", rgba)
        result = detect_primary_transparent_hole(image_path, min_area=500, backend="auto")

        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result["bbox"], {"x": 40, "y": 30, "width": 50, "height": 40})
        self.assertEqual(result["area"], 2000)
        self.assertAlmostEqual(result["centroid"]["x"], 64.5, places=5)
        self.assertAlmostEqual(result["centroid"]["y"], 49.5, places=5)

    def test_returns_none_when_no_component_meets_min_area(self) -> None:
        rgba = np.full((100, 100, 4), 255, dtype=np.uint8)
        rgba[10:20, 10:20, 3] = 0  # 100 px only
        image_path = self._write_rgba("too_small.png", rgba)

        result = detect_primary_transparent_hole(image_path, min_area=500)
        self.assertIsNone(result)

    def test_alpha_threshold_supports_soft_edges(self) -> None:
        rgba = np.full((120, 120, 4), 255, dtype=np.uint8)

        # Included region: alpha 249 (< 250).
        rgba[20:50, 20:60, 3] = 249

        # Excluded region: alpha 250 (not transparent for threshold 250).
        rgba[70:100, 70:110, 3] = 250

        image_path = self._write_rgba("soft_edges.png", rgba)
        result = detect_primary_transparent_hole(image_path, alpha_threshold=250, min_area=500)

        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result["bbox"], {"x": 20, "y": 20, "width": 40, "height": 30})
        self.assertEqual(result["area"], 1200)

    def test_writes_optional_overlay_and_mask_outputs(self) -> None:
        rgba = np.full((90, 90, 4), 255, dtype=np.uint8)
        rgba[20:60, 25:65, 3] = 0
        image_path = self._write_rgba("with_outputs.png", rgba)

        overlay_path = self.tmp_path / "debug" / "overlay.png"
        mask_path = self.tmp_path / "debug" / "mask.png"

        result = detect_primary_transparent_hole(
            image_path,
            min_area=500,
            overlay_output_path=overlay_path,
            mask_output_path=mask_path,
        )

        self.assertIsNotNone(result)
        self.assertTrue(overlay_path.exists())
        self.assertTrue(mask_path.exists())

    @unittest.skipUnless(_has_scipy(), "scipy not installed")
    def test_scipy_backend(self) -> None:
        rgba = np.full((80, 130, 4), 255, dtype=np.uint8)
        rgba[25:55, 30:100, 3] = 0
        image_path = self._write_rgba("scipy_backend.png", rgba)

        result = detect_primary_transparent_hole(image_path, min_area=500, backend="scipy")
        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result["backend"], "scipy")
        self.assertEqual(result["bbox"], {"x": 30, "y": 25, "width": 70, "height": 30})

    @unittest.skipUnless(_has_cv2(), "opencv not installed")
    def test_opencv_backend(self) -> None:
        rgba = np.full((80, 130, 4), 255, dtype=np.uint8)
        rgba[25:55, 30:100, 3] = 0
        image_path = self._write_rgba("opencv_backend.png", rgba)

        result = detect_primary_transparent_hole(image_path, min_area=500, backend="opencv")
        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result["backend"], "opencv")
        self.assertEqual(result["bbox"], {"x": 30, "y": 25, "width": 70, "height": 30})

    @unittest.skipUnless(_has_scipy() and _has_cv2(), "scipy or opencv not installed")
    def test_backend_parity_for_bbox_area(self) -> None:
        rgba = np.full((140, 200, 4), 255, dtype=np.uint8)
        rgba[45:95, 75:145, 3] = 0
        image_path = self._write_rgba("parity.png", rgba)

        scipy_result = detect_primary_transparent_hole(image_path, min_area=500, backend="scipy")
        cv_result = detect_primary_transparent_hole(image_path, min_area=500, backend="opencv")

        self.assertIsNotNone(scipy_result)
        self.assertIsNotNone(cv_result)
        assert scipy_result is not None
        assert cv_result is not None

        self.assertEqual(scipy_result["bbox"], cv_result["bbox"])
        self.assertEqual(scipy_result["area"], cv_result["area"])
        self.assertAlmostEqual(scipy_result["centroid"]["x"], cv_result["centroid"]["x"], places=5)
        self.assertAlmostEqual(scipy_result["centroid"]["y"], cv_result["centroid"]["y"], places=5)


if __name__ == "__main__":
    unittest.main()