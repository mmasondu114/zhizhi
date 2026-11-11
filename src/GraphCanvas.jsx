import { useBranchMotion } from './useBranchMotion';

import React, { useState, useRef, useEffect, useMemo, memo } from 'react';

import {
  ReactFlow,
  useReactFlow,
  useViewport,
  useStore,
  BaseEdge,
  getBezierPath,
} from '@xyflow/react';
import { Plus, Minus, Maximize, Home, Focus, RefreshCw } from 'lucide-react';

import { useSmoothWheel } from './useSmoothWheel';
import { useBoxSelection } from './useBoxSelection';

import { NODE_WIDTH, nodeHeight } from '../shared/tree';

import { KnowledgeNode } from './KnowledgeNode';
import { IconButton } from './TextContent';
function RelationEdge(props) {
  const [path] = getBezierPath({ ...props, curvature: 0.22 });
  return (
    <>
      <BaseEdge id={props.id} path={path} style={props.style} />
      {props.label && (
        <g
          className="relation-label"
          opacity={props.style?.opacity ?? 1}
          transform={`translate(${props.targetX},${props.targetY - 24})`}
          aria-label={`关系：${props.label}`}
        >
          <rect x="-26" y="-12" width="52" height="24" rx="7" />
          <text textAnchor="middle" dominantBaseline="central">
            {props.label}
          </text>
        </g>
      )}
    </>
  );
}

const edgeTypes = { relation: RelationEdge };

const nodeTypes = { knowledge: KnowledgeNode };

function HomeTarget({ home }) {
  const transform = useStore((s) => s.transform);
  return (
    <div
      className="node-home-target"
      data-testid="node-home-target"
      style={{
        left: home.origin.x * transform[2] + transform[0] - 6,
        top: home.origin.y * transform[2] + transform[1] - 6,
        width: NODE_WIDTH * transform[2] + 12,
        height: home.height * transform[2] + 12,
      }}
    />
  );
}

const GraphCanvas = memo(function GraphCanvas({
  initialNodes,
  edges,
  wheelMode,
  graphId,
  onMoveEnd,
  boxSelection,
  onNodeDragStart,
  onNodeDrag,
  onNodeDragStop,
  ...props
}) {
  const {
    nodes,
    edges: animatedEdges,
    onNodesChange,
    beginDrag,
    endDrag,
  } = useBranchMotion(initialNodes, edges, graphId);
  const host = useRef(null),
    drag = useRef(null);
  const [home, setHome] = useState(null);
  const selectionBox = useBoxSelection(host, graphId, boxSelection),
    smoothing = useSmoothWheel(host, wheelMode, graphId, onMoveEnd);
  const flow = useReactFlow(),
    overview = useStore((s) => s.transform[2] < 0.3);
  const shownEdges = useMemo(
    () =>
      overview
        ? animatedEdges.map((e) => ({ ...e, label: undefined }))
        : animatedEdges,
    [animatedEdges, overview],
  );
  useEffect(() => {
    drag.current = null;
    setHome(null);
  }, [graphId]);
  function updateHome(n) {
    const state = drag.current;
    if (!state || state.id !== n.id) return false;
    const distance =
        Math.hypot(
          n.position.x - state.origin.x,
          n.position.y - state.origin.y,
        ) * flow.getZoom(),
      near = distance <= (state.near ? 20 : 14);
    if (near !== state.near) {
      state.near = near;
      setHome(near ? { ...state } : null);
    }
    return near;
  }
  return (
    <div
      className={
        'canvas-gesture-host ' + (selectionBox ? 'is-box-selecting' : '')
      }
      ref={host}
    >
      <ReactFlow
        {...props}
        nodes={nodes}
        edges={shownEdges}
        onNodesChange={onNodesChange}
        onNodeDragStart={(e, n) => {
          beginDrag(n.id);
          const original = initialNodes.find((x) => x.id === n.id) || n;
          drag.current = {
            id: n.id,
            origin: { ...original.position },
            height: nodeHeight(original.data.node),
            near: false,
          };
          updateHome(n);
          onNodeDragStart?.(e, n);
        }}
        onNodeDrag={(e, n) => {
          updateHome(n);
          onNodeDrag?.(e, n);
        }}
        onNodeDragStop={(e, n) => {
          const snapped = updateHome(n),
            origin = drag.current?.origin;
          endDrag(n.id);
          drag.current = null;
          setHome(null);
          onNodeDragStop?.(
            e,
            snapped && origin ? { ...n, position: origin, snapBack: true } : n,
          );
        }}
        onMoveEnd={(e, v) => {
          if (!smoothing.current) onMoveEnd?.(e, v);
        }}
      />
      {home && <HomeTarget home={home} />}
      {selectionBox && (
        <div
          className="box-selection-rectangle"
          data-testid="box-selection"
          style={selectionBox}
        />
      )}
    </div>
  );
});

function ZoomBar({ root, fit, focus, arrange, wheelMode, setWheelMode }) {
  const flow = useReactFlow(),
    { zoom } = useViewport();
  return (
    <div className="zoom-bar">
      <IconButton label="整理分支" onClick={arrange}>
        <RefreshCw size={16} />
      </IconButton>
      <select
        className="interaction-select"
        aria-label="操作模式"
        title="选择滚轮与拖动的操作方式"
        value={wheelMode}
        onChange={(e) => setWheelMode(e.target.value)}
      >
        <option value="zoom">滚轮缩放</option>
        <option value="pan">滚轮平移</option>
      </select>
      <span className="divider" />
      <IconButton label="回到根节点" onClick={root}>
        <Home size={17} />
      </IconButton>
      <IconButton label="适应全部" onClick={fit}>
        <Maximize size={17} />
      </IconButton>
      <IconButton label="聚焦当前子树" onClick={focus}>
        <Focus size={17} />
      </IconButton>
      <span className="divider" />
      <IconButton label="缩小" onClick={() => flow.zoomOut({ duration: 140 })}>
        <Minus size={16} />
      </IconButton>
      <button
        className="zoom-value"
        title="恢复 100% 阅读字号"
        onClick={() => flow.zoomTo(1)}
      >
        {Math.round(zoom * 100)}%
      </button>
      <IconButton label="放大" onClick={() => flow.zoomIn({ duration: 140 })}>
        <Plus size={16} />
      </IconButton>
    </div>
  );
}
export { GraphCanvas, ZoomBar, edgeTypes, nodeTypes };
