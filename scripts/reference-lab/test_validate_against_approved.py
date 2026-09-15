#!/usr/bin/env python3
"""승인 마스터 대비 모델 정합 검증(골든셋 회귀)."""

import json
import unittest
from pathlib import Path

import validate_against_approved as validator

ROOT = Path(__file__).resolve().parents[2]
MODEL = ROOT / ".reference-fonts/guide-corpus/251eae7645152d1705a55414/analysis/variation-model-v2.json"
APPROVED = ROOT / "reference-data/preset-candidates/noto-approved-guide-inputs.v1.json"

FONT = {"fileSha256": "sha", "unitsPerEm": 1000}


def layer(rep, initial=None, medial=None, final=None, interaction=None):
    return {
        "representative": rep,
        "effects": {"initial": initial or {}, "medial": medial or {}, "final": final or {"∅": 0.0}},
        "defaultThreshold": 10.0,
        "confidence": "normal",
        **({"interaction": interaction} if interaction else {}),
    }


class ValidatorUnitTests(unittest.TestCase):
    def test_prediction_adds_effects_and_cell_term(self):
        model = {
            "schema": "noto-variation-model-v2",
            "font": FONT,
            "targets": {
                "initial.roleFaces.bottom": {"layers": {"right": layer(
                    500.0, initial={"ㄱ": -6.0}, medial={"ㅏ": -2.0},
                    interaction={"applied": True, "pair": "initial×medial", "cells": [{"cell": ["ㄱ", "ㅏ"], "term": 12.0}]},
                )}},
            },
        }
        identity = {"initialJamo": "ㄱ", "medialJamo": "ㅏ", "finalJamo": None, "contextId": "right"}
        # 예측 = 500 -6 -2 +12(셀) = 504. 실측 0.5*1000=500 → 잔차 -4.
        outcome = validator.predict(model, "initial.roleFaces.bottom", identity, 0.5)
        self.assertAlmostEqual(outcome["predicted"], 504.0, places=6)
        self.assertAlmostEqual(outcome["residual"], -4.0, places=6)
        self.assertFalse(outcome["exception"])

    def test_cell_term_zero_when_pair_does_not_match(self):
        interaction = {"applied": True, "pair": "initial×medial", "cells": [{"cell": ["ㄲ", "ㅗ"], "term": -47.0}]}
        this_layer = layer(500.0, interaction=interaction)
        self.assertEqual(validator.cell_term(this_layer, {"initialJamo": "ㄱ", "medialJamo": "ㅏ", "finalJamo": None}), 0.0)
        self.assertEqual(validator.cell_term(this_layer, {"initialJamo": "ㄲ", "medialJamo": "ㅗ", "finalJamo": None}), -47.0)

    def test_missing_layer_returns_none(self):
        model = {"schema": "noto-variation-model-v2", "font": FONT, "targets": {}}
        identity = {"initialJamo": "ㄱ", "medialJamo": "ㅏ", "finalJamo": None, "contextId": "right"}
        self.assertIsNone(validator.predict(model, "initial.roleFaces.bottom", identity, 0.5))


@unittest.skipUnless(MODEL.is_file() and APPROVED.is_file(), "corpus/approved unavailable")
class ApprovedGoldenSetTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.result = validator.run(MODEL, APPROVED)

    def test_all_57_approved_cases_are_no_final(self):
        # 승인 입력은 무받침 57자라 받침 역할면은 예측되지 않는다.
        self.assertEqual(self.result["approvedCaseCount"], 57)
        self.assertFalse(self.result["targets"]["final.roleFaces.right"]["predicted"])

    def test_consonant_role_faces_match_masters_closely(self):
        # 닿자 위치면은 사람 마스터와 정합(중앙값 작음)이어야 한다 — 회귀 가드.
        for target in ("initial.roleFaces.bottom", "initial.roleFaces.left", "initial.roleFaces.right"):
            info = self.result["targets"][target]
            self.assertTrue(info["predicted"])
            self.assertEqual(info["residual"]["count"], 57)
            self.assertLessEqual(info["residual"]["median"], 3.0, msg=target)

    def test_beam_lengths_are_the_weak_spot(self):
        # 보 길이·혼합홀자 보는 shape 변동이 커 꼬리가 크다. 위치면보다 p95가 확연히 나쁘다.
        length_p95 = self.result["targets"]["medial.lowerBeam.visibleLength"]["residual"]["p95"]
        face_p95 = self.result["targets"]["initial.roleFaces.left"]["residual"]["p95"]
        self.assertGreater(length_p95, face_p95)
        self.assertGreater(length_p95, 20.0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
