import React from 'react';
import { path as d3Path } from 'd3-path';

/** 편의를 위해 path 문자열 타입 별칭 */
type D = string;

/** 직사각형(모서리 라운드) */
function rectRounded(x: number, y: number, w: number, h: number, r: number): D {
  const p = d3Path();
  const rr = Math.min(r, Math.min(w, h) / 2);

  p.moveTo(x + rr, y);
  p.lineTo(x + w - rr, y);
  p.quadraticCurveTo(x + w, y, x + w, y + rr);
  p.lineTo(x + w, y + h - rr);
  p.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  p.lineTo(x + rr, y + h);
  p.quadraticCurveTo(x, y + h, x, y + h - rr);
  p.lineTo(x, y + rr);
  p.quadraticCurveTo(x, y, x + rr, y);
  p.closePath();

  return p.toString();
}

/** 원 (arc 사용) */
function circle(cx: number, cy: number, r: number): D {
  const p = d3Path();
  p.moveTo(cx + r, cy);
  p.arc(cx, cy, r, 0, Math.PI * 2, false);
  p.closePath();
  return p.toString();
}

/** 다각형(점 배열 → 직선 연결) */
function polygon(points: Array<{ x: number; y: number }>, closed = true): D {
  const p = d3Path();
  points.forEach((pt, i) => {
    if (i === 0) p.moveTo(pt.x, pt.y);
    else p.lineTo(pt.x, pt.y);
  });
  if (closed) p.closePath();
  return p.toString();
}

/** 큐빅 베지어로 만든 곡선 예시 */
function cubicDemo(x: number, y: number): D {
  const p = d3Path();
  p.moveTo(x, y); // 시작점
  p.bezierCurveTo(
    // C (cx1, cy1, cx2, cy2, x, y)
    x + 60,
    y - 80,
    x + 140,
    y + 80,
    x + 200,
    y
  );
  return p.toString();
}

/** 부채꼴(원호) */
function wedge(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number
): D {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const p = d3Path();
  const sx = cx + r * Math.cos(toRad(startDeg));
  const sy = cy + r * Math.sin(toRad(startDeg));

  p.moveTo(cx, cy);
  p.lineTo(sx, sy);
  p.arc(cx, cy, r, toRad(startDeg), toRad(endDeg), false);
  p.closePath();
  return p.toString();
}

/** 보조: 가벼운 격자 */
function grid(width: number, height: number, gap = 50): D[] {
  const ds: D[] = [];
  for (let x = 0; x <= width; x += gap) {
    const p = d3Path();
    p.moveTo(x, 0);
    p.lineTo(x, height);
    ds.push(p.toString());
  }
  for (let y = 0; y <= height; y += gap) {
    const p = d3Path();
    p.moveTo(0, y);
    p.lineTo(width, y);
    ds.push(p.toString());
  }
  return ds;
}

/** 테스트 컴포넌트 */
export default function TestD3() {
  const W = 800;
  const H = 800;

  const dRect = rectRounded(40, 40, 180, 120, 24);
  const dCircle = circle(360, 100, 60);
  const dPoly = polygon(
    [
      { x: 560, y: 40 },
      { x: 740, y: 80 },
      { x: 700, y: 160 },
      { x: 540, y: 140 },
    ],
    true
  );
  const dCubic = cubicDemo(80, 260);
  const dWedge = wedge(360, 320, 90, -40, 220);
  const dGrid = grid(W, H, 10);

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ marginBottom: 8 }}>TestD3 — d3-path로 만든 SVG 도형</h2>
      <svg
        width="100%"
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        style={{
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
        }}
      >
        {/* 격자 */}
        <g opacity={0.5}>
          {dGrid.map((d, i) => {
            console.log('d', d);
            return (
              <path
                key={`g-${i}`}
                d={d}
                stroke={i % 10 ? '#9ca3af' : 'red'}
                fill="none"
              />
            );
          })}
        </g>

        {/* 도형들 */}
        <path d={dRect} fill="#fef08a" stroke="#f59e0b" />
        <path d={dCircle} fill="#bae6fd" stroke="#0284c7" />
        <path d={dPoly} fill="#ddd6fe" stroke="#7c3aed" />
        <path d={dCubic} fill="none" stroke="#ef4444" strokeWidth={3} />
        <path d={dWedge} fill="#bbf7d0" stroke="#16a34a" />
      </svg>

      <ol style={{ marginTop: 12, color: '#374151' }}>
        <li>
          <b>d3Path()</b>로 “가상의 캔버스 컨텍스트”를 만들고,
        </li>
        <li>
          <b>moveTo/lineTo/arc/quadraticCurveTo/bezierCurveTo</b>를 호출해서
          경로를 쌓은 뒤,
        </li>
        <li>
          <b>toString()</b>으로 SVG <code>d</code> 문자열을 얻어{' '}
          <code>&lt;path d="..." /&gt;</code>에 꽂습니다.
        </li>
      </ol>
    </div>
  );
}
