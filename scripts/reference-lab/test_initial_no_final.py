#!/usr/bin/env python3
"""무받침 전수 문맥의 직접 관측과 역할 충돌 차단 검증."""

from copy import deepcopy
from pathlib import Path
import unittest

from fontTools.pens.boundsPen import BoundsPen

import initial_component_contract as contract
import initial_component_extractor as initial
import medial_guide_extractor as medial


FONT_PATH = Path(__file__).resolve().parents[2] / ".reference-fonts/NotoSansKR.ttf"


class NoFinalContractTests(unittest.TestCase):
    def test_all_399_contexts_preserve_the_original_57_requests(self):
        cases = contract.no_final_cases()
        self.assertEqual(len(cases), 399)
        self.assertEqual(len({case["character"] for case in cases}), 399)
        self.assertEqual(len(contract.EXPANDED_NO_FINAL_CONTEXT_IDS), 18)
        by_character = {case["character"]: case for case in cases}
        for old in contract.p0_cases():
            if old["finalJamo"] is None:
                self.assertEqual(old, by_character[old["character"]])
        for case in cases:
            self.assertIsNone(case["finalJamo"])
            initial._validate_identity(case["character"], case["initialJamo"], case["medialJamo"], None, case["contextId"])

    def test_expanded_contexts_do_not_accept_different_syllables_or_finals(self):
        case = next(case for case in contract.no_final_cases() if case["character"] == "걔")
        for character, medial_jamo, final_jamo, context_id in (
            ("갸", "ㅒ", None, case["contextId"]),
            ("걔", "ㅑ", None, case["contextId"]),
            ("걕", "ㅒ", "ㄱ", case["contextId"]),
            ("걔", "ㅒ", None, "right"),
            ("걔", "ㅒ", None, "right-medial-dead"),
        ):
            with self.subTest(character=character, context=context_id), self.assertRaises(ValueError):
                initial._validate_identity(character, "ㄱ", medial_jamo, final_jamo, context_id)
        # 홀자 21종 확장 이후 compose_syllable도 무받침 조합을 만들 수 있다.
        # 두 경로의 결과가 같아야 identity 검증이 어긋나지 않는다.
        self.assertEqual(
            contract.compose_syllable("ㄱ", "ㅒ", None),
            contract.compose_no_final_syllable("ㄱ", "ㅒ"),
        )

    def test_mixed_anchor_uses_each_medials_actual_base_beam(self):
        faces = {key: {"value": value} for key, value in {"lowerBeam": 700, "upperBeam": 500, "primaryBeam": 600}.items()}
        for context in contract.NO_FINAL_CONTEXTS:
            if context["id"] not in contract.EXPANDED_NO_FINAL_CONTEXT_IDS or context["baseBeamRole"] is None:
                continue
            with self.subTest(medial=context["medialJamo"]):
                self.assertEqual(initial._mixed_base_anchor(faces, context["id"]), faces[context["baseBeamRole"]]["value"])
                self.assertIsNone(initial._mixed_base_anchor({}, context["id"]))


@unittest.skipUnless(FONT_PATH.is_file(), "Noto reference font unavailable")
class NotoNoFinalTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.font = medial.load_font(FONT_PATH)

    @classmethod
    def tearDownClass(cls):
        cls.font.close()

    def test_all_399_roles_account_for_raw_contours_or_explicitly_abstain(self):
        candidate_count = 0
        abstained = []
        glyph_set = self.font.getGlyphSet()
        scale = 1000 / self.font["head"].unitsPerEm
        for case in contract.no_final_cases():
            with self.subTest(character=case["character"]):
                observed_medial = medial.extract_medial_character(self.font, case["character"], case["medialJamo"], None)
                observed = initial.extract_initial_character(
                    self.font, case["character"], case["initialJamo"], case["medialJamo"], None,
                    case["contextId"], medial_observation=observed_medial,
                )
                if observed["selectionArea"]["status"] != "candidate":
                    abstained.append(case["character"])
                    self.assertEqual(observed["componentGroup"]["reasonCode"], "medial-anchor-role-conflict")
                    self.assertNotIn("value", observed["selectionArea"])
                    continue
                candidate_count += 1
                self.assertTrue(all(observed["roleFaces"][side]["status"] == "candidate" for side in contract.BOUND_SIDES))
                group = observed["componentGroup"]["value"]
                initial_ids = set(group["contourIds"])
                medial_ids = {element["face"]["evidence"]["contourId"] for element in observed_medial["elements"]}
                self.assertFalse(initial_ids & medial_ids)
                recorder = medial.DecomposingRecordingPen(glyph_set)
                glyph_set[observed["glyphName"]].draw(recorder)
                contours = medial.split_contours(recorder.value)
                # 홀자 윤곽과 좌표·면적이 같은 중복 윤곽(예: 껴의 ㅕ 기둥 복제)은
                # 홀자 몫으로 회계한다. 초성으로 새면 안 된다.
                records = {record.contour_id: record for record in initial._contour_records(recorder.value, self.font["head"].unitsPerEm)}
                accounted = set(initial._duplicate_medial_contours(list(records.values()), set(medial_ids)))
                self.assertFalse(initial_ids & accounted)
                self.assertEqual(initial_ids | accounted, set(range(len(contours))))
                pen = BoundsPen(None)
                for contour_id in initial_ids:
                    medial._replay(contours[contour_id], pen)
                x0, y0, x1, y1 = pen.bounds
                expected = {"left": x0 * scale, "right": x1 * scale, "top": 880 - y1 * scale, "bottom": 880 - y0 * scale}
                for side, value in expected.items():
                    self.assertEqual(observed["inkBounds"][side]["value"], round(value, 3))
                self.assertNotIn("approved", observed)
        self.assertEqual(candidate_count, 399)
        self.assertEqual(abstained, [])

    def test_incomplete_medial_roles_cannot_supply_initial_bounds(self):
        case = next(case for case in contract.no_final_cases() if case["character"] == "걔")
        source = medial.extract_medial_character(self.font, "걔", "ㅒ", None)
        for change in ("missing-role", "empty-span", "invalid-span"):
            observation = deepcopy(source)
            if change == "missing-role":
                observation["elements"].pop()
            elif change == "empty-span":
                observation["elements"][0]["visibleSpans"]["value"] = []
            else:
                observation["elements"][0]["visibleSpans"]["value"] = [{"from": float("nan"), "to": 500}]
            with self.subTest(change=change):
                result = initial.extract_initial_character(self.font, "걔", "ㄱ", "ㅒ", None, case["contextId"], medial_observation=observation)
                self.assertEqual(result["selectionArea"]["reasonCode"], "medial-anchor-unavailable")

    def test_duplicate_medial_stem_does_not_leak_into_initial(self):
        # 껴는 ㅕ 세로기둥이 동일 윤곽 둘(c0·c7)로 그려져 있다. 홀자가 하나만
        # evidence로 잡아도 중복 c7이 첫닿밑선으로 새면 안 된다. 형제 끼와 같은
        # baseline 위 값이어야 하고, 초성 선택에 중복 기둥이 포함되면 안 된다.
        case = next(case for case in contract.no_final_cases() if case["character"] == "껴")
        observation = medial.extract_medial_character(self.font, "껴", "ㅕ", None)
        result = initial.extract_initial_character(self.font, "껴", "ㄲ", "ㅕ", None, case["contextId"], medial_observation=observation)
        self.assertEqual(result["componentGroup"]["status"], "candidate")
        self.assertEqual(result["componentGroup"]["value"]["contourIds"], [3, 4, 5, 6])
        bottom = result["roleFaces"]["bottom"]["value"]
        self.assertLess(bottom, 880.0)  # baseline 위
        self.assertAlmostEqual(bottom, 812.5, delta=1.0)  # 끼와 같은 ㄲ 바닥

    def test_role_conflict_does_not_invent_a_missing_paired_body(self):
        case = next(case for case in contract.no_final_cases() if case["character"] == "뼤")
        observation = medial.extract_medial_character(self.font, "뼤", "ㅖ", None)
        result = initial.extract_initial_character(self.font, "뼤", "ㅃ", "ㅖ", None, case["contextId"], medial_observation=observation)
        self.assertEqual(result["componentGroup"]["status"], "candidate")
        self.assertEqual(result["componentGroup"]["value"]["contourIds"], [0, 1, 2, 3])
        self.assertEqual(result["componentGroup"]["value"]["holeContourIds"], [1, 3])
        upper = next(element for element in observation["elements"] if element["elementId"] == "upperBeam")
        self.assertEqual(upper["face"]["evidence"]["contourId"], 5)
        self.assertEqual(upper["face"]["value"], 274.239)

        # 과거의 역할 오염을 주입해도 첫닿자 구조 검증을 우회할 수 없다.
        for field in ("face", "visibleSpans"):
            upper[field]["evidence"]["contourId"] = 2
        result = initial.extract_initial_character(self.font, "뼤", "ㅃ", "ㅖ", None, case["contextId"], medial_observation=observation)
        self.assertEqual(result["componentGroup"]["status"], "abstained")
        self.assertEqual(result["componentGroup"]["reasonCode"], "medial-anchor-role-conflict")
        self.assertNotIn("value", result["selectionArea"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
