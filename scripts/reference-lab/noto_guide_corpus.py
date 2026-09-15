#!/usr/bin/env python3
"""Noto 전수 관측 배치. 추출 후보와 검수 승인을 구분하며 생산값을 쓰지 않는다."""

from __future__ import annotations

import argparse
from collections import Counter
from contextlib import contextmanager
import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import sys
import tempfile
import time
from typing import Any, Callable, Dict, Iterator, List, Optional, Tuple

import fontTools
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.ttLib import TTFont

import final_component_contract as final_contract
import final_component_extractor as final
import initial_component_contract as initial_contract
import initial_component_extractor as initial
import medial_guide_extractor as medial


PROJECT_ROOT = Path(__file__).resolve().parents[2]
SCHEMA = "noto-guide-corpus-v1"
CACHE_SCHEMA = "noto-guide-stage-v1"
MEDIALS = tuple("ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ")
FINALS = (None,) + final_contract.FINAL_JAMOS
INITIALS = initial_contract.INITIAL_JAMOS
MIXED = frozenset("ㅘㅙㅚㅝㅞㅟㅢ")
HORIZONTAL = frozenset("ㅗㅛㅜㅠㅡ")
STAGES = ("outline", "medial", "initial", "final")
INITIAL_ANCHOR_CASES = {case["character"]: case for case in initial_contract.p0_cases()}
INITIAL_CASES = {
    **INITIAL_ANCHOR_CASES,
    **{case["character"]: case for case in initial_contract.no_final_cases()},
    **{case["character"]: case for case in initial_contract.final_cases()},
}
FINAL_CASES = {case["character"]: case for case in final_contract.g2_cases()}
REVIEW = {"status": "pending", "approved": False, "structuralValidation": "not-run"}


def json_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")


def digest(value: Any) -> str:
    return hashlib.sha256(json_bytes(value)).hexdigest()


def file_digest(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def write_json(path: Path, value: Any) -> None:
    payload = json_bytes(value)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary: Optional[str] = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, prefix=".writing-", delete=False) as output:
            temporary = output.name
            output.write(payload)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
    finally:
        if temporary is not None and os.path.exists(temporary):
            os.unlink(temporary)


@contextmanager
def exclusive_run(root: Path) -> Iterator[None]:
    root.mkdir(parents=True, exist_ok=True)
    with (root / ".lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise RuntimeError("같은 Noto corpus 배치가 실행 중입니다.") from error
        try:
            yield
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)


def case_for(codepoint: int) -> Dict[str, Any]:
    if not 0xAC00 <= codepoint <= 0xD7A3:
        raise ValueError("현대 한글 완성형 글자만 요청할 수 있습니다.")
    offset = codepoint - 0xAC00
    medial_jamo = MEDIALS[(offset % 588) // 28]
    final_jamo = FINALS[offset % 28]
    family = "mixed" if medial_jamo in MIXED else "bottom" if medial_jamo in HORIZONTAL else "right"
    return {
        "character": chr(codepoint),
        "codepoint": codepoint,
        "initialJamo": INITIALS[offset // 588],
        "medialJamo": medial_jamo,
        "finalJamo": final_jamo,
        "contextId": family + ("-final" if final_jamo is not None else ""),
    }


def all_cases() -> List[Dict[str, Any]]:
    return [case_for(codepoint) for codepoint in range(0xAC00, 0xD7A4)]


def selected_cases(scope: str, characters: Optional[str]) -> List[Dict[str, Any]]:
    if characters is not None:
        points = sorted({ord(character) for character in characters if not character.isspace()})
        if not points:
            raise ValueError("추출할 글자가 없습니다.")
        return [case_for(point) for point in points]
    cases = all_cases()
    if scope == "no-final":
        return [case for case in cases if case["finalJamo"] is None]
    if scope == "anchors":
        return [case for case in cases if case["character"] in INITIAL_ANCHOR_CASES]
    return cases


def font_identity(path: Path) -> Dict[str, Any]:
    sha = file_digest(path)
    if sha != medial.G0_FONT_SHA256:
        raise ValueError("현재 배치는 기존 검증용 Noto Sans KR 파일 SHA만 허용합니다.")
    with TTFont(path, lazy=True) as font:
        axes = {axis.axisTag: float(axis.defaultValue) for axis in font["fvar"].axes} if "fvar" in font else {}
        if "wght" in axes:
            weight = next(axis for axis in font["fvar"].axes if axis.axisTag == "wght")
            if not weight.minValue <= 400 <= weight.maxValue:
                raise ValueError("Noto 굵기 400을 고정할 수 없습니다.")
            axes["wght"] = 400.0
        upm = int(font["head"].unitsPerEm)
        if upm <= 0:
            raise ValueError("unitsPerEm은 양수여야 합니다.")
    return {"id": medial.G0_FONT_ID, "fileSha256": sha, "axes": axes, "unitsPerEm": upm}


def stage_versions(identity: Dict[str, Any]) -> Tuple[Dict[str, str], Dict[str, Any]]:
    sources = {
        "batch": file_digest(Path(__file__)),
        "medial": file_digest(Path(medial.__file__)),
        "initial": file_digest(Path(initial.__file__)),
        "initialContractModule": file_digest(Path(initial_contract.__file__)),
        "initialContract": file_digest(initial_contract.CONTRACT_PATH),
        "final": file_digest(Path(final.__file__)),
        "finalContractModule": file_digest(Path(final_contract.__file__)),
        "finalContract": file_digest(final_contract.CONTRACT_PATH),
    }
    outline_key = digest({"font": identity, "batch": sources["batch"], "fontTools": fontTools.__version__})
    medial_key = digest({"outline": outline_key, "source": sources["medial"]})
    initial_key = digest({"medial": medial_key, "sources": {key: value for key, value in sources.items() if key.startswith("initial")}})
    final_key = digest({"initial": initial_key, "sources": {key: value for key, value in sources.items() if key.startswith("final")}})
    return dict(zip(STAGES, (outline_key, medial_key, initial_key, final_key))), {
        "sourceSha256": sources,
        "fontTools": fontTools.__version__,
        "medial": medial.API_EXTRACTOR_VERSION,
        "medialRoleDefinition": medial.API_ROLE_CONTRACT_VERSION,
        "initial": initial_contract.EXTRACTOR_VERSION,
        "initialRoleDefinition": initial_contract.ROLE_DEFINITION_VERSION,
        "initialNoFinalContract": initial_contract.NO_FINAL_CONTRACT_VERSION,
        "initialFinalContract": initial_contract.FINAL_CONTEXT_CONTRACT_VERSION,
        "final": final_contract.EXTRACTOR_VERSION,
        "finalRoleDefinition": final_contract.ROLE_DEFINITION_VERSION,
    }


class StageCache:
    def __init__(self, root: Path, keys: Dict[str, str], retry_incomplete: bool = False):
        self.root = root
        self.keys = keys
        self.retry_incomplete = retry_incomplete
        self.hits: Counter = Counter()
        self.writes: Counter = Counter()

    def run(self, stage: str, case: Dict[str, Any], compute: Callable[[], Dict[str, Any]]) -> Tuple[Dict[str, Any], str]:
        relative = Path("cache") / stage / self.keys[stage] / ("{:04X}.json".format(case["codepoint"]))
        path = self.root / relative
        try:
            with path.open(encoding="utf-8") as source:
                cached = json.load(source)
            payload = cached["payload"]
            valid = (
                cached["schema"] == CACHE_SCHEMA
                and cached["stage"] == stage
                and cached["stageKey"] == self.keys[stage]
                and cached["identity"] == case
                and cached["payloadSha256"] == digest(payload)
            )
            retry = payload["status"] == "error" or (
                self.retry_incomplete and payload["status"] in {"partial", "abstained", "blocked"}
            )
            if valid and not retry:
                self.hits[stage] += 1
                return payload, relative.as_posix()
        except (OSError, ValueError, KeyError, TypeError):
            pass
        started = time.monotonic()
        try:
            payload = compute()
            json_bytes(payload)
        except Exception as error:  # 한 글자의 오류가 나머지 작업을 버리지 않게 한다.
            payload = unavailable("error", "extractor-error")
            payload["error"] = {"type": type(error).__name__, "message": str(error)}
            print("{} {}: {}".format(case["character"], stage, error), file=sys.stderr, flush=True)
        write_json(path, {
            "schema": CACHE_SCHEMA,
            "stage": stage,
            "stageKey": self.keys[stage],
            "identity": case,
            "seconds": round(time.monotonic() - started, 6),
            "payloadSha256": digest(payload),
            "payload": payload,
        })
        self.writes[stage] += 1
        return payload, relative.as_posix()


def unavailable(status: str, reason: str) -> Dict[str, Any]:
    return {"status": status, "reasonCodes": [reason], "observation": None, "measurements": {}}


def finite(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def candidate_value(field: Any) -> bool:
    return isinstance(field, dict) and field.get("status") == "candidate" and finite(field.get("value"))


def reason_codes(value: Any) -> List[str]:
    reasons: set[str] = set()
    if isinstance(value, dict):
        if isinstance(value.get("reasonCode"), str) and value["reasonCode"]:
            reasons.add(value["reasonCode"])
        for child in value.values():
            reasons.update(reason_codes(child))
    elif isinstance(value, (list, tuple)):
        for child in value:
            reasons.update(reason_codes(child))
    return sorted(reasons)


def outline_observation(font: TTFont, case: Dict[str, Any]) -> Dict[str, Any]:
    glyph_name = (font.getBestCmap() or {}).get(case["codepoint"])
    if glyph_name is None:
        return unavailable("abstained", "glyph-missing")
    glyph_set = font.getGlyphSet()
    recording = DecomposingRecordingPen(glyph_set)
    glyph_set[glyph_name].draw(recording)
    bounds_pen = BoundsPen(glyph_set)
    recording.replay(bounds_pen)
    if bounds_pen.bounds is None:
        return unavailable("abstained", "empty-glyph")
    upm = int(font["head"].unitsPerEm)
    left, bottom, right, top = bounds_pen.bounds
    observation = {
        "glyphName": glyph_name,
        "coordinateFrame": "font-units-y-up",
        "unitsPerEm": upm,
        "fontToGlyphNormalized": [1 / upm, 0, 0, -1 / upm, 0, medial.BASELINE_Y / 1000],
        "recordingSha256": digest(recording.value),
        "contourCount": sum(operation == "moveTo" for operation, _ in recording.value),
        "operations": [{"id": index, "operation": operation, "arguments": arguments} for index, (operation, arguments) in enumerate(recording.value)],
        "inkBounds": {"left": left, "bottom": bottom, "right": right, "top": top},
    }
    return {
        "status": "candidate", "reasonCodes": [], "observation": observation,
        "measurements": {"inkBounds": {
            "left": left / upm, "right": right / upm,
            "top": medial.BASELINE_Y / 1000 - top / upm,
            "bottom": medial.BASELINE_Y / 1000 - bottom / upm,
        }},
    }


def medial_payload(observation: Dict[str, Any], medial_jamo: str) -> Dict[str, Any]:
    specs = medial.MEDIAL_ROLE_SPECS[medial_jamo]
    elements = {element["elementId"]: element for element in observation.get("elements", ())}
    measurements: Dict[str, Any] = {}
    for spec in specs:
        element = elements.get(spec.element_id, {})
        face = element.get("face", {})
        spans_field = element.get("visibleSpans", {})
        spans = spans_field.get("value") or []
        if (
            not candidate_value(face)
            or element.get("orientation") != spec.orientation
            or element.get("faceSide") != spec.side
            or spans_field.get("status") != "candidate"
            or not spans
            or any(not finite(span.get("from")) or not finite(span.get("to")) or span["from"] >= span["to"] for span in spans)
        ):
            continue
        measurements[spec.element_id] = {
            "orientation": spec.orientation,
            "faceSide": spec.side,
            "face": face["value"] / 1000,
            "visibleSpans": [{"from": span["from"] / 1000, "to": span["to"] / 1000} for span in spans],
            "visibleLength": sum(span["to"] - span["from"] for span in spans) / 1000,
        }
    complete = len(measurements) == len(specs) and len(elements) == len(specs)
    reasons = reason_codes(observation)
    if not complete:
        reasons = sorted(set(reasons + ["incomplete-required-medial-roles"]))
    return {
        "status": "candidate" if complete else "partial" if measurements else "abstained",
        "reasonCodes": reasons, "observation": observation, "measurements": measurements,
        "requiredRoleIds": [spec.element_id for spec in specs],
    }


def component_payload(observation: Dict[str, Any]) -> Dict[str, Any]:
    faces = observation.get("roleFaces", {})
    values = {side: faces[side]["value"] / 1000 for side in ("top", "bottom", "left", "right") if candidate_value(faces.get(side))}
    area = observation.get("selectionArea", {})
    area_value = area.get("value") or {}
    area_usable = (
        area.get("status") == "candidate"
        and all(finite(area_value.get(key)) for key in ("x", "y", "width", "height"))
        and area_value["width"] > 0 and area_value["height"] > 0
    )
    complete = (
        len(values) == 4 and area_usable
        and observation.get("componentGroup", {}).get("status") == "candidate"
        and values["left"] < values["right"] and values["top"] < values["bottom"]
    )
    measurements: Dict[str, Any] = {"roleFaces": values}
    if area_usable:
        measurements["selectionArea"] = {key: area_value[key] / 1000 for key in ("x", "y", "width", "height")}
    return {
        "status": "candidate" if complete else "partial" if values else "abstained",
        "reasonCodes": reason_codes(observation) or ([] if complete else ["incomplete-required-component-roles"]),
        "observation": observation, "measurements": measurements,
    }


def medial_deltas(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """같은 홀자·실제 받침의 ㄱ 문맥만 기준으로 비교한다. 규칙으로 승격하지 않는다."""
    anchors = {
        (row["identity"]["medialJamo"], row["identity"]["finalJamo"]): row
        for row in rows if row["identity"]["initialJamo"] == "ㄱ" and row["stages"]["medial"]["status"] == "candidate"
    }
    deltas: List[Dict[str, Any]] = []
    for row in rows:
        case = row["identity"]
        base = anchors.get((case["medialJamo"], case["finalJamo"]))
        if base is None or base is row or row["stages"]["medial"]["status"] != "candidate":
            continue
        for role_id, value in row["stages"]["medial"]["measurements"].items():
            reference = base["stages"]["medial"]["measurements"].get(role_id)
            if reference is None or (value["orientation"], value["faceSide"]) != (reference["orientation"], reference["faceSide"]):
                continue
            deltas.append({
                "character": case["character"], "baselineCharacter": base["identity"]["character"],
                "roleId": role_id, "medialJamo": case["medialJamo"], "finalJamo": case["finalJamo"],
                "faceDelta": value["face"] - reference["face"],
                "visibleLengthDelta": value["visibleLength"] - reference["visibleLength"],
                "source": row["stages"]["medial"]["artifact"],
                "baselineSource": base["stages"]["medial"]["artifact"],
                "status": "analysis-candidate",
            })
    return deltas


def summary(rows: List[Dict[str, Any]], requested: int) -> Dict[str, Any]:
    counts = {stage: dict(Counter(row["stages"][stage]["status"] for row in rows)) for stage in STAGES}
    all_roles = sum(all(row["stages"][stage]["status"] in {"candidate", "not-applicable"} for stage in STAGES) for row in rows)
    reasons: Counter = Counter()
    for row in rows:
        for stage, result in row["stages"].items():
            for reason in result["reasonCodes"]:
                reasons[stage + ":" + reason] += 1
    return {
        "corpusCount": 11172, "requestedCount": requested,
        "processedCount": len(rows), "pendingCount": requested - len(rows),
        "outsideRequestedScopeCount": 11172 - requested,
        "stageCounts": counts, "allRequiredRolesCandidateCount": all_roles,
        "verifiedCount": 0, "reasonCounts": dict(sorted(reasons.items())),
    }


def extract_case(case: Dict[str, Any], cache: StageCache, get_font: Callable[[], TTFont], source: Dict[str, Any]) -> Dict[str, Any]:
    stages: Dict[str, Any] = {}

    def run(stage: str, callback: Callable[[], Dict[str, Any]]) -> Dict[str, Any]:
        payload, artifact = cache.run(stage, case, callback)
        stages[stage] = {key: payload[key] for key in ("status", "reasonCodes", "measurements")}
        stages[stage]["artifact"] = artifact
        stages[stage]["payloadSha256"] = digest(payload)
        return payload

    outline = run("outline", lambda: outline_observation(get_font(), case))

    def get_medial() -> Dict[str, Any]:
        if outline["status"] != "candidate":
            return unavailable("blocked", "outline-unavailable")
        observed = medial.extract_medial_character(get_font(), case["character"], case["medialJamo"], case["finalJamo"])
        result = medial_payload(observed, case["medialJamo"])
        result["evaluationScope"] = "existing-no-final-or-giyeok" if case["finalJamo"] in medial.P0_FINAL_JAMOS else "expanded-final-unreviewed"
        return result

    observed_medial = run("medial", get_medial)

    def get_component(stage: str) -> Dict[str, Any]:
        if stage == "final" and case["finalJamo"] is None:
            return unavailable("not-applicable", "no-final")
        requests = INITIAL_CASES if stage == "initial" else FINAL_CASES
        request = requests.get(case["character"])
        if request is None:
            return unavailable("unsupported", "context-contract-not-expanded")
        if outline["status"] != "candidate" or observed_medial["observation"] is None:
            return unavailable("blocked", "medial-extraction-unavailable")
        args = (case["character"], case["initialJamo"], case["medialJamo"], case["finalJamo"], request["contextId"])
        if stage == "initial":
            observed = initial.extract_initial_character(get_font(), *args, medial_observation=observed_medial["observation"])
        else:
            observed = final.extract_final_character(get_font(), source["fileSha256"], source["axes"], *args, medial_observation=observed_medial["observation"])
        result = component_payload(observed)
        if stage == "initial" and request["contextId"] in initial_contract.EXPANDED_NO_FINAL_CONTEXT_IDS:
            result["evaluationScope"] = "expanded-no-final-unreviewed"
        elif stage == "initial" and request["contextId"] in initial_contract.EXPANDED_FINAL_CONTEXT_IDS:
            result["evaluationScope"] = "expanded-final-unreviewed"
        return result

    run("initial", lambda: get_component("initial"))
    run("final", lambda: get_component("final"))
    return {"identity": case, "stages": stages}


def run_batch(args: argparse.Namespace) -> Dict[str, Any]:
    source = font_identity(args.font)
    keys, versions = stage_versions(source)
    root = args.output.resolve() / digest(source)[:24]
    requested = selected_cases(args.scope, args.characters)
    selection = {"scope": args.scope, "characters": [case["character"] for case in requested] if args.characters is not None else None}
    report_name = args.scope if args.characters is None else "characters-" + digest(selection)[:12]
    metadata = {
        "schema": SCHEMA, "font": source, "versions": versions, "stageKeys": keys,
        "coordinateFrame": "glyph-normalized", "measurementScale": 0.001,
        "baselineY": medial.BASELINE_Y / 1000,
        "sourceKind": "actual-glyph-outline", "review": REVIEW,
        "candidateMeaning": "required-fields-present-not-semantic-verification",
    }
    with exclusive_run(root):
        write_json(root / "manifest.json", {**metadata, "cases": all_cases()})
        if args.manifest_only:
            return {"status": "manifest-only", "corpusCount": 11172, "output": str(root)}
        cache = StageCache(root, keys, args.retry_incomplete)
        font: Optional[TTFont] = None

        def get_font() -> TTFont:
            nonlocal font
            if font is None:
                font = medial.load_font(args.font)
            return font

        rows: List[Dict[str, Any]] = []
        started = time.monotonic()
        new_cases = 0
        status = "failed"
        report_path = root / "reports" / (report_name + ".json")
        try:
            for case in requested:
                before = sum(cache.writes.values())
                rows.append(extract_case(case, cache, get_font, source))
                if sum(cache.writes.values()) > before:
                    new_cases += 1
                if len(rows) == 1 or len(rows) % 25 == 0:
                    progress = {"status": "running", "processed": len(rows), "requested": len(requested), "newCases": new_cases, "seconds": round(time.monotonic() - started, 3)}
                    write_json(root / "progress.json", progress)
                    print(json.dumps(progress), file=sys.stderr, flush=True)
                if args.stop_after is not None and new_cases >= args.stop_after:
                    break
            status = "completed" if len(rows) == len(requested) else "paused"
        except KeyboardInterrupt:
            status = "interrupted"
        finally:
            if font is not None:
                font.close()
            totals = summary(rows, len(requested))
            report = {
                **metadata, "runStatus": status, "selection": selection,
                "summary": totals, "elapsedSeconds": round(time.monotonic() - started, 6),
                "cacheHits": dict(cache.hits), "stageWrites": dict(cache.writes),
                "newCases": new_cases, "cases": rows,
                "medialVariationFromGiyeok": medial_deltas(rows),
            }
            write_json(report_path, report)
            write_json(root / "progress.json", {"status": status, **totals, "report": str(report_path)})
    return {"status": status, **totals, "report": str(report_path), "elapsedSeconds": report["elapsedSeconds"], "cacheHits": report["cacheHits"], "stageWrites": report["stageWrites"], "medialDeltaCount": len(report["medialVariationFromGiyeok"])}


def main() -> None:
    parser = argparse.ArgumentParser(description="Noto 11,172자 직접 관측 corpus. 자동 후보는 검수 완료가 아닙니다.")
    parser.add_argument("--font", type=Path, default=PROJECT_ROOT / ".reference-fonts/NotoSansKR.ttf")
    parser.add_argument("--output", type=Path, default=PROJECT_ROOT / ".reference-fonts/guide-corpus")
    parser.add_argument("--scope", choices=("no-final", "anchors", "all"), default="no-final")
    parser.add_argument("--characters", help="공백 없이 요청할 실제 글자. scope 대신 사용합니다.")
    parser.add_argument("--manifest-only", action="store_true")
    parser.add_argument("--retry-incomplete", action="store_true")
    parser.add_argument("--stop-after", type=int, help="새로 처리한 글자 수가 한도에 도달하면 재개 가능한 상태로 중단합니다.")
    args = parser.parse_args()
    if args.stop_after is not None and args.stop_after <= 0:
        parser.error("--stop-after는 양수여야 합니다.")
    try:
        result = run_batch(args)
    except (OSError, ValueError, RuntimeError) as error:
        parser.exit(1, str(error) + "\n")
    print(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False))
    if result["status"] == "interrupted":
        raise SystemExit(130)
    if any(counts.get("error", 0) for counts in result.get("stageCounts", {}).values()):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
