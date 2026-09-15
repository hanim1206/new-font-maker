#!/usr/bin/env python3
"""역할 두께 측정 패스의 산식·불변성 검증."""

import json
import unittest
from pathlib import Path

import measure_role_attributes as attrs


CORPUS = Path(__file__).resolve().parents[2] / ".reference-fonts/guide-corpus/251eae7645152d1705a55414"


class ThicknessMathTests(unittest.TestCase):
    def test_vertical_face_thickness_on_square(self):
        # 100~180 두께 80의 세로 막대. 오른면(180)에서 안쪽 두께는 80.
        polygon = [(100.0, 0.0), (180.0, 0.0), (180.0, 500.0), (100.0, 500.0), (100.0, 0.0)]
        thickness = attrs.measure_face_thickness([polygon], "vertical", "right", 180.0, (0.0, 500.0))
        self.assertAlmostEqual(thickness, 80.0, places=3)

    def test_horizontal_face_thickness_on_bar(self):
        polygon = [(0.0, 300.0), (600.0, 300.0), (600.0, 370.0), (0.0, 370.0), (0.0, 300.0)]
        thickness = attrs.measure_face_thickness([polygon], "horizontal", "top", 300.0, (0.0, 600.0))
        self.assertAlmostEqual(thickness, 70.0, places=3)

    def test_missing_ink_returns_none_not_a_guess(self):
        polygon = [(0.0, 0.0), (10.0, 0.0), (10.0, 10.0), (0.0, 10.0), (0.0, 0.0)]
        self.assertIsNone(
            attrs.measure_face_thickness([polygon], "vertical", "right", 500.0, (0.0, 10.0))
        )

    def test_ink_intervals_pair_even_odd(self):
        self.assertEqual(attrs._ink_intervals([5.0, 1.0, 9.0, 7.0]), [(1.0, 5.0), (7.0, 9.0)])


@unittest.skipUnless((CORPUS / "reports/all.json").is_file(), "corpus unavailable")
class CorpusThicknessTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        report = json.load(open(CORPUS / "reports/all.json", encoding="utf-8"))
        cls.rows = {r["identity"]["character"]: r for r in report["cases"]}

    def measure(self, character):
        row = self.rows[character]
        outline = json.load(open(CORPUS / row["stages"]["outline"]["artifact"], encoding="utf-8"))["payload"]
        components = {}
        for stage in ("initial", "final"):
            components[stage] = (
                json.load(open(CORPUS / row["stages"][stage]["artifact"], encoding="utf-8"))["payload"]
                if row["stages"][stage]["status"] == "candidate"
                else None
            )
        return attrs.measure_character(row, outline, components)

    def test_actual_noto_thickness_is_finite_and_plausible(self):
        for character in ("가", "간", "굔", "홥"):
            with self.subTest(character=character):
                result = self.measure(character)
                for role_id, role in result["medialRoles"].items():
                    self.assertIsNotNone(role["thickness"], role_id)
                    self.assertTrue(30.0 <= role["thickness"] <= 200.0, (role_id, role["thickness"]))
                for stage in ("initial", "final"):
                    component = result["components"][stage]
                    if "inkCoverage" in component:
                        self.assertTrue(0.05 <= component["inkCoverage"] <= 1.0)

    def test_non_candidate_medial_is_reported_not_filled(self):
        result = self.measure("넖")
        self.assertEqual(result["medialRoles"], {"reasonCode": "medial-not-candidate"})


if __name__ == "__main__":
    unittest.main(verbosity=2)
