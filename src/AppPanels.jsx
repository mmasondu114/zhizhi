import React from 'react';

import {
  ChevronRight,
  ChevronDown,
  X,
  Check,
  MessageCircle,
} from 'lucide-react';

import { visibleNodes } from '../shared/tree';

import { IconButton } from './TextContent';
function Outline({ graph, selected, locate, collapse }) {
  const byId = new Map(graph.nodes.map((n) => [n.id, n])),
    visible = new Set(visibleNodes(graph).map((n) => n.id)),
    rows = [],
    stack = [[graph.root, 0]];
  const cs = new Map();
  for (const n of graph.nodes) {
    if (!cs.has(n.parent)) cs.set(n.parent, []);
    cs.get(n.parent).push(n);
  }
  while (stack.length) {
    const [id, d] = stack.pop(),
      n = byId.get(id);
    if (!visible.has(id)) continue;
    rows.push(
      <div
        className={
          'outline-row ' +
          (id === selected ? 'selected' : '') +
          (n.highlighted ? ' highlighted' : '')
        }
        key={id}
        style={{ paddingLeft: Math.min(d, 6) * 13 + 8 }}
      >
        <button
          className="outline-toggle"
          aria-label={'折叠大纲 ' + n.title}
          onClick={() => collapse(id)}
        >
          {cs.get(id)?.length ? (
            n.collapsed ? (
              <ChevronRight size={13} />
            ) : (
              <ChevronDown size={13} />
            )
          ) : (
            <span className="outline-dot" />
          )}
        </button>
        <button
          className="outline-title"
          onClick={() => locate(id)}
          title={n.title}
        >
          {n.type === 'question' && <MessageCircle size={12} />} {n.title}
        </button>
        {n.status === 'understood' && <Check size={12} />}
      </div>,
    );
    for (const c of [...(cs.get(id) || [])].reverse())
      stack.push([c.id, d + 1]);
  }
  return <div className="outline-tree">{rows}</div>;
}

function Modal({ title, onClose, wide, children }) {
  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className={'modal ' + (wide ? 'wide' : '')}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-title">
          <h2>{title}</h2>
          <IconButton label="关闭窗口" onClick={onClose}>
            <X size={19} />
          </IconButton>
        </div>
        {children}
      </section>
    </div>
  );
}

function EditNode({ node, save }) {
  if (!node) return null;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(e.currentTarget));
        save(d);
      }}
    >
      <label>
        标题
        <input
          name="title"
          required
          maxLength={100}
          defaultValue={node.title}
        />
      </label>
      <p className="muted small-copy">
        在要点或解释中用 **文字** 标红某一段重点；也可通过右键菜单标记整个节点。
      </p>
      <label>
        一句核心要点
        <textarea
          name="summary"
          required
          maxLength={320}
          defaultValue={node.summary}
        />
      </label>
      <label>
        详细解释
        <textarea
          name="detail"
          rows={5}
          required
          maxLength={10000}
          defaultValue={node.detail}
        />
      </label>
      <label>
        公式（LaTeX）
        <input name="formula" maxLength={2000} defaultValue={node.formula} />
      </label>
      <button className="primary full">保存修改</button>
    </form>
  );
}
export { Outline, Modal, EditNode };
