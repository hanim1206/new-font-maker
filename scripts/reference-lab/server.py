#!/usr/bin/env python3
"""Token-free local outline API for the Reference Lab.

The service is deliberately read-only: it reads the versioned catalog and font
files, keeps derived objects in memory, and never writes a runtime cache.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import threading
import unicodedata
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlsplit

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.recordingPen import DecomposingRecordingPen, RecordingPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

import medial_guide_extractor
import initial_component_contract
import initial_component_extractor
import final_component_contract
import final_component_extractor


API_VERSION = "reference.v1"
ERROR_SCHEMA = "reference-api-error-v1"
MAX_BODY_BYTES = 64 * 1024
MAX_CODEPOINTS = 12
MAX_CATALOG_FONTS = 64
MAX_MEDIAL_CASES = 12
MAX_INITIAL_COMPONENT_CASES = 6
MAX_FINAL_COMPONENT_CASES = 3
PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_FONT_DIR = PROJECT_ROOT / ".reference-fonts"
DEFAULT_CATALOG_PATH = PROJECT_ROOT / "reference-data/font-catalog.v1.json"
FINAL_COMPONENT_DISPLAY_SCHEMA = "reference-final-component-display-response-v1"
FINAL_COMPONENT_DISPLAY_INDEX_SCHEMA = "reference-final-component-display-index-v1"
FINAL_COMPONENT_DISPLAY_SOURCES = {
    "noto-sans-kr": {
        "index": PROJECT_ROOT / "reference-data/font-guide-calibrations/noto-sans-kr.final-component-display-index.v1.json",
        "verification": PROJECT_ROOT / "reference-data/font-guide-calibrations/noto-sans-kr.final-component-g2.verification.v1.json",
    },
    "nanum-gothic": {
        "index": PROJECT_ROOT / "reference-data/font-guide-calibrations/nanum-gothic.final-component-display-index.v1.json",
        "verification": PROJECT_ROOT / "reference-data/font-guide-calibrations/nanum-gothic.final-component-g2.verification.v1.json",
    },
    "dotum": {
        "index": PROJECT_ROOT / "reference-data/font-guide-calibrations/dotum.final-component-display-index.v1.json",
        "verification": PROJECT_ROOT / "reference-data/font-guide-calibrations/dotum.final-component-g3.verification.v1.json",
    },
}
ALLOWED_ORIGINS = {
    "http://127.0.0.1:5173",
    "http://localhost:5173",
}
INITIAL_JAMOS = (
    "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
    "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
)
MEDIAL_JAMOS = (
    "ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ", "ㅙ",
    "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ",
)
FINAL_JAMOS = (
    None, "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ",
    "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ", "ㅇ",
    "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
)


def _final_component_case_key(case: Dict[str, Any]) -> Tuple[str, str, str, str, str]:
    return (
        str(case["character"]),
        str(case["initialJamo"]),
        str(case["medialJamo"]),
        str(case["finalJamo"]),
        str(case["contextId"]),
    )


def _same_number_record(left: Dict[str, Any], right: Dict[str, Any]) -> bool:
    return set(left) == set(right) and all(
        isinstance(left[key], (int, float))
        and isinstance(right[key], (int, float))
        and float(left[key]) == float(right[key])
        for key in left
    )


def _sha256_identity_cases(cases: List[Dict[str, Any]]) -> str:
    canonical = json.dumps(
        [case["identity"] for case in cases],
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


class APIError(Exception):
    """An expected request or local-corpus failure with a public error code."""

    def __init__(
        self,
        status: int,
        code: str,
        message: str,
        details: Optional[Dict[str, Any]] = None,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def path_sha256(path_commands: str) -> str:
    return hashlib.sha256(path_commands.encode("utf-8")).hexdigest()


def contour_paths(glyph: Any, glyph_set: Any) -> List[Dict[str, Any]]:
    """Extract closed contours without changing original glyph coordinates."""
    recorder = RecordingPen()
    glyph.draw(recorder)
    contours: List[Dict[str, Any]] = []
    current: List[Tuple[str, Tuple[Any, ...]]] = []

    def flush() -> None:
        if not current:
            return
        path_pen = SVGPathPen(glyph_set)
        bounds_pen = BoundsPen(glyph_set)
        for operator, arguments in current:
            getattr(path_pen, operator)(*arguments)
            getattr(bounds_pen, operator)(*arguments)
        path = path_pen.getCommands()
        if not path or bounds_pen.bounds is None:
            raise ValueError("empty contour data")
        contours.append({
            "path": path,
            "bounds": [float(value) for value in bounds_pen.bounds],
        })
        current.clear()

    for operator, arguments in recorder.value:
        if operator == "moveTo" and current:
            flush()
        current.append((operator, arguments))
        if operator in {"closePath", "endPath"}:
            flush()
    flush()
    return contours


def codepoint_label(character: str) -> str:
    return "U+{:04X}".format(ord(character))


def normalized_text(value: Any) -> str:
    if not isinstance(value, str):
        raise APIError(400, "INVALID_TEXT", "text는 문자열이어야 합니다.")
    nfc = unicodedata.normalize("NFC", value)
    filtered = "".join(
        character
        for character in nfc
        if not character.isspace()
        and not unicodedata.category(character).startswith("C")
    )
    if not filtered:
        raise APIError(
            400,
            "EMPTY_TEXT",
            "공백과 제어 문자를 제외한 글자를 하나 이상 입력해 주세요.",
        )
    if len(filtered) > MAX_CODEPOINTS:
        raise APIError(
            400,
            "TEXT_TOO_LONG",
            "한 번에 최대 12개 codepoint를 비교할 수 있습니다.",
            {"maximum": MAX_CODEPOINTS, "actual": len(filtered)},
        )
    return filtered


def compose_syllable(initial_jamo: str, medial_jamo: str, final_jamo: Optional[str]) -> str:
    try:
        initial_index = INITIAL_JAMOS.index(initial_jamo)
        medial_index = MEDIAL_JAMOS.index(medial_jamo)
        final_index = FINAL_JAMOS.index(final_jamo)
    except ValueError as error:
        raise APIError(
            400,
            "INVALID_JAMO",
            "현대 한글 초성·중성·종성 조합이어야 합니다.",
        ) from error
    return chr(0xAC00 + initial_index * 588 + medial_index * 28 + final_index)


def validated_medial_cases(value: Any) -> List[Dict[str, Any]]:
    if not isinstance(value, list) or not 1 <= len(value) <= MAX_MEDIAL_CASES:
        raise APIError(
            400,
            "INVALID_MEDIAL_CASES",
            "cases는 1..{}개 배열이어야 합니다.".format(MAX_MEDIAL_CASES),
        )
    validated: List[Dict[str, Any]] = []
    seen = set()
    required = {"character", "initialJamo", "medialJamo", "finalJamo"}
    for index, case in enumerate(value):
        if not isinstance(case, dict) or set(case) != required:
            raise APIError(
                400,
                "INVALID_MEDIAL_CASE",
                "각 case는 character·initialJamo·medialJamo·finalJamo만 가져야 합니다.",
                {"index": index},
            )
        character = case["character"]
        initial_jamo = case["initialJamo"]
        medial_jamo = case["medialJamo"]
        final_jamo = case["finalJamo"]
        if not all(isinstance(item, str) for item in (character, initial_jamo, medial_jamo)):
            raise APIError(400, "INVALID_MEDIAL_CASE", "case의 글자와 자모는 문자열이어야 합니다.", {"index": index})
        if final_jamo is not None and not isinstance(final_jamo, str):
            raise APIError(400, "INVALID_MEDIAL_CASE", "finalJamo는 null 또는 문자열이어야 합니다.", {"index": index})
        if len(character) != 1 or character != compose_syllable(initial_jamo, medial_jamo, final_jamo):
            raise APIError(
                400,
                "INVALID_SYLLABLE_CASE",
                "character와 초성·중성·종성 조합이 일치하지 않습니다.",
                {"index": index},
            )
        if character in seen:
            raise APIError(400, "DUPLICATE_MEDIAL_CASE", "같은 완성 글자를 중복 요청할 수 없습니다.", {"index": index})
        seen.add(character)
        validated.append(dict(case))
    return validated


def validated_initial_component_cases(value: Any) -> List[Dict[str, Any]]:
    if not isinstance(value, list) or not 1 <= len(value) <= MAX_INITIAL_COMPONENT_CASES:
        raise APIError(
            400,
            "INVALID_INITIAL_COMPONENT_CASES",
            "cases는 1..{}개 배열이어야 합니다.".format(MAX_INITIAL_COMPONENT_CASES),
        )
    validated: List[Dict[str, Any]] = []
    seen = set()
    required = {"character", "initialJamo", "medialJamo", "finalJamo", "contextId"}
    contexts = {str(context["id"]): context for context in initial_component_contract.P0_CONTEXTS}
    for index, case in enumerate(value):
        if not isinstance(case, dict) or set(case) != required:
            raise APIError(
                400,
                "INVALID_INITIAL_COMPONENT_CASE",
                "각 case는 character·initialJamo·medialJamo·finalJamo·contextId만 가져야 합니다.",
                {"index": index},
            )
        character = case["character"]
        initial_jamo = case["initialJamo"]
        medial_jamo = case["medialJamo"]
        final_jamo = case["finalJamo"]
        context_id = case["contextId"]
        if not all(isinstance(item, str) for item in (character, initial_jamo, medial_jamo, context_id)):
            raise APIError(400, "INVALID_INITIAL_COMPONENT_CASE", "case의 글자·자모·문맥은 문자열이어야 합니다.", {"index": index})
        if final_jamo is not None and not isinstance(final_jamo, str):
            raise APIError(400, "INVALID_INITIAL_COMPONENT_CASE", "finalJamo는 null 또는 문자열이어야 합니다.", {"index": index})
        context = contexts.get(context_id)
        try:
            expected_character = initial_component_contract.compose_syllable(initial_jamo, medial_jamo, final_jamo)
        except ValueError as error:
            raise APIError(422, "P0_SCOPE_UNAVAILABLE", "현재 첫닿 P0는 ㅏ·ㅗ·ㅘ와 받침 없음/ㄱ만 계산합니다.", {"index": index}) from error
        if (
            len(character) != 1
            or character != expected_character
            or context is None
            or context["medialJamo"] != medial_jamo
            or context["finalJamo"] != final_jamo
        ):
            raise APIError(400, "INVALID_INITIAL_COMPONENT_IDENTITY", "character와 첫닿 P0 문맥 identity가 일치하지 않습니다.", {"index": index})
        if character in seen:
            raise APIError(400, "DUPLICATE_INITIAL_COMPONENT_CASE", "같은 완성 글자를 중복 요청할 수 없습니다.", {"index": index})
        seen.add(character)
        validated.append(dict(case))
    return validated


def validated_final_component_cases(value: Any) -> List[Dict[str, Any]]:
    if not isinstance(value, list) or not 1 <= len(value) <= MAX_FINAL_COMPONENT_CASES:
        raise APIError(
            400,
            "INVALID_FINAL_COMPONENT_CASES",
            "cases는 1..{}개 배열이어야 합니다.".format(MAX_FINAL_COMPONENT_CASES),
        )
    validated: List[Dict[str, Any]] = []
    seen = set()
    required = {"character", "initialJamo", "medialJamo", "finalJamo", "contextId"}
    contexts = {str(context["id"]): context for context in final_component_contract.P0_CONTEXTS}
    for index, case in enumerate(value):
        if not isinstance(case, dict) or set(case) != required:
            raise APIError(
                400,
                "INVALID_FINAL_COMPONENT_CASE",
                "각 case는 character·initialJamo·medialJamo·finalJamo·contextId만 가져야 합니다.",
                {"index": index},
            )
        character = case["character"]
        initial_jamo = case["initialJamo"]
        medial_jamo = case["medialJamo"]
        final_jamo = case["finalJamo"]
        context_id = case["contextId"]
        if not all(isinstance(item, str) for item in (character, initial_jamo, medial_jamo, final_jamo, context_id)):
            raise APIError(400, "INVALID_FINAL_COMPONENT_CASE", "case의 글자·자모·문맥은 문자열이어야 합니다.", {"index": index})
        context = contexts.get(context_id)
        try:
            expected_character = final_component_contract.compose_syllable(initial_jamo, medial_jamo, final_jamo)
        except ValueError as error:
            raise APIError(422, "P1_SCOPE_UNAVAILABLE", "현재 받침 P1은 ㅏ·ㅗ·ㅘ와 현대 받침 27종만 표시합니다.", {"index": index}) from error
        if (
            len(character) != 1
            or character != expected_character
            or context is None
            or context["medialJamo"] != medial_jamo
        ):
            raise APIError(400, "INVALID_FINAL_COMPONENT_IDENTITY", "character와 받침 P1 identity가 일치하지 않습니다.", {"index": index})
        key = _final_component_case_key(case)
        if key in seen:
            raise APIError(400, "DUPLICATE_FINAL_COMPONENT_CASE", "같은 받침 사례를 중복 요청할 수 없습니다.", {"index": index})
        seen.add(key)
        validated.append(dict(case))
    return validated


def load_catalog(path: Path) -> Dict[str, Any]:
    try:
        catalog = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise RuntimeError("reference font catalog가 없습니다: {}".format(path)) from error
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeError("reference font catalog를 읽을 수 없습니다: {}".format(error)) from error

    if catalog.get("schema") != "reference-font-catalog-v1" or catalog.get("version") != 1:
        raise RuntimeError("지원하지 않는 reference font catalog schema입니다.")
    display = catalog.get("display")
    fonts = catalog.get("fonts")
    if (
        not isinstance(display, dict)
        or not isinstance(fonts, list)
        or not 1 <= len(fonts) <= MAX_CATALOG_FONTS
    ):
        raise RuntimeError(
            "reference font catalog는 display와 1..{}개 font를 가져야 합니다.".format(
                MAX_CATALOG_FONTS
            )
        )

    required = {
        "id",
        "family",
        "fileName",
        "fileSha256",
        "version",
        "source",
        "license",
        "weight",
        "axes",
    }
    seen_ids = set()
    seen_files = set()
    for font in fonts:
        if not isinstance(font, dict) or not required.issubset(font):
            raise RuntimeError("reference font catalog entry의 필수 필드가 누락되었습니다.")
        font_id = font["id"]
        file_name = font["fileName"]
        if not isinstance(font_id, str) or not font_id or font_id in seen_ids:
            raise RuntimeError("reference font id는 비어 있지 않은 고유 문자열이어야 합니다.")
        if (
            not isinstance(file_name, str)
            or not file_name
            or Path(file_name).name != file_name
            or file_name in seen_files
        ):
            raise RuntimeError("font fileName은 고유한 단일 파일명이어야 합니다.")
        expected_hash = font["fileSha256"]
        if (
            not isinstance(expected_hash, str)
            or len(expected_hash) != 64
            or any(character not in "0123456789abcdef" for character in expected_hash)
        ):
            raise RuntimeError("font fileSha256은 소문자 SHA-256이어야 합니다.")
        seen_ids.add(font_id)
        seen_files.add(file_name)
    return catalog


class ReferenceEngine:
    """Read-only catalog, font, and glyph cache shared by request threads."""

    def __init__(self, font_dir: Path, catalog_path: Path) -> None:
        self.font_dir = font_dir.resolve()
        self.catalog = load_catalog(catalog_path.resolve())
        self.fonts_by_id = {font["id"]: font for font in self.catalog["fonts"]}
        self._font_cache: Dict[str, Tuple[Tuple[int, int], TTFont]] = {}
        self._hash_cache: Dict[Path, Tuple[Tuple[int, int], str]] = {}
        self._glyph_cache: Dict[Tuple[str, int], Dict[str, Any]] = {}
        self._medial_candidate_cache: Dict[Tuple[Any, ...], Dict[str, Any]] = {}
        self._initial_component_candidate_cache: Dict[Tuple[Any, ...], Dict[str, Any]] = {}
        self._final_component_index_cache: Dict[str, Tuple[Tuple[int, int, int, int], Dict[str, Any]]] = {}
        self._final_component_display_cache: Dict[Tuple[Any, ...], Dict[str, Any]] = {}
        self._lock = threading.RLock()

    @property
    def display(self) -> Dict[str, Any]:
        return dict(self.catalog["display"])

    def catalog_response(self) -> Dict[str, Any]:
        return {
            "schema": "reference-font-catalog-response-v1",
            "apiVersion": API_VERSION,
            "display": self.display,
            "fonts": [dict(font) for font in self.catalog["fonts"]],
        }

    def health_response(self) -> Dict[str, Any]:
        with self._lock:
            font_cache_size = len(self._font_cache)
            glyph_cache_size = len(self._glyph_cache)
            medial_candidate_cache_size = len(self._medial_candidate_cache)
            initial_component_candidate_cache_size = len(self._initial_component_candidate_cache)
            final_component_index_cache_size = len(self._final_component_index_cache)
            final_component_display_cache_size = len(self._final_component_display_cache)
        return {
            "schema": "reference-lab-health-v1",
            "apiVersion": API_VERSION,
            "status": "ok",
            "fontCount": len(self.fonts_by_id),
            "runtime": {
                "diskWrites": False,
                "fontCacheEntries": font_cache_size,
                "glyphCacheEntries": glyph_cache_size,
                "medialCandidateCacheEntries": medial_candidate_cache_size,
                "initialComponentCandidateCacheEntries": initial_component_candidate_cache_size,
                "finalComponentIndexCacheEntries": final_component_index_cache_size,
                "finalComponentDisplayCacheEntries": final_component_display_cache_size,
            },
        }

    def _font_path(self, record: Dict[str, Any]) -> Path:
        path = (self.font_dir / record["fileName"]).resolve()
        if path.parent != self.font_dir:
            raise APIError(500, "INVALID_FONT_PATH", "catalog의 font 경로가 안전하지 않습니다.")
        return path

    @staticmethod
    def _signature(path: Path) -> Tuple[int, int]:
        try:
            stat = path.stat()
        except FileNotFoundError as error:
            raise APIError(
                422,
                "FONT_FILE_MISSING",
                "reference font 파일이 없습니다.",
                {"fileName": path.name},
            ) from error
        except OSError as error:
            raise APIError(
                422,
                "FONT_FILE_UNREADABLE",
                "reference font 파일을 읽을 수 없습니다.",
                {"fileName": path.name},
            ) from error
        if not path.is_file():
            raise APIError(
                422,
                "FONT_FILE_MISSING",
                "reference font 경로가 파일이 아닙니다.",
                {"fileName": path.name},
            )
        return stat.st_size, stat.st_mtime_ns

    def _verified_font(self, font_id: str) -> TTFont:
        record = self.fonts_by_id[font_id]
        path = self._font_path(record)
        signature = self._signature(path)
        with self._lock:
            cached = self._font_cache.get(font_id)
            if cached and cached[0] == signature:
                return cached[1]

            hash_cached = self._hash_cache.get(path)
            actual_hash = (
                hash_cached[1]
                if hash_cached and hash_cached[0] == signature
                else sha256_file(path)
            )
            self._hash_cache[path] = (signature, actual_hash)
            expected_hash = record["fileSha256"]
            if actual_hash != expected_hash:
                raise APIError(
                    422,
                    "FONT_HASH_MISMATCH",
                    "reference font 파일의 SHA-256이 catalog와 다릅니다.",
                    {
                        "fontId": font_id,
                        "fileName": path.name,
                        "expected": expected_hash,
                        "actual": actual_hash,
                    },
                )

            try:
                font = TTFont(path, lazy=False)
                if "fvar" in font:
                    axes = {
                        axis.axisTag: axis.defaultValue
                        for axis in font["fvar"].axes
                    }
                    if "wght" in axes:
                        axes["wght"] = 400
                    font = instantiateVariableFont(font, axes, inplace=True)
            except Exception as error:
                raise APIError(
                    422,
                    "FONT_LOAD_FAILED",
                    "reference font 파일을 FontTools로 열 수 없습니다.",
                    {"fontId": font_id, "fileName": path.name},
                ) from error

            if cached:
                cached[1].close()
                stale_keys = [key for key in self._glyph_cache if key[0] == font_id]
                for key in stale_keys:
                    del self._glyph_cache[key]
                stale_candidate_keys = [key for key in self._medial_candidate_cache if key[0] == font_id]
                for key in stale_candidate_keys:
                    del self._medial_candidate_cache[key]
                stale_initial_keys = [key for key in self._initial_component_candidate_cache if key[0] == font_id]
                for key in stale_initial_keys:
                    del self._initial_component_candidate_cache[key]
                self._final_component_display_cache = {
                    key: value
                    for key, value in self._final_component_display_cache.items()
                    if key[0] != font_id
                }
            self._font_cache[font_id] = (signature, font)
            return font

    def _glyph(self, font_id: str, character: str) -> Dict[str, Any]:
        cache_key = (font_id, ord(character))
        with self._lock:
            font = self._verified_font(font_id)
            cached = self._glyph_cache.get(cache_key)
            if cached is not None:
                return dict(cached)

            cmap = font.getBestCmap() or {}
            glyph_name = cmap.get(ord(character))
            common = {
                "character": character,
                "codepoint": codepoint_label(character),
            }
            if glyph_name is None:
                result = {
                    **common,
                    "missing": True,
                    "error": {
                        "code": "GLYPH_MISSING",
                        "message": "이 font에 해당 glyph가 없습니다.",
                    },
                }
                self._glyph_cache[cache_key] = result
                return dict(result)

            try:
                glyph_set = font.getGlyphSet()
                glyph = glyph_set[glyph_name]
                path_pen = SVGPathPen(glyph_set)
                bounds_pen = BoundsPen(glyph_set)
                glyph.draw(path_pen)
                glyph.draw(bounds_pen)
                path_commands = path_pen.getCommands()
                contours = contour_paths(glyph, glyph_set)
                units_per_em = int(font["head"].unitsPerEm)
                advance = float(glyph.width) / units_per_em
                bounds = (
                    [float(value) / units_per_em for value in bounds_pen.bounds]
                    if bounds_pen.bounds
                    else None
                )
                numeric_values = [advance] + (bounds or [])
                if (
                    units_per_em <= 0
                    or any(not math.isfinite(value) for value in numeric_values)
                    or "nan" in path_commands.lower()
                    or "inf" in path_commands.lower()
                ):
                    raise ValueError("non-finite outline data")
            except Exception as error:
                raise APIError(
                    422,
                    "GLYPH_EXTRACTION_FAILED",
                    "glyph 윤곽을 추출하지 못했습니다.",
                    {"fontId": font_id, "codepoint": codepoint_label(character)},
                ) from error

            result = {
                **common,
                "missing": False,
                "glyphName": glyph_name,
                "path": path_commands,
                "pathSha256": path_sha256(path_commands),
                "contours": contours,
                "unitsPerEm": units_per_em,
                "advance": advance,
                "bounds": bounds,
            }
            self._glyph_cache[cache_key] = result
            return dict(result)

    def _selected_font_ids(self, value: Any) -> List[str]:
        if value is None:
            return [font["id"] for font in self.catalog["fonts"]]
        if not isinstance(value, list) or not value:
            raise APIError(400, "INVALID_FONT_IDS", "fontIds는 비어 있지 않은 배열이어야 합니다.")
        if any(not isinstance(font_id, str) for font_id in value):
            raise APIError(400, "INVALID_FONT_IDS", "fontIds에는 문자열만 사용할 수 있습니다.")
        if len(value) != len(set(value)):
            raise APIError(400, "DUPLICATE_FONT_IDS", "fontIds에 같은 font를 중복 지정할 수 없습니다.")
        unknown = [font_id for font_id in value if font_id not in self.fonts_by_id]
        if unknown:
            raise APIError(
                400,
                "UNKNOWN_FONT_ID",
                "catalog에 없는 font id가 포함되어 있습니다.",
                {"fontIds": unknown},
            )
        return value

    def outlines_response(self, payload: Any) -> Dict[str, Any]:
        if not isinstance(payload, dict):
            raise APIError(400, "INVALID_BODY", "요청 body는 JSON object여야 합니다.")
        extra_keys = sorted(set(payload) - {"text", "fontIds"})
        if extra_keys:
            raise APIError(
                400,
                "UNKNOWN_FIELDS",
                "지원하지 않는 요청 필드가 있습니다.",
                {"fields": extra_keys},
            )
        text = normalized_text(payload.get("text"))
        font_ids = self._selected_font_ids(payload.get("fontIds"))
        samples = [
            {
                "fontId": font_id,
                "glyphs": [self._glyph(font_id, character) for character in text],
            }
            for font_id in font_ids
        ]
        return {
            "schema": "reference-outline-response-v1",
            "apiVersion": API_VERSION,
            "text": text,
            "display": self.display,
            "samples": samples,
        }

    def medial_guide_candidates_response(self, payload: Any) -> Dict[str, Any]:
        if not isinstance(payload, dict):
            raise APIError(400, "INVALID_BODY", "요청 body는 JSON object여야 합니다.")
        extra_keys = sorted(set(payload) - {"fontId", "cases"})
        if extra_keys:
            raise APIError(400, "UNKNOWN_FIELDS", "지원하지 않는 요청 필드가 있습니다.", {"fields": extra_keys})
        font_id = payload.get("fontId")
        if not isinstance(font_id, str) or font_id not in self.fonts_by_id:
            raise APIError(400, "UNKNOWN_FONT_ID", "catalog에 없는 font id입니다.", {"fontId": font_id})
        font_record = self.fonts_by_id[font_id]
        if font_record["fileSha256"] != medial_guide_extractor.P0_VERIFIED_FONT_SHA256.get(font_id):
            raise APIError(
                422,
                "P1_SCOPE_UNAVAILABLE",
                "현재 P1 역할 탐색 범위는 검증된 Noto Sans KR·나눔고딕 파일입니다.",
                {"fontId": font_id, "fileSha256": font_record["fileSha256"]},
            )
        cases = validated_medial_cases(payload.get("cases"))
        unavailable = [
            case["character"]
            for case in cases
            if case["medialJamo"] not in medial_guide_extractor.SUPPORTED_MEDIAL_JAMOS
            or case["finalJamo"] not in medial_guide_extractor.P0_FINAL_JAMOS
        ]
        if unavailable:
            raise APIError(
                422,
                "P1_SCOPE_UNAVAILABLE",
                "현재 P1은 현대 홀자 21자와 받침 없음/ㄱ만 계산합니다.",
                {"characters": unavailable},
            )

        font = self._verified_font(font_id)
        results = []
        for case in cases:
            glyph = self._glyph(font_id, case["character"])
            if glyph["missing"]:
                results.append({**case, "status": "abstained", "reasonCode": "glyph-missing"})
                continue
            cache_key = (
                font_id,
                font_record["fileSha256"],
                tuple(sorted(font_record["axes"].items())),
                ord(case["character"]),
                glyph["pathSha256"],
                medial_guide_extractor.API_EXTRACTOR_VERSION,
                medial_guide_extractor.API_ROLE_CONTRACT_VERSION,
            )
            with self._lock:
                cached = self._medial_candidate_cache.get(cache_key)
            if cached is None:
                extracted = medial_guide_extractor.extract_medial_character(
                    font,
                    case["character"],
                    case["medialJamo"],
                    case["finalJamo"],
                )
                cached = {
                    "status": "candidate",
                    "glyphName": glyph["glyphName"],
                    "pathSha256": glyph["pathSha256"],
                    "elements": extracted["elements"],
                }
                with self._lock:
                    self._medial_candidate_cache[cache_key] = cached
            results.append({**case, **cached})

        return {
            "schema": "reference-medial-guide-candidate-response-v1",
            "apiVersion": API_VERSION,
            "extractorVersion": medial_guide_extractor.API_EXTRACTOR_VERSION,
            "roleDefinitionVersion": medial_guide_extractor.API_ROLE_CONTRACT_VERSION,
            "coordinateFrame": "shared-baseline",
            "matching": "geometry-role-search",
            "font": {
                "id": font_id,
                "fileSha256": font_record["fileSha256"],
                "axes": dict(font_record["axes"]),
            },
            "cases": results,
        }

    def initial_component_candidates_response(self, payload: Any) -> Dict[str, Any]:
        if not isinstance(payload, dict):
            raise APIError(400, "INVALID_BODY", "요청 body는 JSON object여야 합니다.")
        extra_keys = sorted(set(payload) - {"fontId", "cases"})
        if extra_keys:
            raise APIError(400, "UNKNOWN_FIELDS", "지원하지 않는 요청 필드가 있습니다.", {"fields": extra_keys})
        font_id = payload.get("fontId")
        if not isinstance(font_id, str) or font_id not in self.fonts_by_id:
            raise APIError(400, "UNKNOWN_FONT_ID", "catalog에 없는 font id입니다.", {"fontId": font_id})
        font_record = self.fonts_by_id[font_id]
        if font_record["fileSha256"] != initial_component_extractor.P0_VERIFIED_FONT_SHA256.get(font_id):
            raise APIError(
                422,
                "P0_SCOPE_UNAVAILABLE",
                "현재 첫닿 P0 범위는 검증된 Noto Sans KR·나눔고딕 파일입니다.",
                {"fontId": font_id, "fileSha256": font_record["fileSha256"]},
            )
        cases = validated_initial_component_cases(payload.get("cases"))
        font = self._verified_font(font_id)
        results = []
        for case in cases:
            glyph = self._glyph(font_id, case["character"])
            cache_key = (
                font_id,
                font_record["fileSha256"],
                tuple(sorted(font_record["axes"].items())),
                ord(case["character"]),
                case["initialJamo"],
                case["medialJamo"],
                case["finalJamo"],
                case["contextId"],
                glyph.get("pathSha256", "glyph-missing"),
                initial_component_contract.RESPONSE_SCHEMA,
                initial_component_contract.EXTRACTOR_VERSION,
                initial_component_contract.ROLE_DEFINITION_VERSION,
                initial_component_contract.MEDIAL_ANCHOR_EXTRACTOR_VERSION,
            )
            with self._lock:
                cached = self._initial_component_candidate_cache.get(cache_key)
            if cached is None:
                cached = initial_component_extractor.extract_initial_character(
                    font,
                    case["character"],
                    case["initialJamo"],
                    case["medialJamo"],
                    case["finalJamo"],
                    case["contextId"],
                )
                with self._lock:
                    self._initial_component_candidate_cache[cache_key] = cached
            results.append(dict(cached))
        return initial_component_extractor.response_envelope(
            font_id,
            font_record["fileSha256"],
            dict(font_record["axes"]),
            results,
        )

    def _final_component_display_index(self, font_id: str) -> Dict[str, Any]:
        source = FINAL_COMPONENT_DISPLAY_SOURCES.get(font_id)
        if source is None:
            raise APIError(
                422,
                "P1_SCOPE_UNAVAILABLE",
                "현재 받침 P1 화면 범위는 검증된 Noto Sans KR·나눔고딕·돋움입니다.",
                {"fontId": font_id},
            )
        index_path = source["index"]
        verification_path = source["verification"]
        try:
            index_stat = index_path.stat()
            verification_stat = verification_path.stat()
            signature = (
                index_stat.st_size,
                index_stat.st_mtime_ns,
                verification_stat.st_size,
                verification_stat.st_mtime_ns,
            )
        except OSError as error:
            raise APIError(500, "FINAL_COMPONENT_INDEX_MISSING", "검증된 받침 표시 index를 읽을 수 없습니다.", {"fontId": font_id}) from error
        with self._lock:
            cached = self._final_component_index_cache.get(font_id)
            if cached is not None and cached[0] == signature:
                return cached[1]
        try:
            index = json.loads(index_path.read_text(encoding="utf-8"))
            verification = json.loads(verification_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise APIError(500, "FINAL_COMPONENT_INDEX_INVALID", "검증된 받침 표시 index 형식이 올바르지 않습니다.", {"fontId": font_id}) from error
        if not isinstance(index, dict) or not isinstance(verification, dict):
            raise APIError(500, "FINAL_COMPONENT_INDEX_INVALID", "검증된 받침 표시 index 형식이 올바르지 않습니다.", {"fontId": font_id})
        if (
            index.get("schema") != FINAL_COMPONENT_DISPLAY_INDEX_SCHEMA
            or index.get("coordinateFrame") != final_component_contract.COORDINATE_FRAME
            or index.get("extractorVersion") != final_component_contract.EXTRACTOR_VERSION
            or index.get("roleDefinitionVersion") != final_component_contract.ROLE_DEFINITION_VERSION
            or index.get("medialAnchorExtractorVersion") != final_component_contract.MEDIAL_ANCHOR_EXTRACTOR_VERSION
        ):
            raise APIError(500, "FINAL_COMPONENT_INDEX_INVALID", "받침 표시 index 계약이 현재 추출 계약과 다릅니다.", {"fontId": font_id})
        if (
            verification.get("schema") != final_component_contract.VERIFICATION_SCHEMA
            or verification.get("state") != "verified"
            or index.get("candidateArtifactSha256") != verification.get("candidateArtifactSha256")
            or index.get("candidateIdentitySha256") != verification.get("candidateIdentitySha256")
        ):
            raise APIError(500, "FINAL_COMPONENT_VERIFICATION_REQUIRED", "사용자 화면 승인된 받침 fixture가 필요합니다.", {"fontId": font_id})
        record = self.fonts_by_id[font_id]
        index_font = index.get("font")
        if (
            not isinstance(index_font, dict)
            or index_font.get("id") != font_id
            or index_font.get("fileSha256") != record["fileSha256"]
            or not isinstance(index_font.get("axes"), dict)
            or not _same_number_record(index_font["axes"], record["axes"])
        ):
            raise APIError(500, "FINAL_COMPONENT_INDEX_INVALID", "받침 표시 index 폰트 identity가 catalog와 다릅니다.", {"fontId": font_id})
        cases = index.get("cases")
        if not isinstance(cases, list) or not cases:
            raise APIError(500, "FINAL_COMPONENT_INDEX_INVALID", "받침 표시 index 사례가 필요합니다.", {"fontId": font_id})
        if index.get("candidateIdentitySha256") != _sha256_identity_cases(cases):
            raise APIError(500, "FINAL_COMPONENT_INDEX_INVALID", "받침 표시 index identity SHA가 다릅니다.", {"fontId": font_id})
        cases_by_key: Dict[Tuple[str, str, str, str, str], Dict[str, Any]] = {}
        for case in cases:
            if not isinstance(case, dict) or not isinstance(case.get("identity"), dict):
                raise APIError(500, "FINAL_COMPONENT_INDEX_INVALID", "받침 표시 index 사례 identity가 필요합니다.", {"fontId": font_id})
            identity = case["identity"]
            required = {"character", "initialJamo", "medialJamo", "finalJamo", "contextId"}
            if not required.issubset(identity):
                raise APIError(500, "FINAL_COMPONENT_INDEX_INVALID", "받침 표시 index 사례 identity가 불완전합니다.", {"fontId": font_id})
            if identity.get("fontSha256") != record["fileSha256"] or not isinstance(identity.get("axes"), dict) or not _same_number_record(identity["axes"], record["axes"]):
                raise APIError(500, "FINAL_COMPONENT_INDEX_INVALID", "받침 표시 index 사례 폰트 identity가 다릅니다.", {"fontId": font_id})
            key = _final_component_case_key(identity)
            if key in cases_by_key:
                raise APIError(500, "FINAL_COMPONENT_INDEX_INVALID", "받침 표시 index 사례가 중복됩니다.", {"fontId": font_id})
            cases_by_key[key] = case
        value = {
            "source": {
                "candidateArtifactSha256": index["candidateArtifactSha256"],
                "candidateIdentitySha256": index["candidateIdentitySha256"],
                "verification": dict(index["verification"]),
            },
            "font": dict(index_font),
            "casesByKey": cases_by_key,
        }
        with self._lock:
            self._final_component_index_cache[font_id] = (signature, value)
        return value

    def _final_component_member_paths(
        self,
        font: TTFont,
        candidate: Dict[str, Any],
    ) -> List[Dict[str, str]]:
        identity = candidate["identity"]
        glyph_name = identity.get("glyphName")
        if not isinstance(glyph_name, str) or not glyph_name:
            raise APIError(500, "FINAL_COMPONENT_DISPLAY_INVALID", "받침 표시 후보 glyph identity가 없습니다.")
        glyph_set = font.getGlyphSet()
        recorder = DecomposingRecordingPen(glyph_set)
        glyph_set[glyph_name].draw(recorder)
        units_per_em = int(font["head"].unitsPerEm)
        records = initial_component_extractor._contour_records(recorder.value, units_per_em)  # pylint: disable=protected-access
        group = candidate.get("componentGroup")
        if not isinstance(group, dict) or not isinstance(group.get("contourIds"), list) or not isinstance(group.get("selectedPathSha256"), str):
            raise APIError(500, "FINAL_COMPONENT_DISPLAY_INVALID", "받침 표시 후보 contour provenance가 없습니다.")
        group_ids = [int(contour_id) for contour_id in group["contourIds"]]
        if not group_ids or len(set(group_ids)) != len(group_ids):
            raise APIError(500, "FINAL_COMPONENT_DISPLAY_INVALID", "받침 표시 전체 contour provenance가 올바르지 않습니다.")
        selection = final_component_extractor._selection_for_ids(  # pylint: disable=protected-access
            group_ids,
            records,
            units_per_em,
        )
        if initial_component_extractor._selected_path_sha256(selection) != group["selectedPathSha256"]:  # pylint: disable=protected-access
            raise APIError(422, "FINAL_COMPONENT_PATH_MISMATCH", "현재 글리프 윤곽이 검증된 받침 fixture와 다릅니다.")
        members = candidate.get("members")
        if not isinstance(members, list) or not members:
            raise APIError(500, "FINAL_COMPONENT_DISPLAY_INVALID", "받침 표시 후보 구성원이 없습니다.")
        member_ids = set()
        member_contours = set()
        member_contour_sequence: List[int] = []
        paths: List[Dict[str, str]] = []
        for member in members:
            if not isinstance(member, dict) or not isinstance(member.get("id"), str) or not isinstance(member.get("contourIds"), list):
                raise APIError(500, "FINAL_COMPONENT_DISPLAY_INVALID", "받침 표시 구성원 provenance가 없습니다.")
            member_id = member["id"]
            contour_ids = [int(contour_id) for contour_id in member["contourIds"]]
            if member_id in member_ids or not contour_ids or len(set(contour_ids)) != len(contour_ids):
                raise APIError(500, "FINAL_COMPONENT_DISPLAY_INVALID", "받침 표시 구성원 순서가 올바르지 않습니다.")
            member_ids.add(member_id)
            member_contours.update(contour_ids)
            member_contour_sequence.extend(contour_ids)
            member_selection = final_component_extractor._selection_for_ids(  # pylint: disable=protected-access
                contour_ids,
                records,
                units_per_em,
            )
            paths.append({
                "id": member_id,
                "path": initial_component_extractor.selection_path_commands(member_selection),
            })
        if len(member_contour_sequence) != len(member_contours) or member_contours != set(group_ids):
            raise APIError(500, "FINAL_COMPONENT_DISPLAY_INVALID", "받침 표시 구성원 contour 분할이 완전하지 않습니다.")
        return paths

    def final_component_display_response(self, payload: Any) -> Dict[str, Any]:
        if not isinstance(payload, dict):
            raise APIError(400, "INVALID_BODY", "요청 body는 JSON object여야 합니다.")
        extra_keys = sorted(set(payload) - {"fontId", "cases"})
        if extra_keys:
            raise APIError(400, "UNKNOWN_FIELDS", "지원하지 않는 요청 필드가 있습니다.", {"fields": extra_keys})
        font_id = payload.get("fontId")
        if not isinstance(font_id, str) or font_id not in self.fonts_by_id:
            raise APIError(400, "UNKNOWN_FONT_ID", "catalog에 없는 font id입니다.", {"fontId": font_id})
        cases = validated_final_component_cases(payload.get("cases"))
        display_index = self._final_component_display_index(font_id)
        font_record = self.fonts_by_id[font_id]
        font = self._verified_font(font_id)
        results: List[Dict[str, Any]] = []
        for request_case in cases:
            candidate = display_index["casesByKey"].get(_final_component_case_key(request_case))
            if candidate is None:
                raise APIError(422, "P1_SCOPE_UNAVAILABLE", "현재 선택은 검증된 받침 fixture 범위에 없습니다.", {"character": request_case["character"]})
            identity = candidate["identity"]
            if any(identity[key] != request_case[key] for key in request_case):
                raise APIError(500, "FINAL_COMPONENT_INDEX_INVALID", "받침 표시 index 사례 identity가 요청과 다릅니다.", {"character": request_case["character"]})
            glyph = self._glyph(font_id, request_case["character"])
            if glyph["missing"] or glyph["glyphName"] != identity.get("glyphName") or glyph["pathSha256"] != identity.get("pathSha256"):
                raise APIError(422, "FINAL_COMPONENT_PATH_MISMATCH", "현재 글리프 윤곽이 검증된 받침 fixture와 다릅니다.", {"character": request_case["character"]})
            if candidate.get("state") == "abstained":
                results.append(dict(candidate))
                continue
            cache_key = (
                font_id,
                font_record["fileSha256"],
                tuple(sorted(font_record["axes"].items())),
                request_case["character"],
                glyph["pathSha256"],
                display_index["source"]["candidateArtifactSha256"],
            )
            with self._lock:
                cached = self._final_component_display_cache.get(cache_key)
            if cached is None:
                cached = {**candidate, "memberPaths": self._final_component_member_paths(font, candidate)}
                with self._lock:
                    self._final_component_display_cache[cache_key] = cached
            results.append(dict(cached))
        return {
            "schema": FINAL_COMPONENT_DISPLAY_SCHEMA,
            "apiVersion": API_VERSION,
            "coordinateFrame": final_component_contract.COORDINATE_FRAME,
            "extractorVersion": final_component_contract.EXTRACTOR_VERSION,
            "roleDefinitionVersion": final_component_contract.ROLE_DEFINITION_VERSION,
            "medialAnchorExtractorVersion": final_component_contract.MEDIAL_ANCHOR_EXTRACTOR_VERSION,
            "source": display_index["source"],
            "font": {
                "id": font_id,
                "fileSha256": font_record["fileSha256"],
                "axes": dict(font_record["axes"]),
            },
            "cases": results,
        }

    def close(self) -> None:
        with self._lock:
            for _, font in self._font_cache.values():
                font.close()
            self._font_cache.clear()
            self._glyph_cache.clear()
            self._medial_candidate_cache.clear()
            self._initial_component_candidate_cache.clear()
            self._final_component_index_cache.clear()
            self._final_component_display_cache.clear()


class ReferenceLabServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address: Tuple[str, int], engine: ReferenceEngine) -> None:
        self.engine = engine
        super().__init__(address, ReferenceRequestHandler)


class ReferenceRequestHandler(BaseHTTPRequestHandler):
    server_version = "ReferenceLab/1"

    @property
    def engine(self) -> ReferenceEngine:
        return self.server.engine  # type: ignore[attr-defined]

    def _response_headers(self) -> Dict[str, str]:
        headers = {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        }
        request_headers = getattr(self, "headers", {})
        origin = request_headers.get("Origin")
        if origin in ALLOWED_ORIGINS:
            headers["Access-Control-Allow-Origin"] = origin
            headers["Vary"] = "Origin"
        return headers

    def _send_json(self, status: int, payload: Dict[str, Any]) -> None:
        body = json.dumps(
            payload,
            ensure_ascii=False,
            separators=(",", ":"),
        ).encode("utf-8")
        self.send_response(status)
        for name, value in self._response_headers().items():
            self.send_header(name, value)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_error(self, error: APIError) -> None:
        public_error: Dict[str, Any] = {
            "code": error.code,
            "message": error.message,
        }
        if error.details is not None:
            public_error["details"] = error.details
        self._send_json(
            error.status,
            {
                "schema": ERROR_SCHEMA,
                "apiVersion": API_VERSION,
                "error": public_error,
            },
        )

    def send_error(
        self,
        code: int,
        message: Optional[str] = None,
        explain: Optional[str] = None,
    ) -> None:
        """Keep parser and unsupported-method failures on the JSON contract."""
        del explain
        if code == 501:
            self._send_error(
                APIError(405, "METHOD_NOT_ALLOWED", "지원하지 않는 HTTP method입니다.")
            )
            return
        self._send_error(
            APIError(code, "HTTP_ERROR", message or "HTTP 요청을 처리하지 못했습니다.")
        )

    def _path(self) -> str:
        return urlsplit(self.path).path

    def do_GET(self) -> None:  # noqa: N802
        try:
            path = self._path()
            if path == "/api/reference/v1/health":
                self._send_json(200, self.engine.health_response())
            elif path == "/api/reference/v1/fonts":
                self._send_json(200, self.engine.catalog_response())
            else:
                raise APIError(404, "NOT_FOUND", "요청한 API endpoint가 없습니다.")
        except APIError as error:
            self._send_error(error)
        except Exception:
            self._send_error(APIError(500, "INTERNAL_ERROR", "서버 내부 오류가 발생했습니다."))

    def do_POST(self) -> None:  # noqa: N802
        try:
            path = self._path()
            if path not in {
                "/api/reference/v1/outlines",
                "/api/reference/v1/medial-guide-candidates",
                "/api/reference/v1/initial-component-candidates",
                "/api/reference/v1/final-component-display",
            }:
                raise APIError(404, "NOT_FOUND", "요청한 API endpoint가 없습니다.")
            content_type = self.headers.get("Content-Type", "")
            if content_type.split(";", 1)[0].strip().lower() != "application/json":
                raise APIError(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type은 application/json이어야 합니다.")
            if self.headers.get("Transfer-Encoding"):
                raise APIError(400, "UNSUPPORTED_TRANSFER_ENCODING", "chunked request body는 지원하지 않습니다.")
            raw_length = self.headers.get("Content-Length")
            if raw_length is None:
                raise APIError(411, "LENGTH_REQUIRED", "Content-Length가 필요합니다.")
            try:
                length = int(raw_length)
            except ValueError as error:
                raise APIError(400, "INVALID_CONTENT_LENGTH", "Content-Length가 올바르지 않습니다.") from error
            if length < 0:
                raise APIError(400, "INVALID_CONTENT_LENGTH", "Content-Length가 올바르지 않습니다.")
            if length > MAX_BODY_BYTES:
                raise APIError(
                    413,
                    "BODY_TOO_LARGE",
                    "요청 body는 64 KiB를 넘을 수 없습니다.",
                    {"maximumBytes": MAX_BODY_BYTES},
                )
            body = self.rfile.read(length)
            try:
                payload = json.loads(body.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError) as error:
                raise APIError(400, "INVALID_JSON", "올바른 UTF-8 JSON body가 필요합니다.") from error
            if path == "/api/reference/v1/outlines":
                result = self.engine.outlines_response(payload)
            elif path == "/api/reference/v1/medial-guide-candidates":
                result = self.engine.medial_guide_candidates_response(payload)
            elif path == "/api/reference/v1/initial-component-candidates":
                result = self.engine.initial_component_candidates_response(payload)
            else:
                result = self.engine.final_component_display_response(payload)
            self._send_json(200, result)
        except APIError as error:
            self._send_error(error)
        except Exception:
            self._send_error(APIError(500, "INTERNAL_ERROR", "서버 내부 오류가 발생했습니다."))

    def do_OPTIONS(self) -> None:  # noqa: N802
        if self._path() not in {
            "/api/reference/v1/health",
            "/api/reference/v1/fonts",
            "/api/reference/v1/outlines",
            "/api/reference/v1/medial-guide-candidates",
            "/api/reference/v1/initial-component-candidates",
            "/api/reference/v1/final-component-display",
        }:
            self._send_error(APIError(404, "NOT_FOUND", "요청한 API endpoint가 없습니다."))
            return
        self.send_response(204)
        origin = self.headers.get("Origin")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "600")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def log_message(self, format_string: str, *args: Any) -> None:
        print("[reference-lab] {} - {}".format(self.address_string(), format_string % args))


def create_server(
    font_dir: Path = DEFAULT_FONT_DIR,
    catalog_path: Path = DEFAULT_CATALOG_PATH,
    port: int = 8765,
) -> ReferenceLabServer:
    engine = ReferenceEngine(font_dir, catalog_path)
    return ReferenceLabServer(("127.0.0.1", port), engine)


def main() -> None:
    parser = argparse.ArgumentParser(description="로컬 FontTools reference outline API")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--font-dir", type=Path, default=DEFAULT_FONT_DIR)
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG_PATH)
    args = parser.parse_args()
    if not 0 < args.port < 65536:
        parser.error("--port는 1..65535 범위여야 합니다.")

    server = create_server(args.font_dir, args.catalog, args.port)
    print("Reference Lab API: http://127.0.0.1:{}/api/reference/v1/health".format(args.port))
    print("runtime disk writes: 0")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.shutdown()
        server.server_close()
        server.engine.close()


if __name__ == "__main__":
    main()
