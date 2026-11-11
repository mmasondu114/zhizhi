import React, { useRef, useEffect, memo } from 'react';

import { Handle, Position, useStore } from '@xyflow/react';
import {
  Plus,
  Minus,
  MoreHorizontal,
  Info,
  X,
  ArrowUpRight,
  Check,
  MessageCircle,
} from 'lucide-react';

import { nodeHeight } from '../shared/tree';

import { MathText, Emphasis, IconButton } from './TextContent';
import { names, statusNames } from './ui-labels';
const KnowledgeNode = memo(function KnowledgeNode({ id, data, selected }) {
  const { node: n, actions, busy, count, error, progress, ready } = data;
  const press = useRef(null),
    origin = useRef(null),
    card = useRef(null);
  const overview = useStore((s) => s.transform[2] < 0.3);
  useEffect(() => {
    if (overview || !card.current) return;
    const observer = new ResizeObserver((entries) => {
      const height =
        entries[0].borderBoxSize?.[0]?.blockSize || card.current.offsetHeight;
      actions.measure(id, Math.ceil(height));
    });
    observer.observe(card.current);
    return () => observer.disconnect();
  }, [id, actions, overview]);
  if (overview)
    return (
      <div
        className={
          'knowledge-node overview-node type-' +
          n.type +
          (selected ? ' active' : '') +
          (n.highlighted ? ' highlighted' : '') +
          (data.groupSelected ? ' group-selected' : '')
        }
        style={{ height: nodeHeight(n) }}
        data-testid="knowledge-node"
      >
        <Handle type="target" position={Position.Top} />
        <h3>{n.title}</h3>
        <Handle type="source" position={Position.Bottom} />
      </div>
    );
  return (
    <div
      className={`knowledge-node type-${n.type} ${selected ? 'active' : ''} ${busy ? 'busy' : ''} ${n.highlighted ? 'highlighted' : ''} ${data.groupSelected ? 'group-selected' : ''}`}
      ref={card}
      data-testid="knowledge-node"
      onPointerDown={(e) => {
        if (e.pointerType !== 'mouse') {
          origin.current = { x: e.clientX, y: e.clientY };
          press.current = setTimeout(() => {
            actions.menu(id, e.clientX, e.clientY, true);
            press.current = null;
          }, 550);
        }
      }}
      onPointerMove={(e) => {
        if (
          origin.current &&
          Math.hypot(
            e.clientX - origin.current.x,
            e.clientY - origin.current.y,
          ) > 7
        )
          clearTimeout(press.current);
      }}
      onPointerUp={() => clearTimeout(press.current)}
      onPointerCancel={() => clearTimeout(press.current)}
    >
      <Handle type="target" position={Position.Top} />
      <div className="node-meta">
        <span className={'type-label ' + n.type}>
          {n.type === 'question' ? (
            <MessageCircle size={12} />
          ) : n.type === 'formula' ? (
            <span className="sigma">ƒ</span>
          ) : (
            <span className="type-dot" />
          )}
          {names[n.type]}
          {n.highlighted && <span className="important-badge">重点</span>}
        </span>
        <span className="node-actions nodrag nopan">
          {data.groupSelected && (
            <span className="selection-check" title="已选中">
              <Check size={14} />
            </span>
          )}
          <IconButton
            label="查看详情"
            onClick={(e) => {
              e.stopPropagation();
              actions.details(id);
            }}
          >
            <Info size={15} />
          </IconButton>
          <IconButton
            label="更多操作"
            onClick={(e) => {
              e.stopPropagation();
              const r = e.currentTarget.getBoundingClientRect();
              actions.menu(id, r.left, r.bottom);
            }}
          >
            <MoreHorizontal size={17} />
          </IconButton>
        </span>
      </div>
      <h3>{n.title}</h3>
      <p>
        <Emphasis text={n.summary} />
      </p>
      {n.formula && (
        <div className="node-formula">
          <MathText value={n.formula} />
        </div>
      )}
      <div className="generation-slot">
        {(busy || progress?.percent === 100) && (
          <div
            className="generation-bar"
            role="progressbar"
            aria-label="生成进度"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress?.percent || 0}
            aria-valuetext={generationLabel(progress)}
          >
            <i style={{ width: (progress?.percent || 0) + '%' }} />
          </div>
        )}
      </div>
      <div className="node-footer">
        <span
          className={'learning-dot ' + n.status}
          title={statusNames[n.status]}
        />
        <span title={busy ? generationLabel(progress) : undefined}>
          {busy
            ? generationLabel(progress)
            : progress?.percent === 100
              ? '100% · 已完成'
              : error
                ? '生成失败 · 点击重试'
                : count
                  ? `${count} 个分支 · 点击${n.collapsed ? '展开' : '收起'}`
                  : n.expanded
                    ? '这一层已展开'
                    : ready || n.outline?.length
                      ? '下一层已就绪'
                      : n.prepared
                        ? '概念已准备好 · 点击阅读'
                        : '点击探索下一层'}
        </span>
        {busy ? (
          <button
            className="node-toggle nodrag"
            title="取消生成"
            aria-label="取消生成"
            onClick={(e) => {
              e.stopPropagation();
              actions.cancel(id);
            }}
          >
            <X size={14} />
          </button>
        ) : count > 0 ? (
          <button
            className="node-toggle nodrag"
            title={n.collapsed ? '展开分支' : '折叠分支'}
            aria-label={n.collapsed ? '展开分支' : '折叠分支'}
            onClick={(e) => {
              e.stopPropagation();
              actions.collapse(id);
            }}
          >
            {n.collapsed ? <Plus size={14} /> : <Minus size={14} />}
          </button>
        ) : (
          <ArrowUpRight size={14} />
        )}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
});

function generationLabel(p) {
  const labels = {
    preparing: '整理上下文',
    planning: '规划教材',
    reading: '逐段阅读',
    reviewing: '检查遗漏',
    reviewed: '复核完成',
    assembling: '整理知识层次',
    generating: '生成知识点',
    connecting: '连接模型',
    checking: '检查客户端',
    waiting: '等待模型输出',
    receiving: '正在接收内容',
    validating: '校验知识分支',
    complete: '已完成',
    cached: '已准备好',
  };
  return `${p?.percent || 0}% · ${(p?.providerStage === 'rate-limited' ? '服务限流，等待重试' : p?.providerStage === 'repairing' ? '正在修正输出格式' : labels[p?.stage]) || '准备生成'}${p?.batch ? ' · ' + p.batch + '/' + p.batches + ' 批' : ''}${p?.parallel > 1 ? ' · ' + p.parallel + ' 路并行' : ''}${p?.reused ? ' · 已复用 ' + p.reused + ' 项' : ''}${p?.reviewRound ? ' · 第 ' + p.reviewRound + ' 次复核' : ''}${p?.elapsedMs >= 1000 ? ' · ' + Math.floor(p.elapsedMs / 1000) + '秒' : ''}${p?.file ? ' · ' + p.file : ''}`;
}
export { KnowledgeNode };
