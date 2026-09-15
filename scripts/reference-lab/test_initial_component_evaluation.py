#!/usr/bin/env python3
"""Regression tests for fixed-font initial component P0 fixtures."""

from __future__ import annotations

import json
import unittest
from pathlib import Path

import evaluate_initial_component_p0 as evaluation


PROJECT_ROOT = Path(__file__).resolve().parents[2]
NOTO_PATH = PROJECT_ROOT / ".reference-fonts/NotoSansKR.ttf"
NANUM_PATH = PROJECT_ROOT / ".reference-fonts/NanumGothic-Regular.ttf"
G0_FIXTURE_PATH = PROJECT_ROOT / "reference-data/font-guide-calibrations/noto-sans-kr.initial-component-g0.v2.json"
G1_FIXTURE_PATH = PROJECT_ROOT / "reference-data/font-guide-calibrations/nanum-gothic.initial-component-g1.v2.json"


@unittest.skipUnless(NOTO_PATH.is_file(), "Noto Sans KR reference font is unavailable")
class InitialComponentEvaluationTests(unittest.TestCase):
    def test_g0_fixture_reproduces_all_noto_cases_and_gate_metrics(self) -> None:
        with G0_FIXTURE_PATH.open(encoding="utf-8") as source:
            fixture = json.load(source)

        current = evaluation.evaluate(NOTO_PATH)
        summary = current["summary"]

        self.assertEqual(current["response"], fixture)
        self.assertEqual(summary["caseCount"], 114)
        self.assertEqual(summary["glyphMissingCount"], 0)
        self.assertEqual(summary["componentCandidateCount"], 114)
        self.assertEqual(summary["selectionAreaCandidateCount"], 114)
        self.assertEqual(summary["axisFaceCandidateCount"], 414)
        self.assertEqual(summary["roleFaceCandidateCount"], 456)
        self.assertEqual(summary["abstainedReasonCounts"], {})
        self.assertEqual(summary["invalidNumberCount"], 0)
        self.assertEqual(summary["legacyTopBottomComparison"], {
            "comparisonOnly": True,
            "valueCount": 228,
            "maximumDelta": 0.499,
            "rmse": 0.2988,
        })
        self.assertTrue(
            all(
                metrics["usableAreaRate"] >= 0.8
                for metrics in summary["perStructureClass"].values()
            )
        )
        self.assertTrue(
            all(
                metrics["usableAreaRate"] == 1.0
                for metrics in summary["perContext"].values()
            )
        )

    @unittest.skipUnless(NANUM_PATH.is_file(), "Nanum Gothic reference font is unavailable")
    def test_g1_fixture_reproduces_holdout_with_merged_boundary_evidence(self) -> None:
        with G1_FIXTURE_PATH.open(encoding="utf-8") as source:
            fixture = json.load(source)

        current = evaluation.evaluate(NANUM_PATH)
        summary = current["summary"]
        selection_rules = [
            case["componentGroup"]["evidence"]["selectionRule"]
            for case in current["response"]["cases"]
        ]

        self.assertEqual(current["response"], fixture)
        self.assertEqual(summary["caseCount"], 114)
        self.assertEqual(summary["glyphMissingCount"], 0)
        self.assertEqual(summary["componentCandidateCount"], 114)
        self.assertEqual(summary["selectionAreaCandidateCount"], 114)
        self.assertEqual(summary["axisFaceCandidateCount"], 352)
        self.assertEqual(summary["roleFaceCandidateCount"], 456)
        self.assertEqual(summary["abstainedReasonCounts"], {})
        self.assertEqual(summary["invalidNumberCount"], 0)
        self.assertIsNone(summary["legacyTopBottomComparison"])
        self.assertEqual(selection_rules.count("context-directed-merged-boundary"), 29)
        self.assertTrue(
            all(
                metrics["usableAreaRate"] >= 0.8
                for metrics in summary["perStructureClass"].values()
            )
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
