#!/usr/bin/env python3
"""Tests for separate final-component candidate verification."""

from __future__ import annotations

import hashlib
import json
import tempfile
import unittest
from pathlib import Path

import final_component_contract as contract
from verify_final_component_candidate import create_verification


class FinalComponentVerificationTest(unittest.TestCase):
    def _candidate(self, directory: str) -> Path:
        path = Path(directory) / "candidate.json"
        path.write_text(json.dumps({
            "schema": contract.RESPONSE_SCHEMA,
            "lifecycle": contract.CANDIDATE_LIFECYCLE,
            "cases": [{"identity": {"character": "각", "fontSha256": "a" * 64}}],
        }, ensure_ascii=False) + "\n", encoding="utf-8")
        return path

    def test_verification_references_exact_artifact_and_identity(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            candidate = self._candidate(directory)
            result = create_verification(
                candidate,
                "verified",
                "2026-09-14T16:43:07+09:00",
                "user",
                "G0 81자 정적 검토표 승인",
            )
            self.assertEqual(contract.VERIFICATION_SCHEMA, result["schema"])
            self.assertEqual("verified", result["state"])
            self.assertEqual(hashlib.sha256(candidate.read_bytes()).hexdigest(), result["candidateArtifactSha256"])
            self.assertEqual("user-visual-review", result["review"]["method"])

    def test_candidate_state_cannot_be_verification(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            candidate = self._candidate(directory)
            with self.assertRaisesRegex(ValueError, "verified 또는 rejected"):
                create_verification(candidate, "candidate", "2026-09-14", "user", "검토")


if __name__ == "__main__":
    unittest.main()
