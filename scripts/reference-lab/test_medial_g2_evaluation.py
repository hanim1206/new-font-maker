#!/usr/bin/env python3
"""Regression tests against the historical Noto G2 holdout metrics."""

from __future__ import annotations

import json
import unittest
from pathlib import Path

import evaluate_medial_g2 as evaluation


PROJECT_ROOT = Path(__file__).resolve().parents[2]
NOTO_PATH = PROJECT_ROOT / ".reference-fonts/NotoSansKR.ttf"
REPORT_PATH = PROJECT_ROOT / "reference-data/font-guide-calibrations/noto-sans-kr.medial-g2.report.v1.json"


class G2ScopeTests(unittest.TestCase):
    def test_holdout_scope_does_not_overlap_g0_tuning_characters(self) -> None:
        cases = evaluation.evaluation_cases("g2")
        characters = {str(case["character"]) for case in cases}

        self.assertEqual(len(cases), 24)
        self.assertEqual(len(characters), 24)
        self.assertFalse(characters & evaluation.extractor.G0_TUNING_CHARACTERS)


@unittest.skipUnless(NOTO_PATH.is_file(), "Noto G2 reference font is unavailable")
class G2EvaluationTests(unittest.TestCase):
    def test_current_matcher_preserves_reviewed_holdout_metrics(self) -> None:
        report = evaluation.evaluate(NOTO_PATH, "g2")
        with REPORT_PATH.open(encoding="utf-8") as source:
            reviewed = json.load(source)

        self.assertEqual(reviewed["extractorVersion"], "geometric-role-matcher-v3")
        self.assertEqual(report["extractorVersion"], "geometric-role-matcher-v4")
        self.assertEqual(report["thresholdPolicy"], "g1-frozen-contour-plus-g4-segment-fallback")
        self.assertEqual(report["summary"]["caseCount"], reviewed["scope"]["characterCount"])
        self.assertEqual(report["summary"]["elementCount"], reviewed["scope"]["elementCount"])
        self.assertEqual(report["summary"]["usableCandidateCount"], reviewed["metrics"]["usableCandidateCount"])
        self.assertEqual(report["summary"]["usableConfidence"]["high"], reviewed["metrics"]["usableHighConfidenceCount"])
        self.assertEqual(report["summary"]["usableConfidence"]["medium"], reviewed["metrics"]["usableMediumConfidenceCount"])
        self.assertEqual(report["summary"]["simpleCandidateRate"], reviewed["metrics"]["simpleCandidateRate"])
        self.assertEqual(report["summary"]["mixedCandidateRate"], reviewed["metrics"]["mixedCandidateRate"])
        self.assertEqual(report["summary"]["reasonCodes"], reviewed["metrics"]["abstainedReasonCounts"])
        self.assertEqual(report["summary"]["invalidNumberCount"], 0)
        self.assertEqual(report["summary"]["roleContractViolationCount"], 0)
        self.assertEqual(report["summary"]["missingEvidenceCount"], 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
