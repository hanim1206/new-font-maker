#!/usr/bin/env python3
"""Tests for final-component G0 candidate extraction and invariants."""

from __future__ import annotations

import json
import math
import unittest
from pathlib import Path

import evaluate_final_component_g0 as evaluator
import final_component_contract as contract
import final_component_extractor as extractor


PROJECT_ROOT = Path(__file__).resolve().parents[2]
FONT_PATH = PROJECT_ROOT / ".reference-fonts/NotoSansKR.ttf"
FIXTURE_PATH = PROJECT_ROOT / "reference-data/font-guide-calibrations/noto-sans-kr.final-component-g0.v1.json"
G1_FIXTURE_PATH = PROJECT_ROOT / "reference-data/font-guide-calibrations/nanum-gothic.final-component-g1.v1.json"
G1_FONT_PATH = PROJECT_ROOT / ".reference-fonts/NanumGothic-Regular.ttf"


class FinalComponentExtractorTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.response = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
        cls.evaluation = evaluator.evaluate_response(FONT_PATH, cls.response)

    def test_g0_has_exact_contract_order_and_candidate_lifecycle(self) -> None:
        self.assertEqual(contract.RESPONSE_SCHEMA, self.response["schema"])
        self.assertEqual("candidate", self.response["lifecycle"])
        self.assertEqual(81, len(self.response["cases"]))
        expected = [
            (case["character"], case["initialJamo"], case["medialJamo"], case["finalJamo"], case["contextId"])
            for case in contract.g0_cases()
        ]
        actual = [
            (
                case["identity"]["character"],
                case["identity"]["initialJamo"],
                case["identity"]["medialJamo"],
                case["identity"]["finalJamo"],
                case["identity"]["contextId"],
            )
            for case in self.response["cases"]
        ]
        self.assertEqual(expected, actual)
        self.assertTrue(all(case["state"] == "candidate" for case in self.response["cases"]))
        self.assertEqual({"wght": 400.0}, self.response["font"]["axes"])

    def test_four_geometry_layers_remain_separate_and_area_is_derived(self) -> None:
        for case in self.response["cases"]:
            self.assertIsNot(case["inkBounds"], case["axisFaces"])
            self.assertIsNot(case["axisFaces"], case["roleFaces"])
            role_values = {
                side: case["roleFaces"][side]["value"]
                for side in contract.BOUND_SIDES
            }
            expected = contract.selection_area_from_role_faces(role_values)
            for key, value in expected.items():
                self.assertTrue(math.isclose(value, case["selectionArea"]["value"][key], abs_tol=0.002))

    def test_two_member_finals_preserve_order_and_complete_provenance(self) -> None:
        for case in self.response["cases"]:
            spec = contract.member_spec_for(case["identity"]["finalJamo"])
            members = case["members"]
            self.assertEqual([item["id"] for item in spec["members"]], [item["id"] for item in members])
            contour_sets = [
                {fragment["contourId"] for fragment in member["boundaryFragments"]}
                for member in members
            ]
            self.assertTrue(all(contour_sets))
            self.assertEqual(set(), contour_sets[0].intersection(*contour_sets[1:])) if len(contour_sets) > 1 else None
            self.assertEqual(set(case["componentGroup"]["value"]["contourIds"]), set().union(*contour_sets))
            if spec["structureKind"] == "single":
                self.assertIsNone(case["memberRelation"])
            else:
                self.assertLess(case["memberRelation"]["leftAnchorX"], case["memberRelation"]["rightAnchorX"])
                self.assertTrue(case["memberRelation"]["boundaryPairs"])

    def test_structural_evaluator_finds_no_contamination_or_invalidated_family(self) -> None:
        self.assertEqual("pass", self.evaluation["structuralCheckStatus"])
        self.assertEqual([], self.evaluation["globalIssues"])
        self.assertEqual([], self.evaluation["issues"])
        self.assertEqual([], self.evaluation["invalidatedFamilies"])
        self.assertEqual("candidate-only", self.evaluation["supportStatus"])
        self.assertEqual("pending", self.evaluation["visualReviewStatus"])

    def test_candidate_contains_no_legacy_or_verification_fields(self) -> None:
        self.assertEqual([], list(evaluator._forbidden_paths(self.response)))  # pylint: disable=protected-access

    def test_collinear_nonoverlap_is_not_contact(self) -> None:
        self.assertIsNone(extractor._segments_intersection_kind((0, 0), (1, 0), (2, 0), (3, 0)))  # pylint: disable=protected-access
        self.assertEqual("touching", extractor._segments_intersection_kind((0, 0), (1, 0), (1, 0), (2, 0)))  # pylint: disable=protected-access
        self.assertEqual("overlapping", extractor._segments_intersection_kind((0, 0), (2, 0), (1, 0), (3, 0)))  # pylint: disable=protected-access

    def test_context_required_medial_anchor_contract_is_stable(self) -> None:
        faces = {
            "baseStem": {"evidence": {"contourId": 2}},
            "primaryBeam": {"evidence": {"contourId": 1}},
            "outerPillar": {"evidence": {"contourId": 3}},
        }
        self.assertEqual({1}, extractor._required_medial_contour_ids(faces, "bottom-final"))  # pylint: disable=protected-access
        self.assertEqual({3}, extractor._required_medial_contour_ids(faces, "right-final"))  # pylint: disable=protected-access
        self.assertEqual({2, 3}, extractor._required_medial_contour_ids(faces, "mixed-final"))  # pylint: disable=protected-access

    @unittest.skipUnless(FONT_PATH.is_file(), "Noto Sans KR reference font is unavailable")
    def test_contact_closed_medial_group_excludes_all_mixed_vowel_contours(self) -> None:
        from fontTools.pens.recordingPen import DecomposingRecordingPen
        import initial_component_extractor as initial
        import medial_guide_extractor as medial

        font = medial.load_font(FONT_PATH)
        try:
            character = contract.compose_syllable("ㅍ", "ㅘ", "ㄱ")
            glyph_name = (font.getBestCmap() or {})[ord(character)]
            recorder = DecomposingRecordingPen(font.getGlyphSet())
            font.getGlyphSet()[glyph_name].draw(recorder)
            records = initial._contour_records(  # pylint: disable=protected-access
                recorder.value,
                int(font["head"].unitsPerEm),
            )
            faces, all_medial_ids = initial._medial_anchor_data(  # pylint: disable=protected-access
                font,
                character,
                "ㅘ",
                "ㄱ",
            )
            protected = extractor._validated_medial_contour_ids(  # pylint: disable=protected-access
                faces,
                "mixed-final",
                records,
            )
            self.assertEqual(all_medial_ids, protected)
            final_selection, _ = extractor._final_selection(  # pylint: disable=protected-access
                records,
                protected,
                int(font["head"].unitsPerEm),
            )
            self.assertFalse(set(final_selection.contour_ids) & all_medial_ids)
        finally:
            font.close()


class FinalComponentG1HoldoutTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.response = json.loads(G1_FIXTURE_PATH.read_text(encoding="utf-8"))
        cls.evaluation = evaluator.evaluate_response(G1_FONT_PATH, cls.response, "G1")

    def test_g1_evaluates_all_cases_and_keeps_safe_abstentions(self) -> None:
        self.assertEqual(81, self.evaluation["caseCount"])
        self.assertEqual(75, self.evaluation["candidateCount"])
        self.assertEqual(6, self.evaluation["abstainedCount"])
        self.assertEqual({
            "merged-boundary-unresolved": 3,
            "medial-anchor-unavailable": 3,
        }, self.evaluation["abstainedReasonCounts"])
        self.assertEqual("pass", self.evaluation["structuralCheckStatus"])
        self.assertEqual([], self.evaluation["issues"])
        self.assertEqual([], self.evaluation["invalidatedFamilies"])


if __name__ == "__main__":
    unittest.main()
