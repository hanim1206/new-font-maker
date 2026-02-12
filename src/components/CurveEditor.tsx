// CurveEditor.tsx
import React, { useMemo, useState } from 'react';
import { useGesture } from '@use-gesture/react';
import { path as d3Path } from 'd3-path';

type Pt = { x: number; y: number };

const Handle = ({
  p,
  onDrag,
  label,
}: {
  p: Pt;
  onDrag: (dx: number, dy: number) => void;
  label: string;
}) => {
  const bind = useGesture({
    onDrag: ({ delta: [dx, dy] }) => onDrag(dx, dy),
  });
  return (
    <g {...bind()} style={{ cursor: 'grab' }}>
      <circle cx={p.x} cy={p.y} r={7} fill="transparent" stroke="#111" />
      <text x={p.x + 10} y={p.y - 10} fontSize={12} fill="#111">
        {label}
      </text>
    </g>
  );
};

export default function CurveEditor() {
  // 시작점, 제어점1, 제어점2, 끝점
  const [p0, setP0] = useState<Pt>({ x: 120, y: 260 });
  const [c1, setC1] = useState<Pt>({ x: 200, y: 120 });
  const [c2, setC2] = useState<Pt>({ x: 380, y: 400 });
  const [p1, setP1] = useState<Pt>({ x: 520, y: 260 });

  // 베지어 경로 d 생성 (d3-path 사용)
  const d = useMemo(() => {
    const p = d3Path();
    p.moveTo(p0.x, p0.y);
    p.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, p1.x, p1.y);
    return p.toString();
  }, [p0, c1, c2, p1]);

  // 경계 박스(밖으로 못 나가게 하려면 clamp 로직 추가 가능)
  const W = 500,
    H = 500;

  const clamp = (x: number, min: number, max: number) =>
    Math.min(max, Math.max(min, x));

  const applyDrag =
    (setter: React.Dispatch<React.SetStateAction<Pt>>) =>
    (dx: number, dy: number) =>
      setter(prev => ({
        x: clamp(prev.x + dx, 0, W),
        y: clamp(prev.y + dy, 0, H),
      }));

  return (
    <div style={{ padding: 16, backgroundColor: '#eee' }}>
      <h3>Bezier Curve Editor (react-use-gesture + d3-path)</h3>
      <svg
        width="100%"
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: 40,
          background: '#fff',
        }}
      >
        {/* 보조선: 핸들 연결 */}
        <path
          d={`M ${p0.x} ${p0.y} L ${c1.x} ${c1.y}`}
          stroke="#94a3b8"
          fill="none"
        />
        <path
          d={`M ${p1.x} ${p1.y} L ${c2.x} ${c2.y}`}
          stroke="#94a3b8"
          fill="none"
        />

        {/* 실제 곡선 */}
        <path d={d} fill="none" stroke="#ef4444" strokeWidth={10} />

        {/* 핸들러(드래그 가능) */}
        <Handle p={p0} onDrag={applyDrag(setP0)} label="P0" />
        <Handle p={c1} onDrag={applyDrag(setC1)} label="C1" />
        <Handle p={c2} onDrag={applyDrag(setC2)} label="C2" />
        <Handle p={p1} onDrag={applyDrag(setP1)} label="P1" />
      </svg>

      <p style={{ marginTop: 8, color: '#374151' }}>
        포인트(P0/P1)와 제어점(C1/C2)을 드래그해 곡선을 조정하세요. d3-path가{' '}
        <code>d</code> 문자열을 만들고, react-use-gesture가 드래그를 처리합니다.
      </p>
    </div>
  );
}
