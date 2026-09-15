#!/usr/bin/env python3
"""Shared D0 contract for final-component candidate observations."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List


PROJECT_ROOT = Path(__file__).resolve().parents[2]
CONTRACT_PATH = PROJECT_ROOT / "reference-data/font-guide-calibrations/final-component-p0-contract.v1.json"

with CONTRACT_PATH.open(encoding="utf-8") as source:
    CONTRACT: Dict[str, Any] = json.load(source)

SCHEMA = str(CONTRACT["schema"])
RESPONSE_SCHEMA = str(CONTRACT["responseSchema"])
VERIFICATION_SCHEMA = str(CONTRACT["verificationSchema"])
EXTRACTOR_VERSION = str(CONTRACT["extractorVersion"])
ROLE_DEFINITION_VERSION = str(CONTRACT["roleDefinitionVersion"])
MEDIAL_ANCHOR_EXTRACTOR_VERSION = str(CONTRACT["medialAnchorExtractorVersion"])
COORDINATE_FRAME = str(CONTRACT["coordinateFrame"])
GROUPING_METHOD = str(CONTRACT["groupingMethod"])
MEMBER_PARTITION_METHOD = str(CONTRACT["memberPartitionMethod"])
BOUND_METHOD = str(CONTRACT["boundMethod"])
AXIS_FACE_METHOD = str(CONTRACT["axisFaceMethod"])
MEMBER_RELATION_METHOD = str(CONTRACT["memberRelationMethod"])
ROLE_FACE_METHOD = str(CONTRACT["roleFaceMethod"])
ROLE_FACE_SELECTION_RULE = str(CONTRACT["roleFaceSelectionRule"])
SELECTION_AREA_METHOD = str(CONTRACT["selectionAreaMethod"])
CANDIDATE_LIFECYCLE = str(CONTRACT["candidateLifecycle"])
VERIFICATION_STATES = tuple(str(value) for value in CONTRACT["verificationStates"])
MEMBER_ROLES = tuple(str(value) for value in CONTRACT["memberRoles"])
CONTACT_RELATIONS = tuple(str(value) for value in CONTRACT["contactRelations"])
BOUND_SIDES = tuple(str(value) for value in CONTRACT["boundSides"])
INITIAL_JAMOS = tuple(str(value) for value in CONTRACT["initialJamos"])
FINAL_JAMOS = tuple(str(value) for value in CONTRACT["finalJamos"])
STRUCTURE_KINDS = tuple(dict(value) for value in CONTRACT["structureKinds"])
MEMBER_SPECS = tuple(dict(value) for value in CONTRACT["memberSpecs"])
P0_CONTEXTS = tuple(dict(value) for value in CONTRACT["contexts"])
SELECTION_RULES = tuple(str(value) for value in CONTRACT["selectionRules"])
REASON_CODES = tuple(str(value) for value in CONTRACT["reasonCodes"])
FORBIDDEN_CANDIDATE_KEYS = tuple(str(value) for value in CONTRACT["forbiddenCandidateKeys"])
INVALIDATION_SCOPE = tuple(str(value) for value in CONTRACT["invalidationScope"])

ALL_MEDIALS = tuple("ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ")
MEDIAL_INDEX = {jamo: index for index, jamo in enumerate(ALL_MEDIALS)}
FINAL_INDEX = {jamo: index + 1 for index, jamo in enumerate(FINAL_JAMOS)}

MEDIAL_CONTEXT_CONTRACT_VERSION = "final-medial-context-v1"
MEDIAL_FAMILY = {
    **{jamo: "right" for jamo in "ㅏㅐㅑㅒㅓㅔㅕㅖㅣ"},
    **{jamo: "bottom" for jamo in "ㅗㅛㅜㅠㅡ"},
    **{jamo: "mixed" for jamo in "ㅘㅙㅚㅝㅞㅟㅢ"},
}


def _validate_contract() -> None:
    if len(INITIAL_JAMOS) != 19 or len(set(INITIAL_JAMOS)) != 19:
        raise ValueError("첫닿자 19종 계약이 필요합니다.")
    if len(FINAL_JAMOS) != 27 or len(set(FINAL_JAMOS)) != 27:
        raise ValueError("받침 27종 계약이 필요합니다.")
    if tuple(spec["finalJamo"] for spec in MEMBER_SPECS) != FINAL_JAMOS:
        raise ValueError("받침 구성원 계약 순서가 27종 순서와 다릅니다.")

    kinds_by_id = {str(kind["id"]): kind for kind in STRUCTURE_KINDS}
    classified = [str(jamo) for kind in STRUCTURE_KINDS for jamo in kind["finalJamos"]]
    if sorted(classified) != sorted(FINAL_JAMOS) or len(classified) != len(set(classified)):
        raise ValueError("받침은 정확히 하나의 구조군에 속해야 합니다.")

    for spec in MEMBER_SPECS:
        kind = kinds_by_id.get(str(spec["structureKind"]))
        if kind is None or spec["finalJamo"] not in kind["finalJamos"]:
            raise ValueError("받침 구성원과 구조군이 맞지 않습니다.")
        members = list(spec["members"])
        if len(members) != int(kind["expectedMemberCount"]):
            raise ValueError("구조군별 구성원 수가 맞지 않습니다.")
        expected_roles = ["only"] if kind["id"] == "single" else ["left", "right"]
        if [member["role"] for member in members] != expected_roles:
            raise ValueError("구성원 역할 순서가 맞지 않습니다.")
        if [member["id"] for member in members] != expected_roles:
            raise ValueError("구성원 ID와 역할이 맞지 않습니다.")
        if kind["id"] == "single" and members[0]["jamo"] != spec["finalJamo"]:
            raise ValueError("단일받침 구성원이 받침과 다릅니다.")
        if kind["id"] == "doubled" and members[0]["jamo"] != members[1]["jamo"]:
            raise ValueError("된받침은 같은 기본자 두 개여야 합니다.")
        if kind["id"] == "compound" and members[0]["jamo"] == members[1]["jamo"]:
            raise ValueError("겹받침은 서로 다른 구성원이어야 합니다.")


_validate_contract()


def member_spec_for(final_jamo: str) -> Dict[str, Any]:
    matches = [spec for spec in MEMBER_SPECS if spec["finalJamo"] == final_jamo]
    if len(matches) != 1:
        raise ValueError("받침은 정확히 하나의 구성원 계약을 가져야 합니다.")
    return matches[0]


def structure_kind_for(final_jamo: str) -> Dict[str, Any]:
    spec = member_spec_for(final_jamo)
    matches = [kind for kind in STRUCTURE_KINDS if kind["id"] == spec["structureKind"]]
    if len(matches) != 1:
        raise ValueError("받침은 정확히 하나의 구조군을 가져야 합니다.")
    return matches[0]


def _medial_contexts() -> tuple:
    """P0 3가족 템플릿에서 나머지 18홀자 문맥을 파생한다. 기존 P0 문맥 ID는 바꾸지 않는다."""
    templates = {str(context["medialJamo"]): context for context in P0_CONTEXTS}
    families = {MEDIAL_FAMILY[jamo]: templates[jamo] for jamo in templates}
    contexts = []
    for medial_jamo in ALL_MEDIALS:
        if medial_jamo in templates:
            continue
        template = families[MEDIAL_FAMILY[medial_jamo]]
        contexts.append({
            **template,
            "id": "{}-medial-{:04x}".format(template["id"], ord(medial_jamo)),
            "medialJamo": medial_jamo,
        })
    return tuple(contexts)


MEDIAL_CONTEXTS = _medial_contexts()
EXPANDED_MEDIAL_CONTEXT_IDS = frozenset(context["id"] for context in MEDIAL_CONTEXTS)


def compose_syllable(initial_jamo: str, medial_jamo: str, final_jamo: str) -> str:
    if initial_jamo not in INITIAL_JAMOS:
        raise ValueError("지원하지 않는 첫닿자입니다.")
    if medial_jamo not in MEDIAL_INDEX:
        raise ValueError("현대 홀자 21종이 아닙니다.")
    if final_jamo not in FINAL_INDEX:
        raise ValueError("현대 받침 27종이 아닙니다.")
    return chr(
        0xAC00
        + INITIAL_JAMOS.index(initial_jamo) * 588
        + MEDIAL_INDEX[medial_jamo] * 28
        + FINAL_INDEX[final_jamo]
    )


def g0_cases() -> List[Dict[str, str]]:
    return [
        {
            "character": compose_syllable("ㄱ", str(context["medialJamo"]), final_jamo),
            "initialJamo": "ㄱ",
            "medialJamo": str(context["medialJamo"]),
            "finalJamo": final_jamo,
            "contextId": str(context["id"]),
        }
        for context in P0_CONTEXTS
        for final_jamo in FINAL_JAMOS
    ]


def g2_cases() -> List[Dict[str, str]]:
    return [
        {
            "character": compose_syllable(initial_jamo, str(context["medialJamo"]), final_jamo),
            "initialJamo": initial_jamo,
            "medialJamo": str(context["medialJamo"]),
            "finalJamo": final_jamo,
            "contextId": str(context["id"]),
        }
        for initial_jamo in INITIAL_JAMOS
        for context in P0_CONTEXTS
        for final_jamo in FINAL_JAMOS
    ]


def expanded_medial_cases() -> List[Dict[str, str]]:
    return [
        {
            "character": compose_syllable(initial_jamo, str(context["medialJamo"]), final_jamo),
            "initialJamo": initial_jamo,
            "medialJamo": str(context["medialJamo"]),
            "finalJamo": final_jamo,
            "contextId": str(context["id"]),
        }
        for initial_jamo in INITIAL_JAMOS
        for context in MEDIAL_CONTEXTS
        for final_jamo in FINAL_JAMOS
    ]


def selection_area_from_role_faces(role_faces: Dict[str, float]) -> Dict[str, float]:
    if set(role_faces) != set(BOUND_SIDES):
        raise ValueError("상·하·좌·우 네 받침 역할 단면이 필요합니다.")
    top = float(role_faces["top"])
    bottom = float(role_faces["bottom"])
    left = float(role_faces["left"])
    right = float(role_faces["right"])
    if not top < bottom or not left < right:
        raise ValueError("받침 역할 단면 순서가 잘못됐습니다.")
    return {
        "x": left,
        "y": top,
        "width": right - left,
        "height": bottom - top,
    }
