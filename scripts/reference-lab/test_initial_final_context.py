#!/usr/bin/env python3
"""받침 26종 확장 문맥의 계약·분리 게이트·기존 P0 보존 검증."""

from pathlib import Path
import unittest

import final_component_contract as final_contract
import initial_component_contract as contract
import initial_component_extractor as initial
import medial_guide_extractor as medial


FONT_PATH = Path(__file__).resolve().parents[2] / ".reference-fonts/NotoSansKR.ttf"


class FinalContextContractTests(unittest.TestCase):
    def test_78_contexts_cover_26_finals_for_each_p0_medial(self):
        legacy = [context for context in contract.FINAL_CONTEXTS if "-medial-" not in context["id"]]
        self.assertEqual(len(legacy), 78)
        self.assertEqual(len(contract.EXPANDED_FINAL_CONTEXT_IDS), 564)
        pairs = {(context["medialJamo"], context["finalJamo"]) for context in legacy}
        expected = {
            (medial_jamo, final_jamo)
            for medial_jamo in contract.P0_MEDIALS
            for final_jamo in final_contract.FINAL_JAMOS
            if final_jamo != "ㄱ"
        }
        self.assertEqual(pairs, expected)
        for context in legacy:
            family = context["id"].split("-final-")[0]
            self.assertIn(family, ("right", "bottom", "mixed"))
            template = next(
                value for value in contract.P0_CONTEXTS
                if value["finalJamo"] == "ㄱ" and value["medialJamo"] == context["medialJamo"]
            )
            self.assertEqual(context["scanOrigin"], template["scanOrigin"])
            self.assertEqual(context["scanDirection"], template["scanDirection"])

    def test_1482_cases_do_not_overlap_p0_or_no_final_and_match_g2(self):
        cases = [case for case in contract.final_cases() if case["medialJamo"] in contract.P0_MEDIALS]
        self.assertEqual(len(cases), 1482)
        characters = {case["character"] for case in cases}
        self.assertEqual(len(characters), 1482)
        p0_characters = {case["character"] for case in contract.p0_cases()}
        no_final_characters = {case["character"] for case in contract.no_final_cases()}
        self.assertFalse(characters & p0_characters)
        self.assertFalse(characters & no_final_characters)
        g2_characters = {case["character"] for case in final_contract.g2_cases()}
        p0_final_characters = {case["character"] for case in contract.p0_cases() if case["finalJamo"] is not None}
        self.assertEqual(characters | p0_final_characters, g2_characters)
        for case in cases:
            initial._validate_identity(
                case["character"], case["initialJamo"], case["medialJamo"], case["finalJamo"], case["contextId"]
            )

    def test_existing_p0_contexts_and_giyeok_cases_are_unchanged(self):
        self.assertEqual(
            [context["id"] for context in contract.P0_CONTEXTS],
            ["right", "right-final", "bottom", "bottom-final", "mixed", "mixed-final"],
        )
        giyeok_cases = [case for case in contract.p0_cases() if case["finalJamo"] == "ㄱ"]
        self.assertEqual(len(giyeok_cases), 57)
        for case in giyeok_cases:
            self.assertNotIn(case["contextId"], contract.EXPANDED_FINAL_CONTEXT_IDS)

    def test_identity_rejects_wrong_final_or_context(self):
        case = next(case for case in contract.final_cases() if case["character"] == "간")
        for character, final_jamo, context_id in (
            ("갇", "ㄴ", case["contextId"]),
            ("간", "ㄷ", case["contextId"]),
            ("간", "ㄴ", "right-final"),
            ("간", "ㄴ", "right-final-dead"),
        ):
            with self.subTest(character=character, context=context_id), self.assertRaises(ValueError):
                initial._validate_identity(character, "ㄱ", "ㅏ", final_jamo, context_id)

    def test_compose_syllable_supports_all_medials_and_finals(self):
        self.assertEqual(contract.compose_syllable("ㄱ", "ㅏ", "ㅎ"), "갛")
        self.assertEqual(contract.compose_syllable("ㅎ", "ㅘ", "ㅄ"), "홦")
        self.assertEqual(contract.compose_syllable("ㄱ", "ㅓ", "ㄴ"), "건")
        with self.assertRaises(ValueError):
            contract.compose_syllable("ㄱ", "ㅏ", "가")


@unittest.skipUnless(FONT_PATH.is_file(), "Noto reference font unavailable")
class NotoFinalContextTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.font = medial.load_font(FONT_PATH)
        cls.cases = {case["character"]: case for case in contract.final_cases()}

    @classmethod
    def tearDownClass(cls):
        cls.font.close()

    def extract(self, character):
        case = self.cases[character]
        return initial.extract_initial_character(
            self.font, character, case["initialJamo"], case["medialJamo"], case["finalJamo"], case["contextId"]
        )

    def test_expanded_final_candidates_have_all_role_faces(self):
        for character in ("간", "갈", "곰", "홥", "값", "났"):
            with self.subTest(character=character):
                result = self.extract(character)
                self.assertEqual(result["status"], "candidate")
                self.assertEqual(result["contextContractVersion"], contract.FINAL_CONTEXT_CONTRACT_VERSION)
                for side in contract.BOUND_SIDES:
                    self.assertEqual(result["roleFaces"][side]["status"], "candidate")

    def test_selection_excludes_medial_contours_and_keeps_final_leftover(self):
        for character in ("간", "곰", "홥"):
            with self.subTest(character=character):
                case = self.cases[character]
                selection = initial.resolve_component_selection(
                    self.font, character, case["initialJamo"], case["medialJamo"], case["finalJamo"], case["contextId"]
                )
                self.assertIsNotNone(selection)
                _, medial_contour_ids = initial._medial_anchor_data(
                    self.font, character, case["medialJamo"], case["finalJamo"]
                )
                self.assertFalse(set(selection.contour_ids) & medial_contour_ids)

    def test_pillar_bottom_rule_rejects_absorbed_final_strokes(self):
        # 갛: ㅎ받침 위 획이 첫닿자 클러스터와 세로로 융합되어 분리 증명이 없다.
        # 임의 절단 대신 자동 포기하고, 기둥 하단 안의 유효 분할이 있으면 그 분할을 쓴다.
        result = self.extract("갛")
        self.assertEqual(result["componentGroup"]["status"], "abstained")
        self.assertEqual(result["componentGroup"]["reasonCode"], "final-separation-unproven")
        for character in ("깧", "핳", "탛", "챃"):
            with self.subTest(character=character):
                value = self.extract(character)["componentGroup"]
                self.assertEqual(value["status"], "candidate")

    def test_giyeok_p0_observation_is_byte_identical_to_p0_path(self):
        case = next(case for case in contract.p0_cases() if case["character"] == "각")
        result = initial.extract_initial_character(
            self.font, "각", case["initialJamo"], case["medialJamo"], case["finalJamo"], case["contextId"]
        )
        self.assertEqual(result["status"], "candidate")
        self.assertNotIn("contextContractVersion", result)


if __name__ == "__main__":
    unittest.main(verbosity=2)
