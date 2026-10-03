#!/usr/bin/env python3
"""참고 폰트 측정에서 "좁은 틈 벌리기" 규칙을 역추론한다 — 벌리기 층의 입력.

플랜 `docs/plans/2026-10-02_속공간-벌리기-층.md` 단계 1. 관측만 한다.
입력은 `measure_weight_offsets.py` 출력(원시 프로브 구간 포함). 폰트 이름을 박지 않는다.

틈 쌍: 같은 프로브에서 기준 굵기(400)와 대상 굵기의 잉크 구간 수가 같을 때,
이웃 구간 사이 틈마다 —
- 예측 틈 = 중심 고정 가정(틈 양쪽 구간이 제자리에서 굵어지기만 한다)으로 남는 틈
- 실제 틈 = 대상 굵기에서 잰 틈

규칙(확정, G0): 실제 = max(예측, 0.25 × 그 굵기의 양쪽 줄기 두께 평균).
벌릴 때 양쪽 획이 반반으로 틈에서 멀어진다(900 눌린 쌍 12개 중앙값 0.5 / 0.49).
쐐기(실제가 끝까지 거의 0인 틈)는 예외로 제외하고 따로 센다.
검증(G0): 규칙이 손대는 눌린 틈(예측 ≤ 20u)에서 규칙 오차 대 무규칙 오차.
"""

from __future__ import annotations

import argparse
import json
import statistics
from pathlib import Path
from typing import Any, Dict, List, Optional

# compare_weight_offsets.py와 같은 줄기 거름망.
STEM_BASE_MIN = 25.0
STEM_BASE_MAX = 150.0
RATIO_MAX = 3.0
# 실제 틈이 이 아래로 끝까지 남으면 쐐기(ㅅ 다리처럼 원래 붙다시피인 자리)로 보고 바닥 맞춤에서 뺀다.
WEDGE_MAX = 10.0
# 예측 틈이 이보다 넉넉하면 손 안 댄 구간으로 본다(바닥 맞춤 대상 아님). 400 줄기 두께 상한 근처.
UNTOUCHED_MIN = 60.0
# 확정 규칙의 바닥 — 굵어진 두께(틈 양쪽 평균)의 비율. 0.2 · 0.25 · 0.3 중 재현 오차 최소(900: 6.0u).
FLOOR_FRACTION = 0.25


def load(path: Path) -> Dict[str, Any]:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def median_of(values: List[float]) -> Optional[float]:
    return round(statistics.median(values), 2) if values else None


def collect_pairs(data: Dict[str, Any], weight: str, base_weight: str = "400") -> List[Dict[str, Any]]:
    """틈 쌍 목록. 각 쌍 = {char, orientation, ratio, index, base_gap, predicted, actual, flank_thickness}."""
    pairs: List[Dict[str, Any]] = []
    for character, entry in data["characters"].items():
        base = entry.get("weights", {}).get(base_weight, {})
        target = entry.get("weights", {}).get(weight, {})
        if base.get("reasonCode") or target.get("reasonCode"):
            continue
        for orientation in ("horizontal", "vertical"):
            base_rows = {row["ratio"]: row for row in base.get("probes", {}).get(orientation, [])}
            for row in target.get("probes", {}).get(orientation, []):
                base_row = base_rows.get(row["ratio"])
                if not base_row:
                    continue
                b_iv = base_row.get("intervals", [])
                t_iv = row.get("intervals", [])
                # 구간 수가 다르면 400과 대상이 서로 다른 것을 짚은 프로브 — 통째로 버린다.
                if len(b_iv) != len(t_iv) or len(b_iv) < 2:
                    continue
                widths_b = [iv[1] - iv[0] for iv in b_iv]
                widths_t = [iv[1] - iv[0] for iv in t_iv]
                for i in range(len(b_iv) - 1):
                    # 틈 양쪽이 둘 다 줄기여야 한다(기둥 관통 · 동그라미 통짜 · 꼭지 끝자락 거름).
                    ok = True
                    for j in (i, i + 1):
                        if not STEM_BASE_MIN <= widths_b[j] <= STEM_BASE_MAX:
                            ok = False
                        if widths_b[j] > 0 and widths_t[j] / widths_b[j] > RATIO_MAX:
                            ok = False
                    if not ok:
                        continue
                    base_gap = b_iv[i + 1][0] - b_iv[i][1]
                    actual = t_iv[i + 1][0] - t_iv[i][1]
                    predicted = base_gap - (widths_t[i] - widths_b[i]) / 2 - (widths_t[i + 1] - widths_b[i + 1]) / 2
                    pairs.append({
                        "char": character, "orientation": orientation, "ratio": row["ratio"], "index": i,
                        "baseGap": round(base_gap, 1), "predicted": round(predicted, 1), "actual": round(actual, 1),
                        "flankThickness": round((widths_t[i] + widths_t[i + 1]) / 2, 1),
                    })
    return pairs


def fit_floor(pairs: List[Dict[str, Any]]) -> Dict[str, Any]:
    """예측이 좁은 틈에서 실제 틈의 바닥을 맞춘다. 바닥은 u와 두께 비율 둘 다로 낸다."""
    wedges = [p for p in pairs if p["actual"] <= WEDGE_MAX]
    opened = [p for p in pairs if p["actual"] > WEDGE_MAX and p["predicted"] < UNTOUCHED_MIN]
    untouched = [p for p in pairs if p["actual"] > WEDGE_MAX and p["predicted"] >= UNTOUCHED_MIN]
    # 바닥 = "그냥 두면 닿는(예측 ≤ 0)" 틈이 실제로 벌어진 값의 중앙값.
    squeezed = [p for p in opened if p["predicted"] <= 20.0]
    floor_u = median_of([p["actual"] for p in squeezed])
    floor_frac = median_of([p["actual"] / p["flankThickness"] for p in squeezed if p["flankThickness"] > 0])
    return {
        "counts": {"all": len(pairs), "wedge": len(wedges), "opened": len(opened), "untouched": len(untouched), "squeezed": len(squeezed)},
        "floorU": floor_u,
        "floorPerThickness": floor_frac,
        "untouchedError": median_of([abs(p["actual"] - p["predicted"]) for p in untouched]),
    }


def validate(pairs: List[Dict[str, Any]]) -> Dict[str, Any]:
    """확정 규칙 실제′ = max(예측, 0.25 × 두께)로 전 쌍을 예측, 오차 분포. 쐐기는 예외라 뺀다."""
    errors: List[float] = []
    naive_errors: List[float] = []
    squeezed_errors: List[float] = []
    squeezed_naive: List[float] = []
    worst: List[Dict[str, Any]] = []
    for p in pairs:
        if p["actual"] <= WEDGE_MAX:
            continue
        ruled = max(p["predicted"], FLOOR_FRACTION * p["flankThickness"])
        err = abs(ruled - p["actual"])
        errors.append(err)
        naive_errors.append(abs(p["predicted"] - p["actual"]))
        if p["predicted"] <= 20.0:
            # 규칙이 실제로 손대는 곳 — 여기서 무규칙 대비 얼마나 좋아지나가 신호다.
            squeezed_errors.append(err)
            squeezed_naive.append(abs(p["predicted"] - p["actual"]))
        worst.append({**p, "ruled": round(ruled, 1), "error": round(err, 1)})
    worst.sort(key=lambda p: -p["error"])
    errors_sorted = sorted(errors)
    p90 = errors_sorted[int(len(errors_sorted) * 0.9)] if errors_sorted else None
    return {
        "count": len(errors),
        "errorMedian": median_of(errors),
        "errorP90": round(p90, 2) if p90 is not None else None,
        "naiveErrorMedian": median_of(naive_errors),
        "squeezedErrorMedian": median_of(squeezed_errors),
        "squeezedNaiveMedian": median_of(squeezed_naive),
        "squeezedCount": len(squeezed_errors),
        "worst": [{k: p[k] for k in ("char", "orientation", "ratio", "predicted", "actual", "ruled", "error")} for p in worst[:8]],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="좁은 틈 벌리기 규칙 역추론 (관측 불변)")
    parser.add_argument("--reference", type=Path, default=Path("reference-data/noto-weight-offsets.v1.json"))
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    data = load(args.reference)
    base_weight = str(data["baseWeight"])
    weights = [str(w) for w in data["weights"] if str(w) != base_weight and int(w) > int(base_weight)]

    result: Dict[str, Any] = {"schema": "weight-gap-rule-v1", "baseWeight": base_weight, "weights": {}}
    print("== 굵기별 바닥과 재현 오차 (u, 중앙값) ==")
    print("w    쌍(쐐기/벌림/그대로)   바닥u  바닥/두께   그대로오차   규칙오차(중/90%)  무규칙오차")
    for weight in weights:
        pairs = collect_pairs(data, weight, base_weight)
        fit = fit_floor(pairs)
        check = validate(pairs)
        result["weights"][weight] = {"fit": fit, "validation": check, "pairs": pairs}
        c = fit["counts"]
        print(f"{weight:>4} {c['all']:>4} ({c['wedge']:>3}/{c['opened']:>3}/{c['untouched']:>3})   "
              f"{fit['floorU'] or '-':>5}  {fit['floorPerThickness'] or '-':>7}   {fit['untouchedError'] or '-':>8}   "
              f"{check['errorMedian'] or '-':>5} / {check['errorP90'] or '-':>5}   {check['naiveErrorMedian'] or '-':>7}   "
              f"눌린 {check['squeezedCount']:>2}: 규칙 {check['squeezedErrorMedian'] or '-'} 대 무규칙 {check['squeezedNaiveMedian'] or '-'}")

    final = result["weights"].get("900", {})
    if final:
        print("\n== 900 나쁜 쌍 (규칙 오차 큰 순) ==")
        for p in final["validation"]["worst"]:
            print(f"  {p['char']} {p['orientation'][:1]}@{p['ratio']}: 예측 {p['predicted']} → 규칙 {p['ruled']} 대 실제 {p['actual']} (오차 {p['error']})")

    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        slim = {w: {"fit": v["fit"], "validation": {k: v["validation"][k] for k in ("count", "errorMedian", "errorP90", "naiveErrorMedian")}}
                for w, v in result["weights"].items()}
        with args.output.open("w", encoding="utf-8") as target:
            json.dump({**result, "weights": slim}, target, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        print(f"\n저장: {args.output}")


if __name__ == "__main__":
    main()
