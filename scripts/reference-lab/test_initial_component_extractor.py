#!/usr/bin/env python3
"""Tests for context-directed initial component extraction."""

from __future__ import annotations

import math
import unittest
from pathlib import Path
from typing import Any, Iterable

from fontTools.pens.recordingPen import DecomposingRecordingPen

import initial_component_contract as contract
import initial_component_extractor as extractor
import medial_guide_extractor as medial


PROJECT_ROOT = Path(__file__).resolve().parents[2]
NOTO_PATH = PROJECT_ROOT / ".reference-fonts/NotoSansKR.ttf"


def finite_numbers(value: Any) -> Iterable[float]:
    if isinstance(value, bool):
        return
    if isinstance(value, (int, float)):
        yield float(value)
        return
    if isinstance(value, dict):
        for item in value.values():
            yield from finite_numbers(item)
        return
    if isinstance(value, list):
        for item in value:
            yield from finite_numbers(item)


@unittest.skipUnless(NOTO_PATH.is_file(), "Noto Sans KR reference font is unavailable")
class InitialComponentExtractorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.font = medial.load_font(NOTO_PATH)
        cls.response = extractor.generate_p0_response(
            cls.font,
            "noto-sans-kr",
            extractor._sha256_file(NOTO_PATH),  # pylint: disable=protected-access
            {"wght": 400},
        )

    @classmethod
    def tearDownClass(cls) -> None:
        cls.font.close()

    def test_structure_classes_cover_modern_initials_without_syllable_rules(self) -> None:
        self.assertEqual(set(extractor.INITIAL_STRUCTURE_SPECS), set(contract.INITIAL_JAMOS))
        self.assertEqual(
            {spec.class_id for spec in extractor.INITIAL_STRUCTURE_SPECS.values()},
            {
                "open-single",
                "open-paired-separated",
                "open-paired-connected",
                "counter-single",
                "counter-paired",
                "barred-diagonal",
                "marked-diagonal",
                "barred-frame",
                "marked-counter",
            },
        )
        self.assertTrue(all(len(key) == 1 and key in contract.INITIAL_JAMOS for key in extractor.INITIAL_STRUCTURE_SPECS))

    def test_noto_all_114_cases_have_deterministic_component_groups(self) -> None:
        cases = self.response["cases"]
        self.assertEqual(len(cases), 114)
        self.assertEqual(len({case["character"] for case in cases}), 114)
        self.assertTrue(all(case["status"] == "candidate" for case in cases))
        self.assertTrue(all(case["componentGroup"]["status"] == "candidate" for case in cases))
        self.assertTrue(all(math.isfinite(value) for value in finite_numbers(self.response)))

        for case in cases:
            with self.subTest(character=case["character"]):
                group = case["componentGroup"]
                self.assertRegex(group["value"]["selectedPathSha256"], r"^[0-9a-f]{64}$")
                self.assertRegex(case["pathSha256"], r"^[0-9a-f]{64}$")
                self.assertEqual(group["evidence"]["method"], contract.GROUPING_METHOD)
                self.assertEqual(group["evidence"]["selectionRule"], "context-directed-contour-islands")
                expected_context = next(
                    context for context in contract.P0_CONTEXTS
                    if context["id"] == case["contextId"]
                )
                self.assertEqual(group["evidence"]["scanOrigin"], expected_context["scanOrigin"])
                self.assertEqual(group["evidence"]["scanDirection"], expected_context["scanDirection"])

    def test_selection_area_is_exactly_derived_from_four_role_faces(self) -> None:
        for case in self.response["cases"]:
            with self.subTest(character=case["character"]):
                role_faces = {
                    side: case["roleFaces"][side]["value"]
                    for side in contract.BOUND_SIDES
                }
                area = case["selectionArea"]
                self.assertEqual(area["status"], "candidate")
                self.assertEqual(area["evidence"]["derivedFrom"], list(contract.BOUND_SIDES))
                self.assertAlmostEqual(area["value"]["x"], role_faces["left"], places=6)
                self.assertAlmostEqual(area["value"]["y"], role_faces["top"], places=6)
                self.assertAlmostEqual(area["value"]["width"], role_faces["right"] - role_faces["left"], places=6)
                self.assertAlmostEqual(area["value"]["height"], role_faces["bottom"] - role_faces["top"], places=6)

    def test_rieul_digeut_tieut_right_role_faces_stop_at_first_upper_bend_in_six_contexts(self) -> None:
        cases = [case for case in self.response["cases"] if case["initialJamo"] in {"ㄹ", "ㄷ", "ㅌ"}]
        self.assertEqual(len(cases), 18)
        for case in cases:
            with self.subTest(character=case["character"]):
                right_face = case["roleFaces"]["right"]
                self.assertEqual(right_face["status"], "candidate")
                self.assertEqual(right_face["evidence"]["roleClass"], "first-main-horizontal")
                self.assertEqual(right_face["evidence"]["selectionRule"], "first-main-horizontal-endpoint")
                self.assertLess(right_face["value"], case["inkBounds"]["right"]["value"])
                self.assertAlmostEqual(
                    case["selectionArea"]["value"]["x"] + case["selectionArea"]["value"]["width"],
                    right_face["value"],
                    places=6,
                )

    def test_counter_holes_stay_attached_and_curved_faces_abstain_independently(self) -> None:
        by_character = {case["character"]: case for case in self.response["cases"]}
        for character, expected_holes in (("마", 1), ("바", 1), ("빠", 2), ("아", 1), ("하", 1)):
            with self.subTest(character=character):
                group = by_character[character]["componentGroup"]["value"]
                self.assertEqual(len(group["holeContourIds"]), expected_holes)
                self.assertTrue(set(group["holeContourIds"]).issubset(group["contourIds"]))

        curved = by_character["아"]
        self.assertTrue(all(value["status"] == "abstained" for value in curved["axisFaces"].values()))
        self.assertTrue(all(value["status"] == "candidate" for value in curved["inkBounds"].values()))
        self.assertEqual(curved["selectionArea"]["status"], "candidate")

    def test_selected_contours_never_reuse_medial_anchor_contours(self) -> None:
        for case in self.response["cases"]:
            with self.subTest(character=case["character"]):
                glyph_name = case["glyphName"]
                glyph_set = self.font.getGlyphSet()
                recorder = DecomposingRecordingPen(glyph_set)
                glyph_set[glyph_name].draw(recorder)
                records = extractor._contour_records(  # pylint: disable=protected-access
                    recorder.value,
                    int(self.font["head"].unitsPerEm),
                )
                faces, medial_ids = extractor._medial_anchor_data(  # pylint: disable=protected-access
                    self.font,
                    case["character"],
                    case["medialJamo"],
                    case["finalJamo"],
                )
                self.assertTrue(all(anchor in faces for anchor in extractor._required_anchor_ids(case["contextId"])))  # pylint: disable=protected-access
                selected = set(case["componentGroup"]["value"]["contourIds"])
                self.assertTrue(selected.isdisjoint(medial_ids))
                self.assertTrue(selected.issubset({record.contour_id for record in records}))

    def test_response_contains_no_roi_or_legacy_guide_values(self) -> None:
        forbidden = {"roi", "initialTop", "initialBottom", "initialLeft", "initialRight", "legacyGuides"}

        def keys(value: Any) -> Iterable[str]:
            if isinstance(value, dict):
                for key, item in value.items():
                    yield key
                    yield from keys(item)
            elif isinstance(value, list):
                for item in value:
                    yield from keys(item)

        self.assertTrue(forbidden.isdisjoint(keys(self.response)))


if __name__ == "__main__":
    unittest.main(verbosity=2)
