// 필요한 import
import { path as d3Path } from 'd3-path';
import { useGesture } from '@use-gesture/react';
import { useState } from 'react';

const ShapeEditorStep1 = () => {
  // 기본 타입
  type Pt = { x: number; y: number };
  type Stroke = { p0: Pt; p1: Pt; color?: string; strokeWidth?: number };

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

  // 선택된 stroke 의 상태
  const [stroke, setStroke] = useState<Stroke>({
    p0: { x: 100, y: 250 },
    p1: { x: 300, y: 250 },
    color: '#111',
    strokeWidth: 12,
  });
  const bindP0 = useGesture({
    onDrag: ({ delta }) => {
      setStroke(prev => ({
        ...prev,
        p0: {
          x: prev.p0.x + delta[0],
          y: prev.p0.y + delta[1],
        },
      }));
    },
  });
  const bindP1 = useGesture({
    onDrag: ({ delta }) => {
      setStroke(prev => ({
        ...prev,
        p1: {
          x: prev.p1.x + delta[0],
          y: prev.p1.y + delta[1],
        },
      }));
    },
  });
  return (
    <div>
      <h2>STEP 1: 기본 선 그리기</h2>
      <p>여기에 구현하세요!</p>
      {/* svg 내에서 path 사용이 가능 */}
      <svg
        width="500px"
        height="500px"
        style={{ border: '1px solid #111', backgroundColor: '#fff' }}
      >
        <path
          d={drawPath(stroke)}
          fill="none"
          stroke={stroke.color}
          strokeWidth={stroke.strokeWidth}
        />
        <path
          d={drawCircle(6, stroke.p0.x, stroke.p0.y)}
          fill="#fff"
          stroke="#111"
          strokeWidth={'2px'}
          {...bindP0()}
        />
        <path
          d={drawCircle(6, stroke.p1.x, stroke.p1.y)}
          fill="#fff"
          stroke="#111"
          strokeWidth={'2px'}
          {...bindP1()}
        />
      </svg>
    </div>
  );
};

export default ShapeEditorStep1;
