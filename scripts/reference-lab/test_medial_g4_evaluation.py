#!/usr/bin/env python3
"""Regression tests for fixed Nanum Gothic G4 evaluation."""

from __future__ import annotations

import unittest
from pathlib import Path

import evaluate_medial_g4 as evaluation


PROJECT_ROOT = Path(__file__).resolve().parents[2]
NANUM_PATH = PROJECT_ROOT / ".reference-fonts/NanumGothic-Regular.ttf"


@unittest.skipUnless(NANUM_PATH.is_file(), "Nanum Gothic G4 reference font is unavailable")
class G4EvaluationTests(unittest.TestCase):
    def test_risk_scope_keeps_generation_floor_and_composite_evidence(self) -> None:
        report = evaluation.evaluate(NANUM_PATH, "g4")
        summary = report["summary"]

        self.assertEqual(report["extractorVersion"], "geometric-role-matcher-v4")
        self.assertEqual(summary["caseCount"], 24)
        self.assertEqual(summary["elementCount"], 64)
        self.assertEqual(summary["glyphMissingCount"], 0)
        self.assertEqual(summary["compositeCharacters"], ["돡", "뫅", "퐉"])
        self.assertEqual(summary["usableCandidateCount"], 60)
        self.assertEqual(summary["usableConfidence"], {"high": 0, "medium": 60})
        self.assertEqual(summary["matchingUnits"], {"axis-face-segment-group": 60})
        self.assertEqual(summary["simpleCandidateRate"], 1.0)
        self.assertEqual(summary["mixedCandidateRate"], 0.875)
        self.assertEqual(summary["reasonCodes"], {"no-role-match": 4})
        self.assertEqual(summary["invalidNumberCount"], 0)
        self.assertEqual(summary["roleContractViolationCount"], 0)
        self.assertEqual(summary["missingEvidenceCount"], 0)

        abstained = [
            (case["character"], element["elementId"])
            for case in report["cases"]
            for element in case["elements"]
            if element["face"]["status"] == "abstained"
        ]
        self.assertEqual(abstained, [("돠", "lowerBeam"), ("뫄", "lowerBeam"), ("퐈", "lowerBeam"), ("화", "lowerBeam")])


if __name__ == "__main__":
    unittest.main(verbosity=2)
