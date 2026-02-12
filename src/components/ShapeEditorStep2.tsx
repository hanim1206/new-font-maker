// 필요한 import
import { path as d3Path } from 'd3-path';
import { useGesture } from '@use-gesture/react';
import { useMemo, useRef, useState } from 'react';
import styled from 'styled-components';

// 기본 타입
type Pt = { x: number; y: number };
type Stroke = {
  id: number;
  p0: Pt;
  p1: Pt;
  color?: string;
  strokeWidth?: number;
};

const INITIAL_COLOR = '#111';
const INITIAL_STROKE_WIDTH = 12;
const INITIAL_POSITIONS = {
  p0: { x: 100, y: 250 },
  p1: { x: 300, y: 250 },
} as const;

const ShapeEditorStep2 = () => {
  // strokes 배열 상태 관리
  const [strokes, setStrokes] = useState<Stroke[] | []>([]);
  const [selectedStrokeId, setSelectedStrokeId] = useState<number | null>(null);
  const nextIdRef = useRef(0);
  // stroke객체 업데이트하는 함수
  const updatePoint = (
    stroke: Stroke,
    pointType: string,
    delta: [number, number]
  ) => {
    if (pointType === 'p0') {
      return {
        ...stroke,
        p0: { x: stroke.p0.x + delta[0], y: stroke.p0.y + delta[1] },
      };
    }
    if (pointType === 'p1') {
      return {
        ...stroke,
        p1: { x: stroke.p1.x + delta[0], y: stroke.p1.y + delta[1] },
      };
    }
    return {
      ...stroke,
      p0: { x: stroke.p0.x + delta[0], y: stroke.p0.y + delta[1] },
      p1: { x: stroke.p1.x + delta[0], y: stroke.p1.y + delta[1] },
    };
  };
  const bind = useGesture({
    onDrag: ({ delta, event }) => {
      // 클릭된 요소에서 stroke ID를 가져오기
      const target = event.target as HTMLElement;
      const strokeId = parseInt(target.dataset.strokeId || '0');
      const pointType = target.dataset.pointType || 'p0'; // 'p0' 또는 'p1'
      // 선택된 stroke만 드래그 가능함
      if (strokeId !== selectedStrokeId) {
        setSelectedStrokeId(strokeId);
      }

      setStrokes(prev => [
        ...prev.filter(stroke => stroke.id !== strokeId),
        updatePoint(prev.find(i => i.id === strokeId)!, pointType, delta),
      ]);
    },
  });
  const paintStrokes = () => {
    return strokes.map(i => (
      <g key={i.id}>
        {selectedStrokeId === i.id && (
          <path
            d={drawPath(i)}
            fill="none"
            stroke={'orange'}
            strokeWidth={INITIAL_STROKE_WIDTH + 6}
            strokeLinecap="round"
          />
        )}

        <path
          d={drawPath(i)}
          fill="none"
          stroke={i.color}
          strokeWidth={INITIAL_STROKE_WIDTH}
          onClick={e => {
            e.stopPropagation();
            setSelectedStrokeId(i.id);
          }}
          data-stroke-id={i.id}
          data-point-type="all"
          {...bind()}
        />
        {selectedStrokeId === i.id && (
          <>
            <path
              d={drawCircle(6, i.p0.x, i.p0.y)}
              fill="#fff"
              stroke={INITIAL_COLOR}
              strokeWidth={INITIAL_COLOR}
              data-stroke-id={i.id}
              data-point-type="p0"
              {...bind()}
              onClick={e => e.stopPropagation()}
            />
            <path
              d={drawCircle(6, i.p1.x, i.p1.y)}
              fill="#fff"
              stroke={INITIAL_COLOR}
              strokeWidth={INITIAL_COLOR}
              data-stroke-id={i.id}
              data-point-type="p1"
              {...bind()}
              onClick={e => e.stopPropagation()}
            />
          </>
        )}
      </g>
    ));
  };

  const drawPath = (stroke: Stroke) => {
    const path = d3Path();
    path.moveTo(stroke.p0.x, stroke.p0.y);
    path.lineTo(stroke.p1.x, stroke.p1.y);
    return path.toString();
  };
  const drawCircle = (radius: number, x: number, y: number) => {
    const path = d3Path();
    const segments = 32; // 원을 32개 선분으로 근사
    const angleStep = (2 * Math.PI) / segments;

    path.moveTo(x + radius, y); // 시작점 (오른쪽)

    for (let i = 1; i <= segments; i++) {
      const angle = i * angleStep;
      const px = x + radius * Math.cos(angle);
      const py = y + radius * Math.sin(angle);
      path.lineTo(px, py);
    }
    return path.toString();
  };
  const createStroke = () => {
    const newId = nextIdRef.current++;
    setStrokes(prev => [
      ...prev,
      {
        id: newId,
        ...INITIAL_POSITIONS,
        color: INITIAL_COLOR,
        strokeWidth: INITIAL_STROKE_WIDTH,
      },
    ]);
    setSelectedStrokeId(newId);
  };
  const deleteStroke = () => {
    const deletedList = strokes.filter(i => i.id !== selectedStrokeId);
    const lastItem = deletedList[deletedList.length - 1];

    setStrokes(deletedList);
    lastItem ? setSelectedStrokeId(lastItem.id) : setSelectedStrokeId(null);
  };
  return (
    <div>
      <h2>STEP 2: 다중 선분 그리기</h2>
      <p>여기에 구현하세요!</p>
      <BtnWrapper>
        <button onClick={createStroke}>stroke 추가</button>
        <button onClick={deleteStroke} disabled={selectedStrokeId === null}>
          stroke 삭제
        </button>
      </BtnWrapper>
      {/* svg 내에서 path 사용이 가능 */}
      <svg
        width="500px"
        height="500px"
        style={{ border: '1px solid #111', backgroundColor: '#fff' }}
        onClick={() => setSelectedStrokeId(null)}
      >
        {paintStrokes()}
      </svg>
    </div>
  );
};

export default ShapeEditorStep2;

const BtnWrapper = styled.div`
  display: flex;
`;
