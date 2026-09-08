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
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont


API_VERSION = "reference.v1"
ERROR_SCHEMA = "reference-api-error-v1"
MAX_BODY_BYTES = 64 * 1024
MAX_CODEPOINTS = 12
MAX_CATALOG_FONTS = 64
PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_FONT_DIR = PROJECT_ROOT / ".reference-fonts"
DEFAULT_CATALOG_PATH = PROJECT_ROOT / "reference-data/font-catalog.v1.json"
ALLOWED_ORIGINS = {
    "http://127.0.0.1:5173",
    "http://localhost:5173",
}


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
        return {
            "schema": "reference-lab-health-v1",
            "apiVersion": API_VERSION,
            "status": "ok",
            "fontCount": len(self.fonts_by_id),
            "runtime": {
                "diskWrites": False,
                "fontCacheEntries": font_cache_size,
                "glyphCacheEntries": glyph_cache_size,
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

    def close(self) -> None:
        with self._lock:
            for _, font in self._font_cache.values():
                font.close()
            self._font_cache.clear()
            self._glyph_cache.clear()


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
            if self._path() != "/api/reference/v1/outlines":
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
            self._send_json(200, self.engine.outlines_response(payload))
        except APIError as error:
            self._send_error(error)
        except Exception:
            self._send_error(APIError(500, "INTERNAL_ERROR", "서버 내부 오류가 발생했습니다."))

    def do_OPTIONS(self) -> None:  # noqa: N802
        if self._path() not in {
            "/api/reference/v1/health",
            "/api/reference/v1/fonts",
            "/api/reference/v1/outlines",
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
