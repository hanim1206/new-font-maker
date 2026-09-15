#!/usr/bin/env python3
"""변화량 모델(v1 주효과·v2 상호작용)의 추정·예외·v1.2 판정·홀드아웃 검증."""

import json
import unittest
from itertools import product
from pathlib import Path

import build_variation_model as model


CORPUS = Path(__file__).resolve().parents[2] / ".reference-fonts/guide-corpus/251eae7645152d1705a55414"
INITIALS = ("ㄱ", "ㄴ", "ㄷ", "ㄹ")
MEDIALS = ("ㅏ", "ㅓ", "ㅣ")
FINALS = ("ㄱ", "ㄴ", "ㅅ")
# 모델은 효과 중앙값을 0으로 정규화하므로 합성 효과도 중앙값 0으로 둔다.
INITIAL_EFFECT = {"ㄱ": -6.0, "ㄴ": -2.0, "ㄷ": 2.0, "ㄹ": 9.0}
MEDIAL_EFFECT = {"ㅏ": -2.0, "ㅓ": 0.0, "ㅣ": 5.0}
FINAL_EFFECT = {"ㄱ": -3.0, "ㄴ": 0.0, "ㅅ": 12.0}
REPRESENTATIVE = 530.0


def additive_table():
    rows = []
    for index, (initial, medial, final) in enumerate(product(INITIALS, MEDIALS, FINALS)):
        value = REPRESENTATIVE + INITIAL_EFFECT[initial] + MEDIAL_EFFECT[medial] + FINAL_EFFECT[final]
        rows.append((f"c{index}", (initial, medial, final), value))
    return rows


class MedianPolishTests(unittest.TestCase):
    def test_recovers_exact_additive_effects(self):
        fitted = model.median_polish([(key, value) for _, key, value in additive_table()])
        self.assertAlmostEqual(fitted["representative"], REPRESENTATIVE, places=6)
        for factor, expected in (("initial", INITIAL_EFFECT), ("medial", MEDIAL_EFFECT), ("final", FINAL_EFFECT)):
            for level, effect in expected.items():
                self.assertAlmostEqual(fitted["effects"][factor][level], effect, places=6, msg=(factor, level))
        self.assertTrue(all(abs(residual) < 1e-6 for _, residual in fitted["residuals"]))

    def test_single_outlier_lands_in_residual_not_effects(self):
        rows = additive_table()
        rows[5] = (rows[5][0], rows[5][1], rows[5][2] + 80.0)
        fitted = model.median_polish([(key, value) for _, key, value in rows])
        self.assertAlmostEqual(fitted["representative"], REPRESENTATIVE, places=6)
        self.assertAlmostEqual(fitted["effects"]["initial"]["ㄹ"], 9.0, places=6)
        residuals = {key: residual for key, residual in fitted["residuals"]}
        self.assertAlmostEqual(residuals[rows[5][1]], 80.0, places=6)
        self.assertEqual(sum(1 for value in residuals.values() if abs(value) > 1e-6), 1)

    def test_effects_are_median_zero_normalized(self):
        rows = [(character, key, value + 100.0) for character, key, value in additive_table()]
        fitted = model.median_polish([(key, value) for _, key, value in rows])
        self.assertAlmostEqual(fitted["representative"], REPRESENTATIVE + 100.0, places=6)


class LayerModelTests(unittest.TestCase):
    def test_no_final_layer_has_zero_final_effect_and_low_confidence(self):
        rows = [
            (f"c{index}", (initial, medial, model.NO_FINAL), REPRESENTATIVE + INITIAL_EFFECT[initial] + MEDIAL_EFFECT[medial])
            for index, (initial, medial) in enumerate(product(INITIALS, MEDIALS))
        ]
        layer = model.build_layer_model(rows)
        self.assertEqual(layer["effects"]["final"], {model.NO_FINAL: 0.0})
        self.assertEqual(layer["confidence"], "low")
        self.assertEqual(layer["exceptions"]["10"]["count"], 0)
        self.assertEqual(layer["diagnosis"]["verdict"], "exceptions-preserved")
        # 무받침 층은 받침 수준이 하나이고 첫닿×홀자 셀당 관측이 1개라 뭉침을 진단할 수 없다.
        self.assertFalse(any(pair["diagnosable"] for pair in layer["pairCells"].values()))

    def test_undiagnosable_layer_never_becomes_interaction_candidate(self):
        rows = [
            (f"c{index}", (initial, medial, model.NO_FINAL), REPRESENTATIVE + INITIAL_EFFECT[initial] + MEDIAL_EFFECT[medial])
            for index, (initial, medial) in enumerate(product(INITIALS, MEDIALS))
        ]
        rows[0] = (rows[0][0], rows[0][1], rows[0][2] + 40.0)
        layer = model.build_layer_model(rows)
        self.assertGreater(layer["exceptions"]["10"]["ratio"], model.EXCEPTION_RATIO_LIMIT)
        self.assertEqual(layer["diagnosis"]["verdict"], "threshold-or-font-variation")

    def test_clustered_exceptions_become_interaction_candidate(self):
        rows = additive_table()
        # ㄹ×ㅅ 셀 전체가 30u 튐 → 예외 3/36 > 5%, 첫닿×받침 상위 셀에 전부 집중
        rows = [
            (character, key, value + (30.0 if key[0] == "ㄹ" and key[2] == "ㅅ" else 0.0))
            for character, key, value in rows
        ]
        layer = model.build_layer_model(rows)
        self.assertGreater(layer["exceptions"]["10"]["ratio"], model.EXCEPTION_RATIO_LIMIT)
        self.assertEqual(layer["diagnosis"]["verdict"], "interaction-candidate")
        self.assertIn("initial×final", layer["diagnosis"]["clusteredPairs"])
        top_cell = layer["pairCells"]["initial×final"]["topByExceptionCount"][0]
        self.assertEqual(top_cell["cell"], ["ㄹ", "ㅅ"])

    def test_dispersed_exceptions_are_threshold_or_font_variation(self):
        rows = additive_table()
        # 서로 다른 첫닿자·홀자·받침 조합 12개에 흩어진 큰 잔차. 어느 자모쌍 셀도 절반을 못 모은다.
        bumps = {
            ("ㄱ", "ㅏ", "ㄱ"), ("ㄴ", "ㅓ", "ㄴ"), ("ㄷ", "ㅣ", "ㅅ"), ("ㄹ", "ㅏ", "ㄴ"),
            ("ㄱ", "ㅓ", "ㅅ"), ("ㄴ", "ㅣ", "ㄱ"), ("ㄷ", "ㅏ", "ㄴ"), ("ㄹ", "ㅓ", "ㄱ"),
            ("ㄱ", "ㅣ", "ㄴ"), ("ㄴ", "ㅏ", "ㅅ"), ("ㄷ", "ㅓ", "ㄱ"), ("ㄹ", "ㅣ", "ㅅ"),
        }
        rows = [
            (character, key, value + (25.0 if key in bumps else 0.0))
            for character, key, value in rows
        ]
        layer = model.build_layer_model(rows)
        self.assertGreater(layer["exceptions"]["10"]["ratio"], model.EXCEPTION_RATIO_LIMIT)
        self.assertEqual(layer["diagnosis"]["verdict"], "threshold-or-font-variation")
        self.assertEqual(layer["diagnosis"]["clusteredPairs"], [])

    def test_threshold_variants_are_reported_together(self):
        rows = additive_table()
        rows[0] = (rows[0][0], rows[0][1], rows[0][2] + 8.0)
        rows[1] = (rows[1][0], rows[1][1], rows[1][2] + 12.0)
        rows[2] = (rows[2][0], rows[2][1], rows[2][2] + 20.0)
        layer = model.build_layer_model(rows)
        self.assertEqual([layer["exceptions"][key]["count"] for key in ("7", "10", "14")], [3, 2, 1])
        self.assertEqual(layer["exceptions"]["14"]["characters"][0]["character"], "c2")


class HoldoutTests(unittest.TestCase):
    def test_holdout_is_deterministic_and_keeps_every_level(self):
        rows = additive_table()
        first = model.split_holdout(rows)
        second = model.split_holdout(rows)
        self.assertEqual(first, second)
        training, holdout = first
        self.assertTrue(holdout)
        for index in range(len(model.FACTORS)):
            levels = {rows[position][1][index] for position in training}
            self.assertEqual(levels, {row[1][index] for row in rows})

    def test_holdout_never_empties_a_singleton_level(self):
        rows = [("solo", ("ㅋ", "ㅏ", "ㄱ"), 500.0)] + additive_table()
        training, holdout = model.split_holdout(rows)
        self.assertIn(0, training)
        self.assertNotIn(0, holdout)

    def test_holdout_reproduces_exact_additive_data(self):
        evaluation = model.evaluate_holdout(additive_table())
        self.assertLess(evaluation["reproductionError"]["max"], 1e-6)


ALL_DIAGNOSABLE = {f"{first}×{second}": {"diagnosable": True} for first, second in model.PAIRS}
ONLY_INITIAL_MEDIAL = {
    f"{first}×{second}": {"diagnosable": (first, second) == ("initial", "medial")} for first, second in model.PAIRS
}

# 상호작용 판정용 합성 표: 셀마다 받침을 12개 둬 튀는 셀이 홀드아웃(매 10번째)에도 반드시 들어가게 한다.
# 그래야 홀드아웃 일반화 게이트를 결정적으로 검증할 수 있다.
IX_FINALS = tuple(f"f{index}" for index in range(12))


def interaction_table(shifted_cells, shift=30.0):
    """(첫닿, 홀자) 셀 전체가 받침과 무관하게 shift만큼 튀는 합성 표. 주효과는 additive, 받침 효과는 0."""
    rows = []
    index = 0
    for initial in INITIALS:
        for medial in MEDIALS:
            for final in IX_FINALS:
                value = REPRESENTATIVE + INITIAL_EFFECT[initial] + MEDIAL_EFFECT[medial]
                if (initial, medial) in shifted_cells:
                    value += shift
                rows.append((f"c{index}", (initial, medial, final), value))
                index += 1
    return rows


def diagnose_table(target, layer, rows, pair_diagnostics=ALL_DIAGNOSABLE):
    fitted = model.median_polish([(key, value) for _, key, value in rows])
    return model.diagnose_v11(target, layer, rows, fitted["residuals"], pair_diagnostics)


class InteractionV2Tests(unittest.TestCase):
    def test_strong_cell_needs_threshold_sign_consistency_and_count(self):
        residuals = (
            [(("ㄱ", "ㅏ", final), 20.0) for final in "ㄱㄴㅅ"]
            + [(("ㄴ", "ㅏ", "ㄱ"), 20.0), (("ㄴ", "ㅏ", "ㄴ"), 20.0), (("ㄴ", "ㅏ", "ㅅ"), -20.0)]
            + [(("ㄷ", "ㅏ", final), 20.0) for final in "ㄱㄴ"]
            + [(("ㄹ", "ㅏ", final), 8.0) for final in "ㄱㄴㅅ"]
        )
        cells = model.strong_cells(residuals, ("initial", "medial"))
        self.assertEqual([item["cell"] for item in cells], [("ㄱ", "ㅏ")])
        self.assertEqual(cells[0]["observationCount"], 3)
        self.assertEqual(cells[0]["signShare"], 1.0)

    def test_generalizing_cells_are_absorbed_without_moving_main_effects(self):
        # 서로 다른 행·열의 셋(각 첫닿·홀자에 1개뿐)이라 주효과 median은 그대로. 셋 다 홀드아웃에 들어가
        # 층 p95를 움직이므로 일반화 게이트를 통과한다. 단일 셀 하나는 144행 중 홀드아웃 표본이 적어
        # p95를 못 움직여 no-generalization으로 남는다(실제 적용 층은 강셀이 여럿).
        shifted = {("ㄱ", "ㅏ"), ("ㄴ", "ㅓ"), ("ㄷ", "ㅣ")}
        rows = interaction_table(shifted)
        v1 = model.build_layer_model(rows)
        v2 = model.build_layer_model_v2("initial.roleFaces.bottom", "right-final", rows)
        self.assertEqual(v2["v11Diagnosis"]["verdict"], "interaction")
        self.assertEqual(v2["v11Diagnosis"]["bestPair"], "initial×medial")
        self.assertGreaterEqual(v2["v11Diagnosis"]["holdoutP95Gain"], model.HOLDOUT_P95_IMPROVE)
        self.assertLessEqual(v2["v11Diagnosis"]["pairs"]["initial×medial"]["coverage"], model.STRONG_CELL_COVERAGE_LIMIT)
        # 순차 추정: v1 필드(주효과·잔차·예외·홀드아웃)는 v1과 한 글자도 다르지 않다.
        self.assertEqual({key: value for key, value in v2.items() if key not in ("v11Diagnosis", "interaction")}, v1)
        interaction = v2["interaction"]
        self.assertTrue(interaction["applied"])
        self.assertEqual(interaction["pair"], "initial×medial")
        self.assertEqual({tuple(cell["cell"]) for cell in interaction["cells"]}, shifted)
        for cell in interaction["cells"]:
            self.assertAlmostEqual(cell["term"], 30.0, places=6)
        self.assertGreater(v1["exceptions"]["10"]["count"], 0)
        self.assertEqual(interaction["exceptions"]["10"]["count"], 0)

    def test_holdout_with_interaction_reestimates_cell_term_from_training(self):
        # 튀는 셀(ㄱㅏ)이 홀드아웃에도 들어간다. 주효과만으로는 30u를 못 맞히고 셀 보정은 맞힌다.
        rows = interaction_table({("ㄱ", "ㅏ")})
        v2 = model.build_layer_model_v2("initial.roleFaces.bottom", "right-final", rows)
        self.assertAlmostEqual(v2["holdout"]["reproductionError"]["max"], 30.0, places=3)
        self.assertLess(v2["interaction"]["holdout"]["reproductionError"]["max"], 1e-6)

    def test_holdout_gain_helper(self):
        rows = interaction_table({("ㄱ", "ㅏ")})
        gain = model.holdout_p95_gain(rows, ("initial", "medial"), {("ㄱ", "ㅏ"): 30.0})
        self.assertIsNotNone(gain)
        self.assertGreaterEqual(gain, model.HOLDOUT_P95_IMPROVE)
        # 홀드아웃을 못 세우면(관측 없음) 판정 불가로 None.
        self.assertIsNone(model.holdout_p95_gain([], ("initial", "medial"), {}))

    def test_high_coverage_is_broad_and_not_applied(self):
        # 20셀 중 15셀이 강셀 → coverage 0.75 > 0.6. 셀마다 잔차를 저장하는 셈이라 배제한다.
        # 셀 수는 많지만 이건 cap이 아니라 coverage가 잡는다(홀드아웃 이전 단계).
        residuals = []
        for index in range(20):
            initial, medial = f"i{index % 10}", ("ㅏ" if index < 10 else "ㅓ")
            shift = 30.0 if index < 15 else 0.0
            residuals += [((initial, medial, final), shift) for final in ("ㄱ", "ㄴ", "ㅅ")]
        diagnosis, _ = model.diagnose_v11("t", "right-final", [], residuals, ONLY_INITIAL_MEDIAL)
        self.assertEqual(diagnosis["verdict"], "broad-interaction")
        self.assertGreater(diagnosis["pairs"]["initial×medial"]["coverage"], model.STRONG_CELL_COVERAGE_LIMIT)

    def test_weak_absorption_stays_threshold_or_font_variation(self):
        # 강셀 하나가 예외 10개 중 3개만 설명한다 → 흡수 30% < 40%.
        residuals = [((f"i{index}", "ㅏ", "ㄱ"), 0.0) for index in range(60)]
        residuals += [(("i0", "ㅓ", final), 30.0) for final in "ㄱㄴㅅ"]
        residuals += [((f"i{index}", "ㅗ", "ㄱ"), 25.0 if index % 2 else -25.0) for index in range(7)]
        diagnosis, _ = model.diagnose_v11("t", "right-final", [], residuals, ONLY_INITIAL_MEDIAL)
        self.assertEqual(diagnosis["exceptionsBefore"], 10)
        self.assertEqual(diagnosis["pairs"]["initial×medial"]["absorptionGain"], 0.3)
        self.assertEqual(diagnosis["verdict"], "threshold-or-font-variation")

    def test_low_exception_ratio_is_preserved_even_with_strong_cell(self):
        residuals = [((f"i{index}", "ㅏ", "ㄱ"), 0.0) for index in range(97)]
        residuals += [(("i0", "ㅓ", final), 30.0) for final in "ㄱㄴㅅ"]
        diagnosis, _ = model.diagnose_v11("t", "right-final", [], residuals, ALL_DIAGNOSABLE)
        self.assertEqual(diagnosis["verdict"], "exceptions-preserved")

    def test_shape_transition_layer_keeps_exceptions(self):
        target, layer = next(iter(model.SHAPE_TRANSITIONS))
        v2 = model.build_layer_model_v2(target, layer, interaction_table({("ㄹ", "ㅏ")}))
        self.assertEqual(v2["v11Diagnosis"]["verdict"], "shape-transition")
        self.assertEqual(v2["v11Diagnosis"]["shapeTransition"], model.SHAPE_TRANSITIONS[(target, layer)])
        self.assertEqual(v2["interaction"], {"applied": False})


@unittest.skipUnless((CORPUS / "reports/all.json").is_file(), "corpus unavailable")
class CorpusVariationModelTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = json.load(open(CORPUS / "reports/all.json", encoding="utf-8"))
        cls.grouped = model.group_observations(cls.report["cases"])

    def test_initial_bottom_layers_cover_all_six_layouts(self):
        layers = self.grouped["initial.roleFaces.bottom"]
        self.assertEqual(set(layers), set(model.LAYERS))
        self.assertEqual(sum(len(rows) for rows in layers.values()), 11172)

    def test_vertical_final_initial_bottom_matches_design_numbers(self):
        rows = self.grouped["initial.roleFaces.bottom"]["right-final"]
        layer = model.build_layer_model(rows)
        self.assertEqual(layer["observationCount"], 4617)
        self.assertEqual(layer["levelCounts"]["initial"]["min"], 243)
        self.assertEqual(layer["confidence"], "normal")
        self.assertLess(layer["residuals"]["median"], 6.0)
        # 설계 단계 예측: 주효과만으로는 받침 층 예외가 5%를 넘고 특정 자모쌍에 뭉친다.
        self.assertGreater(layer["exceptions"]["10"]["ratio"], model.EXCEPTION_RATIO_LIMIT)
        self.assertNotEqual(layer["diagnosis"]["verdict"], "exceptions-preserved")

    def test_no_final_layer_is_low_confidence(self):
        layer = model.build_layer_model(self.grouped["initial.roleFaces.bottom"]["right"])
        self.assertEqual(layer["observationCount"], 171)
        self.assertEqual(layer["confidence"], "low")
        self.assertEqual(layer["effects"]["final"], {model.NO_FINAL: 0.0})

    def test_medial_targets_only_include_jamos_with_that_role(self):
        layers = self.grouped["medial.primaryBeam.face"]
        for layer_rows in layers.values():
            for _, key, _ in layer_rows:
                self.assertNotEqual(key[1], "ㅣ")

    def test_v2_absorbs_mixed_final_initial_left_cells_without_moving_effects(self):
        rows = self.grouped["initial.roleFaces.left"]["mixed-final"]
        v1 = model.build_layer_model(rows)
        v2 = model.build_layer_model_v2("initial.roleFaces.left", "mixed-final", rows)
        self.assertEqual(v2["effects"], v1["effects"])
        self.assertEqual(v2["v11Diagnosis"]["verdict"], "interaction")
        self.assertGreaterEqual(v2["v11Diagnosis"]["holdoutP95Gain"], model.HOLDOUT_P95_IMPROVE)
        cells = {tuple(cell["cell"]) for cell in v2["interaction"]["cells"]}
        self.assertLessEqual({("ㄱ", "ㅢ"), ("ㄲ", "ㅝ"), ("ㅋ", "ㅘ"), ("ㄱ", "ㅝ")}, cells)
        self.assertEqual(v1["exceptions"]["10"]["count"], 308)
        self.assertEqual(v2["interaction"]["exceptions"]["10"]["count"], 122)
        self.assertLess(
            v2["interaction"]["holdout"]["reproductionError"]["p95"], v1["holdout"]["reproductionError"]["p95"]
        )

    def test_v2_beam_contact_layer_is_shape_transition(self):
        # 홀드아웃은 크게 좋아지지만 접촉 on/off 형태 전환이라 셀 보정 대신 예외로 보존한다.
        rows = self.grouped["medial.primaryBeam.visibleLength"]["bottom-final"]
        v2 = model.build_layer_model_v2("medial.primaryBeam.visibleLength", "bottom-final", rows)
        self.assertEqual(v2["v11Diagnosis"]["verdict"], "shape-transition")
        self.assertFalse(v2["interaction"]["applied"])

    def test_v2_giyeok_family_bottom_final_absorbs_under_holdout_gate(self):
        # ㄲㅗ −47u 신호 층. 강셀 13개지만 coverage 낮고 홀드아웃이 일반화돼 v1.2에선 흡수된다.
        rows = self.grouped["initial.roleFaces.bottom"]["bottom-final"]
        v2 = model.build_layer_model_v2("initial.roleFaces.bottom", "bottom-final", rows)
        self.assertEqual(v2["v11Diagnosis"]["verdict"], "interaction")
        self.assertEqual(v2["v11Diagnosis"]["pairs"]["initial×medial"]["strongCellCount"], 13)
        self.assertLessEqual(v2["v11Diagnosis"]["pairs"]["initial×medial"]["coverage"], model.STRONG_CELL_COVERAGE_LIMIT)
        self.assertGreaterEqual(v2["v11Diagnosis"]["holdoutP95Gain"], model.HOLDOUT_P95_IMPROVE)
        term = {tuple(cell["cell"]): cell["term"] for cell in v2["interaction"]["cells"]}
        self.assertAlmostEqual(term[("ㄲ", "ㅗ")], -47.0, delta=1.0)
        v1 = model.build_layer_model(rows)
        self.assertLess(v2["interaction"]["exceptions"]["10"]["count"], v1["exceptions"]["10"]["count"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
