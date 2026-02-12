// ShapeEditor.tsx
import React, { useEffect, useRef, useState } from 'react';
import { path as d3Path } from 'd3-path';
import { useGesture } from '@use-gesture/react';

type ID = string;
type Pt = { x: number; y: number };

/** 단일 획: 라인으로 시작, c1/c2 넣으면 큐빅(세그먼트 1개) */
type Stroke = {
  id: ID;
  type: 'stroke';
  p0: Pt;
  p1: Pt;
  c1?: Pt;
  c2?: Pt;
  stroke?: string;
  strokeWidth?: number;
  strokeLinecap?: 'butt' | 'round' | 'square';
  strokeLinejoin?: 'miter' | 'round' | 'bevel';
};

/** Path: 노드/핸들 기반 (여러 세그먼트, 닫힘 지원) */
type Node = { p: Pt; h1?: Pt; h2?: Pt };
type PathShape = {
  id: ID;
  type: 'path';
  nodes: Node[];
  closed?: boolean;
  stroke?: string;
  strokeWidth?: number;
  strokeLinecap?: 'butt' | 'round' | 'square';
  strokeLinejoin?: 'miter' | 'round' | 'bevel';
};

type Shape = Stroke | PathShape;

// ────────────────────────────────────────────────────────────────────────────────
// Config & Utils
// ────────────────────────────────────────────────────────────────────────────────
const GRID = 20;
const CTRL_MARGIN = 300; // 컨트롤 핸들은 바깥 허용
const EPS = 12; // 병합 스냅 거리
const CORNER_HANDLE_RATIO = 0.4;
const HALO_OUT = 4; // 선택 하이라이트 두께(밖으로만)
const PASTE_OFFSET = 20;
const KAPPA = 0.5522847498307936; // 원/타원 베지어 근사 상수
const SAFE_CELLS = 3; // 세이프 박스(빨간 박스) 그리드 칸 수 인셋

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));
const snap = (v: number) => Math.round(v / GRID) * GRID;
const snapPt = (pt: Pt) => ({ x: snap(pt.x), y: snap(pt.y) });

const isPath = (s: any): s is PathShape => s?.type === 'path'; // null-safe
const isCubic = (s: Stroke) => Boolean(s.c1 && s.c2);

const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });
const len = (a: Pt) => Math.hypot(a.x, a.y);
const norm = (a: Pt) => {
  const L = len(a) || 1;
  return { x: a.x / L, y: a.y / L };
};
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a: Pt, b: Pt, t: number): Pt => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

// 데이터 -> svg
function toPathD(shape: Shape): string {
  const p = d3Path();
  if (isPath(shape)) {
    const nodes = shape.nodes;
    if (!nodes.length) return '';
    p.moveTo(nodes[0].p.x, nodes[0].p.y);
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i],
        b = nodes[i + 1];
      if (a.h2 && b.h1)
        p.bezierCurveTo(a.h2.x, a.h2.y, b.h1.x, b.h1.y, b.p.x, b.p.y);
      else p.lineTo(b.p.x, b.p.y);
    }
    if (shape.closed && nodes.length > 1) {
      const a = nodes[nodes.length - 1],
        b = nodes[0];
      if (a.h2 && b.h1)
        p.bezierCurveTo(a.h2.x, a.h2.y, b.h1.x, b.h1.y, b.p.x, b.p.y);
      else p.lineTo(b.p.x, b.p.y);
      p.closePath();
    }
  } else {
    p.moveTo(shape.p0.x, shape.p0.y);
    if (isCubic(shape))
      p.bezierCurveTo(
        shape.c1!.x,
        shape.c1!.y,
        shape.c2!.x,
        shape.c2!.y,
        shape.p1.x,
        shape.p1.y
      );
    else p.lineTo(shape.p1.x, shape.p1.y);
  }
  return p.toString();
}
function reverseStroke(s: Stroke): Stroke {
  return { ...s, p0: s.p1, p1: s.p0, c1: s.c2, c2: s.c1 };
}

// 큐빅 분할(De Casteljau)
function splitCubic(p0: Pt, c1: Pt, c2: Pt, p1: Pt, t: number) {
  const p01 = lerp(p0, c1, t),
    p12 = lerp(c1, c2, t),
    p23 = lerp(c2, p1, t);
  const p012 = lerp(p01, p12, t),
    p123 = lerp(p12, p23, t);
  const m = lerp(p012, p123, t);
  return {
    left: { p0, c1: p01, c2: p012, p1: m },
    right: { p0: m, c1: p123, c2: p23, p1 },
    mid: m,
  };
}

// ────────────────────────────────────────────────────────────────────────────────
// Handle
function Handle({
  p,
  onDrag,
  onDragEnd,
  label,
  fill = '#fff',
  stroke = '#111',
}: {
  p: Pt;
  label?: string;
  fill?: string;
  stroke?: string;
  onDrag: (dx: number, dy: number, meta: { shiftKey: boolean }) => void;
  onDragEnd: (_mx: number, _my: number, meta: { shiftKey: boolean }) => void;
}) {
  const bind = useGesture(
    {
      onDragStart: ({ event }) => {
        event?.stopPropagation();
      },
      onDrag: ({ delta: [dx, dy], shiftKey, event }) => {
        event?.stopPropagation();
        onDrag(dx, dy, { shiftKey });
      },
      onDragEnd: ({ movement: [mx, my], shiftKey, event }) => {
        event?.stopPropagation();
        onDragEnd(mx, my, { shiftKey });
      },
    },
    { eventOptions: { passive: false } }
  );
  return (
    <g {...bind()} style={{ cursor: 'grab', touchAction: 'none' }} data-handle>
      <circle cx={p.x} cy={p.y} r={6} fill={fill} stroke={stroke} />
      {label && (
        <text x={p.x + 8} y={p.y - 8} fontSize={11} fill="#111">
          {label}
        </text>
      )}
    </g>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// Main
export default function ShapeEditor() {
  // 캔버스 크기 (프리셋 셀렉터로 변경)
  const [canvasW, setCanvasW] = useState(500);
  const [canvasH, setCanvasH] = useState(500);

  // clamp/snap 함수는 현재 캔버스 크기를 사용해야 하므로 컴포넌트 내부에 정의
  const clampByKey = (key: 'p0' | 'p1' | 'c1' | 'c2', pt: Pt) => {
    const minX = key === 'c1' || key === 'c2' ? -CTRL_MARGIN : 0;
    const maxX = key === 'c1' || key === 'c2' ? canvasW + CTRL_MARGIN : canvasW;
    const minY = key === 'c1' || key === 'c2' ? -CTRL_MARGIN : 0;
    const maxY = key === 'c1' || key === 'c2' ? canvasH + CTRL_MARGIN : canvasH;
    return { x: clamp(pt.x, minX, maxX), y: clamp(pt.y, minY, maxY) };
  };
  const snapClampByKey = (key: 'p0' | 'p1' | 'c1' | 'c2', pt: Pt) =>
    clampByKey(key, snapPt(pt));

  const [shapes, setShapes] = useState<Shape[]>([
    {
      type: 'stroke',
      id: crypto.randomUUID(),
      p0: { x: 120, y: 240 },
      p1: { x: 260, y: 240 },
      stroke: '#111',
      strokeWidth: 18,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
    {
      type: 'stroke',
      id: crypto.randomUUID(),
      p0: { x: 260, y: 240 },
      p1: { x: 260, y: 360 },
      c1: { x: 260, y: 260 },
      c2: { x: 260, y: 340 },
      stroke: '#111',
      strokeWidth: 18,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ]);
  const [selected, setSelected] = useState<ID | null>(null);
  const [mode, setMode] = useState<'select' | 'points'>('select');
  const clipboardRef = useRef<Shape | null>(null);

  // 파생값(Null-safe)
  const selectedShape = shapes.find(s => s.id === selected) ?? null;
  const selIsPath = !!selectedShape && isPath(selectedShape);

  // ── Toolbar
  const addStroke = () =>
    setShapes(prev => [
      ...prev,
      {
        type: 'stroke',
        id: crypto.randomUUID(),
        p0: { x: 80, y: 260 },
        p1: { x: 320, y: 260 },
        stroke: '#111',
        strokeWidth: 18,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      },
    ]);

  const addCircle = () => {
    addEllipseInternal(canvasW / 2, canvasH / 2, 120, 120);
  };

  const addEllipse = () => {
    addEllipseInternal(
      canvasW / 2,
      canvasH / 2,
      Math.round(canvasW * 0.32),
      Math.round(canvasH * 0.2)
    );
  };

  const addEllipseInternal = (
    cx: number,
    cy: number,
    rx: number,
    ry: number
  ) => {
    const kx = KAPPA * rx;
    const ky = KAPPA * ry;

    const n0: Node = {
      p: { x: cx + rx, y: cy },
      h1: { x: cx + rx, y: cy - ky },
      h2: { x: cx + rx, y: cy + ky },
    }; // right
    const n1: Node = {
      p: { x: cx, y: cy + ry },
      h1: { x: cx + kx, y: cy + ry },
      h2: { x: cx - kx, y: cy + ry },
    }; // bottom
    const n2: Node = {
      p: { x: cx - rx, y: cy },
      h1: { x: cx - rx, y: cy + ky },
      h2: { x: cx - rx, y: cy - ky },
    }; // left
    const n3: Node = {
      p: { x: cx, y: cy - ry },
      h1: { x: cx - kx, y: cy - ry },
      h2: { x: cx + kx, y: cy - ry },
    }; // top

    const path: PathShape = {
      id: crypto.randomUUID(),
      type: 'path',
      nodes: [n0, n1, n2, n3],
      closed: true,
      stroke: '#111',
      strokeWidth: 18,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    };
    setShapes(prev => [...prev, path]);
    setSelected(path.id);
    setMode('points');
  };

  const toggleCubic = () => {
    if (!selectedShape || isPath(selectedShape)) return;
    setShapes(prev =>
      prev.map(s => {
        if (isPath(s) || s.id !== selectedShape.id) return s;
        if (isCubic(s)) {
          const { c1, c2, ...rest } = s;
          return rest;
        }
        return { ...s, c1: { ...s.p0 }, c2: { ...s.p1 } };
      })
    );
    setMode('points');
  };

  const deselect = () => setSelected(null);

  const removeSelected = () => {
    if (!selected) return;
    const id = selected;
    setSelected(null); // 먼저 해제(크래시 방지)
    setShapes(prev => prev.filter(s => s.id !== id));
  };

  const saveJSON = () => console.log(JSON.stringify(shapes, null, 2));

  /** 병합: 선택 stroke + 가장 가까운 stroke -> PathShape */
  const mergeSelected = () => {
    if (!selectedShape || isPath(selectedShape)) return;
    const A = selectedShape as Stroke;

    let best: {
      B: Stroke;
      Aend: 'p0' | 'p1';
      Bend: 'p0' | 'p1';
      d: number;
    } | null = null;
    for (const s of shapes) {
      if (isPath(s) || s.id === A.id) continue;
      const B = s as Stroke;
      (['p0', 'p1'] as const).forEach(ae => {
        (['p0', 'p1'] as const).forEach(be => {
          const d = dist((A as any)[ae], (B as any)[be]);
          if (!best || d < best.d) best = { B, Aend: ae, Bend: be, d };
        });
      });
    }
    if (!best || best.d > EPS) return;

    let a = A,
      b = best.B;
    if (best.Aend === 'p0') a = reverseStroke(a);
    if (best.Bend === 'p1') b = reverseStroke(b);

    const P = a.p1;
    const tanIn = isCubic(a) ? sub(a.p1, a.c2!) : sub(a.p1, a.p0);
    const tanOut = isCubic(b) ? sub(b.c1!, b.p0) : sub(b.p1, b.p0);
    const dirIn = norm(tanIn);
    const dirOut = norm(tanOut);

    const lenIn = isCubic(a)
      ? Math.hypot(a.p1.x - a.c2!.x, a.p1.y - a.c2!.y)
      : dist(a.p1, a.p0);
    const lenOut = isCubic(b)
      ? Math.hypot(b.c1!.x - b.p0.x, b.c1!.y - b.p0.y)
      : dist(b.p1, b.p0);
    const L = CORNER_HANDLE_RATIO * Math.min(lenIn, lenOut);

    const cornerH1 = add(P, mul(dirIn, -L));
    const cornerH2 = add(P, mul(dirOut, L));

    const nodes: Node[] = [
      { p: a.p0, h2: isCubic(a) ? a.c1 : undefined },
      { p: P, h1: cornerH1, h2: cornerH2 },
      { p: b.p1, h1: isCubic(b) ? b.c2 : undefined },
    ];

    const newPath: PathShape = {
      id: crypto.randomUUID(),
      type: 'path',
      nodes,
      stroke: a.stroke ?? b.stroke ?? '#111',
      strokeWidth: a.strokeWidth ?? b.strokeWidth ?? 18,
      strokeLinecap: a.strokeLinecap ?? b.strokeLinecap ?? 'round',
      strokeLinejoin: a.strokeLinejoin ?? b.strokeLinejoin ?? 'round',
    };

    setShapes(prev => [
      ...prev.filter(s => s.id !== a.id && s.id !== b.id),
      newPath,
    ]);
    setSelected(newPath.id);
    setMode('points');
  };

  // ── Stroke 핸들 이동
  const movePoint = (
    shapeId: ID,
    key: 'p0' | 'p1' | 'c1' | 'c2',
    dx: number,
    dy: number,
    meta: { shiftKey: boolean }
  ) => {
    setShapes(prev =>
      prev.map(s => {
        if (isPath(s) || s.id !== shapeId) return s;
        if ((key === 'c1' || key === 'c2') && !isCubic(s)) return s;
        const cur = (s as any)[key] as Pt | undefined;
        if (!cur) return s;
        const raw = { x: cur.x + dx, y: cur.y + dy };
        const next = meta.shiftKey
          ? snapClampByKey(key, raw)
          : clampByKey(key, raw);
        return { ...(s as any), [key]: next } as Stroke;
      })
    );
  };
  const commitPoint = (
    shapeId: ID,
    key: 'p0' | 'p1' | 'c1' | 'c2',
    meta: { shiftKey: boolean }
  ) => {
    setShapes(prev =>
      prev.map(s => {
        if (isPath(s) || s.id !== shapeId) return s;
        if ((key === 'c1' || key === 'c2') && !isCubic(s)) return s;
        const cur = (s as any)[key] as Pt | undefined;
        if (!cur) return s;
        const finalPt = meta.shiftKey
          ? snapClampByKey(key, cur)
          : clampByKey(key, cur);
        return { ...(s as any), [key]: finalPt } as Stroke;
      })
    );
  };

  // ── Path 노드/핸들 드래그
  const movePathP = (
    shapeId: ID,
    idx: number,
    dx: number,
    dy: number,
    meta: { shiftKey: boolean }
  ) => {
    setShapes(prev =>
      prev.map(s => {
        if (!isPath(s) || s.id !== shapeId) return s;
        const n = s.nodes[idx];
        if (!n) return s;
        const raw = { x: n.p.x + dx, y: n.p.y + dy };
        const next = meta.shiftKey
          ? snapClampByKey('p0', raw)
          : clampByKey('p0', raw);
        const nodes = s.nodes.slice();
        nodes[idx] = { ...n, p: next };
        return { ...s, nodes };
      })
    );
  };
  const movePathH = (
    shapeId: ID,
    idx: number,
    which: 'h1' | 'h2',
    dx: number,
    dy: number,
    meta: { shiftKey: boolean }
  ) => {
    setShapes(prev =>
      prev.map(s => {
        if (!isPath(s) || s.id !== shapeId) return s;
        const n = s.nodes[idx];
        if (!n) return s;
        const cur = (n as any)[which] as Pt | undefined;
        const base = cur ?? n.p;
        const raw = { x: base.x + dx, y: base.y + dy };
        const next = meta.shiftKey
          ? snapClampByKey('c1', raw)
          : clampByKey('c1', raw);
        const nodes = s.nodes.slice();
        nodes[idx] = { ...n, [which]: next } as Node;
        return { ...s, nodes };
      })
    );
  };
  const commitNoop = (
    _mx: number,
    _my: number,
    _m: { shiftKey: boolean }
  ) => {};

  // ── 도형 이동(Select 모드에서만 드래그)
  const dragRef = useRef<{ start: Shape | null; shapeId: ID | null }>({
    start: null,
    shapeId: null,
  });
  const bindCanvas = useGesture({
    onDragStart: ({ event }) => {
      if (mode !== 'select') return;
      const target = event?.target as HTMLElement | null;
      if (target?.closest('[data-handle]')) return;
      if (!selectedShape) return;
      dragRef.current.start = JSON.parse(JSON.stringify(selectedShape));
      dragRef.current.shapeId = selectedShape.id;
    },
    onDrag: ({ movement: [mx, my], buttons, shiftKey, event }) => {
      if (mode !== 'select') return;
      const lockedId = dragRef.current.shapeId;
      const start = dragRef.current.start;
      if (!lockedId || !start || buttons !== 1) return;
      const target = event?.target as HTMLElement | null;
      if (target?.closest('[data-handle]')) return;

      let sdx = mx,
        sdy = my;
      const anchor = isPath(start) ? start.nodes[0].p : (start as Stroke).p0;
      if (shiftKey) {
        sdx = snap(anchor.x + mx) - anchor.x;
        sdy = snap(anchor.y + my) - anchor.y;
      }

      const anchors: Pt[] = isPath(start)
        ? start.nodes.map(n => n.p)
        : [(start as Stroke).p0, (start as Stroke).p1];
      const minX = Math.min(...anchors.map(p => p.x));
      const maxX = Math.max(...anchors.map(p => p.x));
      const minY = Math.min(...anchors.map(p => p.y));
      const maxY = Math.max(...anchors.map(p => p.y));
      sdx = clamp(sdx, -minX, canvasW - maxX);
      sdy = clamp(sdy, -minY, canvasH - maxY);

      setShapes(prev =>
        prev.map(s => {
          if (s.id !== lockedId) return s;
          if (isPath(start) && isPath(s)) {
            const nodes = s.nodes.map((_, i) => ({
              p: {
                x: (start as PathShape).nodes[i].p.x + sdx,
                y: (start as PathShape).nodes[i].p.y + sdy,
              },
              h1: (start as PathShape).nodes[i].h1
                ? {
                    x: (start as PathShape).nodes[i].h1!.x + sdx,
                    y: (start as PathShape).nodes[i].h1!.y + sdy,
                  }
                : undefined,
              h2: (start as PathShape).nodes[i].h2
                ? {
                    x: (start as PathShape).nodes[i].h2!.x + sdx,
                    y: (start as PathShape).nodes[i].h2!.y + sdy,
                  }
                : undefined,
            }));
            return { ...s, nodes };
          } else if (!isPath(start) && !isPath(s)) {
            const p0 = {
              x: (start as Stroke).p0.x + sdx,
              y: (start as Stroke).p0.y + sdy,
            };
            const p1 = {
              x: (start as Stroke).p1.x + sdx,
              y: (start as Stroke).p1.y + sdy,
            };
            const next: Stroke = {
              ...s,
              p0: clampByKey('p0', p0),
              p1: clampByKey('p1', p1),
            };
            if (isCubic(start as Stroke)) {
              const c1 = {
                x: (start as Stroke).c1!.x + sdx,
                y: (start as Stroke).c1!.y + sdy,
              };
              const c2 = {
                x: (start as Stroke).c2!.x + sdx,
                y: (start as Stroke).c2!.y + sdy,
              };
              next.c1 = clampByKey('c1', c1);
              next.c2 = clampByKey('c2', c2);
            }
            return next;
          }
          return s;
        })
      );
    },
    onDragEnd: () => {
      dragRef.current.start = null;
      dragRef.current.shapeId = null;
    },
  });

  // 선택 변경 시 드래그 스냅샷 폐기
  useEffect(() => {
    dragRef.current.start = null;
    dragRef.current.shapeId = null;
  }, [selected]);

  // ── 방향키로 이동 (선택 도형 전체 이동)
  const moveSelectedBy = (dx: number, dy: number) => {
    if (!selectedShape) return;
    const start = JSON.parse(JSON.stringify(selectedShape)) as Shape;

    // 캔버스 경계 내로만 이동(엔드포인트 기준)
    const anchors: Pt[] = isPath(start)
      ? start.nodes.map(n => n.p)
      : [(start as Stroke).p0, (start as Stroke).p1];
    const minX = Math.min(...anchors.map(p => p.x));
    const maxX = Math.max(...anchors.map(p => p.x));
    const minY = Math.min(...anchors.map(p => p.y));
    const maxY = Math.max(...anchors.map(p => p.y));
    const sdx = clamp(dx, -minX, canvasW - maxX);
    const sdy = clamp(dy, -minY, canvasH - maxY);

    setShapes(prev =>
      prev.map(s => {
        if (s.id !== start.id) return s;
        if (isPath(start) && isPath(s)) {
          const nodes = s.nodes.map((_, i) => ({
            p: {
              x: (start as PathShape).nodes[i].p.x + sdx,
              y: (start as PathShape).nodes[i].p.y + sdy,
            },
            h1: (start as PathShape).nodes[i].h1
              ? {
                  x: (start as PathShape).nodes[i].h1!.x + sdx,
                  y: (start as PathShape).nodes[i].h1!.y + sdy,
                }
              : undefined,
            h2: (start as PathShape).nodes[i].h2
              ? {
                  x: (start as PathShape).nodes[i].h2!.x + sdx,
                  y: (start as PathShape).nodes[i].h2!.y + sdy,
                }
              : undefined,
          }));
          return { ...s, nodes };
        } else if (!isPath(start) && !isPath(s)) {
          const p0 = {
            x: (start as Stroke).p0.x + sdx,
            y: (start as Stroke).p0.y + sdy,
          };
          const p1 = {
            x: (start as Stroke).p1.x + sdx,
            y: (start as Stroke).p1.y + sdy,
          };
          const next: Stroke = {
            ...s,
            p0: clampByKey('p0', p0),
            p1: clampByKey('p1', p1),
          };
          if (isCubic(start as Stroke)) {
            const c1 = {
              x: (start as Stroke).c1!.x + sdx,
              y: (start as Stroke).c1!.y + sdy,
            };
            const c2 = {
              x: (start as Stroke).c2!.x + sdx,
              y: (start as Stroke).c2!.y + sdy,
            };
            next.c1 = clampByKey('c1', c1);
            next.c2 = clampByKey('c2', c2);
          }
          return next;
        }
        return s;
      })
    );
  };

  // ── 키보드: Delete/C/M/E/A, 복사/붙여넣기, 방향키
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isTyping =
        tag === 'input' || tag === 'textarea' || target?.isContentEditable;
      if (isTyping) return;

      // copy
      if (e.key.toLowerCase() === 'c' && (e.ctrlKey || e.metaKey)) {
        if (selectedShape)
          clipboardRef.current = JSON.parse(JSON.stringify(selectedShape));
        return;
      }
      // paste
      if (e.key.toLowerCase() === 'v' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        const clip = clipboardRef.current;
        if (!clip) return;
        const dup = offsetShape(
          withNewId(clip),
          PASTE_OFFSET,
          PASTE_OFFSET,
          clampByKey
        );
        setShapes(prev => [...prev, dup]);
        setSelected(dup.id);
        return;
      }

      // 방향키 이동 (Shift = GRID)
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? GRID : 1;
        if (e.key === 'ArrowLeft') moveSelectedBy(-step, 0);
        if (e.key === 'ArrowRight') moveSelectedBy(step, 0);
        if (e.key === 'ArrowUp') moveSelectedBy(0, -step);
        if (e.key === 'ArrowDown') moveSelectedBy(0, step);
        return;
      }

      if ((e.key === 'Backspace' || e.key === 'Delete') && selected) {
        e.preventDefault();
        removeSelected();
      } else if (e.key.toLowerCase() === 'c' && !e.ctrlKey && !e.metaKey)
        toggleCubic();
      else if (e.key.toLowerCase() === 'm') mergeSelected();
      else if (e.key.toLowerCase() === 'a') addNodeMid();
      else if (e.key.toLowerCase() === 'e')
        setMode(m => (m === 'select' ? 'points' : 'select'));
      else if (e.key.toLowerCase() === 'escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, selectedShape, shapes, canvasW, canvasH]);

  // ── 스타일 & 스케일 패널(항상 표시, 선택 없으면 비활성)
  const panelDisabled = !selectedShape;

  const updateStyle = (
    patch: Partial<
      Pick<Shape, 'stroke' | 'strokeWidth' | 'strokeLinecap' | 'strokeLinejoin'>
    >
  ) => {
    if (!selectedShape) return;
    setShapes(prev =>
      prev.map(s =>
        s.id === selectedShape.id ? ({ ...s, ...patch } as Shape) : s
      )
    );
  };

  const getBBoxCenter = (s: Shape): Pt => {
    const pts: Pt[] = isPath(s)
      ? s.nodes.map(n => n.p)
      : [(s as Stroke).p0, (s as Stroke).p1];
    const minX = Math.min(...pts.map(p => p.x));
    const maxX = Math.max(...pts.map(p => p.x));
    const minY = Math.min(...pts.map(p => p.y));
    const maxY = Math.max(...pts.map(p => p.y));
    return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  };

  const scaleSelected = (factor: number, scaleStrokeWidth: boolean) => {
    if (!selectedShape) return;
    const center = getBBoxCenter(selectedShape);
    const scalePt = (p: Pt): Pt => ({
      x: center.x + (p.x - center.x) * factor,
      y: center.y + (p.y - center.y) * factor,
    });

    setShapes(prev =>
      prev.map(s => {
        if (s.id !== selectedShape.id) return s;
        if (isPath(s)) {
          const nodes = s.nodes.map(n => ({
            p: clampByKey('p0', scalePt(n.p)),
            h1: n.h1 ? scalePt(n.h1) : undefined,
            h2: n.h2 ? scalePt(n.h2) : undefined,
          }));
          return {
            ...s,
            nodes,
            strokeWidth: scaleStrokeWidth
              ? (s.strokeWidth ?? 4) * factor
              : s.strokeWidth,
          };
        } else {
          const p0 = clampByKey('p0', scalePt(s.p0));
          const p1 = clampByKey('p1', scalePt(s.p1));
          const next: Stroke = {
            ...s,
            p0,
            p1,
            strokeWidth: scaleStrokeWidth
              ? (s.strokeWidth ?? 4) * factor
              : s.strokeWidth,
          };
          if (isCubic(s)) {
            next.c1 = scalePt(s.c1!);
            next.c2 = scalePt(s.c2!);
          }
          return next;
        }
      })
    );
  };

  // ── “Add Node (중간 분할)”
  function strokeToPathSplitMid(s: Stroke): PathShape {
    if (isCubic(s)) {
      const { left, right, mid } = splitCubic(s.p0, s.c1!, s.c2!, s.p1, 0.5);
      const nodes: Node[] = [
        { p: left.p0, h2: left.c1 },
        { p: mid, h1: left.c2, h2: right.c1 },
        { p: right.p1, h1: right.c2 },
      ];
      return {
        id: crypto.randomUUID(),
        type: 'path',
        nodes,
        stroke: s.stroke,
        strokeWidth: s.strokeWidth,
        strokeLinecap: s.strokeLinecap,
        strokeLinejoin: s.strokeLinejoin,
      };
    } else {
      const m = lerp(s.p0, s.p1, 0.5);
      const nodes: Node[] = [{ p: s.p0 }, { p: m }, { p: s.p1 }];
      return {
        id: crypto.randomUUID(),
        type: 'path',
        nodes,
        stroke: s.stroke,
        strokeWidth: s.strokeWidth,
        strokeLinecap: s.strokeLinecap,
        strokeLinejoin: s.strokeLinejoin,
      };
    }
  }
  function longestSegIndex(pth: PathShape) {
    let best = 0,
      bestLen = -1;
    for (let i = 0; i < pth.nodes.length - 1 + (pth.closed ? 1 : 0); i++) {
      const a = pth.nodes[i % pth.nodes.length],
        b = pth.nodes[(i + 1) % pth.nodes.length];
      const L = dist(a.p, b.p);
      if (L > bestLen) {
        bestLen = L;
        best = i % pth.nodes.length;
      }
    }
    return best;
  }
  function splitPathAt(path: PathShape, segIdx: number, t: number): PathShape {
    const nodes = path.nodes.slice();
    const a = nodes[segIdx],
      b = nodes[(segIdx + 1) % nodes.length];
    const wrap = segIdx === nodes.length - 1 && path.closed;

    if (a.h2 && b.h1) {
      // cubic
      const { left, right, mid } = splitCubic(a.p, a.h2, b.h1, b.p, t);
      const A: Node = { p: left.p0, h2: left.c1 };
      const M: Node = { p: mid, h1: left.c2, h2: right.c1 };
      const B: Node = { p: right.p1, h1: right.c2 };
      if (wrap) {
        nodes[segIdx] = A;
        nodes[0] = B;
        nodes.splice(nodes.length, 0, M);
      } else {
        nodes.splice(segIdx, 2, A, M, B);
      }
    } else {
      // line
      const m = lerp(a.p, b.p, t);
      if (wrap) nodes.splice(nodes.length, 0, { p: m });
      else nodes.splice(segIdx + 1, 0, { p: m });
    }
    return { ...path, nodes };
  }
  const addNodeMid = () => {
    if (!selectedShape) return;
    if (!isPath(selectedShape)) {
      const p = strokeToPathSplitMid(selectedShape as Stroke);
      setShapes(prev => prev.map(x => (x.id === selectedShape.id ? p : x)));
      setSelected(p.id);
    } else {
      const idx = longestSegIndex(selectedShape);
      setShapes(prev =>
        prev.map(x =>
          x.id === selectedShape.id ? splitPathAt(selectedShape, idx, 0.5) : x
        )
      );
    }
    setMode('points');
  };

  // 선택 하이라이트(모드별 색상)
  const renderWithSelection = (s: Shape, isSel: boolean) => {
    const d = toPathD(s);
    const sw = (s as any).strokeWidth ?? 4;
    const cap = (s as any).strokeLinecap ?? 'round';
    const join = (s as any).strokeLinejoin ?? 'round';
    const haloColor = mode === 'points' ? '#f59e0b' : '#3b82f6'; // points=주황, select=파랑

    const main = (
      <path
        d={d}
        fill="none"
        stroke={(s as any).stroke ?? '#111'}
        strokeWidth={sw}
        strokeLinecap={cap}
        strokeLinejoin={join}
        vectorEffect="non-scaling-stroke"
        onMouseDown={e => {
          e.stopPropagation();
          setSelected(s.id);
        }}
      />
    );
    if (!isSel) return main;
    return (
      <>
        <path
          d={d}
          fill="none"
          stroke={haloColor}
          strokeWidth={sw + HALO_OUT * 2}
          strokeLinecap={cap}
          strokeLinejoin={join}
          opacity={0.4}
          vectorEffect="non-scaling-stroke"
          style={{ pointerEvents: 'none' }}
        />
        {main}
      </>
    );
  };

  // 캔버스 프리셋
  const sizePresets = [
    { label: 'Square 500×500', w: 500, h: 500 },
    { label: 'Square 800×800', w: 800, h: 800 },
    { label: 'Portrait 512×768 (2:3)', w: 512, h: 768 },
    { label: 'Portrait 768×1024 (3:4)', w: 768, h: 1024 },
    { label: 'Portrait 1080×1920 (9:16)', w: 1080, h: 1920 },
    { label: 'Portrait 1200×1600 (3:4)', w: 1200, h: 1600 },
  ];
  const onPickPreset = (idx: number) => {
    const p = sizePresets[idx];
    if (!p) return;
    setCanvasW(p.w);
    setCanvasH(p.h);
    // 선택된 도형이 경계 밖으로 나가 있을 수 있으니 살짝 중앙쯤으로 오프셋하는 것도 옵션
    // 여기선 그대로 두되, 필요시 추가 가능
  };

  // 세이프 박스(빨간 사각) 크기
  const inset = SAFE_CELLS * GRID;
  const safeW = Math.max(0, canvasW - inset * 2);
  const safeH = Math.max(0, canvasH - inset * 2);

  // ── UI
  return (
    <div style={{ padding: 12, background: '#f5f5f5', borderRadius: 12 }}>
      {/* 캔버스 사이즈 프리셋 바 (최상단 분리) */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          marginBottom: 10,
          padding: 8,
          background: '#fff',
          border: '1px solid #eee',
          borderRadius: 8,
        }}
      >
        <strong style={{ color: '#111' }}>Canvas</strong>
        <select
          onChange={e => onPickPreset(Number(e.target.value))}
          value={sizePresets.findIndex(p => p.w === canvasW && p.h === canvasH)}
        >
          {sizePresets.map((p, i) => (
            <option key={p.label} value={i}>
              {p.label}
            </option>
          ))}
        </select>
        <span style={{ color: '#666' }}>
          {canvasW} × {canvasH}px
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 8,
          marginBottom: 8,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        {/* 모드 토글 */}
        <span
          style={{
            display: 'inline-flex',
            border: '1px solid #ddd',
            borderRadius: 8,
            overflow: 'hidden',
          }}
        >
          <button
            onClick={() => setMode('select')}
            style={{
              padding: '6px 10px',
              background: mode === 'select' ? '#111' : '#fff',
              color: mode === 'select' ? '#fff' : '#111',
              border: 'none',
            }}
          >
            Select
          </button>
          <button
            onClick={() => setMode('points')}
            style={{
              padding: '6px 10px',
              background: mode === 'points' ? '#111' : '#fff',
              color: mode === 'points' ? '#fff' : '#111',
              border: 'none',
            }}
          >
            Edit points
          </button>
        </span>

        <button onClick={addStroke}>+ Stroke(라인)</button>
        <button onClick={addCircle}>+ Circle</button>
        <button onClick={addEllipse}>+ Ellipse</button>
        <button onClick={toggleCubic} disabled={!selectedShape || selIsPath}>
          Curve Toggle (C)
        </button>
        <button onClick={mergeSelected} disabled={!selectedShape || selIsPath}>
          Merge to Path (M)
        </button>
        <button onClick={addNodeMid} disabled={!selectedShape}>
          Add Node (A)
        </button>
        <button onClick={deselect} disabled={!selectedShape}>
          Deselect
        </button>
        <button onClick={removeSelected} disabled={!selectedShape}>
          Delete (⌫)
        </button>
        <button onClick={saveJSON}>Save JSON (console)</button>

        {/* 스타일 & 스케일 — 항상 보이고, 선택 없으면 비활성 */}
        <span style={{ marginLeft: 12, color: '#333' }}>— Style —</span>
        <StylePanel
          selectedShape={selectedShape}
          disabled={!selectedShape}
          onChange={updateStyle}
        />
        <span
          style={{
            marginLeft: 12,
            color: '#333',
            opacity: !selectedShape ? 0.5 : 1,
          }}
        >
          — Scale —
        </span>
        <ScaleControls
          onScale={(f, withStroke) => scaleSelected(f, withStroke)}
          disabled={!selectedShape}
        />
      </div>

      <svg
        width="100%"
        height={canvasH}
        viewBox={`0 0 ${canvasW} ${canvasH}`}
        style={{
          background: '#fff',
          border: '1px solid #ddd',
          borderRadius: 12,
        }}
        {...bindCanvas()}
      >
        <defs>
          <clipPath id="canvasClip">
            <rect x="0" y="0" width={canvasW} height={canvasH} />
          </clipPath>
          <pattern
            id="grid"
            width={GRID}
            height={GRID}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M ${GRID} 0 L 0 0 0 ${GRID}`}
              fill="none"
              stroke="#eee"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          </pattern>
        </defs>

        {/* 배경(클릭 시 선택 해제) */}
        <rect
          x="0"
          y="0"
          width={canvasW}
          height={canvasH}
          fill="url(#grid)"
          onMouseDown={() => setSelected(null)}
        />
        {/* 세이프 박스(빨간 박스) */}
        <rect
          x={inset}
          y={inset}
          width={safeW}
          height={safeH}
          fill="none"
          stroke="#ef4444"
          strokeWidth={1.5}
          strokeDasharray="4 4"
          style={{ pointerEvents: 'none' }}
        />

        {/* 도형(클립 적용) */}
        <g clipPath="url(#canvasClip)">
          {shapes.map(s => (
            <g key={`shape-${s.id}`} opacity={selected === s.id ? 1 : 0.95}>
              {renderWithSelection(s, selected === s.id)}
            </g>
          ))}
        </g>

        {/* 핸들 UI: points 모드일 때만. 곡선 핸들은 주황색 꽉 채움 */}
        {mode === 'points' &&
          shapes.map(s => {
            if (selected !== s.id) return null;

            if (isPath(s)) {
              return (
                <g
                  key={`handles-path-${s.id}`}
                  onMouseDown={e => e.stopPropagation()}
                >
                  {s.nodes.map((n, i) => (
                    <g key={i}>
                      {n.h1 && (
                        <path
                          d={`M ${n.p.x} ${n.p.y} L ${n.h1.x} ${n.h1.y}`}
                          stroke="#f59e0b"
                          fill="none"
                          opacity={0.6}
                          vectorEffect="non-scaling-stroke"
                        />
                      )}
                      {n.h2 && (
                        <path
                          d={`M ${n.p.x} ${n.p.y} L ${n.h2.x} ${n.h2.y}`}
                          stroke="#f59e0b"
                          fill="none"
                          opacity={0.6}
                          vectorEffect="non-scaling-stroke"
                        />
                      )}
                      {n.h1 && (
                        <Handle
                          p={n.h1}
                          fill="#f59e0b"
                          stroke="#b45309"
                          onDrag={(dx, dy, m) =>
                            movePathH(s.id, i, 'h1', dx, dy, m)
                          }
                          onDragEnd={commitNoop}
                          label={`h1`}
                        />
                      )}
                      <Handle
                        p={n.p}
                        fill="#fff"
                        stroke="#111"
                        onDrag={(dx, dy, m) => movePathP(s.id, i, dx, dy, m)}
                        onDragEnd={commitNoop}
                        label={`p${i}`}
                      />
                      {n.h2 && (
                        <Handle
                          p={n.h2}
                          fill="#f59e0b"
                          stroke="#b45309"
                          onDrag={(dx, dy, m) =>
                            movePathH(s.id, i, 'h2', dx, dy, m)
                          }
                          onDragEnd={commitNoop}
                          label={`h2`}
                        />
                      )}
                    </g>
                  ))}
                </g>
              );
            }

            const st = s as Stroke;
            return (
              <g
                key={`handles-stroke-${s.id}`}
                onMouseDown={e => {
                  e.stopPropagation();
                  setSelected(s.id);
                }}
              >
                {isCubic(st) && (
                  <>
                    <path
                      d={`M ${st.p0.x} ${st.p0.y} L ${st.c1!.x} ${st.c1!.y}`}
                      stroke="#f59e0b"
                      fill="none"
                      opacity={0.6}
                      vectorEffect="non-scaling-stroke"
                    />
                    <path
                      d={`M ${st.p1.x} ${st.p1.y} L ${st.c2!.x} ${st.c2!.y}`}
                      stroke="#f59e0b"
                      fill="none"
                      opacity={0.6}
                      vectorEffect="non-scaling-stroke"
                    />
                  </>
                )}
                <Handle
                  p={st.p0}
                  fill="#fff"
                  stroke="#111"
                  onDrag={(dx, dy, m) => movePoint(st.id, 'p0', dx, dy, m)}
                  onDragEnd={(_, __, m) => commitPoint(st.id, 'p0', m)}
                  label="p0"
                />
                {isCubic(st) && (
                  <Handle
                    p={st.c1!}
                    fill="#f59e0b"
                    stroke="#b45309"
                    onDrag={(dx, dy, m) => movePoint(st.id, 'c1', dx, dy, m)}
                    onDragEnd={(_, __, m) => commitPoint(st.id, 'c1', m)}
                    label="c1"
                  />
                )}
                {isCubic(st) && (
                  <Handle
                    p={st.c2!}
                    fill="#f59e0b"
                    stroke="#b45309"
                    onDrag={(dx, dy, m) => movePoint(st.id, 'c2', dx, dy, m)}
                    onDragEnd={(_, __, m) => commitPoint(st.id, 'c2', m)}
                    label="c2"
                  />
                )}
                <Handle
                  p={st.p1}
                  fill="#fff"
                  stroke="#111"
                  onDrag={(dx, dy, m) => movePoint(st.id, 'p1', dx, dy, m)}
                  onDragEnd={(_, __, m) => commitPoint(st.id, 'p1', m)}
                  label="p1"
                />
              </g>
            );
          })}
      </svg>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// Panels & Utils
function StylePanel({
  selectedShape,
  disabled,
  onChange,
}: {
  selectedShape: Shape | null;
  disabled: boolean;
  onChange: (
    patch: Partial<
      Pick<Shape, 'stroke' | 'strokeWidth' | 'strokeLinecap' | 'strokeLinejoin'>
    >
  ) => void;
}) {
  return (
    <>
      <label
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        Width
        <input
          type="range"
          min={1}
          max={64}
          step={1}
          disabled={disabled}
          value={(selectedShape as any)?.strokeWidth ?? 18}
          onChange={e => onChange({ strokeWidth: Number(e.target.value) })}
        />
        <input
          type="number"
          min={1}
          max={256}
          step={1}
          disabled={disabled}
          value={(selectedShape as any)?.strokeWidth ?? 18}
          onChange={e => onChange({ strokeWidth: Number(e.target.value) })}
          style={{ width: 64 }}
        />
      </label>

      <label
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        Cap
        <select
          disabled={disabled}
          value={(selectedShape as any)?.strokeLinecap ?? 'round'}
          onChange={e => onChange({ strokeLinecap: e.target.value as any })}
        >
          <option value="butt">butt (일자)</option>
          <option value="round">round (둥글게)</option>
          <option value="square">square</option>
        </select>
      </label>

      <label
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        Join
        <select
          disabled={disabled}
          value={(selectedShape as any)?.strokeLinejoin ?? 'round'}
          onChange={e => onChange({ strokeLinejoin: e.target.value as any })}
        >
          <option value="miter">miter</option>
          <option value="round">round</option>
          <option value="bevel">bevel</option>
        </select>
      </label>
    </>
  );
}

/** -10% / +10% + "stroke 두께 함께 스케일" */
function ScaleControls({
  onScale,
  disabled,
}: {
  onScale: (factor: number, withStroke: boolean) => void;
  disabled?: boolean;
}) {
  const [withStroke, setWithStroke] = useState(true);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <input
          type="checkbox"
          checked={withStroke}
          onChange={e => setWithStroke(e.target.checked)}
          disabled={disabled}
        />
        scale stroke width
      </label>
      <button onClick={() => onScale(0.9, withStroke)} disabled={disabled}>
        Scale -10%
      </button>
      <button onClick={() => onScale(1.1, withStroke)} disabled={disabled}>
        Scale +10%
      </button>
    </span>
  );
}

// util: 복제/오프셋 (현재 캔버스 clamp 사용)
function withNewId<T extends Shape>(s: T): T {
  const copy = JSON.parse(JSON.stringify(s)) as T;
  (copy as any).id = crypto.randomUUID();
  return copy;
}
function offsetShape<T extends Shape>(
  s: T,
  dx: number,
  dy: number,
  clampByKey: (k: 'p0' | 'p1' | 'c1' | 'c2', pt: Pt) => Pt
): T {
  if (isPath(s)) {
    const nodes = s.nodes.map(n => ({
      p: clampByKey('p0', { x: n.p.x + dx, y: n.p.y + dy }),
      h1: n.h1 ? { x: n.h1.x + dx, y: n.h1.y + dy } : undefined,
      h2: n.h2 ? { x: n.h2.x + dx, y: n.h2.y + dy } : undefined,
    }));
    return { ...(s as any), nodes } as T;
  } else {
    const next: Stroke = {
      ...s,
      p0: clampByKey('p0', { x: s.p0.x + dx, y: s.p0.y + dy }),
      p1: clampByKey('p1', { x: s.p1.x + dx, y: s.p1.y + dy }),
      c1: s.c1 ? { x: s.c1.x + dx, y: s.c1.y + dy } : undefined,
      c2: s.c2 ? { x: s.c2.x + dx, y: s.c2.y + dy } : undefined,
    };
    return next as T;
  }
}
