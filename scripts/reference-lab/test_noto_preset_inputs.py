#!/usr/bin/env python3
"""승인 입력을 현재 후보나 다른 원본으로 대체하지 않는지 검증한다."""

from copy import deepcopy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import build_noto_preset_inputs as builder


@unittest.skipUnless(builder.APPROVAL.is_file(), "Noto approval artifacts unavailable")
class ApprovedInputTests(unittest.TestCase):
    def test_all_57_inputs_keep_exact_approved_roles_and_native_curves(self):
        result = builder.compile_inputs()
        self.assertEqual(result["caseCount"], 57)
        self.assertEqual(len({case["identity"]["character"] for case in result["cases"]}), 57)
        self.assertTrue(result["inputApproved"])
        self.assertFalse(result["generatedFontApproved"])
        self.assertFalse(result["productionEligible"])
        self.assertFalse(result["automaticVersionTransfer"])
        self.assertEqual({case["identity"]["medialJamo"] for case in result["cases"]}, {"ㅏ", "ㅗ", "ㅘ"})
        self.assertNotIn("뼤", {case["identity"]["character"] for case in result["cases"]})
        for case in result["cases"]:
            for stage in builder.STAGES:
                self.assertEqual(builder.digest(case["stages"][stage]), case["sourcePayloadSha256"][stage])
            self.assertTrue(case["stages"]["outline"]["observation"]["operations"])

    def test_payload_tampering_is_rejected_even_when_declared_hash_is_unchanged(self):
        original = builder.read_json
        def corrupted(path):
            value = original(path)
            if value["stage"] == "medial":
                value["payload"]["observation"]["elements"][0]["face"]["value"] += 1
            return value
        with patch.object(builder, "read_json", side_effect=corrupted), self.assertRaisesRegex(ValueError, "payload 해시"):
            builder.compile_inputs()

    def test_other_character_or_stage_version_is_rejected(self):
        original = builder.read_json
        for change in ("identity", "version"):
            def corrupted(path):
                value = original(path)
                if change == "identity":
                    value["identity"]["character"] = "너"
                else:
                    value["stageKey"] = "0" * 64
                return value
            with self.subTest(change=change), patch.object(builder, "read_json", side_effect=corrupted), self.assertRaisesRegex(ValueError, "identity 또는 버전"):
                builder.compile_inputs()

    def test_report_hash_font_axis_and_role_approval_are_required(self):
        original = json.loads(builder.APPROVAL.read_text(encoding="utf-8"))
        for change in ("report", "font", "role", "duplicate"):
            approval = deepcopy(original)
            if change == "report":
                approval["sourceReport"]["sha256"] = "0" * 64
            elif change == "font":
                approval["font"]["axes"]["wght"] = 700
            elif change == "role":
                approval["cases"][0]["roles"]["medial"]["verdict"] = "rejected"
            else:
                approval["cases"][1] = deepcopy(approval["cases"][0])
            with self.subTest(change=change), tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / "approval.json"
                path.write_text(json.dumps(approval, ensure_ascii=False), encoding="utf-8")
                with self.assertRaises(ValueError):
                    builder.compile_inputs(approval_path=path)

    def test_roles_cannot_steal_each_others_contours(self):
        case = builder.compile_inputs()["cases"][0]
        payloads = deepcopy(case["stages"])
        initial_id = payloads["initial"]["observation"]["componentGroup"]["value"]["contourIds"][0]
        element = payloads["medial"]["observation"]["elements"][0]
        element["face"]["evidence"]["contourId"] = initial_id
        element["visibleSpans"]["evidence"]["contourId"] = initial_id
        with self.assertRaisesRegex(ValueError, "역할 오염"):
            builder.validate_geometry(case["identity"], payloads)

    def test_artifact_path_cannot_escape_corpus(self):
        with self.assertRaisesRegex(ValueError, "corpus 경계"):
            builder.contained_file(builder.CORPUS, "../../../outside.json")


if __name__ == "__main__":
    unittest.main(verbosity=2)
