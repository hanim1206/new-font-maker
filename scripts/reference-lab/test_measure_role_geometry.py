#!/usr/bin/env python3
"""역할면 곡률 측정 v2의 산식·불변성 검증."""

import json
import unittest
from pathlib import Path

import measure_role_geometry as geom


CORPUS = Path(__file__).resolve().parents[2] / ".reference-fonts/guide-corpus/251eae7645152d1705a55414"


class BowMathTests(unittest.TestCase):
    def test_straight_vertical_face_has_zero_bow(self):
        # x=200 직선 오른면, y 0~500 막대.
        polygon = [(120.0, 0.0), (200.0, 0.0), (200.0, 500.0), (120.0, 500.0), (120.0, 0.0)]
        bow = geom.face_bow(polygon, "vertical", 200.0, (0.0, 500.0))
        self.assertIsNotNone(bow)
        self.assertLess(bow, 0.5)

    def test_bowed_vertical_face_reports_deviation(self):
        # 오른면이 중앙에서 30 안쪽으로 굽은 막대.
        polygon = [(120.0, 0.0), (200.0, 0.0), (200.0, 100.0), (170.0, 250.0), (200.0, 400.0), (200.0, 500.0), (120.0, 500.0), (120.0, 0.0)]
        bow = geom.face_bow(polygon, "vertical", 200.0, (0.0, 500.0))
        self.assertIsNotNone(bow)
        self.assertGreater(bow, 20.0)

    def test_short_span_is_not_measured(self):
        polygon = [(0.0, 0.0), (200.0, 0.0), (200.0, 500.0), (0.0, 500.0), (0.0, 0.0)]
        self.assertIsNone(geom.face_bow(polygon, "vertical", 200.0, (0.0, 10.0)))

    def test_nearest_crossing_picks_face_side(self):
        self.assertEqual(geom._nearest_crossing([120.0, 200.0], 200.0), 200.0)
        self.assertIsNone(geom._nearest_crossing([], 200.0))


@unittest.skipUnless((CORPUS / "reports/all.json").is_file(), "corpus unavailable")
class CorpusGeometryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        report = json.load(open(CORPUS / "reports/all.json", encoding="utf-8"))
        cls.rows = {r["identity"]["character"]: r for r in report["cases"]}
        cls.upm = int(report["font"]["unitsPerEm"])

    def measure(self, character):
        row = self.rows[character]
        outline = json.load(open(CORPUS / row["stages"]["outline"]["artifact"], encoding="utf-8"))["payload"]
        medial = (
            json.load(open(CORPUS / row["stages"]["medial"]["artifact"], encoding="utf-8"))["payload"]
            if row["stages"]["medial"]["status"] == "candidate" else None
        )
        return geom.measure_character(row, outline, medial, self.upm)

    def test_gothic_straight_faces_have_small_bow(self):
        for character in ("가", "고", "노", "이"):
            with self.subTest(character=character):
                roles = self.measure(character)["medialRoles"]
                for role_id, role in roles.items():
                    if role.get("bow") is not None:
                        self.assertLess(role["bow"], 8.0, (character, role_id))

    def test_non_candidate_medial_reports_reason(self):
        # 넖: 홀자 일부 누락(후보 아님) → 이유만 남기고 값 없음.
        self.assertEqual(self.measure("넖"), {"reasonCode": "medial-not-candidate"})


if __name__ == "__main__":
    unittest.main(verbosity=2)
