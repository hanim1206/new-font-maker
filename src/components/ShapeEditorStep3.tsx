// ShapeEditorStep3.tsx
import { path as d3Path } from 'd3-path';
import { useGesture } from '@use-gesture/react';
import { useRef, useState } from 'react';
import styled from 'styled-components';

// ── 기본 타입
type Pt = { x: number; y: number };

// 선/곡선(2차/3차) 모두를 하나의 유니온으로 관리
type Stroke =
  | {
      id: number;
      type: 'line';
      p0: Pt;
      p1: Pt;
      color?: string;
      strokeWidth?: number;
    }
  | {
      id: number;
      type: 'quadratic';
      p0: Pt;
      p1: Pt;
      q: Pt;
      color?: string;
      strokeWidth?: number;
    }
  | {
      id: number;
      type: 'cubic';
      p0: Pt;
      p1: Pt;
      c1: Pt;
      c2: Pt;
      color?: string;
      strokeWidth?: number;
    };

const INITIAL_COLOR = '#111';
const INITIAL_STROKE_WIDTH = 12;
const INITIAL_POSITIONS = {
  p0: { x: 100, y: 250 },
  p1: { x: 300, y: 250 },
} as const;

export default function ShapeEditorStep3() {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [selectedStrokeId, setSelectedStrokeId] = useState<number | null>(null);
  const nextIdRef = useRef(0);

  // ── 드래그 바인딩 (요소의 data-*를 읽어서 어떤 포인트인지 판단)
  const bind = useGesture({
    onDragStart: ({ event }) => {
      const host = (event.target as HTMLElement).closest(
        '[data-stroke-id]'
      ) as HTMLElement | null;
      if (!host) return;
      const strokeId = Number(host.dataset.strokeId);
      setSelectedStrokeId(strokeId);
      event.stopPropagation?.();
    },
    onDrag: ({ delta, event }) => {
      const el = event.target as HTMLElement;
      const host = el.closest('[data-stroke-id]') as HTMLElement | null;
      if (!host) return;

      const strokeId = Number(host.dataset.strokeId);
      const pointType = (el.getAttribute('data-point-type') || 'all') as
        | 'all'
        | 'p0'
        | 'p1'
        | 'q'
        | 'c1'
        | 'c2';

      setStrokes(prev =>
        prev.map(stroke =>
          stroke.id === strokeId
            ? updatePoint(stroke, pointType, delta as [number, number])
            : stroke
        )
      );
      event.stopPropagation?.();
    },
  });

  // ── 포인트/전체 이동
  function updatePoint(
    stroke: Stroke,
    which: 'all' | 'p0' | 'p1' | 'q' | 'c1' | 'c2',
    [dx, dy]: [number, number]
  ): Stroke {
    const move = (pt: Pt) => ({ x: pt.x + dx, y: pt.y + dy });

    if (which === 'p0') return { ...stroke, p0: move(stroke.p0) };
    if (which === 'p1') return { ...stroke, p1: move(stroke.p1) };

    if (stroke.type === 'quadratic' && which === 'q')
      return { ...stroke, q: move(stroke.q) };
    if (stroke.type === 'cubic') {
      if (which === 'c1') return { ...stroke, c1: move(stroke.c1) };
      if (which === 'c2') return { ...stroke, c2: move(stroke.c2) };
    }

    // 전체 이동
    if (stroke.type === 'line') {
      return { ...stroke, p0: move(stroke.p0), p1: move(stroke.p1) };
    } else if (stroke.type === 'quadratic') {
      return {
        ...stroke,
        p0: move(stroke.p0),
        p1: move(stroke.p1),
        q: move(stroke.q),
      };
    } else {
      return {
        ...stroke,
        p0: move(stroke.p0),
        p1: move(stroke.p1),
        c1: move(stroke.c1),
        c2: move(stroke.c2),
      };
    }
  }

  // ── 그리기
  function drawPath(stroke: Stroke) {
    const path = d3Path();
    path.moveTo(stroke.p0.x, stroke.p0.y);

    if (stroke.type === 'line') {
      path.lineTo(stroke.p1.x, stroke.p1.y);
    } else if (stroke.type === 'quadratic') {
      path.quadraticCurveTo(stroke.q.x, stroke.q.y, stroke.p1.x, stroke.p1.y);
    } else {
      path.bezierCurveTo(
        stroke.c1.x,
        stroke.c1.y,
        stroke.c2.x,
        stroke.c2.y,
        stroke.p1.x,
        stroke.p1.y
      );
    }
    return path.toString();
  }

  function drawCircle(radius: number, x: number, y: number) {
    const path = d3Path();
    const segments = 32;
    const angleStep = (2 * Math.PI) / segments;
    path.moveTo(x + radius, y);
    for (let i = 1; i <= segments; i++) {
      const angle = i * angleStep;
      path.lineTo(x + radius * Math.cos(angle), y + radius * Math.sin(angle));
    }
    return path.toString();
  }

  // ── 버튼 액션
  const createStroke = () => {
    const newId = nextIdRef.current++;
    setStrokes(prev => [
      ...prev,
      {
        id: newId,
        type: 'line',
        ...INITIAL_POSITIONS,
        color: INITIAL_COLOR,
        strokeWidth: INITIAL_STROKE_WIDTH,
      },
    ]);
    setSelectedStrokeId(newId);
  };

  const deleteStroke = () => {
    setStrokes(prev => prev.filter(stroke => stroke.id !== selectedStrokeId));
    setSelectedStrokeId(prev => {
      const left = strokes.filter(s => s.id !== prev);
      return left.length ? left[left.length - 1].id : null;
    });
  };

  // line → quadratic
  const lineToQuadratic = () => {
    if (selectedStrokeId == null) return;
    setStrokes(prev =>
      prev.map(stroke => {
        if (stroke.id !== selectedStrokeId || stroke.type !== 'line')
          return stroke;
        const q = {
          x: (stroke.p0.x + stroke.p1.x) / 2,
          y: (stroke.p0.y + stroke.p1.y) / 2 + 50,
        };
        return { ...stroke, type: 'quadratic', q };
      })
    );
  };

  // line → cubic
  const lineToCubic = () => {
    if (selectedStrokeId == null) return;
    setStrokes(prev =>
      prev.map(stroke => {
        if (stroke.id !== selectedStrokeId || stroke.type !== 'line')
          return stroke;
        const dx = stroke.p1.x - stroke.p0.x;
        const dy = stroke.p1.y - stroke.p0.y;
        const c1 = { x: stroke.p0.x + dx / 3, y: stroke.p0.y + dy / 3 + 60 };
        const c2 = {
          x: stroke.p0.x + (2 * dx) / 3,
          y: stroke.p0.y + (2 * dy) / 3 + 60,
        };
        return { ...stroke, type: 'cubic', c1, c2 };
      })
    );
  };

  // ── 렌더링
  const paintStrokes = () =>
    strokes.map(stroke => (
      <g key={stroke.id}>
        {/* 선택 시 오렌지 하이라이트 */}
        {selectedStrokeId === stroke.id && (
          <path
            d={drawPath(stroke)}
            fill="none"
            stroke="orange"
            strokeWidth={(stroke.strokeWidth ?? INITIAL_STROKE_WIDTH) + 6}
            strokeLinecap="round"
            style={{ pointerEvents: 'none' }}
          />
        )}

        {/* 본 stroke */}
        <path
          d={drawPath(stroke)}
          fill="none"
          stroke={stroke.color ?? INITIAL_COLOR}
          strokeWidth={stroke.strokeWidth ?? INITIAL_STROKE_WIDTH}
          strokeLinecap="round"
          data-stroke-id={stroke.id}
          data-point-type="all"
          onClick={e => {
            e.stopPropagation();
            setSelectedStrokeId(stroke.id);
          }}
          {...bind()}
        />

        {/* 핸들: 선택된 것만 */}
        {selectedStrokeId === stroke.id && (
          <>
            {/* 앵커 p0/p1 */}
            <path
              d={drawCircle(6, stroke.p0.x, stroke.p0.y)}
              fill="#fff"
              stroke={INITIAL_COLOR}
              strokeWidth={1.5}
              data-stroke-id={stroke.id}
              data-point-type="p0"
              onClick={e => e.stopPropagation()}
              {...bind()}
            />
            <path
              d={drawCircle(6, stroke.p1.x, stroke.p1.y)}
              fill="#fff"
              stroke={INITIAL_COLOR}
              strokeWidth={1.5}
              data-stroke-id={stroke.id}
              data-point-type="p1"
              onClick={e => e.stopPropagation()}
              {...bind()}
            />

            {/* 컨트롤 포인트 */}
            {stroke.type === 'quadratic' && (
              <path
                d={drawCircle(6, stroke.q.x, stroke.q.y)}
                fill="#f59e0b"
                stroke="#b45309"
                strokeWidth={1.5}
                data-stroke-id={stroke.id}
                data-point-type="q"
                onClick={e => e.stopPropagation()}
                {...bind()}
              />
            )}

            {stroke.type === 'cubic' && (
              <>
                <path
                  d={`M ${stroke.p0.x} ${stroke.p0.y} L ${stroke.c1.x} ${stroke.c1.y}`}
                  stroke="#f59e0b"
                  fill="none"
                />
                <path
                  d={`M ${stroke.p1.x} ${stroke.p1.y} L ${stroke.c2.x} ${stroke.c2.y}`}
                  stroke="#f59e0b"
                  fill="none"
                />
                <path
                  d={drawCircle(6, stroke.c1.x, stroke.c1.y)}
                  fill="#f59e0b"
                  stroke="#b45309"
                  strokeWidth={1.5}
                  data-stroke-id={stroke.id}
                  data-point-type="c1"
                  onClick={e => e.stopPropagation()}
                  {...bind()}
                />
                <path
                  d={drawCircle(6, stroke.c2.x, stroke.c2.y)}
                  fill="#f59e0b"
                  stroke="#b45309"
                  strokeWidth={1.5}
                  data-stroke-id={stroke.id}
                  data-point-type="c2"
                  onClick={e => e.stopPropagation()}
                  {...bind()}
                />
              </>
            )}
          </>
        )}
      </g>
    ));

  return (
    <div>
      <h2>STEP 3: 곡선 편집기</h2>
      <p>직선을 2차/3차 곡선으로 바꾸고 포인트를 드래그해보세요.</p>

      <BtnWrapper>
        <button onClick={createStroke}>stroke 추가</button>
        <button onClick={deleteStroke} disabled={selectedStrokeId === null}>
          stroke 삭제
        </button>
        <button onClick={lineToQuadratic} disabled={selectedStrokeId === null}>
          2차 곡선으로
        </button>
        <button onClick={lineToCubic} disabled={selectedStrokeId === null}>
          3차 곡선으로
        </button>
      </BtnWrapper>

      <svg
        width="500"
        height="500"
        style={{ border: '1px solid #111', backgroundColor: '#fff' }}
        onClick={() => setSelectedStrokeId(null)}
      >
        {paintStrokes()}
      </svg>
    </div>
  );
}

const BtnWrapper = styled.div`
  display: flex;
  gap: 8px;
`;
