#!/usr/bin/env python3
"""Tests for the initial component P0 contract."""

from __future__ import annotations

import unittest

import initial_component_contract as contract


class InitialComponentContractTests(unittest.TestCase):
    def test_contract_has_all_initials_and_six_directional_contexts(self) -> None:
        self.assertEqual(len(contract.INITIAL_JAMOS), 19)
        self.assertEqual(len(contract.P0_CONTEXTS), 6)
        self.assertEqual(
            tuple(context["id"] for context in contract.P0_CONTEXTS),
            ("right", "right-final", "bottom", "bottom-final", "mixed", "mixed-final"),
        )
        self.assertEqual(contract.MEDIAL_ANCHOR_EXTRACTOR_VERSION, "geometric-role-matcher-v9")
        self.assertEqual(contract.EXTRACTOR_VERSION, "initial-component-matcher-v3")
        self.assertEqual(
            contract.SELECTION_RULES,
            ("context-directed-contour-islands", "context-directed-merged-boundary"),
        )

    def test_p0_cases_are_complete_and_use_actual_final_identity(self) -> None:
        cases = contract.p0_cases()
        self.assertEqual(len(cases), 114)
        self.assertEqual(len({case["character"] for case in cases}), 114)
        self.assertEqual(
            [case["character"] for case in cases[:6]],
            ["가", "각", "고", "곡", "과", "곽"],
        )
        self.assertEqual(
            [case["character"] for case in cases[-6:]],
            ["하", "학", "호", "혹", "화", "확"],
        )

    def test_role_classes_cover_each_initial_once(self) -> None:
        classified = [
            initial_jamo
            for role_class in contract.ROLE_CLASSES
            for initial_jamo in role_class["initialJamos"]
        ]
        self.assertCountEqual(classified, contract.INITIAL_JAMOS)
        self.assertEqual(len(classified), len(set(classified)))
        self.assertEqual(contract.role_class_for("ㄹ")["horizontalRule"], "first-main-horizontal-endpoint")
        self.assertEqual(contract.role_class_for("ㄸ")["horizontalRule"], "paired-first-main-horizontal-endpoint")
        self.assertEqual(contract.role_class_for("ㅎ")["horizontalRule"], "body-main-horizontal-endpoint")

    def test_selection_area_is_derived_only_from_four_ordered_role_faces(self) -> None:
        self.assertEqual(
            contract.selection_area_from_role_faces({"top": 100, "bottom": 400, "left": 50, "right": 450}),
            {"x": 50.0, "y": 100.0, "width": 400.0, "height": 300.0},
        )
        with self.assertRaisesRegex(ValueError, "네 역할 단면"):
            contract.selection_area_from_role_faces({"top": 100, "bottom": 400, "left": 50})
        with self.assertRaisesRegex(ValueError, "경계 순서"):
            contract.selection_area_from_role_faces({"top": 400, "bottom": 100, "left": 50, "right": 450})


if __name__ == "__main__":
    unittest.main(verbosity=2)
