#!/usr/bin/env python3
"""Create separate user-visual verification for a final-component candidate."""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict

import final_component_contract as contract


def _sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _canonical_identity_sha256(candidate: Dict[str, Any]) -> str:
    identities = [case["identity"] for case in candidate["cases"]]
    canonical = json.dumps(
        identities,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return _sha256_bytes(canonical)


def create_verification(
    candidate_path: Path,
    state: str,
    reviewed_at: str,
    reviewed_by: str,
    note: str,
) -> Dict[str, Any]:
    if state not in contract.VERIFICATION_STATES:
        raise ValueError("검증 상태는 verified 또는 rejected여야 합니다.")
    try:
        datetime.fromisoformat(reviewed_at)
    except ValueError as error:
        raise ValueError("reviewedAt은 ISO 날짜여야 합니다.") from error
    if not reviewed_by or not note:
        raise ValueError("검토자와 화면 검토 메모가 필요합니다.")
    raw = candidate_path.read_bytes()
    candidate = json.loads(raw.decode("utf-8"))
    if (
        candidate.get("schema") != contract.RESPONSE_SCHEMA
        or candidate.get("lifecycle") != contract.CANDIDATE_LIFECYCLE
    ):
        raise ValueError("받침 candidate artifact가 아닙니다.")
    return {
        "schema": contract.VERIFICATION_SCHEMA,
        "state": state,
        "candidateArtifactSha256": _sha256_bytes(raw),
        "candidateIdentitySha256": _canonical_identity_sha256(candidate),
        "review": {
            "method": "user-visual-review",
            "reviewedAt": reviewed_at,
            "reviewedBy": reviewed_by,
            "note": note,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify final-component candidate after user visual review")
    parser.add_argument("--candidate", type=Path, required=True)
    parser.add_argument("--state", choices=contract.VERIFICATION_STATES, required=True)
    parser.add_argument("--reviewed-at", required=True)
    parser.add_argument("--reviewed-by", required=True)
    parser.add_argument("--note", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    verification = create_verification(
        args.candidate,
        args.state,
        args.reviewed_at,
        args.reviewed_by,
        args.note,
    )
    args.output.write_text(
        json.dumps(verification, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
