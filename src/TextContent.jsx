import React, { useMemo } from 'react';

import katex from 'katex';

import { normalizeFormula } from '../shared/math';

function MathText({ value, block = false }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(normalizeFormula(value), {
        throwOnError: false,
        trust: false,
        strict: 'ignore',
        displayMode: block,
        output: 'html',
        maxExpand: 1000,
      });
    } catch {
      return null;
    }
  }, [value, block]);
  return html ? (
    <span
      className={block ? 'math-block' : 'math-inline'}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  ) : (
    <span>{value}</span>
  );
}

function Emphasis({ text = '' }) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong className="key-emphasis" key={i}>
        {part.slice(2, -2)}
      </strong>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    ),
  );
}

function Prose({ text = '' }) {
  return (
    <div className="prose">
      {text
        .split(
          /(\$\$[\s\S]*?\$\$|\$[^$\n]+\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\))/g,
        )
        .map((t, i) =>
          t.startsWith('$$') ? (
            <MathText key={i} block value={t.slice(2, -2)} />
          ) : t.startsWith('$') ? (
            <MathText key={i} value={t.slice(1, -1)} />
          ) : t.startsWith('\\[') || t.startsWith('\\(') ? (
            <MathText
              key={i}
              block={t.startsWith('\\[')}
              value={t.slice(2, -2)}
            />
          ) : (
            <Emphasis key={i} text={t} />
          ),
        )}
    </div>
  );
}

function IconButton({ label, children, ...props }) {
  return (
    <button className="icon-btn" title={label} aria-label={label} {...props}>
      {children}
    </button>
  );
}
export { MathText, Emphasis, Prose, IconButton };
