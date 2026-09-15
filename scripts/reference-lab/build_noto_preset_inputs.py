#!/usr/bin/env python3
"""사용자가 승인한 당시의 직접 관측만 프리셋 생성 입력으로 묶는다."""

import argparse
import hashlib
import json
import math
from pathlib import Path

from medial_guide_extractor import G0_FONT_SHA256, MEDIAL_ROLE_SPECS


PROJECT = Path(__file__).resolve().parents[2]
CORPUS = PROJECT / ".reference-fonts/guide-corpus/251eae7645152d1705a55414"
APPROVAL = CORPUS / "review-history/user-approved-candidates-0941e3e5d715.json"
OUTPUT = PROJECT / "reference-data/preset-candidates/noto-approved-guide-inputs.v1.json"
STAGES = ("outline", "initial", "medial")
INITIALS = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ"
MEDIALS = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")).hexdigest()


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def contained_file(root, relative):
    path = (root / relative).resolve()
    require(path.is_relative_to(root.resolve()), "승인 자료가 corpus 경계를 벗어납니다.")
    return path


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def validate_identity(identity):
    character = identity["character"]
    require(isinstance(character, str) and len(character) == 1, "승인 글자 identity가 다릅니다.")
    codepoint = ord(character)
    offset = codepoint - 0xAC00
    require(0 <= offset < 11172 and offset % 28 == 0, "무받침 현대 한글 승인 입력만 지원합니다.")
    require(identity["codepoint"] == codepoint and identity["finalJamo"] is None
            and identity["initialJamo"] == INITIALS[offset // 588]
            and identity["medialJamo"] == MEDIALS[(offset % 588) // 28], "승인 글자 identity가 다릅니다.")


def validate_geometry(identity, payloads):
    outline = payloads["outline"]["observation"]
    initial = payloads["initial"]["observation"]
    medial = payloads["medial"]["observation"]
    require(all(value["character"] == identity["character"] for value in (initial, medial)), "관측 글자가 승인 글자와 다릅니다.")
    require(initial["initialJamo"] == identity["initialJamo"] and initial["medialJamo"] == identity["medialJamo"]
            and initial["finalJamo"] is None and initial["contextId"] == identity["contextId"], "첫닿자 관측 문맥이 다릅니다.")
    require(initial["glyphName"] == medial["glyphName"] == outline["glyphName"], "역할별 원본 글리프가 다릅니다.")
    require(outline["unitsPerEm"] == 1000 and outline["coordinateFrame"] == "font-units-y-up"
            and outline["fontToGlyphNormalized"] == [0.001, 0, 0, -0.001, 0, 0.88], "원본 좌표계가 다릅니다.")
    require(sum(op["operation"] == "moveTo" for op in outline["operations"]) == outline["contourCount"], "원본 contour 개수가 다릅니다.")
    group = initial["componentGroup"]
    area = payloads["initial"]["measurements"]["selectionArea"]
    require(group["status"] == "candidate" and initial["selectionArea"]["status"] == "candidate"
            and all(finite(area[key]) for key in ("x", "y", "width", "height"))
            and area["width"] > 0 and area["height"] > 0, "첫닿자 생성 기준 영역이 없습니다.")
    require(all(initial["roleFaces"][side]["status"] == "candidate" and finite(initial["roleFaces"][side]["value"])
                for side in ("left", "right", "top", "bottom")), "첫닿자 필수 역할면이 없습니다.")
    initial_ids = group["value"]["contourIds"]
    require(initial_ids and len(initial_ids) == len(set(initial_ids)) and all(type(value) is int for value in initial_ids), "첫닿자 contour 근거가 다릅니다.")
    roles = {role.element_id for role in MEDIAL_ROLE_SPECS[identity["medialJamo"]]}
    elements = medial["elements"]
    require(len(elements) == len(roles) and {element["elementId"] for element in elements} == roles, "홀자 필수 역할이 없습니다.")
    medial_ids = set()
    for element in elements:
        require(element["face"]["status"] == "candidate" and finite(element["face"]["value"])
                and element["visibleSpans"]["status"] == "candidate", "홀자 필수 역할면이 없습니다.")
        spans = element["visibleSpans"]["value"]
        require(spans and all(finite(span["from"]) and finite(span["to"]) and span["from"] < span["to"] for span in spans), "홀자 유한 노출 구간이 없습니다.")
        contour_id = element["face"]["evidence"]["contourId"]
        require(type(contour_id) is int and element["visibleSpans"]["evidence"]["contourId"] == contour_id, "홀자 contour 근거가 다릅니다.")
        medial_ids.add(contour_id)
    require(not set(initial_ids) & medial_ids and set(initial_ids) | medial_ids == set(range(outline["contourCount"])), "역할 오염 또는 미배정 contour가 있습니다.")


def compile_inputs(root=CORPUS, approval_path=APPROVAL):
    approval_bytes = approval_path.read_bytes()
    approval = json.loads(approval_bytes)
    require(approval["schema"] == "noto-corpus-user-approval-v1"
            and approval["source"] == "explicit-user-conversation"
            and approval["verdict"] == "approved-baseline-input"
            and approval["generatedFontApproved"] is False
            and approval["automaticVersionTransfer"] is False, "명시적인 기준선 입력 승인이 필요합니다.")
    require(approval["font"] == {"id": "noto-sans-kr", "fileSha256": G0_FONT_SHA256, "axes": {"wght": 400}, "unitsPerEm": 1000}, "승인 폰트 또는 축이 다릅니다.")
    report_path = contained_file(root, "review-history/" + approval["sourceReport"]["file"])
    report_bytes = report_path.read_bytes()
    require(hashlib.sha256(report_bytes).hexdigest() == approval["sourceReport"]["sha256"], "승인 당시 보고서 해시가 다릅니다.")
    report = json.loads(report_bytes)
    require(report["schema"] == "noto-guide-corpus-v1" and report["font"] == approval["font"]
            and report["stageKeys"] == approval["stageKeys"], "승인 당시 관측 버전이 다릅니다.")
    by_character = {row["identity"]["character"]: row for row in report["cases"]}
    require(len(by_character) == len(report["cases"]), "보고서에 중복 글자가 있습니다.")
    require(approval["candidateCount"] == len(approval["cases"]) > 0, "승인 글자 개수가 다릅니다.")
    cases = []
    seen = set()
    for approved in approval["cases"]:
        identity = approved["identity"]
        validate_identity(identity)
        require(identity["character"] not in seen, "승인에 중복 글자가 있습니다.")
        seen.add(identity["character"])
        row = by_character[identity["character"]]
        require(row["identity"] == identity, "승인과 보고서 identity가 다릅니다.")
        payloads = {}
        hashes = {}
        for stage in STAGES:
            declared = row["stages"][stage]
            key = approval["stageKeys"][stage]
            expected = f"cache/{stage}/{key}/{identity['codepoint']:X}.json"
            require(declared["artifact"] == expected, "승인 artifact 경로가 다릅니다.")
            record = read_json(contained_file(root, expected))
            require(record["schema"] == "noto-guide-stage-v1" and record["stage"] == stage
                    and record["stageKey"] == key and record["identity"] == identity, "승인 관측 identity 또는 버전이 다릅니다.")
            payload = record["payload"]
            sha = digest(payload)
            require(sha == record["payloadSha256"] == declared["payloadSha256"], "승인 관측 payload 해시가 다릅니다.")
            if stage != "outline":
                require(approved["roles"][stage]["verdict"] == "approved" and approved["roles"][stage]["payloadSha256"] == sha, "역할별 승인 해시가 다릅니다.")
            require(payload["status"] == declared["status"] == "candidate" and payload["measurements"] == declared["measurements"], "승인 관측과 집계 필수값이 다릅니다.")
            payloads[stage] = payload
            hashes[stage] = sha
        validate_geometry(identity, payloads)
        cases.append({"identity": identity, "sourcePayloadSha256": hashes, "stages": payloads})
    return {
        "schema": "noto-approved-guide-inputs-v1", "font": approval["font"],
        "approval": {"fileSha256": hashlib.sha256(approval_bytes).hexdigest(), "sourceReport": approval["sourceReport"], "stageKeys": approval["stageKeys"], "statement": approval["statement"], "recordedAt": approval["recordedAt"]},
        "coordinateFrame": "glyph-normalized-measurements-with-explicit-native-outline-transform",
        "sourceKind": "direct-approved-historical-observation", "inputApproved": True,
        "generatedFontApproved": False, "productionEligible": False, "automaticVersionTransfer": False,
        "caseCount": len(cases), "cases": cases,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--corpus", type=Path, default=CORPUS)
    parser.add_argument("--approval", type=Path, default=APPROVAL)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    try:
        result = compile_inputs(args.corpus, args.approval)
        encoded = json.dumps(result, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False) + "\n"
        args.output.parent.mkdir(parents=True, exist_ok=True)
        temporary = args.output.with_suffix(args.output.suffix + ".tmp")
        temporary.write_text(encoded, encoding="utf-8")
        temporary.replace(args.output)
        print(json.dumps({"output": str(args.output), "caseCount": result["caseCount"], "inputApproved": True, "generatedFontApproved": False}, ensure_ascii=False))
    except (OSError, ValueError, KeyError, TypeError) as error:
        parser.exit(1, str(error) + "\n")


if __name__ == "__main__":
    main()
