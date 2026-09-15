#!/usr/bin/env python3
"""Tests for finite medial face extraction geometry."""

from __future__ import annotations

import json
import unittest
from pathlib import Path
from unittest import mock

from fontTools.pens.recordingPen import RecordingPen

import medial_guide_extractor as extractor
import evaluate_medial_p1 as p1_evaluation


PROJECT_ROOT = Path(__file__).resolve().parents[2]
NOTO_PATH = PROJECT_ROOT / ".reference-fonts/NotoSansKR.ttf"
NANUM_PATH = PROJECT_ROOT / ".reference-fonts/NanumGothic-Regular.ttf"
G0_GOLD_PATH = PROJECT_ROOT / "reference-data/font-guide-calibrations/noto-sans-kr.medial-g0.gold.v1.json"
G0_CASE_MEDIALS = {
    "가": "ㅏ", "각": "ㅏ", "거": "ㅓ", "걱": "ㅓ", "기": "ㅣ", "긱": "ㅣ",
    "고": "ㅗ", "곡": "ㅗ", "구": "ㅜ", "국": "ㅜ", "그": "ㅡ", "극": "ㅡ",
    "과": "ㅘ", "곽": "ㅘ",
}
G0_FINAL_CASES = {"각", "걱", "긱", "곡", "국", "극", "곽"}


def rectangle(pen: RecordingPen, x_min: float, y_min: float, x_max: float, y_max: float) -> None:
    pen.moveTo((x_min, y_max))
    pen.lineTo((x_max, y_max))
    pen.lineTo((x_max, y_min))
    pen.lineTo((x_min, y_min))
    pen.closePath()


def gold_projection(case):
    elements = []
    for element in case["elements"]:
        evidence = element["face"]["evidence"]
        face = {
            key: element["face"][key]
            for key in ("status", "value", "reasonCode")
            if key in element["face"]
        }
        face["referenceMode"] = evidence["referenceMode"]
        for key in ("referenceSide", "anchor", "maximumDeviation"):
            if key in evidence:
                face[key] = evidence[key]

        visible_spans = {
            key: element["visibleSpans"][key]
            for key in ("status", "value", "reasonCode")
            if key in element["visibleSpans"]
        }
        projected = {
            "elementId": element["elementId"],
            "orientation": element["orientation"],
            "faceSide": element["faceSide"],
            "face": face,
            "visibleSpans": visible_spans,
        }
        for key in ("componentSpans", "derived"):
            if key in element:
                projected[key] = element[key]
        elements.append(projected)
    return {"character": case["character"], "elements": elements}


class FaceGeometryTests(unittest.TestCase):
    def synthetic_left_beam(self, beams, *, pillar=True, slanted=False, medial="ㅓ", reverse=False):
        operations = []
        if pillar:
            pen = RecordingPen()
            if slanted:
                pen.moveTo((710, 830))
                pen.lineTo((795, 830))
                pen.lineTo((795, -70))
                pen.lineTo((740, -70))
                pen.closePath()
            else:
                rectangle(pen, 710, -70, 795, 830)
            operations.append(pen.value)
        for bounds in beams:
            pen = RecordingPen()
            rectangle(pen, *bounds)
            operations.append(pen.value)
        if reverse:
            operations.reverse()
        glyph = mock.Mock()
        glyph.draw.side_effect = lambda pen: extractor._replay(
            [operation for contour in operations for operation in contour], pen,
        )
        font = mock.MagicMock()
        font["head"].unitsPerEm = 1000
        font.getBestCmap.return_value = {ord("너"): "synthetic"}
        font.getGlyphSet.return_value = {"synthetic": glyph}
        return {
            element["elementId"]: element
            for element in extractor.extract_medial_character(font, "너", medial, None)["elements"]
        }

    def test_left_beam_before_fixed_roi_start_requires_actual_pillar_attachment(self) -> None:
        for reverse in (False, True):
            with self.subTest(reverse=reverse):
                elements = self.synthetic_left_beam([(430, 460, 739, 530)], reverse=reverse)
                beam = elements["primaryBeam"]
                self.assertEqual(beam["face"]["status"], "candidate")
                self.assertEqual(beam["face"]["value"], 350)
                self.assertEqual(beam["visibleSpans"]["value"], [{"from": 430, "to": 710}])
                self.assertEqual(beam["componentSpans"], [{"from": 430, "to": 739}])
                self.assertEqual(
                    beam["face"]["evidence"]["anchorContourId"],
                    elements["outerPillar"]["face"]["evidence"]["contourId"],
                )

    def test_left_beam_relaxation_rejects_detached_cap_and_unproven_pillar(self) -> None:
        for name, beams, options in (
            ("detached", [(430, 460, 709, 530)], {}),
            ("cap", [(430, 800, 739, 860)], {}),
            ("outside-bottom", [(430, -100, 739, -30)], {}),
            ("missing-pillar", [(430, 460, 739, 530)], {"pillar": False}),
            ("non-scalar-left-face", [(430, 460, 739, 530)], {"slanted": True}),
            ("wrong-medial-direction", [(430, 460, 739, 530)], {"medial": "ㅏ"}),
        ):
            with self.subTest(case=name):
                beam = self.synthetic_left_beam(beams, **options)["primaryBeam"]
                self.assertEqual(beam["face"]["status"], "abstained")
                self.assertEqual(beam["face"]["reasonCode"], "no-role-match")

    def test_equally_plausible_left_beams_still_abstain(self) -> None:
        beam = self.synthetic_left_beam([(430, 460, 739, 530), (430, 260, 739, 330)])["primaryBeam"]
        self.assertEqual(beam["face"]["status"], "abstained")
        self.assertEqual(beam["face"]["reasonCode"], "ambiguous-role-match")

    def test_all_21_medials_have_explicit_structure_role_contracts(self) -> None:
        expected = {
            "ㅏ": ("outerPillar", "primaryBeam"),
            "ㅐ": ("innerPillar", "outerPillar", "primaryBeam"),
            "ㅑ": ("outerPillar", "upperBeam", "lowerBeam"),
            "ㅒ": ("innerPillar", "outerPillar", "upperBeam", "lowerBeam"),
            "ㅓ": ("outerPillar", "primaryBeam"),
            "ㅔ": ("innerPillar", "outerPillar", "primaryBeam"),
            "ㅕ": ("outerPillar", "upperBeam", "lowerBeam"),
            "ㅖ": ("innerPillar", "outerPillar", "upperBeam", "lowerBeam"),
            "ㅗ": ("baseStem", "primaryBeam"),
            "ㅘ": ("baseStem", "outerPillar", "upperBeam", "lowerBeam"),
            "ㅙ": ("baseStem", "innerPillar", "outerPillar", "upperBeam", "lowerBeam"),
            "ㅚ": ("baseStem", "outerPillar", "primaryBeam"),
            "ㅛ": ("leftStem", "rightStem", "primaryBeam"),
            "ㅜ": ("baseStem", "primaryBeam"),
            "ㅝ": ("baseStem", "outerPillar", "upperBeam", "lowerBeam"),
            "ㅞ": ("baseStem", "innerPillar", "outerPillar", "upperBeam", "lowerBeam"),
            "ㅟ": ("baseStem", "outerPillar", "primaryBeam"),
            "ㅠ": ("leftStem", "rightStem", "primaryBeam"),
            "ㅡ": ("primaryBeam",),
            "ㅢ": ("outerPillar", "primaryBeam"),
            "ㅣ": ("outerPillar",),
        }

        self.assertEqual(set(extractor.MEDIAL_ROLE_SPECS), set(expected))
        self.assertEqual(
            {
                medial: tuple(role.element_id for role in roles)
                for medial, roles in extractor.MEDIAL_ROLE_SPECS.items()
            },
            expected,
        )

    def test_vertical_face_is_split_where_neighbor_hides_outer_side(self) -> None:
        pen = RecordingPen()
        rectangle(pen, 10, 0, 20, 100)
        rectangle(pen, 15, 40, 40, 60)
        result = extractor.extract_annotated_face(
            pen.value,
            extractor.FaceAnnotation("pillar", 0, "vertical", "right", "legacy"),
            units_per_em=1000,
            baseline_y=100,
        )

        self.assertEqual(result["face"]["value"], 20)
        self.assertEqual(result["componentSpans"], [{"from": 0, "to": 100}])
        self.assertEqual(
            result["visibleSpans"]["value"],
            [{"from": 0, "to": 40}, {"from": 60, "to": 100}],
        )
        self.assertEqual(result["derived"], {"extent": 100, "visibleLength": 80})

    def test_horizontal_face_is_split_by_vertical_neighbor(self) -> None:
        pen = RecordingPen()
        rectangle(pen, 0, 10, 100, 20)
        rectangle(pen, 40, 15, 60, 40)
        result = extractor.extract_annotated_face(
            pen.value,
            extractor.FaceAnnotation("beam", 0, "horizontal", "top", "legacy"),
            units_per_em=1000,
            baseline_y=100,
        )

        self.assertEqual(result["face"]["value"], 80)
        self.assertEqual(
            result["visibleSpans"]["value"],
            [{"from": 0, "to": 40}, {"from": 60, "to": 100}],
        )

    def test_curved_extreme_abstains_from_scalar_face(self) -> None:
        pen = RecordingPen()
        pen.moveTo((0, 0))
        pen.qCurveTo((50, 120), (100, 0))
        pen.lineTo((0, 0))
        pen.closePath()
        result = extractor.extract_annotated_face(
            pen.value,
            extractor.FaceAnnotation("beam", 0, "horizontal", "top", "legacy"),
            units_per_em=1000,
            baseline_y=100,
        )

        self.assertEqual(result["face"]["status"], "abstained")
        self.assertEqual(result["face"]["reasonCode"], "non-scalar-face")

    def test_explicit_start_side_uses_only_local_tangent_support(self) -> None:
        pen = RecordingPen()
        pen.moveTo((0, 0))
        pen.qCurveTo((50, 12), (100, 20))
        pen.lineTo((100, -20))
        pen.lineTo((0, 0))
        pen.closePath()
        result = extractor.extract_annotated_face(
            pen.value,
            extractor.FaceAnnotation(
                "beam",
                0,
                "horizontal",
                "top",
                "legacy",
                local_reference_side="left",
                local_segment_id=0,
            ),
            units_per_em=1000,
            baseline_y=100,
        )

        self.assertEqual(result["face"]["status"], "candidate")
        self.assertEqual(result["face"]["value"], 100)
        self.assertEqual(result["face"]["evidence"]["referenceMode"], "start-side-local-tangent")
        self.assertLess(result["visibleSpans"]["value"][0]["to"], 100)

    def test_explicit_start_side_overrides_unrelated_axis_aligned_extreme(self) -> None:
        pen = RecordingPen()
        pen.moveTo((0, 0))
        pen.qCurveTo((50, 12), (100, 20))
        pen.lineTo((100, 80))
        pen.lineTo((50, 80))
        pen.lineTo((50, -20))
        pen.closePath()
        ordinary = extractor.extract_annotated_face(
            pen.value,
            extractor.FaceAnnotation("beam", 0, "horizontal", "top", "legacy"),
            units_per_em=1000,
            baseline_y=100,
        )
        local = extractor.extract_annotated_face(
            pen.value,
            extractor.FaceAnnotation(
                "beam",
                0,
                "horizontal",
                "top",
                "legacy",
                local_reference_side="left",
            ),
            units_per_em=1000,
            baseline_y=100,
        )

        self.assertEqual(ordinary["face"]["value"], 20)
        self.assertEqual(local["face"]["value"], 100)
        self.assertEqual(local["face"]["evidence"]["referenceMode"], "start-side-local-tangent")


@unittest.skipUnless(NOTO_PATH.is_file(), "Noto G0 reference font is unavailable")
class NotoG0Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.font = extractor.load_font(NOTO_PATH)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.font.close()

    def element(self, character: str, element_id: str):
        case = extractor.extract_g0_character(self.font, character)
        return next(element for element in case["elements"] if element["elementId"] == element_id)

    def test_ga_pillar_and_beam_keep_only_visible_outer_face_intervals(self) -> None:
        pillar = self.element("가", "outerPillar")
        beam = self.element("가", "primaryBeam")

        self.assertEqual(round(pillar["face"]["value"]), 745)
        self.assertEqual(
            [[round(span["from"]), round(span["to"])] for span in pillar["visibleSpans"]["value"]],
            [[53, 420], [489, 957]],
        )
        self.assertEqual(round(beam["face"]["value"]), 420)
        self.assertEqual(
            [[round(span["from"]), round(span["to"])] for span in beam["visibleSpans"]["value"]],
            [[745, 889]],
        )

    def test_neo_recovers_actual_left_beam_without_fabricating_its_hidden_join(self) -> None:
        result = extractor.extract_medial_character(self.font, "너", "ㅓ", None)
        elements = {element["elementId"]: element for element in result["elements"]}
        beam = elements["primaryBeam"]
        self.assertEqual(beam["face"]["status"], "candidate")
        self.assertEqual(beam["face"]["value"], 351.379)
        self.assertEqual(beam["visibleSpans"]["value"], [{"from": 434.56, "to": 712.089}])
        self.assertEqual(beam["componentSpans"], [{"from": 434.56, "to": 739.399}])
        self.assertEqual(elements["outerPillar"]["face"]["value"], 795.011)
        self.assertEqual(beam["face"]["evidence"]["roleStrategy"], "left-beam-attached-to-selected-pillar")
        self.assertEqual(
            beam["face"]["evidence"]["anchorContourId"],
            elements["outerPillar"]["face"]["evidence"]["contourId"],
        )

    def test_eo_roles_repeat_across_all_initials_with_and_without_giyeok_final(self) -> None:
        for initial_index in range(19):
            for final_index, final_jamo in ((0, None), (1, "ㄱ")):
                character = chr(0xAC00 + (initial_index * 21 + 4) * 28 + final_index)
                with self.subTest(character=character):
                    result = extractor.extract_medial_character(self.font, character, "ㅓ", final_jamo)
                    self.assertEqual(len(result["elements"]), 2)
                    for element in result["elements"]:
                        self.assertEqual(element["face"]["status"], "candidate")
                        self.assertEqual(element["visibleSpans"]["status"], "candidate")
                        self.assertTrue(element["visibleSpans"]["value"])

    def test_guk_stem_exposes_only_between_beam_and_final(self) -> None:
        stem = self.element("국", "baseStem")

        self.assertEqual(round(stem["face"]["value"]), 500)
        self.assertEqual(
            [[round(span["from"]), round(span["to"])] for span in stem["visibleSpans"]["value"]],
            [[487, 652]],
        )
        self.assertEqual(
            [[round(span["from"]), round(span["to"])] for span in stem["componentSpans"]],
            [[466, 678]],
        )

    def test_g0_has_28_elements_and_both_approved_gwa_contexts_get_local_reference(self) -> None:
        fixture = [extractor.extract_g0_character(self.font, character) for character in extractor.G0_ANNOTATIONS]
        self.assertEqual(sum(len(case["elements"]) for case in fixture), 28)
        gwa = self.element("과", "lowerBeam")
        self.assertEqual(round(gwa["face"]["value"]), 691)
        self.assertEqual(gwa["face"]["evidence"]["referenceMode"], "start-side-local-tangent")
        self.assertEqual(
            [[round(span["from"]), round(span["to"])] for span in gwa["visibleSpans"]["value"]],
            [[41, 65]],
        )

        gwak = self.element("곽", "lowerBeam")
        self.assertEqual(round(gwak["face"]["value"]), 496)
        self.assertEqual(gwak["face"]["evidence"]["referenceMode"], "start-side-local-tangent")
        self.assertEqual(
            [[round(span["from"]), round(span["to"])] for span in gwak["visibleSpans"]["value"]],
            [[44, 98]],
        )

        for character, final_jamo in (("돠", None), ("돡", "ㄱ")):
            case = extractor.extract_medial_character(self.font, character, "ㅘ", final_jamo)
            lower_beam = next(element for element in case["elements"] if element["elementId"] == "lowerBeam")
            self.assertEqual(lower_beam["face"]["status"], "candidate")
            self.assertEqual(lower_beam["face"]["evidence"]["referenceMode"], "start-side-local-tangent")
            self.assertEqual(lower_beam["face"]["evidence"]["referenceSide"], "left")

    def test_current_extractor_matches_user_approved_analysis_gold(self) -> None:
        with G0_GOLD_PATH.open(encoding="utf-8") as source:
            gold = json.load(source)
        actual = extractor.generate_g0_fixture(NOTO_PATH)

        self.assertEqual(gold["schema"], "medial-guide-g0-analysis-gold-v1")
        self.assertEqual(gold["status"], "approved-analysis-gold")
        self.assertFalse(gold["productionEligible"])
        self.assertEqual(gold["font"]["fileSha256"], actual["fontFileSha256"])
        self.assertEqual(gold["roleDefinitionVersion"], actual["roleDefinitionVersion"])
        self.assertEqual(gold["extractorVersionAtApproval"], actual["method"])
        self.assertEqual(gold["scope"]["characterCount"], len(actual["cases"]))
        self.assertEqual(
            gold["scope"]["elementCount"],
            sum(len(case["elements"]) for case in actual["cases"]),
        )
        self.assertEqual(gold["cases"], [gold_projection(case) for case in actual["cases"]])

    def test_geometry_role_matcher_matches_gold_without_character_annotations(self) -> None:
        with G0_GOLD_PATH.open(encoding="utf-8") as source:
            gold = json.load(source)
        with mock.patch.object(extractor, "G0_ANNOTATIONS", {}):
            actual_cases = [
                extractor.extract_medial_character(
                    self.font,
                    gold_case["character"],
                    G0_CASE_MEDIALS[gold_case["character"]],
                    "ㄱ" if gold_case["character"] in G0_FINAL_CASES else None,
                )
                for gold_case in gold["cases"]
            ]

        self.assertEqual(gold["cases"], [gold_projection(case) for case in actual_cases])
        matches = [element["match"] for case in actual_cases for element in case["elements"]]
        self.assertEqual(len(matches), 28)
        self.assertTrue(all(match["status"] == "matched" for match in matches))
        self.assertTrue(all(match["confidence"] == "high" for match in matches))
        self.assertTrue(all(match["alternatives"] for match in matches))

    def test_p1_current_selects_double_beam_twin_stem_and_mixed_local_face(self) -> None:
        cases = (
            ("갹", "ㅑ", "ㄱ"),
            ("괙", "ㅙ", "ㄱ"),
            ("굑", "ㅛ", "ㄱ"),
            ("긕", "ㅢ", "ㄱ"),
        )
        results = {
            character: extractor.extract_medial_character(self.font, character, medial, final)
            for character, medial, final in cases
        }

        self.assertEqual(
            [round(element["face"]["value"]) for element in results["갹"]["elements"]],
            [752, 191, 385],
        )
        self.assertEqual(
            [element["elementId"] for element in results["굑"]["elements"]],
            ["leftStem", "rightStem", "primaryBeam"],
        )
        self.assertLess(
            results["굑"]["elements"][0]["face"]["value"],
            results["굑"]["elements"][1]["face"]["value"],
        )
        for character in results:
            self.assertTrue(all(
                element["face"]["status"] == "candidate"
                and element["visibleSpans"]["status"] == "candidate"
                for element in results[character]["elements"]
            ))
            self.assertTrue(all(
                element["face"]["evidence"]["method"] == extractor.P1_EXTRACTOR_VERSION
                for element in results[character]["elements"]
            ))
        mixed_lower = next(
            element for element in results["괙"]["elements"] if element["elementId"] == "lowerBeam"
        )
        self.assertEqual(mixed_lower["face"]["evidence"]["referenceMode"], "start-side-local-tangent")
        self.assertEqual(mixed_lower["face"]["evidence"]["referenceSide"], "left")

    def test_p1_twin_structure_rejects_initial_bar_and_selects_medial_beam(self) -> None:
        for character, medial_jamo, final_jamo, expected_range in (
            ("표", "ㅛ", None, (700, 850)),
            ("뀩", "ㅠ", "ㄱ", (350, 500)),
        ):
            with self.subTest(character=character):
                case = extractor.extract_medial_character(
                    self.font,
                    character,
                    medial_jamo,
                    final_jamo,
                )
                elements = {element["elementId"]: element for element in case["elements"]}
                self.assertTrue(all(
                    elements[element_id]["face"]["status"] == "candidate"
                    for element_id in ("leftStem", "rightStem", "primaryBeam")
                ))
                beam_value = elements["primaryBeam"]["face"]["value"]
                self.assertGreater(beam_value, expected_range[0])
                self.assertLess(beam_value, expected_range[1])
                self.assertEqual(
                    elements["primaryBeam"]["face"]["evidence"]["roleStrategy"],
                    "lower-main-beam-with-directional-paired-stems",
                )

    def test_p1_twin_stems_extend_past_beam_in_medial_direction(self) -> None:
        for character, medial_jamo, final_jamo, expected_stems in (
            ("교", "ㅛ", None, (332.601, 555.671)),
            ("굑", "ㅛ", "ㄱ", (339.75, 566.161)),
            ("규", "ㅠ", None, (343.551, 652.251)),
            ("귝", "ㅠ", "ㄱ", (351.741, 649.401)),
        ):
            with self.subTest(character=character):
                case = extractor.extract_medial_character(
                    self.font,
                    character,
                    medial_jamo,
                    final_jamo,
                )
                elements = {element["elementId"]: element for element in case["elements"]}
                beam_value = float(elements["primaryBeam"]["face"]["value"])
                self.assertEqual(
                    tuple(float(elements[stem_id]["face"]["value"]) for stem_id in ("leftStem", "rightStem")),
                    expected_stems,
                )
                for stem_id in ("leftStem", "rightStem"):
                    spans = elements[stem_id]["componentSpans"]
                    stem_start = min(float(span["from"]) for span in spans)
                    stem_end = max(float(span["to"]) for span in spans)
                    directional_reach = (
                        beam_value - stem_start
                        if medial_jamo == "ㅛ"
                        else stem_end - beam_value
                    )
                    self.assertGreaterEqual(
                        directional_reach,
                        extractor.MIN_TWIN_STEM_DIRECTIONAL_REACH,
                    )

    def test_p1_nonfinal_wo_side_beam_is_not_dropped_below_old_y_cutoff(self) -> None:
        case = extractor.extract_medial_character(self.font, "풔", "ㅝ", None)
        lower_beam = next(
            element for element in case["elements"] if element["elementId"] == "lowerBeam"
        )

        self.assertEqual(lower_beam["face"]["status"], "candidate")
        self.assertEqual(round(lower_beam["face"]["value"]), 690)
        self.assertEqual(
            lower_beam["face"]["evidence"]["roleStrategy"],
            "single-beam-attached-to-inner-pillar",
        )

    def test_p1_mixed_base_stems_attach_inside_their_selected_beams(self) -> None:
        base_medials = {"ㅙ", "ㅚ", "ㅝ", "ㅞ", "ㅟ"}
        for context in p1_evaluation.evaluation_cases("full"):
            if context["medialJamo"] not in base_medials:
                continue
            with self.subTest(character=context["character"]):
                case = extractor.extract_medial_character(
                    self.font,
                    context["character"],
                    context["medialJamo"],
                    context["finalJamo"],
                )
                elements = {element["elementId"]: element for element in case["elements"]}
                evidence = elements["baseStem"]["face"]["evidence"]
                self.assertGreaterEqual(
                    evidence["beamInteriorInset"],
                    evidence["minimumBeamInteriorInset"],
                )
                self.assertGreater(evidence["beamInteriorInset"], 0)

    def test_p1_noto_peu_wo_regression_selects_medial_base_structure(self) -> None:
        for character, final_jamo, expected_stem, expected_beam in (
            ("풔", None, 380, 556),
            ("풕", "ㄱ", 370, 437),
        ):
            with self.subTest(character=character):
                case = extractor.extract_medial_character(self.font, character, "ㅝ", final_jamo)
                elements = {element["elementId"]: element for element in case["elements"]}
                self.assertEqual(round(elements["baseStem"]["face"]["value"]), expected_stem)
                self.assertEqual(round(elements["upperBeam"]["face"]["value"]), expected_beam)
                self.assertEqual(
                    elements["baseStem"]["face"]["evidence"]["roleStrategy"],
                    "below-initial-base-beam-directional-interior-stem",
                )


@unittest.skipUnless(NANUM_PATH.is_file(), "Nanum Gothic G4 reference font is unavailable")
class NanumG4Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.font = extractor.load_font(NANUM_PATH)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.font.close()

    def elements(self, character: str, medial_jamo: str, final_jamo):
        case = extractor.extract_medial_character(self.font, character, medial_jamo, final_jamo)
        return {element["elementId"]: element for element in case["elements"]}

    def test_merged_outline_can_supply_pillar_and_beam_from_same_contour(self) -> None:
        elements = self.elements("다", "ㅏ", None)
        pillar = elements["outerPillar"]
        beam = elements["primaryBeam"]

        self.assertEqual(pillar["face"]["value"], 770)
        self.assertEqual(beam["face"]["value"], 432)
        self.assertEqual(pillar["face"]["evidence"]["contourId"], beam["face"]["evidence"]["contourId"])
        self.assertEqual(pillar["face"]["evidence"]["matchingUnit"], "axis-face-segment-group")
        self.assertEqual(beam["face"]["evidence"]["matchingUnit"], "axis-face-segment-group")

    def test_composite_mixed_final_uses_base_stem_join_for_lower_beam(self) -> None:
        elements = self.elements("돡", "ㅘ", "ㄱ")

        self.assertEqual(
            {element_id: round(elements[element_id]["face"]["value"]) for element_id in elements},
            {"baseStem": 370, "outerPillar": 767, "upperBeam": 392, "lowerBeam": 566},
        )
        lower = elements["lowerBeam"]
        self.assertEqual(lower["face"]["evidence"]["referenceMode"], "start-side-local-tangent")
        self.assertEqual(lower["face"]["evidence"]["referenceSide"], "left")

    def test_curved_nonfinal_lower_beam_abstains_instead_of_selecting_initial_bar(self) -> None:
        lower = self.elements("돠", "ㅘ", None)["lowerBeam"]

        self.assertEqual(lower["face"]["status"], "abstained")
        self.assertEqual(lower["face"]["reasonCode"], "no-role-match")

    def test_p1_rounded_mixed_base_beam_uses_visible_start_tangent(self) -> None:
        elements = self.elements("괘", "ㅙ", None)

        lower_beam = elements["lowerBeam"]
        self.assertEqual(lower_beam["face"]["status"], "candidate")
        self.assertEqual(round(lower_beam["face"]["value"]), 706)
        self.assertEqual(lower_beam["face"]["evidence"]["referenceMode"], "start-side-local-tangent")
        self.assertEqual(lower_beam["face"]["evidence"]["scanOrigin"], "below-initial-left-edge")
        self.assertTrue(all(
            elements[element_id]["face"]["status"] == "candidate"
            for element_id in ("baseStem", "innerPillar", "outerPillar", "upperBeam")
        ))

    def test_p1_final_context_selects_directional_twin_structure_not_final_bar(self) -> None:
        elements = self.elements("듁", "ㅠ", "ㄱ")

        self.assertTrue(all(
            elements[element_id]["face"]["status"] == "candidate"
            for element_id in ("leftStem", "rightStem", "primaryBeam")
        ))
        self.assertEqual(round(elements["primaryBeam"]["face"]["value"]), 528)
        self.assertEqual(round(elements["leftStem"]["face"]["value"]), 347)
        self.assertEqual(round(elements["rightStem"]["face"]["value"]), 654)

    def test_p1_scan_contract_repeats_across_reported_initial_variants(self) -> None:
        expected_roles = {
            "궥": ("baseStem", "innerPillar", "outerPillar", "upperBeam", "lowerBeam"),
            "뛔": ("baseStem", "innerPillar", "outerPillar", "upperBeam", "lowerBeam"),
            "뛕": ("baseStem", "innerPillar", "outerPillar", "upperBeam", "lowerBeam"),
            "뚀": ("leftStem", "rightStem", "primaryBeam"),
            "퓩": ("leftStem", "rightStem", "primaryBeam"),
        }
        medials = {"궥": "ㅞ", "뛔": "ㅞ", "뛕": "ㅞ", "뚀": "ㅛ", "퓩": "ㅠ"}
        finals = {"궥": "ㄱ", "뛔": None, "뛕": "ㄱ", "뚀": None, "퓩": "ㄱ"}

        for character, roles in expected_roles.items():
            with self.subTest(character=character):
                elements = self.elements(character, medials[character], finals[character])
                self.assertEqual(tuple(elements), roles)
                self.assertTrue(all(
                    element["face"]["status"] == "candidate"
                    and element["visibleSpans"]["status"] == "candidate"
                    for element in elements.values()
                ))

    def test_p1_mixed_scan_links_base_stem_to_base_beam_not_initial(self) -> None:
        elements = self.elements("뫠", "ㅙ", None)

        self.assertEqual(round(elements["baseStem"]["face"]["value"]), 313)
        self.assertEqual(round(elements["lowerBeam"]["face"]["value"]), 766)
        self.assertEqual(
            elements["baseStem"]["face"]["evidence"]["contourId"],
            elements["lowerBeam"]["face"]["evidence"]["contourId"],
        )
        self.assertEqual(
            elements["baseStem"]["face"]["evidence"]["roleStrategy"],
            "below-initial-base-beam-directional-interior-stem",
        )

    def test_p1_nonfinal_wo_side_beam_survives_low_mixed_layout(self) -> None:
        lower_beam = self.elements("풔", "ㅝ", None)["lowerBeam"]

        self.assertEqual(lower_beam["face"]["status"], "candidate")
        self.assertEqual(round(lower_beam["face"]["value"]), 714)


if __name__ == "__main__":
    unittest.main(verbosity=2)
