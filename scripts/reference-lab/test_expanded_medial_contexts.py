#!/usr/bin/env python3
"""나머지 18홀자 받침 문맥 확장의 계약·앵커·기존 ID 보존 검증."""

from pathlib import Path
import unittest

import final_component_contract as final_contract
import final_component_extractor as final
import initial_component_contract as contract
import initial_component_extractor as initial
import medial_guide_extractor as medial


FONT_PATH = Path(__file__).resolve().parents[2] / ".reference-fonts/NotoSansKR.ttf"


class ExpandedMedialContractTests(unittest.TestCase):
    def test_initial_contexts_cover_all_medial_final_pairs(self):
        self.assertEqual(len(contract.FINAL_CONTEXTS), 564)
        pairs = {(c["medialJamo"], c["finalJamo"]) for c in contract.FINAL_CONTEXTS}
        expected = {
            (m, f)
            for m in contract.ALL_MEDIALS
            for f in final_contract.FINAL_JAMOS
            if not (m in contract.P0_MEDIALS and f == "ㄱ")
        }
        self.assertEqual(pairs, expected)
        cases = contract.final_cases()
        self.assertEqual(len(cases), 10716)
        characters = {c["character"] for c in cases}
        no_final = {c["character"] for c in contract.no_final_cases()}
        p0 = {c["character"] for c in contract.p0_cases()}
        self.assertFalse(characters & no_final)
        self.assertFalse(characters & p0)
        self.assertEqual(len(characters | no_final | p0), 11172)

    def test_legacy_78_context_ids_are_unchanged(self):
        legacy = [c for c in contract.FINAL_CONTEXTS if "-medial-" not in c["id"]]
        self.assertEqual(len(legacy), 78)
        for context in legacy:
            self.assertIn(context["medialJamo"], contract.P0_MEDIALS)
            self.assertNotIn("baseBeamRole", context)

    def test_final_contract_derives_18_medial_contexts(self):
        self.assertEqual(len(final_contract.MEDIAL_CONTEXTS), 18)
        self.assertEqual(len(final_contract.expanded_medial_cases()), 9234)
        for context in final_contract.MEDIAL_CONTEXTS:
            family = final_contract.MEDIAL_FAMILY[str(context["medialJamo"])]
            self.assertTrue(str(context["id"]).startswith(family + "-final-medial-"))

    def test_mixed_anchors_follow_each_medials_actual_roles(self):
        # ㅢ는 baseStem이 없으므로 primaryBeam을 기준으로 앵커해야 한다.
        by_pair = {(c["medialJamo"], c["finalJamo"]): c for c in contract.FINAL_CONTEXTS}
        for medial_jamo, expected in (("ㅢ", "primaryBeam"), ("ㅝ", "upperBeam"), ("ㅙ", "lowerBeam"), ("ㅚ", "primaryBeam")):
            context = by_pair[(medial_jamo, "ㄴ")]
            self.assertEqual(
                initial._required_anchor_ids(context["id"]),
                (expected, "outerPillar"),
            )
        for medial_jamo in ("ㅐ", "ㅕ", "ㅣ"):
            self.assertEqual(initial._required_anchor_ids(by_pair[(medial_jamo, "ㄴ")]["id"]), ("outerPillar",))
        for medial_jamo in ("ㅛ", "ㅜ", "ㅡ"):
            self.assertEqual(initial._required_anchor_ids(by_pair[(medial_jamo, "ㄴ")]["id"]), ("primaryBeam",))

    def test_final_extractor_anchor_ids_for_expanded_contexts(self):
        by_medial = {str(c["medialJamo"]): c for c in final_contract.MEDIAL_CONTEXTS}
        self.assertEqual(final._required_anchor_ids(by_medial["ㅢ"]["id"]), ("primaryBeam", "outerPillar"))
        self.assertEqual(final._required_anchor_ids(by_medial["ㅓ"]["id"]), ("outerPillar",))
        self.assertEqual(final._required_anchor_ids(by_medial["ㅜ"]["id"]), ("primaryBeam",))
        # P0 문맥은 기존 규칙 위임을 유지한다.
        self.assertEqual(final._required_anchor_ids("mixed-final"), ("baseStem", "outerPillar"))


@unittest.skipUnless(FONT_PATH.is_file(), "Noto reference font unavailable")
class NotoExpandedMedialTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.font = medial.load_font(FONT_PATH)
        cls.initial_cases = {c["character"]: c for c in contract.final_cases()}
        cls.final_cases = {c["character"]: c for c in final_contract.expanded_medial_cases()}

    @classmethod
    def tearDownClass(cls):
        cls.font.close()

    def test_initial_candidates_across_all_families(self):
        for character in ("넌", "밸", "짐", "굔", "준", "픔", "흰", "궝", "꿴", "넣"):
            with self.subTest(character=character):
                case = self.initial_cases[character]
                result = initial.extract_initial_character(
                    self.font, character, case["initialJamo"], case["medialJamo"], case["finalJamo"], case["contextId"]
                )
                self.assertEqual(result["componentGroup"]["status"], "candidate")
                for side in contract.BOUND_SIDES:
                    self.assertEqual(result["roleFaces"][side]["status"], "candidate")

    def test_role_guards_block_final_body_disguise(self):
        # ㅠㅛㅜ 받침 문맥: 받침 몸체가 홀자 보·줄기를 위장하지 못한다.
        import hashlib
        sha = hashlib.sha256(FONT_PATH.read_bytes()).hexdigest()
        cases = (
            ("늆", "ㅠ", "ㅄ"),  # 이전: 모든 역할이 ㅂ 몸체 선택
            ("꾭", "ㅛ", "ㅂ"),  # 이전: primaryBeam이 ㅂ 윗면 선택
            ("훋", "ㅜ", "ㄷ"),  # 이전: primaryBeam이 ㄷ 윗면 선택
            ("훾", "ㅞ", "ㄲ"),  # 이전: 떨어진 팔보·안기둥이 받침 클러스터로 흡수
            ("휺", "ㅠ", "ㄶ"),  # 곡선 접합 bbox 오차 허용 확인
        )
        icases = {c["character"]: c for c in contract.final_cases()}
        fcases = {c["character"]: c for c in final_contract.expanded_medial_cases()}
        for character, medial_jamo, final_jamo in cases:
            with self.subTest(character=character):
                observation = medial.extract_medial_character(self.font, character, medial_jamo, final_jamo)
                medial_ids = {
                    element["face"]["evidence"]["contourId"]
                    for element in observation["elements"]
                    if element.get("face", {}).get("evidence")
                }
                icase = icases[character]
                initial_result = initial.extract_initial_character(
                    self.font, character, icase["initialJamo"], medial_jamo, final_jamo,
                    icase["contextId"], medial_observation=observation,
                )
                initial_ids = set((initial_result.get("componentGroup") or {}).get("value", {}).get("contourIds") or [])
                fcase = fcases[character]
                final_result = final.extract_final_character(
                    self.font, sha, {"wght": 400.0}, character,
                    fcase["initialJamo"], medial_jamo, final_jamo, fcase["contextId"],
                    medial_observation=observation,
                )
                final_ids = set((final_result.get("componentGroup") or {}).get("value", {}).get("contourIds") or [])
                self.assertTrue(initial_ids and final_ids)
                self.assertFalse(initial_ids & final_ids)
                self.assertFalse(medial_ids & final_ids)
                self.assertFalse(medial_ids & initial_ids)

    def test_final_candidates_across_all_families(self):
        import hashlib
        sha = hashlib.sha256(FONT_PATH.read_bytes()).hexdigest()
        for character in ("넌", "굔", "준", "픔", "흰", "궝", "꿴", "넋"):
            with self.subTest(character=character):
                case = self.final_cases[character]
                result = final.extract_final_character(
                    self.font, sha, {"wght": 400.0}, character,
                    case["initialJamo"], case["medialJamo"], case["finalJamo"], case["contextId"]
                )
                self.assertNotEqual(result.get("state"), "abstained")


if __name__ == "__main__":
    unittest.main(verbosity=2)
