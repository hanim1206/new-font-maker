#!/usr/bin/env python3
"""닿자 코너/획 굽음 측정 v3의 산식·불변성 검증."""

import json
import unittest
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Tuple

import measure_role_joints as joints


CORPUS = Path(__file__).resolve().parents[2] / ".reference-fonts/guide-corpus/251eae7645152d1705a55414"


@dataclass
class FakeRecord:
    operations: Tuple[Any, ...]


class CurveBendMathTests(unittest.TestCase):
    def bends(self, operations):
        return joints._curve_bends(FakeRecord(operations=tuple(operations)), 1000)

    def test_straight_rectangle_has_no_curves(self):
        ops = [("moveTo", ((0.0, 0.0),)), ("lineTo", ((100.0, 0.0),)), ("lineTo", ((100.0, 400.0),)), ("lineTo", ((0.0, 400.0),)), ("closePath", ())]
        self.assertEqual(self.bends(ops), [])

    def test_long_bend_reports_chord_and_bulge(self):
        # (0,0)→제어(300,200)→(0,400): 현 400, bulge = 제어점의 현(수직선 x=0)까지 거리 300.
        ops = [("moveTo", ((0.0, 0.0),)), ("qCurveTo", ((300.0, 200.0), (0.0, 400.0)))]
        bends = self.bends(ops)
        self.assertEqual(len(bends), 1)
        self.assertAlmostEqual(bends[0]["chord"], 400.0, places=1)
        self.assertAlmostEqual(bends[0]["bulge"], 300.0, places=1)
        self.assertGreater(bends[0]["chord"], joints.SHORT_CHORD)

    def test_short_rounding_is_below_chord_threshold(self):
        # 짧은 코너 라운딩: 현 ~57u.
        ops = [("moveTo", ((0.0, 0.0),)), ("qCurveTo", ((40.0, 0.0), (40.0, 40.0)))]
        bends = self.bends(ops)
        self.assertEqual(len(bends), 1)
        self.assertLess(bends[0]["chord"], joints.SHORT_CHORD)


@unittest.skipUnless((CORPUS / "reports/all.json").is_file(), "corpus unavailable")
class CorpusJointTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        report = json.load(open(CORPUS / "reports/all.json", encoding="utf-8"))
        cls.rows = {r["identity"]["character"]: r for r in report["cases"]}
        cls.upm = int(report["font"]["unitsPerEm"])

    def measure(self, character):
        row = self.rows[character]
        outline = json.load(open(CORPUS / row["stages"]["outline"]["artifact"], encoding="utf-8"))["payload"]
        components = {}
        for stage in ("initial", "final"):
            components[stage] = (
                json.load(open(CORPUS / row["stages"][stage]["artifact"], encoding="utf-8"))["payload"]
                if row["stages"][stage]["status"] == "candidate" else None
            )
        return joints.measure_character(row, outline, components, self.upm)

    def test_giyeok_is_a_long_curved_stroke_not_a_fillet(self):
        initial = self.measure("각")["components"]["initial"]
        self.assertEqual(initial["shortRoundingCount"], 0)
        self.assertGreaterEqual(initial["longBendCount"], 1)
        self.assertGreater(initial["longBendBulgeMedian"], 50.0)

    def test_bieup_is_straight_rectangles_no_curves(self):
        initial = self.measure("밥")["components"]["initial"]
        self.assertEqual(initial["curveCount"], 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
