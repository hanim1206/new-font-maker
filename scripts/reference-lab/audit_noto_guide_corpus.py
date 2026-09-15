"""기존 Noto 관측 캐시의 무결성과 역할별 윤곽 소유권을 읽기 전용으로 검사한다."""

import argparse
from collections import Counter
import json
import math
from pathlib import Path
import re

from fontTools.pens.boundsPen import BoundsPen
from fontTools.ttLib import TTFont

import noto_guide_corpus as corpus


SCHEMA = "noto-guide-role-integrity-v1"
NOTO_SHA256 = "194018e6b2b293a7964f037b25c0249ce1418bc9ab3c971060a03aa57861e252"
TOLERANCE = 0.000002  # 추출 응답의 1000 좌표계 소수 셋째 자리 반올림을 허용한다.
SIDES = ("left", "right", "top", "bottom")
MEMBER_SPECS = {spec["finalJamo"]: spec for spec in corpus.final_contract.MEMBER_SPECS}


class AuditError(ValueError):
    pass


def require(condition, reason):
    if not condition:
        raise AuditError(reason)


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def close(actual, expected):
    return finite(actual) and finite(expected) and abs(actual - expected) <= TOLERANCE


def contour_ids(values, count):
    require(isinstance(values, list) and bool(values), "missing-contour-provenance")
    require(all(type(value) is int and 0 <= value < count for value in values), "invalid-contour-reference")
    require(len(values) == len(set(values)), "duplicate-contour-reference")
    return set(values)


def outline_contours(observation):
    require(observation.get("coordinateFrame") == "font-units-y-up", "outline-coordinate-frame")
    require(observation.get("unitsPerEm") == 1000, "outline-units-per-em")
    require(observation.get("fontToGlyphNormalized") == [0.001, 0, 0, -0.001, 0, 0.88], "outline-transform")
    contours, current = [], None
    operations = observation.get("operations", [])
    require(bool(operations), "missing-outline")
    for operation in operations:
        name, arguments = operation["operation"], operation["arguments"]
        require(name in ("moveTo", "lineTo", "qCurveTo", "curveTo", "closePath"), "unsupported-outline-operation")
        for index, point in enumerate(arguments):
            if point is None:
                require(name == "qCurveTo" and index == len(arguments) - 1, "invalid-implied-point")
            else:
                require(len(point) == 2 and all(finite(value) for value in point), "nonfinite-outline-point")
        if name == "moveTo":
            require(current is None, "unclosed-contour")
            current = []
        require(current is not None, "missing-contour-start")
        current.append((name, [None if point is None else tuple(point) for point in arguments]))
        if name == "closePath":
            pen = BoundsPen(None)
            for command, points in current:
                getattr(pen, command)(*points)
            require(pen.bounds is not None, "empty-contour")
            left, bottom, right, top = pen.bounds
            contours.append({"bounds": {"left": left / 1000, "right": right / 1000,
                                        "top": 0.88 - top / 1000, "bottom": 0.88 - bottom / 1000}})
            current = None
    require(current is None, "unclosed-contour")
    require(len(contours) == observation.get("contourCount"), "contour-count-mismatch")
    return contours


def combined_bounds(contours, ids):
    return {side: (min if side in ("left", "top") else max)(contours[index]["bounds"][side] for index in ids)
            for side in SIDES}


def component_check(payload, contours, final_jamo=None):
    observation = payload["observation"]
    group = observation["componentGroup"]
    require(group.get("status") == "candidate", "missing-component-group")
    ids = contour_ids(group["value"]["contourIds"], len(contours))
    holes = group["value"].get("holeContourIds", [])
    require(not holes or contour_ids(holes, len(contours)) <= ids, "foreign-hole-contour")
    bounds = combined_bounds(contours, ids)
    faces = payload["measurements"]["roleFaces"]
    for side in SIDES:
        ink = observation["inkBounds"][side]
        require(ink.get("status") == "candidate" and close(ink.get("value", float("nan")) / 1000, bounds[side]), "component-ink-bounds-mismatch")
        face = observation["roleFaces"][side]
        require(face.get("status") == "candidate" and close(faces.get(side), face.get("value", float("nan")) / 1000), "component-face-measurement-mismatch")
        lo, hi = ("left", "right") if side in ("left", "right") else ("top", "bottom")
        require(bounds[lo] - TOLERANCE <= faces[side] <= bounds[hi] + TOLERANCE, "component-face-outside-ink")
    require(faces["left"] < faces["right"] and faces["top"] < faces["bottom"], "unordered-component-faces")
    expected_area = {"x": faces["left"], "y": faces["top"],
                     "width": faces["right"] - faces["left"], "height": faces["bottom"] - faces["top"]}
    area = observation["selectionArea"]
    require(area.get("status") == "candidate", "missing-selection-area")
    for key, value in expected_area.items():
        require(close(payload["measurements"]["selectionArea"].get(key), value)
                and close(area["value"].get(key, float("nan")) / 1000, value), "selection-area-mismatch")
    if final_jamo:
        spec = MEMBER_SPECS[final_jamo]
        members = observation.get("members", [])
        require(observation.get("structureKind") == spec["structureKind"], "final-structure-mismatch")
        require([{key: member.get(key) for key in ("id", "jamo", "role")} for member in members] == spec["members"], "final-member-contract-mismatch")
        owned = set()
        for member in members:
            fragments = member.get("boundaryFragments", [])
            member_ids = contour_ids([fragment["contourId"] for fragment in fragments], len(contours))
            require(not owned & member_ids, "final-member-contour-overlap")
            require(member_ids <= ids, "final-member-foreign-contour")
            for fragment in fragments:
                ranges = fragment.get("ranges", [])
                require(bool(ranges) and bool(fragment.get("segmentIds")), "missing-member-segment-provenance")
                for interval in ranges:
                    require(type(interval.get("segmentId")) is int
                            and interval["segmentId"] in fragment["segmentIds"]
                            and finite(interval.get("from")) and finite(interval.get("to"))
                            and 0 <= interval["from"] < interval["to"] <= 1, "invalid-member-segment-range")
            owned.update(member_ids)
        require(owned == ids, "final-member-contour-omission")
    return ids


def medial_check(payload, contours, medial_jamo):
    specs = corpus.medial.MEDIAL_ROLE_SPECS[medial_jamo]
    expected = {spec.element_id: spec for spec in specs}
    require(set(payload.get("requiredRoleIds", [])) == set(expected), "medial-required-role-contract")
    elements = payload["observation"].get("elements", [])
    require(len({element["elementId"] for element in elements}) == len(elements), "duplicate-medial-role")
    by_id = {element["elementId"]: element for element in elements}
    require(set(payload["measurements"]) == set(expected), "incomplete-medial-measurements")
    owned = set()
    for role_id, spec in expected.items():
        element = by_id[role_id]
        face, spans = element["face"], element["visibleSpans"]
        require(element.get("orientation") == spec.orientation and element.get("faceSide") == spec.side, "medial-role-orientation")
        require(face.get("status") == spans.get("status") == "candidate", "incomplete-medial-observation")
        evidence = face.get("evidence", {})
        values = evidence.get("contourIds", [evidence.get("contourId")])
        ids = contour_ids(values, len(contours))
        owned.update(ids)
        bounds = combined_bounds(contours, ids)
        measured = payload["measurements"][role_id]
        require(measured.get("orientation") == spec.orientation and measured.get("faceSide") == spec.side, "medial-measurement-orientation")
        require(close(measured.get("face"), face.get("value", float("nan")) / 1000), "medial-face-measurement-mismatch")
        vertical = spec.orientation == "vertical"
        axis_lo, axis_hi = ("left", "right") if vertical else ("top", "bottom")
        span_lo, span_hi = ("top", "bottom") if vertical else ("left", "right")
        require(bounds[axis_lo] - TOLERANCE <= measured["face"] <= bounds[axis_hi] + TOLERANCE, "medial-face-outside-source")
        raw_spans, measured_spans = spans.get("value", []), measured.get("visibleSpans", [])
        require(bool(raw_spans) and len(raw_spans) == len(measured_spans), "missing-visible-spans")
        previous, length = -math.inf, 0.0
        for raw, span in zip(raw_spans, measured_spans):
            start, end = span.get("from"), span.get("to")
            require(finite(start) and finite(end) and previous <= start < end, "invalid-visible-span")
            require(close(start, raw["from"] / 1000) and close(end, raw["to"] / 1000), "visible-span-measurement-mismatch")
            require(bounds[span_lo] - TOLERANCE <= start < end <= bounds[span_hi] + TOLERANCE, "visible-span-outside-source")
            previous, length = end, length + end - start
        require(close(measured.get("visibleLength"), length), "visible-length-mismatch")
    return owned


def audit_case(identity, payloads):
    checks, owners, issues, blocked = {}, {}, [], []
    try:
        require(identity == corpus.case_for(identity["codepoint"]), "glyph-identity-mismatch")
        require(payloads["outline"]["status"] == "candidate", "outline-unavailable")
        contours = outline_contours(payloads["outline"]["observation"])
        bounds = combined_bounds(contours, range(len(contours)))
        require(all(close(payloads["outline"]["measurements"]["inkBounds"].get(side), bounds[side]) for side in SIDES), "outline-ink-bounds-mismatch")
        checks["outline"] = "passed"
    except (AuditError, KeyError, TypeError, ValueError, AssertionError) as error:
        return {"identity": identity, "status": "failed", "checks": {"outline": "failed"},
                "issues": ["outline:" + str(error)], "blockedStages": []}
    for stage in ("initial", "medial", "final"):
        payload = payloads[stage]
        if stage == "final" and identity["finalJamo"] is None:
            checks[stage] = "not-applicable"
            if payload["status"] != "not-applicable":
                issues.append("final:unexpected-final-stage")
            continue
        if payload["status"] != "candidate":
            checks[stage] = "blocked"
            blocked.append({"stage": stage, "status": payload["status"], "reasonCodes": payload.get("reasonCodes", [])})
            continue
        try:
            observation = payload["observation"]
            source_identity = observation.get("identity", observation)
            for key in ("character", "initialJamo", "medialJamo", "finalJamo"):
                if key in source_identity:
                    require(source_identity[key] == identity[key], "observation-identity-mismatch")
            if "glyphName" in source_identity:
                require(source_identity["glyphName"] == payloads["outline"]["observation"]["glyphName"], "observation-glyph-mismatch")
            owners[stage] = (medial_check(payload, contours, identity["medialJamo"]) if stage == "medial"
                             else component_check(payload, contours, identity["finalJamo"] if stage == "final" else None))
            checks[stage] = "passed"
        except (AuditError, KeyError, TypeError, ValueError, AssertionError) as error:
            checks[stage] = "failed"
            issues.append(stage + ":" + str(error))
    stages = sorted(owners)
    for index, stage in enumerate(stages):
        for other in stages[index + 1:]:
            overlap = sorted(owners[stage] & owners[other])
            if overlap:
                issues.append("joint:contour-overlap:" + stage + ":" + other)
    required = {"initial", "medial"} | ({"final"} if identity["finalJamo"] else set())
    if required <= owners.keys():
        union = set().union(*(owners[stage] for stage in required))
        if union != set(range(len(contours))):
            issues.append("joint:unassigned-contours")
    return {"identity": identity, "status": "failed" if issues else "blocked" if blocked else "passed",
            "checks": checks, "issues": issues, "blockedStages": blocked,
            "contourOwnership": {stage: sorted(ids) for stage, ids in owners.items()}}


def read_stage(root, manifest, row, stage):
    reference = row["stages"][stage]
    key = manifest["stageKeys"][stage]
    require(re.fullmatch(r"[0-9a-f]{64}", key) is not None, "invalid-stage-key")
    expected = "cache/{}/{}/{:X}.json".format(stage, key, row["identity"]["codepoint"])
    require(reference.get("artifact") == expected, "cache-path-mismatch")
    path = (root / expected).resolve()
    require(root.resolve() in path.parents, "cache-path-outside-root")
    record = json.loads(path.read_text(encoding="utf-8"))
    require(record.get("schema") == corpus.CACHE_SCHEMA and record.get("stage") == stage
            and record.get("stageKey") == key, "cache-schema-or-version-mismatch")
    require(record.get("identity") == row["identity"], "cache-identity-mismatch")
    payload = record["payload"]
    require(corpus.digest(payload) == record.get("payloadSha256") == reference.get("payloadSha256"), "cache-payload-hash-mismatch")
    require(all(payload.get(field) == reference.get(field) for field in ("status", "reasonCodes", "measurements")), "report-payload-mismatch")
    return payload


def run_audit(root, font_path):
    require(corpus.file_digest(font_path) == NOTO_SHA256, "unexpected-noto-font")
    with TTFont(str(font_path), lazy=True) as font:
        expected_font = {"id": "noto-sans-kr", "fileSha256": NOTO_SHA256,
                         "axes": {axis.axisTag: (400.0 if axis.axisTag == "wght" else float(axis.defaultValue)) for axis in font["fvar"].axes},
                         "unitsPerEm": font["head"].unitsPerEm}
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    require(manifest.get("schema") == corpus.SCHEMA and manifest.get("font") == expected_font, "manifest-font-mismatch")
    require(manifest.get("coordinateFrame") == "glyph-normalized" and manifest.get("baselineY") == 0.88
            and manifest.get("measurementScale") == 0.001, "manifest-coordinate-frame")
    rows, reports, ignored = {}, [], []
    for path in sorted((root / "reports").glob("*.json")):
        report = json.loads(path.read_text(encoding="utf-8"))
        if report.get("schema") != corpus.SCHEMA or report.get("font") != expected_font or report.get("stageKeys") != manifest["stageKeys"]:
            ignored.append(path.name)
            continue
        require(all(report.get(key) == manifest.get(key) for key in ("coordinateFrame", "baselineY", "measurementScale")), "report-coordinate-frame")
        reports.append({"path": str(path.relative_to(root)), "sha256": corpus.file_digest(path)})
        for row in report["cases"]:
            codepoint = row["identity"]["codepoint"]
            require(codepoint not in rows or rows[codepoint] == row, "conflicting-report-row")
            rows[codepoint] = row
    require(bool(rows), "no-compatible-report")
    results, source_reasons, candidate_counts = [], Counter(), {stage: Counter() for stage in corpus.STAGES}
    for codepoint, row in sorted(rows.items()):
        for stage, reference in row["stages"].items():
            candidate_counts[stage][reference["status"]] += 1
            source_reasons.update(stage + ":" + reason for reason in reference.get("reasonCodes", []))
        try:
            payloads = {stage: read_stage(root, manifest, row, stage) for stage in corpus.STAGES}
            result = audit_case(row["identity"], payloads)
        except (AuditError, OSError, KeyError, TypeError, ValueError) as error:
            result = {"identity": row["identity"], "status": "failed", "checks": {},
                      "issues": ["integrity:" + str(error)], "blockedStages": []}
        results.append(result)
    summary = {
        "corpusCount": 11172, "auditedCount": len(results), "unprocessedCount": 11172 - len(results),
        "statusCounts": dict(Counter(result["status"] for result in results)),
        "noFinal": dict(Counter(result["status"] for result in results if result["identity"]["finalJamo"] is None)),
        "withFinal": dict(Counter(result["status"] for result in results if result["identity"]["finalJamo"] is not None)),
        "stageChecks": {stage: dict(Counter(result["checks"].get(stage, "not-checked") for result in results)) for stage in corpus.STAGES},
        "sourceStageCounts": {stage: dict(counts) for stage, counts in candidate_counts.items()},
        "sourceReasonCounts": dict(sorted(source_reasons.items())),
        "issueCounts": dict(sorted(Counter(issue for result in results for issue in result["issues"]).items())),
        "newUserApprovals": 0,
    }
    return {"schema": SCHEMA, "font": expected_font, "stageKeys": manifest["stageKeys"],
            "auditSourceSha256": corpus.file_digest(Path(__file__)), "reports": reports, "ignoredReports": ignored,
            "meaning": "cache-integrity-and-geometric-consistency-not-semantic-or-user-approval",
            "notChecked": ["semantic-role-correctness", "visible-face-occlusion", "segment-geometry-membership",
                           "hole-winding", "generated-font-quality"],
            "review": {"approved": False, "automaticVersionTransfer": False}, "summary": summary, "cases": results}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=corpus.PROJECT_ROOT / ".reference-fonts/guide-corpus/251eae7645152d1705a55414")
    parser.add_argument("--font", type=Path, default=corpus.PROJECT_ROOT / ".reference-fonts/NotoSansKR.ttf")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    result = run_audit(args.root, args.font)
    output = args.output or args.root / "audits/role-integrity-v1.json"
    corpus.write_json(output, result)
    print(json.dumps({"output": str(output), **result["summary"]}, ensure_ascii=False, indent=2))
    return 1 if result["summary"]["statusCounts"].get("failed", 0) else 0


if __name__ == "__main__":
    raise SystemExit(main())
