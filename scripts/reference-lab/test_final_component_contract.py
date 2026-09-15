#!/usr/bin/env python3
"""Contract tests for final-component D0."""

import unittest

from final_component_contract import (
    BOUND_SIDES,
    CANDIDATE_LIFECYCLE,
    FINAL_JAMOS,
    INVALIDATION_SCOPE,
    MEMBER_SPECS,
    ROLE_FACE_SELECTION_RULE,
    VERIFICATION_STATES,
    compose_syllable,
    g0_cases,
    g2_cases,
    member_spec_for,
    selection_area_from_role_faces,
    structure_kind_for,
)


class FinalComponentContractTest(unittest.TestCase):
    def test_27_finals_have_one_structure_and_member_contract(self) -> None:
        self.assertEqual(len(FINAL_JAMOS), 27)
        self.assertEqual(len(MEMBER_SPECS), 27)
        self.assertEqual(len(set(FINAL_JAMOS)), 27)
        for final_jamo in FINAL_JAMOS:
            self.assertEqual(member_spec_for(final_jamo)["finalJamo"], final_jamo)
            self.assertIn(structure_kind_for(final_jamo)["id"], {"single", "doubled", "compound"})

    def test_doubled_and_compound_members_preserve_order(self) -> None:
        self.assertEqual(member_spec_for("ㄲ")["members"], [
            {"id": "left", "jamo": "ㄱ", "role": "left"},
            {"id": "right", "jamo": "ㄱ", "role": "right"},
        ])
        self.assertEqual(member_spec_for("ㄳ")["members"], [
            {"id": "left", "jamo": "ㄱ", "role": "left"},
            {"id": "right", "jamo": "ㅅ", "role": "right"},
        ])
        self.assertEqual(member_spec_for("ㅀ")["members"], [
            {"id": "left", "jamo": "ㄹ", "role": "left"},
            {"id": "right", "jamo": "ㅎ", "role": "right"},
        ])

    def test_g0_is_three_contexts_by_27_finals(self) -> None:
        cases = g0_cases()
        self.assertEqual(len(cases), 81)
        self.assertEqual(len({case["character"] for case in cases}), 81)
        self.assertEqual({case["contextId"] for case in cases}, {"right-final", "bottom-final", "mixed-final"})
        self.assertEqual({case["finalJamo"] for case in cases}, set(FINAL_JAMOS))
        self.assertEqual(cases[0]["character"], "각")
        self.assertEqual(compose_syllable("ㄱ", "ㅏ", "ㄳ"), "갃")

    def test_g2_is_19_initials_by_three_contexts_by_27_finals(self) -> None:
        cases = g2_cases()
        self.assertEqual(len(cases), 1539)
        identities = {
            (case["character"], case["initialJamo"], case["medialJamo"], case["finalJamo"], case["contextId"])
            for case in cases
        }
        self.assertEqual(len(identities), 1539)

    def test_role_faces_use_full_group_extrema(self) -> None:
        self.assertEqual(tuple(BOUND_SIDES), ("top", "bottom", "left", "right"))
        self.assertEqual(ROLE_FACE_SELECTION_RULE, "final-group-ink-extremum")
        self.assertEqual(
            selection_area_from_role_faces({"top": 650, "bottom": 950, "left": 120, "right": 780}),
            {"x": 120.0, "y": 650.0, "width": 660.0, "height": 300.0},
        )
        with self.assertRaisesRegex(ValueError, "네 받침 역할 단면"):
            selection_area_from_role_faces({"top": 650, "bottom": 950, "left": 120})
        with self.assertRaisesRegex(ValueError, "순서"):
            selection_area_from_role_faces({"top": 950, "bottom": 650, "left": 120, "right": 780})

    def test_candidate_and_verification_lifecycle_are_separate(self) -> None:
        self.assertEqual(CANDIDATE_LIFECYCLE, "candidate")
        self.assertEqual(VERIFICATION_STATES, ("verified", "rejected"))
        self.assertEqual(INVALIDATION_SCOPE, ("role", "structureKind", "contextId", "extractorVersion"))


if __name__ == "__main__":
    unittest.main()
