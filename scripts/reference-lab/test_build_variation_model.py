#!/usr/bin/env python3
"""변화량 모델 v1의 추정·예외·판정·홀드아웃 검증."""

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


if __name__ == "__main__":
    unittest.main(verbosity=2)
