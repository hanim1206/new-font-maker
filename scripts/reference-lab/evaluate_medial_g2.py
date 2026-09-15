#!/usr/bin/env python3
"""Evaluate frozen medial matcher on Noto holdout and full P0 scope.

Outputs are diagnostics, never gold or production font data.
"""

from __future__ import annotations

import argparse
import html
import json
import math
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

from fontTools.pens.svgPathPen import SVGPathPen

import medial_guide_extractor as extractor


INITIAL_JAMOS: Tuple[str, ...] = (
    "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
    "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
)
MEDIAL_JAMOS: Tuple[str, ...] = ("ㅏ", "ㅓ", "ㅣ", "ㅗ", "ㅜ", "ㅡ", "ㅘ")
MEDIAL_INDEX = {"ㅏ": 0, "ㅓ": 4, "ㅣ": 20, "ㅗ": 8, "ㅜ": 13, "ㅡ": 18, "ㅘ": 9}
G2_INITIAL_JAMOS: Tuple[str, ...] = ("ㄷ", "ㅁ", "ㅍ", "ㅎ")
FINAL_CASES: Tuple[Tuple[Optional[str], int], ...] = ((None, 0), ("ㄱ", 1))


def compose(initial_jamo: str, medial_jamo: str, final_index: int) -> str:
    return chr(0xAC00 + INITIAL_JAMOS.index(initial_jamo) * 588 + MEDIAL_INDEX[medial_jamo] * 28 + final_index)


def evaluation_cases(scope: str) -> List[Dict[str, Optional[str]]]:
    initials = G2_INITIAL_JAMOS if scope == "g2" else INITIAL_JAMOS
    medials = ("ㅏ", "ㅗ", "ㅘ") if scope == "g2" else MEDIAL_JAMOS
    return [
        {
            "character": compose(initial_jamo, medial_jamo, final_index),
            "initialJamo": initial_jamo,
            "medialJamo": medial_jamo,
            "finalJamo": final_jamo,
        }
        for initial_jamo in initials
        for medial_jamo in medials
        for final_jamo, final_index in FINAL_CASES
    ]


def finite_numbers(value: Any) -> Iterable[float]:
    if isinstance(value, bool) or value is None:
        return
    if isinstance(value, (int, float)):
        yield float(value)
        return
    if isinstance(value, dict):
        for nested in value.values():
            yield from finite_numbers(nested)
        return
    if isinstance(value, (list, tuple)):
        for nested in value:
            yield from finite_numbers(nested)


def usable(element: Dict[str, Any]) -> bool:
    return element["face"]["status"] == "candidate" and element["visibleSpans"]["status"] == "candidate"


def evaluate(font_path: Path, scope: str) -> Dict[str, Any]:
    actual_hash = extractor._sha256(font_path)  # pylint: disable=protected-access
    if actual_hash != extractor.G0_FONT_SHA256:
        raise ValueError("G2는 고정 Noto Sans KR SHA에서만 평가합니다.")
    font = extractor.load_font(font_path)
    try:
        cases = []
        for case in evaluation_cases(scope):
            result = extractor.extract_medial_character(
                font,
                str(case["character"]),
                str(case["medialJamo"]),
                case["finalJamo"],
            )
            cases.append({**case, "glyphName": result["glyphName"], "elements": result["elements"]})
    finally:
        font.close()

    elements = [element for case in cases for element in case["elements"]]
    invalid_numbers = [value for value in finite_numbers(cases) if not math.isfinite(value)]
    simple_elements = [element for case in cases if case["medialJamo"] != "ㅘ" for element in case["elements"]]
    mixed_elements = [element for case in cases if case["medialJamo"] == "ㅘ" for element in case["elements"]]
    confidence = {
        label: sum(element["match"]["confidence"] == label for element in elements)
        for label in ("high", "medium", "abstained")
    }
    reason_codes: Dict[str, int] = {}
    for element in elements:
        if usable(element):
            continue
        component = element["face"] if element["face"]["status"] == "abstained" else element["visibleSpans"]
        reason = component["reasonCode"]
        reason_codes[reason] = reason_codes.get(reason, 0) + 1
    role_contract_violations = []
    for case in cases:
        expected = [role.element_id for role in extractor.MEDIAL_ROLE_SPECS[case["medialJamo"]]]
        actual = [element["elementId"] for element in case["elements"]]
        if actual != expected or len(set(actual)) != len(actual):
            role_contract_violations.append({"character": case["character"], "expected": expected, "actual": actual})
    missing_evidence = [
        {"character": case["character"], "elementId": element["elementId"]}
        for case in cases
        for element in case["elements"]
        if not element["face"].get("evidence")
        or not element["visibleSpans"].get("evidence")
        or (not usable(element) and not (
            element["face"].get("reasonCode")
            or element["visibleSpans"].get("reasonCode")
        ))
    ]

    return {
        "schema": "medial-guide-p0-evaluation-v1",
        "version": 1,
        "status": "diagnostic-not-gold",
        "productionEligible": False,
        "scope": scope,
        "font": {"id": extractor.G0_FONT_ID, "fileSha256": actual_hash},
        "extractorVersion": extractor.EXTRACTOR_VERSION,
        "thresholdPolicy": "g1-frozen-contour-plus-g4-segment-fallback",
        "summary": {
            "caseCount": len(cases),
            "elementCount": len(elements),
            "usableCandidateCount": sum(usable(element) for element in elements),
            "confidence": confidence,
            "usableConfidence": {
                label: sum(usable(element) and element["match"]["confidence"] == label for element in elements)
                for label in ("high", "medium")
            },
            "reasonCodes": reason_codes,
            "simpleCandidateRate": round(sum(usable(element) for element in simple_elements) / len(simple_elements), 4),
            "mixedCandidateRate": round(sum(usable(element) for element in mixed_elements) / len(mixed_elements), 4),
            "invalidNumberCount": len(invalid_numbers),
            "roleContractViolationCount": len(role_contract_violations),
            "missingEvidenceCount": len(missing_evidence),
        },
        "violations": {
            "roleContract": role_contract_violations,
            "missingEvidence": missing_evidence,
        },
        "cases": cases,
    }


def contact_sheet_html(
    font_path: Path,
    report: Dict[str, Any],
    heading: str = "Noto G2 첫닿자 holdout",
) -> str:
    font = extractor.load_font(font_path)
    try:
        glyph_set = font.getGlyphSet()
        cmap = font.getBestCmap() or {}
        scale = 1000.0 / int(font["head"].unitsPerEm)
        cards: List[str] = []
        for case in report["cases"]:
            character = case["character"]
            glyph_name = cmap[ord(character)]
            path_pen = SVGPathPen(glyph_set)
            glyph_set[glyph_name].draw(path_pen)
            lines: List[str] = []
            labels: List[str] = []
            for element in case["elements"]:
                face = element["face"]
                spans = element["visibleSpans"]
                match = element["match"]
                if usable(element):
                    position = face["value"]
                    for span in spans["value"]:
                        if element["orientation"] == "vertical":
                            coordinates = 'x1="{0}" x2="{0}" y1="{1}" y2="{2}"'.format(position, span["from"], span["to"])
                        else:
                            coordinates = 'x1="{1}" x2="{2}" y1="{0}" y2="{0}"'.format(position, span["from"], span["to"])
                        lines.append('<line class="face" data-element="{}" {} />'.format(element["elementId"], coordinates))
                    ranges = " · ".join("{}–{}".format(round(span["from"]), round(span["to"])) for span in spans["value"])
                    labels.append(
                        "<li><b>{}</b> c{} · {} · {}={} · {}</li>".format(
                            element["elementId"],
                            face["evidence"]["contourId"],
                            match["confidence"],
                            "x" if element["orientation"] == "vertical" else "y",
                            round(position),
                            ranges,
                        )
                    )
                else:
                    component = face if face["status"] == "abstained" else spans
                    labels.append(
                        '<li class="abstained"><b>{}</b> c{} · {} · {}</li>'.format(
                            element["elementId"],
                            face["evidence"]["contourId"],
                            match["confidence"],
                            component["reasonCode"],
                        )
                    )
            cards.append(
                """<article data-character="{character}">
                <h2>{character} <small>{initial} · {medial} · {final}</small></h2>
                <svg viewBox="-120 -120 1240 1240">
                  <rect class="em" x="0" y="0" width="1000" height="1000" />
                  {lines}<g transform="matrix({scale} 0 0 -{scale} 0 880)"><path d="{path}" /></g>
                </svg><ul>{labels}</ul></article>""".format(
                    character=html.escape(character),
                    initial=html.escape(case["initialJamo"]),
                    medial=html.escape(case["medialJamo"]),
                    final=html.escape(case["finalJamo"] or "받침 없음"),
                    lines="".join(lines),
                    scale=scale,
                    path=html.escape(path_pen.getCommands(), quote=True),
                    labels="".join(labels),
                )
            )
    finally:
        font.close()

    summary = report["summary"]
    return """<!doctype html><html lang="ko"><meta charset="utf-8"><title>{heading}</title>
<style>
*{{box-sizing:border-box}}body{{margin:0;padding:24px;background:#eef2f7;color:#172033;font:13px system-ui,sans-serif}}
header{{max-width:1480px;margin:0 auto 18px}}h1{{margin:0 0 6px;font-size:28px}}header p{{margin:4px 0;color:#526176}}
main{{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;max-width:1480px;margin:auto}}
article{{overflow:hidden;padding:12px;border:1px solid #d9e0ea;border-radius:12px;background:#fff}}h2{{display:flex;justify-content:space-between;margin:0 0 6px;font-size:22px}}h2 small{{color:#64748b;font-size:11px}}
svg{{display:block;width:100%;background:#fbfcfe;border:1px solid #e4e8ee}}.em{{fill:none;stroke:#dfe5ed;stroke-width:2}}path{{fill:#171717}}.face{{stroke:#e37700;stroke-width:5;stroke-linecap:round;vector-effect:non-scaling-stroke}}
ul{{display:grid;gap:3px;margin:8px 0 0;padding:0;list-style:none;font-size:11px;line-height:1.35}}li{{overflow-wrap:anywhere}}li b{{color:#a35200}}li.abstained{{color:#9b2c2c}}
</style><header><h1>{heading}</h1><p>주황선: {extractor_version} 결과. gold·생산값 아님.</p>
<p>{cases}글자 · {elements}요소 · usable {usable} · simple {simple:.1%} · mixed {mixed:.1%} · invalid {invalid}</p></header><main>{cards}</main></html>""".format(
        cases=summary["caseCount"],
        elements=summary["elementCount"],
        usable=summary["usableCandidateCount"],
        simple=summary["simpleCandidateRate"],
        mixed=summary["mixedCandidateRate"],
        invalid=summary["invalidNumberCount"],
        extractor_version=report["extractorVersion"],
        heading=html.escape(heading),
        cards="".join(cards),
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate frozen medial guide matcher")
    parser.add_argument("font", type=Path)
    parser.add_argument("--scope", choices=("g2", "p0"), default="g2")
    parser.add_argument("--json", type=Path)
    parser.add_argument("--html", type=Path)
    args = parser.parse_args()
    report = evaluate(args.font.resolve(), args.scope)
    if args.json:
        args.json.resolve().write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if args.html:
        if args.scope != "g2":
            parser.error("--html은 g2 scope에서만 지원합니다.")
        args.html.resolve().write_text(contact_sheet_html(args.font.resolve(), report), encoding="utf-8")
    if not args.json and not args.html:
        print(json.dumps(report["summary"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
