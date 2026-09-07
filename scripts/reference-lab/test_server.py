#!/usr/bin/env python3
"""Focused contract tests for the local, read-only Reference Lab API."""

from __future__ import annotations

import http.client
import json
import tempfile
import threading
import unittest
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import server as reference_server


PROJECT_ROOT = Path(__file__).resolve().parents[2]
FONT_DIR = PROJECT_ROOT / ".reference-fonts"
CATALOG_PATH = PROJECT_ROOT / "reference-data/font-catalog.v1.json"
LEGACY_MANIFEST_PATH = (
    PROJECT_ROOT / "public/references/vertical-vowel-gap.manifest.json"
)


class ReferenceLabHTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.server = reference_server.create_server(FONT_DIR, CATALOG_PATH, 0)
        cls.port = cls.server.server_address[1]
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.thread.join(timeout=5)
        cls.server.server_close()
        cls.server.engine.close()

    def request(
        self,
        method: str,
        path: str,
        payload: Optional[Any] = None,
    ) -> Tuple[int, Dict[str, Any]]:
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=30)
        body = None
        headers = {}
        if payload is not None:
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            headers["Content-Type"] = "application/json"
        connection.request(method, path, body=body, headers=headers)
        response = connection.getresponse()
        result = json.loads(response.read().decode("utf-8"))
        connection.close()
        return response.status, result

    def test_health_and_catalog_expose_fixed_read_only_contract(self) -> None:
        status, health = self.request("GET", "/api/reference/v1/health")
        self.assertEqual(status, 200)
        self.assertEqual(health["schema"], "reference-lab-health-v1")
        self.assertEqual(health["apiVersion"], "reference.v1")
        self.assertFalse(health["runtime"]["diskWrites"])

        status, catalog = self.request("GET", "/api/reference/v1/fonts")
        self.assertEqual(status, 200)
        self.assertEqual(catalog["schema"], "reference-font-catalog-response-v1")
        self.assertGreaterEqual(len(catalog["fonts"]), 6)
        self.assertEqual(health["fontCount"], len(catalog["fonts"]))
        self.assertEqual(catalog["display"]["baselineY"], 880)
        self.assertEqual(catalog["display"]["viewBox"], [-120, -120, 1240, 1240])
        self.assertFalse(catalog["display"]["inkAutofit"])
        self.assertFalse(catalog["display"]["individualCentering"])
        self.assertFalse(catalog["display"]["advanceNormalization"])
        self.assertTrue(all("role" not in font for font in catalog["fonts"]))
        self.assertTrue(all("aggregation" not in font for font in catalog["fonts"]))

    def test_nfc_outline_matches_frozen_six_font_evidence(self) -> None:
        legacy = json.loads(LEGACY_MANIFEST_PATH.read_text(encoding="utf-8"))
        expected_hashes = {
            record["fontId"]: record["pathSha256"]
            for record in legacy["references"]
            if record["glyph"] == "가"
        }
        before = {
            path.name: (path.stat().st_size, path.stat().st_mtime_ns)
            for path in FONT_DIR.iterdir()
            if path.is_file()
        }
        status, result = self.request(
            "POST",
            "/api/reference/v1/outlines",
            {"text": " 가\n", "fontIds": list(expected_hashes)},
        )
        after = {
            path.name: (path.stat().st_size, path.stat().st_mtime_ns)
            for path in FONT_DIR.iterdir()
            if path.is_file()
        }

        self.assertEqual(status, 200)
        self.assertEqual(result["schema"], "reference-outline-response-v1")
        self.assertEqual(result["apiVersion"], "reference.v1")
        self.assertEqual(result["text"], "가")
        self.assertEqual(len(result["samples"]), 6)
        self.assertEqual(before, after)

        for sample in result["samples"]:
            glyph = sample["glyphs"][0]
            self.assertFalse(glyph["missing"])
            self.assertTrue(glyph["path"])
            self.assertEqual(glyph["pathSha256"], expected_hashes[sample["fontId"]])
            self.assertGreater(glyph["unitsPerEm"], 0)
            self.assertGreater(glyph["advance"], 0)
            self.assertEqual(len(glyph["bounds"]), 4)

    def test_subset_and_missing_glyph_use_discriminated_records(self) -> None:
        status, result = self.request(
            "POST",
            "/api/reference/v1/outlines",
            {"text": "🙂", "fontIds": ["black-han-sans"]},
        )
        self.assertEqual(status, 200)
        self.assertEqual(len(result["samples"]), 1)
        glyph = result["samples"][0]["glyphs"][0]
        self.assertTrue(glyph["missing"])
        self.assertEqual(glyph["error"]["code"], "GLYPH_MISSING")
        self.assertNotIn("path", glyph)

    def test_invalid_input_and_methods_return_json_errors(self) -> None:
        status, error = self.request(
            "POST",
            "/api/reference/v1/outlines",
            {"text": "가" * 13},
        )
        self.assertEqual(status, 400)
        self.assertEqual(error["schema"], "reference-api-error-v1")
        self.assertEqual(error["error"]["code"], "TEXT_TOO_LONG")

        status, error = self.request("PUT", "/api/reference/v1/fonts", {})
        self.assertEqual(status, 405)
        self.assertEqual(error["schema"], "reference-api-error-v1")
        self.assertEqual(error["error"]["code"], "METHOD_NOT_ALLOWED")


class ReferenceFontIntegrityTests(unittest.TestCase):
    def test_catalog_accepts_a_future_font_without_engine_code_changes(self) -> None:
        catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
        future_font = dict(catalog["fonts"][0])
        future_font.update(
            {
                "id": "future-reference-font",
                "family": "Future Reference Font",
                "fileName": "FutureReferenceFont.ttf",
            }
        )
        catalog["fonts"].append(future_font)

        with tempfile.TemporaryDirectory() as temporary_directory:
            catalog_path = Path(temporary_directory) / "catalog.json"
            catalog_path.write_text(
                json.dumps(catalog, ensure_ascii=False),
                encoding="utf-8",
            )
            loaded = reference_server.load_catalog(catalog_path)

        self.assertEqual(len(loaded["fonts"]), 7)

    def test_missing_and_hash_mismatch_are_explicit(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            font_dir = Path(temporary_directory)
            engine = reference_server.ReferenceEngine(font_dir, CATALOG_PATH)
            try:
                with self.assertRaises(reference_server.APIError) as missing_context:
                    engine.outlines_response(
                        {"text": "가", "fontIds": ["noto-sans-kr"]}
                    )
                self.assertEqual(missing_context.exception.code, "FONT_FILE_MISSING")

                (font_dir / "NotoSansKR.ttf").write_bytes(b"not the catalog font")
                with self.assertRaises(reference_server.APIError) as mismatch_context:
                    engine.outlines_response(
                        {"text": "가", "fontIds": ["noto-sans-kr"]}
                    )
                self.assertEqual(mismatch_context.exception.code, "FONT_HASH_MISMATCH")
            finally:
                engine.close()


if __name__ == "__main__":
    unittest.main(verbosity=2)
