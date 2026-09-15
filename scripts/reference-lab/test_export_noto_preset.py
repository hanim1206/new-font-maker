#!/usr/bin/env python3
"""Noto 윤곽+기준선 프리셋 export 검증."""

import json
import unittest
from pathlib import Path

import export_noto_preset as exporter

ROOT = Path(__file__).resolve().parents[2]
CORPUS = ROOT / ".reference-fonts/guide-corpus/251eae7645152d1705a55414"


class BaselinesUnitTests(unittest.TestCase):
    def test_baselines_read_face_and_medial_targets(self):
        stages = {
            "initial": {"measurements": {"roleFaces": {"bottom": 0.78, "left": 0.10, "right": 0.51, "top": 0.15}}},
            "medial": {"measurements": {"baseStem": {"orientation": "vertical", "face": 0.47, "visibleLength": 0.18}}},
            "final": {"measurements": {}},
        }
        baselines = exporter.baselines_of(stages)
        self.assertEqual(baselines["initial.roleFaces.bottom"], 0.78)
        self.assertEqual(baselines["initial.roleFaces.left"], 0.10)
        self.assertEqual(baselines["medial.baseStem.face"], 0.47)
        # top은 모델 타깃이 아니므로 빠진다.
        self.assertNotIn("initial.roleFaces.top", baselines)
        # 측정 없는 타깃은 안 들어간다.
        self.assertNotIn("final.roleFaces.right", baselines)

    def test_baselines_skip_missing_measurements(self):
        self.assertEqual(exporter.baselines_of({"initial": {"measurements": {}}}), {})


@unittest.skipUnless((CORPUS / "reports/all.json").is_file(), "corpus unavailable")
class ExportCorpusTests(unittest.TestCase):
    def test_outline_reads_font_unit_operations(self):
        report = json.load((CORPUS / "reports/all.json").open(encoding="utf-8"))
        case = next(c for c in report["cases"] if c["identity"]["character"] == "가")
        outline = exporter.outline_of(CORPUS, case["stages"]["outline"]["artifact"])
        self.assertEqual(outline["unitsPerEm"], 1000)
        self.assertTrue(outline["operations"])
        self.assertEqual(outline["operations"][0]["operation"], "moveTo")

    def test_outline_rejects_path_outside_corpus(self):
        with self.assertRaises(ValueError):
            exporter.outline_of(CORPUS, "../../../etc/passwd")

    def test_single_glyph_export_shape(self):
        # 가 하나만 담은 report로 export 로직을 빠르게 검증한다(전수 11초 회피).
        report = json.load((CORPUS / "reports/all.json").open(encoding="utf-8"))
        case = next(c for c in report["cases"] if c["identity"]["character"] == "가")
        mini = {"font": report["font"], "stageKeys": report["stageKeys"], "cases": [case]}
        mini_path = CORPUS / "reports" / "_test_mini.json"
        mini_path.write_text(json.dumps(mini, ensure_ascii=False), encoding="utf-8")
        try:
            result = exporter.export(CORPUS, "_test_mini.json")
        finally:
            mini_path.unlink()
        self.assertEqual(result["schema"], "noto-preset-outlines-v1")
        self.assertEqual(result["glyphCount"], 1)
        glyph = result["glyphs"][0]
        self.assertEqual(glyph["identity"]["character"], "가")
        self.assertTrue(glyph["outline"]["operations"])
        self.assertIn("initial.roleFaces.bottom", glyph["baselines"])
        self.assertTrue(all(0.0 <= v <= 1.0 for v in glyph["baselines"].values()))


if __name__ == "__main__":
    unittest.main(verbosity=2)
