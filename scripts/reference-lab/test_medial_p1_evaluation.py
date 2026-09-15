#!/usr/bin/env python3
"""Regression tests for remaining-medial P1 diagnostics."""

from __future__ import annotations

import json
import unittest
from pathlib import Path

import evaluate_medial_p1 as evaluation


PROJECT_ROOT = Path(__file__).resolve().parents[2]
FONT_PATHS = (
    PROJECT_ROOT / ".reference-fonts/NotoSansKR.ttf",
    PROJECT_ROOT / ".reference-fonts/NanumGothic-Regular.ttf",
)
BASELINE_REPORT_PATH = PROJECT_ROOT / "reference-data/font-guide-calibrations/medial-p1-g0-baseline.v1.json"
G1_REPORT_PATH = PROJECT_ROOT / "reference-data/font-guide-calibrations/medial-p1-g1-v4.report.v1.json"
G2_REPORT_PATH = PROJECT_ROOT / "reference-data/font-guide-calibrations/medial-p1-g2-v9.report.v1.json"
INVALIDATED_V8_G2_REPORT_PATH = PROJECT_ROOT / "reference-data/font-guide-calibrations/medial-p1-g2-v8.report.v1.json"
INVALIDATED_V7_G2_REPORT_PATH = PROJECT_ROOT / "reference-data/font-guide-calibrations/medial-p1-g2-v7.report.v1.json"
INVALIDATED_V6_G2_REPORT_PATH = PROJECT_ROOT / "reference-data/font-guide-calibrations/medial-p1-g2-v6.report.v1.json"
INVALIDATED_V4_G2_REPORT_PATH = PROJECT_ROOT / "reference-data/font-guide-calibrations/medial-p1-g2-v4.report.v1.json"


class P1EvaluationTests(unittest.TestCase):
    def test_g0_baseline_remains_frozen_historical_evidence(self) -> None:
        with BASELINE_REPORT_PATH.open(encoding="utf-8") as source:
            baseline = json.load(source)

        self.assertEqual(baseline["extractorVersion"], "geometric-role-matcher-v3")
        self.assertEqual(baseline["roleContractVersion"], "medial-guide-role-v4-draft")
        self.assertEqual(baseline["combinedMetrics"]["usableCandidateCount"], 79)
        self.assertEqual(baseline["combinedMetrics"]["wrongRoleCount"], 0)
        self.assertFalse(baseline["productionEligible"])

    def test_g1_report_remains_frozen_historical_evidence(self) -> None:
        with G1_REPORT_PATH.open(encoding="utf-8") as source:
            reviewed = json.load(source)
        self.assertEqual(reviewed["extractorVersion"], "geometric-role-matcher-v4")
        self.assertEqual(reviewed["roleContractVersion"], "medial-guide-role-v4")
        self.assertEqual(reviewed["thresholdPolicy"], "p1-v4-structure-family-selector")
        self.assertEqual(reviewed["combinedMetrics"]["usableCandidateCount"], 180)
        self.assertEqual(reviewed["combinedMetrics"]["wrongRoleCount"], 0)
        self.assertEqual(reviewed["p0Regression"]["result"], "pass")
        self.assertFalse(reviewed["productionEligible"])

    def test_full_scope_reproduces_reviewed_g2_metrics_for_both_fixed_fonts(self) -> None:
        with G2_REPORT_PATH.open(encoding="utf-8") as source:
            reviewed = json.load(source)
        recorded_fonts = {font["id"]: font for font in reviewed["fonts"]}

        for font_path in FONT_PATHS:
            if not font_path.is_file():
                self.skipTest("P1 reference font is unavailable")
            with self.subTest(font=font_path.name):
                report = evaluation.evaluate(font_path, "p1")
                summary = report["summary"]
                recorded = recorded_fonts[report["font"]["id"]]

                self.assertEqual(report["extractorVersion"], "geometric-role-matcher-v11")
                self.assertEqual(report["thresholdPolicy"], "p1-v11-actual-pillar-side-beam-contact")
                self.assertEqual(summary["caseCount"], 532)
                self.assertEqual(summary["elementCount"], 1824)
                self.assertEqual(summary["glyphMissingCount"], 0)
                self.assertEqual(summary["invalidNumberCount"], 0)
                self.assertEqual(summary["roleContractViolationCount"], 0)
                self.assertEqual(summary["missingEvidenceCount"], 0)
                self.assertEqual(summary["structuralInvariantViolationCount"], 0)
                self.assertEqual(summary["unexpectedLocalTangentCount"], 0)
                self.assertEqual(summary["directionalTwinStructureViolationCount"], 0)
                self.assertEqual(summary["scanPlanViolationCount"], 0)
                self.assertEqual(recorded["fileSha256"], report["font"]["fileSha256"])
                self.assertEqual(recorded["usableCandidateCount"], summary["usableCandidateCount"])
                self.assertEqual(recorded["usableHighConfidenceCount"], summary["usableConfidence"]["high"])
                self.assertEqual(recorded["usableMediumConfidenceCount"], summary["usableConfidence"]["medium"])
                self.assertEqual(recorded["simpleCandidateRate"], summary["simpleCandidateRate"])
                self.assertEqual(recorded["mixedCandidateRate"], summary["mixedCandidateRate"])
                self.assertEqual(recorded["matchingUnits"], summary["matchingUnits"])
                self.assertEqual(recorded["abstainedReasonCounts"], summary["reasonCodes"])
                self.assertEqual(
                    recorded["structureFamilyCandidateRates"],
                    {
                        family: metrics["candidateRate"]
                        for family, metrics in summary["perStructureFamily"].items()
                    },
                )

        self.assertEqual(reviewed["extractorVersion"], "geometric-role-matcher-v9")
        self.assertEqual(reviewed["thresholdPolicy"], "p1-v9-directional-and-interior-stem-attachment")
        self.assertEqual(reviewed["combinedMetrics"]["usableCandidateCount"], 3648)
        self.assertEqual(reviewed["combinedMetrics"]["wrongRoleCount"], 0)
        self.assertEqual(reviewed["combinedMetrics"]["directionalTwinStructureViolationCount"], 0)
        self.assertEqual(reviewed["combinedMetrics"]["scanPlanViolationCount"], 0)
        self.assertEqual(reviewed["visualReview"]["reviewedCharacterCount"], 380)
        self.assertEqual(reviewed["visualReview"]["reviewedCandidateCount"], 1520)
        self.assertEqual(reviewed["status"], "user-reviewed-diagnostic")
        self.assertTrue(reviewed["userReviewed"])
        self.assertEqual(reviewed["gateResult"]["result"], "pass-user-reviewed-risk-sample")
        self.assertEqual(reviewed["userReview"]["characters"], ["풔", "풕"])
        self.assertEqual(reviewed["userReview"]["wrongRoleCount"], 0)
        self.assertEqual(reviewed["userReview"]["result"], "pass")
        self.assertEqual(reviewed["presetAnchorReview"]["result"], "pass")
        self.assertEqual(
            reviewed["presetAnchorReview"]["observationDigest"],
            "ddbf8478cd0360301c5755175334ba1e8e3f05afd17bb6b723ef9136ea169291",
        )

    def test_user_rejected_v8_g2_report_stays_invalidated(self) -> None:
        with INVALIDATED_V8_G2_REPORT_PATH.open(encoding="utf-8") as source:
            invalidated = json.load(source)

        self.assertEqual(invalidated["status"], "invalidated-by-user-review")
        self.assertEqual(invalidated["combinedMetrics"]["wrongRoleCount"], 11)
        self.assertEqual(invalidated["gateResult"]["result"], "fail-user-review")
        self.assertEqual(invalidated["invalidationReview"]["userReportedCharacters"], ["풔", "풕"])
        self.assertEqual(invalidated["invalidationReview"]["wrongRoleCount"], 11)
        self.assertEqual(invalidated["invalidationReview"]["result"], "fail")

    def test_user_rejected_v7_g2_report_stays_invalidated(self) -> None:
        with INVALIDATED_V7_G2_REPORT_PATH.open(encoding="utf-8") as source:
            invalidated = json.load(source)

        self.assertEqual(invalidated["status"], "invalidated-by-user-review")
        self.assertEqual(invalidated["combinedMetrics"]["wrongRoleCount"], 76)
        self.assertEqual(invalidated["gateResult"]["result"], "fail-user-review")
        self.assertEqual(invalidated["visualReview"]["result"], "invalidated-by-user-review")
        self.assertEqual(invalidated["userReview"]["characters"], ["규", "귝"])
        self.assertEqual(invalidated["userReview"]["result"], "fail")

    def test_user_rejected_v6_g2_report_stays_invalidated(self) -> None:
        with INVALIDATED_V6_G2_REPORT_PATH.open(encoding="utf-8") as source:
            invalidated = json.load(source)

        self.assertEqual(invalidated["status"], "invalidated-by-user-review")
        self.assertEqual(invalidated["combinedMetrics"]["wrongRoleCount"], 1)
        self.assertEqual(invalidated["gateResult"]["result"], "fail-user-review")
        self.assertEqual(invalidated["visualReview"]["result"], "invalidated-by-user-review")

    def test_user_rejected_v4_g2_report_stays_invalidated(self) -> None:
        with INVALIDATED_V4_G2_REPORT_PATH.open(encoding="utf-8") as source:
            invalidated = json.load(source)

        self.assertEqual(invalidated["status"], "invalidated-by-user-review")
        self.assertEqual(invalidated["combinedMetrics"]["wrongRoleCount"], 1)
        self.assertEqual(invalidated["gateResult"]["result"], "fail-role-contamination")


if __name__ == "__main__":
    unittest.main(verbosity=2)
