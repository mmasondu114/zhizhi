import ConceptView from './ConceptView';
import LessonVisuals from './LessonVisuals';
import OperationGuide from './OperationGuide';
import GenerationPreview from './GenerationPreview';
import { reconcileFlowNodes } from './flow-nodes';

import ExerciseOverlay from './ExerciseOverlay';
import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from 'react';

import { Background, useReactFlow } from '@xyflow/react';
import {
  Plus,
  Minus,
  Search,
  Settings,
  PanelLeft,
  ChevronRight,
  ChevronDown,
  Info,
  CircleHelp,
  X,
  ArrowUpRight,
  Undo2,
  Redo2,
  BookOpen,
  Upload,
  Download,
  Trash2,
  Check,
  Loader2,
  MessageCircle,
  CornerDownRight,
  FileText,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';

import SettingsForm from './SettingsForm';
import { GenerationQueue, requestGeneration } from './generation-client';
import Materials from './Materials';

import SelectionMenu from './SelectionMenu';
import {
  copyNodes,
  selectedText,
  deleteSelected,
  pasteNodes,
} from '../shared/selection';
import { makeGraph, demoChildren, demoAnswer } from './demo';
import {
  NODE_WIDTH,
  LEVEL_GAP,
  nodeHeight,
  readableLayout,
  resolveDrop,
  uid,
  children,
  ancestors,
  visibleNodes,
  layout,
  reveal,
  removeBranch,
  markdown,
} from '../shared/tree';

import { validateGraph } from '../shared/protocol';
import { Prose, IconButton, MathText, Emphasis } from './TextContent';
import { GraphCanvas, ZoomBar, edgeTypes, nodeTypes } from './GraphCanvas';
import { Outline, Modal, EditNode } from './AppPanels';
import { names, origins, statusNames, providerNames } from './ui-labels';
let token = '';

async function api(url, options = {}) {
  const headers = {
    'x-tree-token': token,
    ...(!(options.body instanceof FormData)
      ? { 'Content-Type': 'application/json' }
      : {}),
    ...options.headers,
  };
  const r = await fetch('/api' + url, { ...options, headers });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || `请求失败 ${r.status}`);
  return data;
}

function savedView(g) {
  try {
    const v = JSON.parse(localStorage.getItem('zhizhi-view-' + g.id));
    if (
      v &&
      [v.x, v.y, v.zoom].every(Number.isFinite) &&
      v.zoom >= 0.0005 &&
      v.zoom <= 4
    )
      return { ...g, viewport: v };
  } catch {}
  return g;
}

function App() {
  const [conceptMode, setConceptModeState] = useState(() => {
    try {
      return localStorage.getItem('zhizhi-concept-mode') === 'panel'
        ? 'panel'
        : 'popup';
    } catch {
      return 'popup';
    }
  });
  const [lessonBusy, setLessonBusy] = useState(false),
    lessonRequest = useRef(null);
  function setConceptMode(value) {
    setConceptModeState(value);
    try {
      localStorage.setItem('zhizhi-concept-mode', value);
    } catch {}
  }

  const [wheelMode, setWheelModeState] = useState(() =>
    localStorage.getItem('zhizhi-wheel-mode') === 'pan' ? 'pan' : 'zoom',
  );
  function setWheelMode(value) {
    setWheelModeState(value);
    try {
      localStorage.setItem('zhizhi-wheel-mode', value);
    } catch {}
  }
  function toggleHighlight(id) {
    const g = gRef.current;
    commit({
      ...g,
      nodes: g.nodes.map((n) =>
        n.id === id ? { ...n, highlighted: !n.highlighted } : n,
      ),
    });
  }

  const [graph, setGraph] = useState(null),
    [graphs, setGraphs] = useState([]),
    [settings, setSettings] = useState(null),
    [connection, setConnection] = useState({ status: 'disconnected' }),
    [clients, setClients] = useState({}),
    [selected, setSelected] = useState(null),
    [detail, setDetail] = useState(false),
    [outline, setOutline] = useState(() => window.innerWidth > 760),
    [modal, setModal] = useState(null),
    [menu, setMenu] = useState(null),
    [ask, setAsk] = useState(null),
    [exercise, setExercise] = useState(null),
    [query, setQuery] = useState(''),
    [busy, setBusy] = useState({}),
    [errors, setErrors] = useState({}),
    [notice, setNotice] = useState(''),
    [saveStatus, setSaveStatus] = useState('已保存在本机'),
    [historyTick, setHistoryTick] = useState(0),
    [flowNodes, setFlowNodes] = useState([]),
    [welcome, setWelcome] = useState(false);
  const gRef = useRef(graph),
    settingsRef = useRef(settings),
    inflight = useRef(new Map()),
    history = useRef({ past: [], future: [] }),
    saveQueue = useRef(Promise.resolve()),
    saveTimers = useRef(new Map()),
    latest = useRef(new Map()),
    newestSave = useRef(new Map()),
    epoch = useRef(0),
    dragTime = useRef(0),
    dragNodeId = useRef(null),
    cameraTimer = useRef(null),
    suppressTouchClick = useRef(false),
    flow = useReactFlow(),
    alive = useRef(true);
  gRef.current = graph;
  settingsRef.current = settings;
  const [groupIds, setGroupIds] = useState([]),
    [groupMenu, setGroupMenu] = useState(null),
    [canPaste, setCanPaste] = useState(false);
  const groupRef = useRef([]),
    nodeClipboard = useRef(null),
    bulkCommands = useRef(null),
    lastSelectionPoint = useRef(null);
  const firstDirty = useRef(new Map()),
    recoveryTimer = useRef(null),
    measurements = useRef(new Map()),
    measureTimer = useRef(null);
  const toastTimer = useRef(null),
    [progress, setProgress] = useState({}),
    [previews, setPreviews] = useState({}),
    [prefetchState, setPrefetchState] = useState({
      ready: [],
      active: [],
      queued: 0,
    }),
    [prefetchEnabled, setPrefetchEnabled] = useState(
      () => localStorage.getItem('zhizhi-prefetch') !== 'off',
    );
  const generation = useRef(null);
  if (!generation.current)
    generation.current = new GenerationQueue(
      (g, id, provider, options) =>
        requestGeneration(g, id, provider, { ...options, token }),
      {
        onChange: (s) => {
          if (alive.current) setPrefetchState(s);
        },
      },
    );
  useEffect(() => {
    generation.current.setEnabled(prefetchEnabled && !exercise);
    try {
      localStorage.setItem('zhizhi-prefetch', prefetchEnabled ? 'on' : 'off');
    } catch {}
  }, [prefetchEnabled, !!exercise]);
  useEffect(
    () => () => {
      clearTimeout(toastTimer.current);
      generation.current.reset();
    },
    [],
  );
  const notify = useCallback((message) => {
    clearTimeout(toastTimer.current);
    setNotice(message);
    toastTimer.current = setTimeout(() => setNotice(''), 5000);
  }, []);
  useEffect(() => {
    const blockSyntheticClick = (e) => {
      if (suppressTouchClick.current) {
        suppressTouchClick.current = false;
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    const nextGesture = () => {
      suppressTouchClick.current = false;
      clearTimeout(cameraTimer.current);
    };
    document.addEventListener('click', blockSyntheticClick, true);
    document.addEventListener('pointerdown', nextGesture, true);
    return () => {
      document.removeEventListener('click', blockSyntheticClick, true);
      document.removeEventListener('pointerdown', nextGesture, true);
    };
  }, []);
  function backupRecovery() {
    const g = gRef.current && newestSave.current.get(gRef.current.id);
    if (!g) return;
    try {
      localStorage.setItem('zhizhi-recovery', JSON.stringify(g));
      localStorage.setItem('zhizhi-last', g.id);
    } catch {}
  }
  function queueSave(g) {
    g = { ...g, updatedAt: new Date().toISOString() };
    latest.current.set(g.id, g);
    newestSave.current.set(g.id, g);
    setSaveStatus('待保存');
    if (!firstDirty.current.has(g.id)) firstDirty.current.set(g.id, Date.now());
    clearTimeout(recoveryTimer.current);
    recoveryTimer.current = setTimeout(backupRecovery, 500);
    clearTimeout(saveTimers.current.get(g.id));
    const delay = Math.min(
      3000,
      Math.max(0, 15000 - (Date.now() - firstDirty.current.get(g.id))),
    );
    saveTimers.current.set(
      g.id,
      setTimeout(() => persist(g.id), delay),
    );
  }
  useEffect(() => {
    window.zhizhiFlush = async () => {
      cancelAll();
      backupRecovery();
      for (const id of [...latest.current.keys()]) await persist(id);
      await saveQueue.current;
      return latest.current.size === 0;
    };
    window.addEventListener('beforeunload', backupRecovery);
    return () => {
      window.removeEventListener('beforeunload', backupRecovery);
      delete window.zhizhiFlush;
      clearTimeout(recoveryTimer.current);
      clearTimeout(measureTimer.current);
    };
  }, []);
  function flushMeasurements() {
    if (dragNodeId.current) {
      measureTimer.current = setTimeout(flushMeasurements, 80);
      return;
    }
    const g = gRef.current;
    if (!g) return;
    let changed = false;
    const nodes = g.nodes.map((n) => {
      const h = measurements.current.get(n.id);
      if (h && Math.abs((n.layoutHeight || 0) - h) > 1) {
        changed = true;
        return { ...n, layoutHeight: h };
      }
      return n;
    });
    measurements.current.clear();
    if (changed)
      commit(readableLayout({ ...g, nodes }), { record: false, save: false });
  }
  function measureNode(id, height) {
    if (!Number.isFinite(height) || height < 80 || height > 10000) return;
    measurements.current.set(id, height);
    clearTimeout(measureTimer.current);
    measureTimer.current = setTimeout(flushMeasurements, 80);
  }
  function persist(id) {
    clearTimeout(saveTimers.current.get(id));
    saveTimers.current.delete(id);
    const g = latest.current.get(id);
    if (!g) return saveQueue.current;
    firstDirty.current.delete(id);
    latest.current.delete(id);
    if (gRef.current?.id === id) setSaveStatus('正在保存…');
    saveQueue.current = saveQueue.current
      .catch(() => {})
      .then(async () => {
        try {
          await api('/graphs/' + id, {
            method: 'PUT',
            body: JSON.stringify(g),
          });
          if (gRef.current?.id === id && newestSave.current.get(id) === g)
            setSaveStatus('已保存在本机');
          setGraphs((list) => [
            { id: g.id, name: g.name, count: g.nodes.length },
            ...list.filter((x) => x.id !== id),
          ]);
        } catch (e) {
          if (newestSave.current.get(id) === g) {
            latest.current.set(id, g);
            if (gRef.current?.id === id) {
              setSaveStatus('保存失败 · 点击重试');
              notify(e.message + '；恢复副本保留在浏览器');
            }
          }
        }
      });
    return saveQueue.current;
  }
  function commit(next, { record = true, save = true } = {}) {
    const old = gRef.current;
    if (record && old?.id === next.id) {
      history.current.past.push(structuredClone(old));
      if (history.current.past.length > 40) history.current.past.shift();
      history.current.future = [];
      setHistoryTick((x) => x + 1);
    }
    gRef.current = next;
    setGraph(next);
    if (save) queueSave(next);
  }
  const cancel = useCallback((id) => {
    const req = inflight.current.get(id);
    if (req) {
      req.controller.abort();
      inflight.current.delete(id);
    }
    setBusy((v) => {
      const n = { ...v };
      delete n[id];
      return n;
    });
  }, []);
  function cancelAll() {
    lessonRequest.current?.abort();
    setExercise(null);
    clearSelection();
    generation.current.reset();
    setProgress({});
    setPreviews({});
    epoch.current++;
    for (const { controller } of inflight.current.values()) controller.abort();
    inflight.current.clear();
    setBusy({});
  }
  function undo(redo = false) {
    cancelAll();
    const h = history.current,
      from = redo ? h.future : h.past,
      to = redo ? h.past : h.future;
    if (!from.length) return;
    to.push(structuredClone(gRef.current));
    commit(from.pop(), { record: false });
    setHistoryTick((x) => x + 1);
  }
  function resetHistory() {
    history.current = { past: [], future: [] };
    setHistoryTick((x) => x + 1);
  }
  async function switchGraph(id) {
    cancelAll();
    if (gRef.current) await persist(gRef.current.id);
    try {
      const g = savedView(
        readableLayout(latest.current.get(id) || (await api('/graphs/' + id))),
      );
      resetHistory();
      setSelected(g.root);
      setDetail(false);
      setMenu(null);
      setAsk(null);
      setQuery('');
      setErrors({});
      commit(g, { record: false, save: false });
      localStorage.setItem('zhizhi-last', id);
      cameraTimer.current = setTimeout(
        () =>
          g.viewport
            ? flow.setViewport(g.viewport)
            : flow.fitView({ padding: 0.3, maxZoom: 1 }),
        70,
      );
    } catch (e) {
      notify(e.message);
    }
  }
  useEffect(
    () => () => {
      lessonRequest.current?.abort();
      setLessonBusy(false);
    },
    [detail, selected, graph?.id],
  );
  async function refreshLesson() {
    const g = gRef.current,
      id = selected;
    if (!g || lessonBusy) return;
    const controller = new AbortController();
    lessonRequest.current = controller;
    setLessonBusy(true);
    try {
      const result = await api('/lesson', {
        method: 'POST',
        signal: controller.signal,
        body: JSON.stringify({ graph: g, nodeId: id }),
      });
      if (controller.signal.aborted || gRef.current?.id !== g.id) return;
      commit({
        ...gRef.current,
        nodes: gRef.current.nodes.map((n) =>
          n.id === id ? { ...n, ...result.lesson } : n,
        ),
      });
      notify('章节概括和讲解已更新');
    } catch (e) {
      if (!controller.signal.aborted) notify(e.message);
    } finally {
      if (lessonRequest.current === controller) {
        lessonRequest.current = null;
        setLessonBusy(false);
      }
    }
  }
  async function create(goal, mode) {
    cancelAll();
    if (gRef.current) await persist(gRef.current.id);
    const g = makeGraph(goal, mode);
    resetHistory();
    setSelected(g.root);
    commit(g, { record: false });
    setWelcome(false);
    setModal(null);
    setDetail(false);
    setTimeout(() => flow.fitView({ padding: 0.3, maxZoom: 1 }), 80);
  }
  useEffect(() => {
    alive.current = true;
    (async () => {
      try {
        const boot = await api('/bootstrap');
        token = boot.token;
        setSettings(boot.settings);
        setConnection(boot.connection || { status: 'disconnected' });
        const list = await api('/graphs');
        setGraphs(list);
        let recovery;
        try {
          recovery = validateGraph(
            JSON.parse(localStorage.getItem('zhizhi-recovery')),
          );
        } catch {}
        const last = localStorage.getItem('zhizhi-last');
        let g;
        if (recovery && recovery.id === last) {
          let saved = null;
          try {
            saved = await api('/graphs/' + last);
          } catch {}
          g =
            saved &&
            Date.parse(saved.updatedAt || 0) >=
              Date.parse(recovery.updatedAt || 0)
              ? saved
              : recovery;
          if (g === recovery) queueSave(g);
        } else if (list.length)
          g = await api(
            '/graphs/' + (list.find((x) => x.id === last)?.id || list[0].id),
          );
        else {
          g = makeGraph();
          setWelcome(true);
          queueSave(g);
        }
        if (!alive.current) return;
        const readable = readableLayout(savedView(g));
        if (readable !== g) {
          g = readable;
          queueSave(g);
        }
        gRef.current = g;
        setGraph(g);
        setSelected(g.root);
        cameraTimer.current = setTimeout(
          () =>
            g.viewport
              ? flow.setViewport(g.viewport)
              : flow.fitView({ maxZoom: 1, padding: 0.4 }),
          100,
        );
      } catch (e) {
        notify('启动失败：' + e.message);
      }
    })();
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    const close = () => {
      setMenu(null);
      setGroupMenu(null);
    };
    window.addEventListener('resize', close);
    const keys = (e) => {
      if (e.defaultPrevented || document.querySelector('.exercise-overlay'))
        return;
      if (document.querySelector('.modal-overlay')) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setModal(null);
        }
        return;
      }
      if (document.querySelector('.concept-overlay')) return;
      if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (e.key === 'Escape') {
        clearSelection();
        setMenu(null);
        setAsk(null);
        setModal(null);
        setDetail(false);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo(e.shiftKey);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        undo(true);
      }
    };
    window.addEventListener('keydown', keys);
    return () => {
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', keys);
    };
  }, []);
  function center(id) {
    clearTimeout(cameraTimer.current);
    const n = gRef.current?.nodes.find((n) => n.id === id);
    if (n) {
      setSelected(id);
      flow.setCenter(
        n.position.x + NODE_WIDTH / 2,
        n.position.y + nodeHeight(n) / 2,
        {
          zoom: Math.max(1, flow.getZoom()),
          duration: matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 0
            : 200,
        },
      );
    }
  }
  function locate(id) {
    const old = gRef.current;
    if (ancestors(old, id).some((n) => n.collapsed)) commit(reveal(old, id));
    setTimeout(() => center(id), 30);
  }
  async function generate(id, { force = false, skipOverview = false } = {}) {
    const g = gRef.current,
      n = g?.nodes.find((n) => n.id === id);
    if (!n || inflight.current.has(id)) return;
    setSelected(id);
    // Existing branches and prepared outlines take precedence over chapter lectures.
    if (!force && children(g, id).length) {
      setDetail(false);
      commit(
        layout(
          {
            ...g,
            nodes: g.nodes.map((x) =>
              x.id === id ? { ...x, collapsed: !x.collapsed } : x,
            ),
          },
          id,
        ),
      );
      return;
    }
    const hasCachedOutline = !force && !!n.outline?.length;
    if (!force && !hasCachedOutline) {
      if (!skipOverview && n.materialIds?.length) {
        setDetail(true);
        return;
      }
      if (n.prepared) {
        setDetail(!(selected === id && detail));
        return;
      }
    }
    const kind = settingsRef.current?.selected || 'demo';
    if (!hasCachedOutline && kind === 'demo' && g.mode !== 'demo') {
      notify('请先在设置中连接模型；预置演示仅支持 z-score 示例。');
      setModal('settings');
      return;
    }
    setDetail(false);
    if (force) cancelAll();
    const controller = new AbortController(),
      requestId = uid(),
      startEpoch = epoch.current;
    inflight.current.set(id, { controller, requestId });
    setBusy((v) => ({ ...v, [id]: true }));
    setProgress((v) => ({ ...v, [id]: { stage: 'preparing', percent: 0 } }));
    setErrors((v) => ({ ...v, [id]: '' }));
    try {
      let nodes;
      if (!force && n.outline?.length) {
        nodes = n.outline;
        setProgress((v) => ({ ...v, [id]: { stage: 'cached', percent: 100 } }));
      } else if (kind === 'demo') {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, 380);
          controller.signal.addEventListener(
            'abort',
            () => {
              clearTimeout(timer);
              reject(new Error('请求已取消'));
            },
            { once: true },
          );
        });
        nodes =
          n.type === 'question'
            ? demoAnswer(
                n.title,
                g.nodes.find((x) => x.id === n.parent),
              )
            : demoChildren(n);
      } else {
        const result = await generation.current.request(g, id, kind, {
          signal: controller.signal,
          force,
          onPreview: (p) => {
            if (
              !controller.signal.aborted &&
              epoch.current === startEpoch &&
              gRef.current?.id === g.id
            )
              setPreviews((v) => ({
                ...v,
                [id]: { ...(v[id] || {}), [p.document.id]: p.document },
              }));
          },
          onProgress: (p) => {
            if (!controller.signal.aborted && epoch.current === startEpoch)
              setProgress((v) => ({ ...v, [id]: p }));
          },
        });
        nodes = result.nodes;
        setConnection(result.connection || { kind, status: 'connected' });
      }
      const current = gRef.current;
      if (
        controller.signal.aborted ||
        epoch.current !== startEpoch ||
        current.id !== g.id ||
        !current.nodes.some((x) => x.id === id) ||
        inflight.current.get(id)?.requestId !== requestId
      )
        return;
      let base = current;
      if (force) {
        for (const c of children(current, id)) base = removeBranch(base, c.id);
      }
      const fresh = nodes.map((x) => ({
        ...x,
        ...(n.prepared ? { prepared: true } : {}),
        id: uid(),
        parent: id,
        status: 'unlearned',
        collapsed: false,
        expanded: false,
        position: { x: n.position.x, y: n.position.y + LEVEL_GAP },
        origin:
          !hasCachedOutline && kind === 'demo'
            ? 'demo'
            : x.sources?.length
              ? 'material'
              : 'ai',
      }));
      commit(
        layout(
          {
            ...base,
            nodes: [
              ...base.nodes.map((x) =>
                x.id === id
                  ? {
                      ...x,
                      expanded: true,
                      collapsed: false,
                      status: x.status === 'unlearned' ? 'learning' : x.status,
                    }
                  : x,
              ),
              ...fresh,
            ],
          },
          id,
        ),
      );
      setPreviews((v) => {
        const next = { ...v };
        delete next[id];
        return next;
      });
      setProgress((v) => ({ ...v, [id]: { stage: 'complete', percent: 100 } }));
      setTimeout(() => {
        if (epoch.current === startEpoch && !inflight.current.has(id))
          setProgress((v) => {
            const next = { ...v };
            delete next[id];
            return next;
          });
      }, 1500);
      if (kind !== 'demo')
        generation.current.schedule(gRef.current, fresh, kind);
    } catch (e) {
      if (!controller.signal.aborted && epoch.current === startEpoch) {
        setErrors((v) => ({ ...v, [id]: e.message }));
        if (kind !== 'demo') setConnection({ kind, status: 'error' });
        notify(e.message);
      }
    } finally {
      if (inflight.current.get(id)?.requestId === requestId) {
        inflight.current.delete(id);
        setBusy((v) => {
          const n = { ...v };
          delete n[id];
          return n;
        });
      }
    }
  }
  const actions = useMemo(
    () => ({
      details: (id) => {
        clearSelection();
        setSelected(id);
        setDetail(true);
      },
      menu: (id, x, y, longPress = false) => {
        clearSelection();
        if (longPress) suppressTouchClick.current = true;
        setSelected(id);
        setMenu({
          id,
          x: Math.max(8, Math.min(x, window.innerWidth - 256)),
          y: Math.max(8, Math.min(y, window.innerHeight - 515)),
        });
        setAsk(null);
      },
      collapse: (id) => {
        const g = gRef.current;
        commit(
          layout(
            {
              ...g,
              nodes: g.nodes.map((n) =>
                n.id === id ? { ...n, collapsed: !n.collapsed } : n,
              ),
            },
            id,
          ),
        );
      },
      cancel: (id) => cancel(id),
      measure: (id, height) => measureNode(id, height),
    }),
    [],
  );
  useEffect(() => {
    if (!graph) return;
    const counts = new Map();
    graph.nodes.forEach((n) =>
      counts.set(n.parent, (counts.get(n.parent) || 0) + 1),
    );
    setFlowNodes((previous) =>
      reconcileFlowNodes(
        previous,
        visibleNodes(graph).map((n) => ({
          id: n.id,
          type: 'knowledge',
          position: n.position,
          selected: groupIds.length
            ? groupIds.length === 1 && groupIds[0] === n.id
            : n.id === selected,
          data: {
            node: n,
            groupSelected: groupIds.includes(n.id),
            actions,
            busy: busy[n.id],
            count: counts.get(n.id) || 0,
            error: errors[n.id],
            progress: progress[n.id],
            ready: prefetchState.ready.includes(n.id),
          },
        })),
      ),
    );
  }, [
    graph,
    selected,
    busy,
    errors,
    actions,
    progress,
    prefetchState,
    groupIds,
  ]);
  const edges = useMemo(() => {
    if (!graph) return [];
    const visible = new Set(visibleNodes(graph).map((n) => n.id));
    return [
      ...graph.nodes
        .filter((n) => n.parent && visible.has(n.id))
        .map((n) => ({
          id: 'e-' + n.id,
          source: n.parent,
          target: n.id,
          type: 'relation',
          label: n.relation,
          style: {
            stroke: n.type === 'question' ? '#8fb8aa' : '#c6c8cf',
            strokeWidth: 1.4,
          },
          pathOptions: { borderRadius: 18, offset: 25 },
        })),
      ...graph.references
        .filter((r) => visible.has(r.source) && visible.has(r.target))
        .map((r, i) => ({
          id: 'ref-' + i,
          source: r.source,
          target: r.target,
          type: 'relation',
          label: '引用',
          style: { stroke: '#b2c8bf', strokeDasharray: '4 4' },
        })),
    ];
  }, [graph]);
  function askNode(id, text = '', x, y) {
    const node = gRef.current.nodes.find((n) => n.id === id);
    if (!node) return;
    setMenu(null);
    const p = flow.flowToScreenPosition({
      x: node.position.x + 120,
      y: node.position.y + 160,
    });
    setAsk({
      id,
      text,
      x: Math.max(8, Math.min(x || p.x, window.innerWidth - 380)),
      y: Math.max(80, Math.min(y || p.y, window.innerHeight - 290)),
    });
  }
  function submitQuestion(text, parent) {
    if (!text.trim()) return;
    const g = gRef.current,
      n = g.nodes.find((n) => n.id === parent);
    if (!n) return;
    const id = uid();
    const q = {
      id,
      parent,
      title: text.trim().slice(0, 100),
      summary: '针对「' + n.title + '」提出的问题',
      detail: text.trim().slice(0, 10000),
      type: 'question',
      relation: '提问',
      formula: '',
      example: '',
      sources: [],
      status: 'unlearned',
      collapsed: false,
      expanded: false,
      position: { x: n.position.x, y: n.position.y + LEVEL_GAP },
      origin: 'user',
    };
    commit(
      layout(
        {
          ...g,
          nodes: [
            ...g.nodes.map((x) =>
              x.id === parent ? { ...x, collapsed: false } : x,
            ),
            q,
          ],
        },
        parent,
      ),
    );
    setSelected(id);
    setAsk(null);
    setTimeout(() => generate(id), 0);
  }
  function changeSelection(ids) {
    const valid = ids.filter((id) =>
      gRef.current?.nodes.some((n) => n.id === id),
    );
    groupRef.current = valid;
    setGroupIds((previous) =>
      previous.join('|') === valid.join('|') ? previous : valid,
    );
  }
  function clearSelection() {
    groupRef.current = [];
    setGroupIds([]);
    setGroupMenu(null);
  }
  function endSelection(ids, point) {
    changeSelection(ids);
    lastSelectionPoint.current = point;
    setGroupMenu(ids.length ? point : null);
  }
  function selectionContext(id, point) {
    lastSelectionPoint.current = point;
    if (id && groupRef.current.includes(id)) {
      setMenu(null);
      setAsk(null);
      setGroupMenu(point);
    } else if (id) {
      actions.menu(id, point.x, point.y);
    } else {
      clearSelection();
      setMenu(null);
      setAsk(null);
      if (nodeClipboard.current) setGroupMenu(point);
    }
  }
  async function writeClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const focused = document.activeElement,
        field = document.createElement('textarea');
      field.value = text;
      field.style.cssText = 'position:fixed;left:-10000px;top:0';
      document.body.appendChild(field);
      field.select();
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch {}
      field.remove();
      focused?.focus?.({ preventScroll: true });
      return ok;
    }
  }
  async function copyGroup() {
    const g = gRef.current,
      ids = groupRef.current;
    if (!g || !ids.length) return;
    const payload = copyNodes(g, ids);
    nodeClipboard.current = payload;
    setCanPaste(true);
    const copied = await writeClipboard(selectedText(payload));
    notify(
      copied
        ? '已复制 ' + payload.nodes.length + ' 个节点；可粘贴副本，文字也已复制'
        : '已复制节点，可在应用内粘贴副本',
    );
  }
  function pasteGroup() {
    if (!nodeClipboard.current || !gRef.current) return;
    try {
      const point = lastSelectionPoint.current || {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      };
      const result = pasteNodes(
        gRef.current,
        nodeClipboard.current,
        flow.screenToFlowPosition(point),
      );
      commit(result.graph);
      changeSelection(result.ids);
      setGroupMenu(null);
      setSelected(result.ids[0]);
      setTimeout(
        () =>
          flow.fitView({
            nodes: result.ids.map((id) => ({ id })),
            padding: 0.35,
            maxZoom: 1,
            duration: 180,
          }),
        80,
      );
      notify('已粘贴 ' + result.ids.length + ' 个节点，可以撤销');
    } catch (e) {
      notify(e.message);
    }
  }
  function deleteGroup() {
    const g = gRef.current,
      ids = [...groupRef.current];
    if (!g || !ids.some((id) => id !== g.root)) return;
    const next = deleteSelected(g, ids),
      count = g.nodes.length - next.nodes.length;
    cancelAll();
    commit(next);
    setSelected(next.root);
    setDetail(false);
    notify(
      '已删除 ' +
        count +
        ' 个节点，未选中的子节点已保留；可以撤销' +
        (ids.includes(g.root) ? '。根节点已保留' : ''),
    );
  }
  function updateGroup(change) {
    const chosen = new Set(groupRef.current),
      g = gRef.current;
    if (!g || !chosen.size) return;
    const next = {
      ...g,
      nodes: g.nodes.map((n) => (chosen.has(n.id) ? { ...n, ...change } : n)),
    };
    commit(change.collapsed ? layout(next) : next);
    setGroupMenu(null);
  }
  bulkCommands.current = {
    copy: copyGroup,
    paste: pasteGroup,
    delete: deleteGroup,
  };
  useEffect(() => {
    const keys = (e) => {
      if (
        e.defaultPrevented ||
        e.target.closest?.('input,textarea,select,[contenteditable=true]') ||
        document.querySelector(
          '.modal-overlay,.exercise-overlay,.concept-overlay',
        )
      )
        return;
      const command = e.ctrlKey || e.metaKey,
        key = e.key.toLowerCase();
      if (
        command &&
        key === 'c' &&
        groupRef.current.length &&
        window.getSelection()?.isCollapsed !== false
      ) {
        e.preventDefault();
        bulkCommands.current.copy();
      } else if (command && key === 'v' && nodeClipboard.current) {
        e.preventDefault();
        bulkCommands.current.paste();
      } else if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        groupRef.current.length
      ) {
        e.preventDefault();
        bulkCommands.current.delete();
      }
    };
    window.addEventListener('keydown', keys);
    return () => window.removeEventListener('keydown', keys);
  }, []);
  function deleteNode(id) {
    const g = gRef.current;
    try {
      cancelAll();
      const next = removeBranch(g, id);
      for (const n of g.nodes)
        if (!next.nodes.some((x) => x.id === n.id)) cancel(n.id);
      commit(next);
      setSelected(next.root);
      setMenu(null);
      setDetail(false);
      notify('分支已删除，可以撤销恢复。');
    } catch (e) {
      notify(e.message);
    }
  }
  const current = graph?.nodes.find((n) => n.id === selected),
    pathNodes = graph ? ancestors(graph, selected) : [],
    matches =
      graph && query
        ? graph.nodes
            .filter((n) =>
              (n.title + ' ' + n.summary)
                .toLowerCase()
                .includes(query.toLowerCase()),
            )
            .slice(0, 30)
        : [];
  function exportFile(type) {
    const data =
      type === 'json'
        ? JSON.stringify({ ...graph, viewport: flow.getViewport() }, null, 2)
        : markdown(graph);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(
      new Blob([data], {
        type:
          type === 'json' ? 'application/json' : 'text/markdown;charset=utf-8',
      }),
    );
    a.download =
      graph.name.replace(/[<>:"/\\|?*]/g, '_') +
      '.' +
      (type === 'json' ? 'json' : 'md');
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  async function importFile(file) {
    if (!file) return;
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error('导入文件超过 25MB');
      const g = validateGraph(JSON.parse(await file.text()));
      g.id = uid();
      g.name = g.name + ' · 导入';
      cancelAll();
      if (gRef.current) await persist(gRef.current.id);
      resetHistory();
      commit(g, { record: false });
      setModal(null);
      setSelected(g.root);
      setWelcome(false);
      setTimeout(() => flow.fitView({ maxZoom: 1, padding: 0.25 }), 80);
      notify('已恢复节点、关系、位置、折叠与学习状态');
    } catch (e) {
      notify('导入失败：' + e.message);
    }
  }
  if (!graph || !settings)
    return (
      <div className="loading-page">
        <p>{notice || '正在打开你的知识空间…'}</p>
      </div>
    );
  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="graph-name" onClick={() => setModal('graphs')}>
          {graph.name}
          <ChevronDown size={14} />
        </button>
        <div className="top-spacer" />
        <button className="save-status" onClick={() => persist(graph.id)}>
          <span /> {saveStatus}
        </button>
        <button
          className="text-btn materials-btn"
          onClick={() => setModal('materials')}
        >
          <BookOpen size={16} />
          教材
          {graph.materials.length > 0 && (
            <span className="count">{graph.materials.length}</span>
          )}
        </button>
        <IconButton label="导入与导出" onClick={() => setModal('export')}>
          <Download size={18} />
        </IconButton>
        <button
          className={
            'agent-connect ' +
            (connection.status === 'connected' ? 'is-connected' : '')
          }
          onClick={() => {
            setModal('settings');
            api('/clients')
              .then(setClients)
              .catch((e) => notify(e.message));
          }}
        >
          <span className="agent-dot" />
          {connection.status === 'connected'
            ? 'Agent 已连接'
            : connection.status === 'connecting'
              ? '正在连接 Agent…'
              : '连接到 Agent'}
        </button>
        <IconButton label="操作指引" onClick={() => setModal('help')}>
          <CircleHelp size={20} />
        </IconButton>
        <IconButton
          label="模型与设置"
          onClick={() => {
            setModal('settings');
            api('/clients')
              .then(setClients)
              .catch((e) => notify(e.message));
          }}
        >
          <Settings size={18} />
        </IconButton>
        <button className="primary small" onClick={() => setModal('create')}>
          <Plus size={16} />
          新建
        </button>
      </header>
      <div className="workspace">
        <aside className={'outline ' + (!outline ? 'closed' : '')}>
          <div className="outline-heading">
            <span>知识大纲</span>
            <IconButton label="收起大纲" onClick={() => setOutline(false)}>
              <PanelLeft size={16} />
            </IconButton>
          </div>
          <div className="search-wrap">
            <Search size={15} />
            <input
              aria-label="搜索知识点"
              placeholder="搜索知识点…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button onClick={() => setQuery('')} aria-label="清空搜索">
                <X size={14} />
              </button>
            )}
          </div>
          <div className="outline-scroll">
            {query ? (
              <>
                <div className="eyebrow">找到 {matches.length} 个知识点</div>
                {matches.map((n) => (
                  <button
                    className="search-result"
                    key={n.id}
                    onClick={() => locate(n.id)}
                  >
                    <span>{n.title}</span>
                    <small>{n.summary}</small>
                  </button>
                ))}
                {!matches.length && <p className="muted">没有匹配的知识点</p>}
              </>
            ) : (
              <Outline
                graph={graph}
                selected={selected}
                locate={locate}
                collapse={actions.collapse}
              />
            )}
          </div>
          <div className="learning-progress">
            <div>
              <span>理解进度</span>
              <span>
                {graph.nodes.filter((n) => n.status === 'understood').length} /{' '}
                {graph.nodes.length}
              </span>
            </div>
            <div className="progress-track">
              <i
                style={{
                  width:
                    (100 *
                      graph.nodes.filter((n) => n.status === 'understood')
                        .length) /
                      graph.nodes.length +
                    '%',
                }}
              />
            </div>
            <p>每弄懂一点，就离目标近一点。</p>
          </div>
          <button className="library-link" onClick={() => setModal('graphs')}>
            <FileText size={16} />
            我的知识图<span>{graphs.length || 1}</span>
            <ChevronRight size={14} />
          </button>
        </aside>
        <main className="canvas-main">
          <div className="canvas-top">
            <div className="breadcrumbs">
              {!outline && (
                <IconButton label="打开大纲" onClick={() => setOutline(true)}>
                  <PanelLeft size={17} />
                </IconButton>
              )}
              <span className="eyebrow">探索路径</span>
              {pathNodes.slice(-4).map((n, i) => (
                <React.Fragment key={n.id}>
                  {i > 0 && <ChevronRight size={12} />}
                  <button onClick={() => locate(n.id)}>{n.title}</button>
                </React.Fragment>
              ))}
            </div>
            <button
              className="outline-rebuild"
              disabled={
                !!busy[graph.root] ||
                !graph.materials.length ||
                settings.selected === 'demo'
              }
              title="按 PDF 分开整理，每次只展开一层核心主题；练习在右键菜单，可撤销"
              onClick={() => generate(graph.root, { force: true })}
            >
              按教材整理层次
            </button>
            <button
              className="prefetch-toggle"
              aria-pressed={prefetchEnabled}
              title="提前准备概念分支，点击直接展开；会额外调用模型，点击可关闭"
              onClick={() => setPrefetchEnabled((v) => !v)}
            >
              <span className={prefetchEnabled ? 'enabled' : ''} />
              {!prefetchEnabled
                ? '预生成已关闭'
                : prefetchState.active.length
                  ? `正在预生成 · ${prefetchState.ready.length} 就绪`
                  : prefetchState.ready.length
                    ? `${prefetchState.ready.length} 层已就绪`
                    : '预生成已开启'}
            </button>
            <button className="mode-badge" onClick={() => setModal('settings')}>
              <span />
              {settings.selected === 'demo'
                ? '预置示例 · 非实时生成'
                : providerNames[settings.selected]}
            </button>
          </div>
          <GraphCanvas
            boxSelection={{
              selectedIds: groupIds,
              onChange: changeSelection,
              onEnd: endSelection,
              onContext: selectionContext,
              onStart: () => {
                setMenu(null);
                setAsk(null);
                setGroupMenu(null);
              },
            }}
            wheelMode={wheelMode}
            graphId={graph.id}
            initialNodes={flowNodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodeClick={(e, n) => {
              if (Date.now() - dragTime.current < 200 || menu || ask) return;
              clearSelection();
              generate(n.id);
            }}
            onNodeContextMenu={(e, n) => {
              e.preventDefault();
              actions.menu(n.id, e.clientX, e.clientY);
            }}
            onNodeDragStart={(e, n) => {
              dragNodeId.current = n.id;
              clearSelection();
              setMenu(null);
              setAsk(null);
            }}
            onNodeDragStop={(e, n) => {
              dragNodeId.current = null;
              dragTime.current = Date.now();
              const g = gRef.current;
              const pos = n.snapBack
                ? n.position
                : resolveDrop(g, n.id, n.position);
              commit({
                ...g,
                nodes: g.nodes.map((x) =>
                  x.id === n.id ? { ...x, position: pos } : x,
                ),
              });
            }}
            onPaneClick={() => {
              clearSelection();
              setMenu(null);
              setAsk(null);
              setDetail(false);
            }}
            onMoveEnd={(e, v) => {
              if (!gRef.current) return;
              try {
                localStorage.setItem(
                  'zhizhi-view-' + gRef.current.id,
                  JSON.stringify(v),
                );
              } catch {}
            }}
            nodeDragThreshold={7}
            minZoom={0.0005}
            maxZoom={2}
            onlyRenderVisibleElements
            nodesConnectable={false}
            elementsSelectable
            panOnScroll={false}
            zoomOnScroll={false}
            zoomOnPinch
            zoomOnDoubleClick={false}
            panOnDrag={[0, 1]}
            preventScrolling
            fitView
            fitViewOptions={{ maxZoom: 1, padding: 0.3 }}
            deleteKeyCode={null}
            proOptions={{ hideAttribution: false }}
          >
            <Background color="#d9d9df" gap={22} size={1} />
          </GraphCanvas>
          {welcome && (
            <div className="welcome-card">
              <button
                className="close-welcome"
                aria-label="关闭欢迎"
                onClick={() => setWelcome(false)}
              >
                <X size={16} />
              </button>
              <div className="eyebrow">从好奇，到理解</div>
              <h1>
                一个知识点，
                <br />
                也是一个新起点。
              </h1>
              <p>
                点击向下探索，不懂就问。
                <br />
                每一个问题，都会成为你的知识分支。
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const v = new FormData(e.currentTarget).get('goal');
                  if (v.trim()) create(v.trim(), 'live');
                }}
              >
                <input
                  name="goal"
                  placeholder="你想弄懂什么？"
                  aria-label="学习目标"
                  required
                  maxLength={120}
                />
                <button className="primary" aria-label="创建学习目标">
                  <ArrowRight size={19} />
                </button>
              </form>
              <button
                className="try-demo"
                onClick={() => {
                  setWelcome(false);
                  generate(graph.root);
                  setTimeout(
                    () =>
                      flow.fitView({
                        padding: 0.22,
                        maxZoom: 0.85,
                        duration: 300,
                      }),
                    500,
                  );
                }}
              >
                体验「计算 z-score」
                <ArrowUpRight size={15} />
              </button>
            </div>
          )}
          <div className="canvas-bottom">
            <div className="history-buttons">
              <IconButton
                label="撤销"
                disabled={!history.current.past.length}
                onClick={() => undo()}
              >
                <Undo2 size={17} />
              </IconButton>
              <IconButton
                label="重做"
                disabled={!history.current.future.length}
                onClick={() => undo(true)}
              >
                <Redo2 size={17} />
              </IconButton>
            </div>
          </div>
          <ZoomBar
            arrange={() => {
              commit(layout(graph, selected || graph.root));
              setTimeout(() => center(selected || graph.root), 30);
            }}
            wheelMode={wheelMode}
            setWheelMode={setWheelMode}
            root={() => center(graph.root)}
            fit={() =>
              flow.fitView({ padding: 0.18, maxZoom: 1, duration: 200 })
            }
            focus={() => {
              const ids = new Set([selected || graph.root]);
              for (let change = true; change; ) {
                change = false;
                for (const n of graph.nodes)
                  if (ids.has(n.parent) && !ids.has(n.id)) {
                    ids.add(n.id);
                    change = true;
                  }
              }
              flow.fitView({
                nodes: flowNodes.filter((n) => ids.has(n.id)),
                padding: 0.25,
                maxZoom: 1,
                duration: 200,
              });
            }}
          />
        </main>
        {previews[selected] && (
          <GenerationPreview
            documents={previews[selected]}
            active={!!busy[selected]}
            Text={Prose}
            onDismiss={() =>
              setPreviews((v) => {
                const next = { ...v };
                delete next[selected];
                return next;
              })
            }
          />
        )}
        <ConceptView
          open={detail && !!current}
          mode={conceptMode}
          onClose={() => setDetail(false)}
        >
          {current && (
            <aside className="details">
              <div className="detail-top">
                <span className="eyebrow">知识详情</span>
                <IconButton label="关闭详情" onClick={() => setDetail(false)}>
                  <X size={18} />
                </IconButton>
              </div>
              <div className="detail-scroll">
                <span className={'detail-type ' + current.type}>
                  {names[current.type]}
                </span>
                <h2 className={current.highlighted ? 'marked-title' : ''}>
                  {current.title}
                </h2>
                <p className="detail-summary">
                  <Emphasis text={current.summary} />
                </p>
                <button
                  className={
                    'highlight-button ' +
                    (current.highlighted ? 'is-marked' : '')
                  }
                  aria-pressed={!!current.highlighted}
                  onClick={() => toggleHighlight(current.id)}
                >
                  {current.highlighted ? '取消重点标红' : '标为重点'}
                </button>
                <div className="origin-badge">{origins[current.origin]}</div>
                {errors[current.id] && (
                  <div className="error-box">
                    {errors[current.id]}
                    <button onClick={() => generate(current.id)}>重试</button>
                  </div>
                )}
                {current.formula && <MathText block value={current.formula} />}
                {current.lessonOverview && (
                  <section className="lesson-overview">
                    <h4>
                      {current.materialIds?.length
                        ? '本章学什么'
                        : '这一节学什么'}
                    </h4>
                    <Prose text={current.lessonOverview} />
                  </section>
                )}
                {current.terms?.length > 0 && (
                  <>
                    <h4>专有名词</h4>
                    <dl className="lesson-terms">
                      {current.terms.map((term, i) => (
                        <div key={i}>
                          <dt>
                            {term.name}
                            {term.english && (
                              <span lang="en">{term.english}</span>
                            )}
                          </dt>
                          <dd>
                            <Prose text={term.definition} />
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </>
                )}
                {settings.selected !== 'demo' && (
                  <button
                    className="text-btn full"
                    disabled={lessonBusy}
                    onClick={refreshLesson}
                  >
                    {lessonBusy ? (
                      <>
                        <Loader2 size={16} className="spin" />
                        正在准备讲解…
                      </>
                    ) : (
                      '讲透原理和例子'
                    )}
                  </button>
                )}
                <LessonVisuals visuals={current.visuals} />
                <h4>老师讲解</h4>
                <Prose text={current.detail} />
                {current.example && (
                  <>
                    <h4>跟着例子做一遍</h4>
                    <Prose text={current.example} />
                  </>
                )}
                {current.materialIds?.length > 0 && (
                  <button
                    className="primary full"
                    onClick={() => {
                      setDetail(false);
                      generate(current.id, { skipOverview: true });
                    }}
                  >
                    {children(graph, current.id).length && !current.collapsed
                      ? '收起本章知识点'
                      : '开始学习本章 · 展开知识点'}
                    <ArrowRight size={16} />
                  </button>
                )}
                <h4>学习状态</h4>
                <div className="status-picker">
                  {Object.entries(statusNames).map(([key, label]) => (
                    <button
                      key={key}
                      className={current.status === key ? 'selected' : ''}
                      onClick={() =>
                        commit({
                          ...graph,
                          nodes: graph.nodes.map((n) =>
                            n.id === current.id ? { ...n, status: key } : n,
                          ),
                        })
                      }
                    >
                      {current.status === key && <Check size={13} />} {label}
                    </button>
                  ))}
                </div>
                <h4>来源</h4>
                {current.webSources?.length > 0 &&
                  current.webSources.map((source) => (
                    <div className="source-card" key={source.url}>
                      <a href={source.url}>{source.title}</a>
                    </div>
                  ))}
                {current.sources?.length ? (
                  current.sources.map((id) => {
                    const m = graph.materials.find((m) =>
                        m.chunks.some((c) => c.id === id),
                      ),
                      c = m?.chunks.find((c) => c.id === id);
                    return (
                      <div className="source-card" key={id}>
                        <FileText size={14} />
                        <strong>
                          {m?.name || '来源资料已移除'}{' '}
                          {c?.page
                            ? `· 第 ${c.page} 页`
                            : `· 段落 ${c?.paragraph || '—'}`}
                        </strong>
                        {c && <p>{c.text}</p>}
                      </div>
                    );
                  })
                ) : (
                  <p className="muted">
                    {current.origin === 'demo'
                      ? '人工整理的 z-score 预置示例。'
                      : current.origin === 'user'
                        ? '由你创建或提出。'
                        : 'AI 补充内容，没有教材引用，请核对重要结论。'}
                  </p>
                )}
                <button
                  className="text-btn full"
                  onClick={() => {
                    setDetail(false);
                    askNode(current.id);
                  }}
                >
                  <MessageCircle size={16} />
                  针对这里继续提问
                  <ArrowUpRight size={15} />
                </button>
                <button
                  className="text-btn full"
                  onClick={() => setModal({ type: 'edit', id: current.id })}
                >
                  编辑这个节点
                </button>
                {settings.selected !== 'demo' && (
                  <button
                    className="text-btn full"
                    onClick={() => generate(current.id, { force: true })}
                  >
                    <RefreshCw size={15} />
                    重新生成直接分支（可撤销）
                  </button>
                )}
              </div>
            </aside>
          )}
        </ConceptView>
      </div>
      {groupMenu && (
        <SelectionMenu
          point={groupMenu}
          count={groupIds.length}
          canDelete={groupIds.some((id) => id !== graph.root)}
          canPaste={canPaste}
          onCopy={copyGroup}
          onPaste={pasteGroup}
          onDelete={deleteGroup}
          onUnderstand={() => updateGroup({ status: 'understood' })}
          onCollapse={() => updateGroup({ collapsed: true })}
          onClear={clearSelection}
          onDismiss={() => setGroupMenu(null)}
        />
      )}
      {exercise && (
        <ExerciseOverlay
          graph={exercise.graph}
          node={exercise.node}
          api={api}
          Text={Prose}
          onClose={() => {
            setExercise(null);
            generation.current.setEnabled(prefetchEnabled);
          }}
        />
      )}
      {menu && (
        <>
          <div className="menu-dismiss" onClick={() => setMenu(null)} />
          <div
            className="context-menu"
            style={{ left: menu.x, top: menu.y }}
            role="menu"
          >
            <div className="menu-caption">沿着这里，继续理解</div>
            {[
              ['针对这个节点提问', ''],
              ['用更简单的话解释', '请用更简单的话解释这个知识点'],
              ['给我一个例子', '请给我一个具体例子'],
              ['为什么是这样', '为什么是这样？'],
              ['我需要先懂什么', '理解这个知识点，我需要先懂什么？'],
              ['展开计算步骤', '请逐步展开计算过程，并解释每一步'],
            ].map(([label, q], i) => (
              <button
                role="menuitem"
                key={label}
                onClick={() => {
                  if (label === '给我一个例子') {
                    generation.current.setEnabled(false);
                    setExercise({
                      graph,
                      node: graph.nodes.find((n) => n.id === menu.id),
                    });
                    setMenu(null);
                    clearSelection();
                  } else askNode(menu.id, q, menu.x, menu.y);
                }}
              >
                {i === 0 ? (
                  <MessageCircle size={15} />
                ) : (
                  <CornerDownRight size={15} />
                )}{' '}
                {label}
              </button>
            ))}
            <hr />
            <button
              role="menuitem"
              className="highlight-menu-item"
              onClick={() => {
                toggleHighlight(menu.id);
                setMenu(null);
              }}
            >
              <span className="red-marker" />
              {graph.nodes.find((n) => n.id === menu.id)?.highlighted
                ? '取消重点标红'
                : '标为重点'}
            </button>
            <button
              role="menuitem"
              onClick={() => {
                setModal({ type: 'edit', id: menu.id });
                setMenu(null);
              }}
            >
              <Info size={15} />
              编辑节点
            </button>
            <button
              role="menuitem"
              onClick={() => {
                actions.collapse(menu.id);
                setMenu(null);
              }}
            >
              <Minus size={15} />
              折叠 / 展开
            </button>
            <button
              role="menuitem"
              className="danger"
              onClick={() => deleteNode(menu.id)}
            >
              <Trash2 size={15} />
              删除分支
            </button>
          </div>
        </>
      )}
      {ask && (
        <div className="ask-popover" style={{ left: ask.x, top: ask.y }}>
          <div className="ask-heading">
            <span>
              <MessageCircle size={15} /> 把疑问变成新的分支
            </span>
            <IconButton label="关闭提问" onClick={() => setAsk(null)}>
              <X size={16} />
            </IconButton>
          </div>
          <p>关于「{graph.nodes.find((n) => n.id === ask.id)?.title}」</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitQuestion(ask.text, ask.id);
            }}
          >
            <textarea
              aria-label="你的问题"
              autoFocus
              placeholder="哪里还不明白？"
              value={ask.text}
              maxLength={100}
              onChange={(e) => setAsk({ ...ask, text: e.target.value })}
            />
            <div className="ask-footer">
              <span>
                {settings.selected === 'demo'
                  ? '预置问答示例 · 非实时生成'
                  : '回答会长在当前知识图里'}
              </span>
              <button className="primary small" disabled={!ask.text.trim()}>
                提问 <ArrowRight size={14} />
              </button>
            </div>
          </form>
        </div>
      )}
      {notice && (
        <div className="toast" role="status">
          <Info size={17} />
          <span>{notice}</span>
          <IconButton label="关闭提示" onClick={() => setNotice('')}>
            <X size={16} />
          </IconButton>
        </div>
      )}
      {modal && (
        <Modal
          title={
            modal === 'help'
              ? '操作指引'
              : modal === 'create'
                ? '种下一个新的知识点'
                : modal === 'settings'
                  ? '模型与设置'
                  : modal === 'materials'
                    ? '学习材料与范围'
                    : modal === 'graphs'
                      ? '我的知识图'
                      : modal === 'export'
                        ? '带走你的知识'
                        : '编辑知识点'
          }
          onClose={() => setModal(null)}
          wide={modal === 'settings' || modal === 'materials'}
        >
          {modal === 'help' && <OperationGuide />}
          {modal === 'create' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                create(f.get('goal').trim(), 'live');
              }}
            >
              <p className="muted">从一个具体的问题出发，按自己的节奏探索。</p>
              <label>
                知识点或学习目标
                <input
                  name="goal"
                  autoFocus
                  required
                  maxLength={120}
                  placeholder="例如：理解抽样分布"
                />
              </label>
              <button className="primary full">
                创建知识图 <ArrowRight size={17} />
              </button>
              <button
                type="button"
                className="text-btn full"
                onClick={() => create('计算 z-score', 'demo')}
              >
                新建 z-score 预置示例
              </button>
            </form>
          )}
          {modal === 'settings' && (
            <SettingsForm
              conceptMode={conceptMode}
              onConceptModeChange={setConceptMode}
              onConnectionChange={setConnection}
              api={api}
              settings={settings}
              clients={clients}
              onSave={async (data) => {
                cancelAll();
                const result = await api('/settings', {
                  method: 'PUT',
                  body: JSON.stringify(data),
                });
                setSettings(result);
                settingsRef.current = result;
                setConnection({
                  kind: result.selected,
                  status:
                    result.selected === 'demo' ? 'disconnected' : 'unverified',
                });
                setNotice('');
                return result;
              }}
              notify={notify}
              refreshClients={() => api('/clients').then(setClients)}
            />
          )}
          {modal === 'materials' && (
            <Materials
              graph={graph}
              onChange={(g) => {
                cancelAll();
                commit({ ...g, nodes: g.nodes.map(({ outline, ...n }) => n) });
              }}
              notify={notify}
              api={api}
              onConfirm={async () => {
                await persist(graph.id);
                if (latest.current.has(graph.id))
                  throw new Error('教材保存失败，请重试确认');
                setModal(null);
                notify(
                  gRef.current.materials.length
                    ? '教材已确认'
                    : '已确认，暂不添加教材',
                );
              }}
            />
          )}
          {modal === 'graphs' && (
            <>
              <div className="graph-list">
                {graphs.map((g) => (
                  <div
                    key={g.id}
                    className={g.id === graph.id ? 'current' : ''}
                  >
                    <button
                      onClick={() => {
                        switchGraph(g.id);
                        setModal(null);
                        setWelcome(false);
                      }}
                    >
                      <FileText size={20} />
                      <span>
                        <strong>{g.name}</strong>
                        <small>
                          {g.count || 0} 个知识点{' '}
                          {g.id === graph.id ? '· 当前' : ''}
                        </small>
                      </span>
                    </button>
                    <IconButton
                      label={'删除知识图 ' + g.name}
                      onClick={async () => {
                        if (
                          !window.confirm(
                            '删除这张知识图？文件会移入本机 data/trash，可手动恢复。',
                          )
                        )
                          return;
                        try {
                          cancelAll();
                          await persist(g.id);
                          await api('/graphs/' + g.id, { method: 'DELETE' });
                          setGraphs((v) => v.filter((x) => x.id !== g.id));
                          if (g.id === graph.id) {
                            localStorage.removeItem('zhizhi-recovery');
                            await create('计算 z-score', 'demo');
                          }
                          notify('已移入本机回收目录');
                        } catch (e) {
                          notify(e.message);
                        }
                      }}
                    >
                      <Trash2 size={16} />
                    </IconButton>
                  </div>
                ))}
              </div>
              <label>
                当前图名称
                <input
                  value={graph.name}
                  maxLength={120}
                  onChange={(e) => {
                    if (e.target.value.trim())
                      commit(
                        { ...graph, name: e.target.value },
                        { record: false },
                      );
                  }}
                />
              </label>
              <button
                className="primary full"
                onClick={() => setModal('create')}
              >
                <Plus size={16} />
                新建知识图
              </button>
            </>
          )}
          {modal === 'export' && (
            <>
              <p className="muted">
                JSON 保存完整关系、位置、折叠状态和教材片段。API
                密钥不会包含在导出中。
              </p>
              <button
                className="export-option"
                onClick={() => exportFile('json')}
              >
                <Download size={20} />
                <span>
                  <strong>导出完整知识图</strong>
                  <small>JSON · 可重新导入继续学习</small>
                </span>
                <ArrowUpRight size={17} />
              </button>
              <button
                className="export-option"
                onClick={() => exportFile('md')}
              >
                <FileText size={20} />
                <span>
                  <strong>导出 Markdown 大纲</strong>
                  <small>便于阅读、整理和分享</small>
                </span>
                <ArrowUpRight size={17} />
              </button>
              <label className="upload-option">
                <Upload size={20} />
                导入知识图 JSON
                <input
                  type="file"
                  accept=".json"
                  onChange={(e) => importFile(e.target.files[0])}
                />
              </label>
            </>
          )}
          {modal?.type === 'edit' && (
            <EditNode
              node={graph.nodes.find((n) => n.id === modal.id)}
              save={(data) => {
                cancelAll();
                commit({
                  ...graph,
                  nodes: graph.nodes.map((n) =>
                    n.id === modal.id ? { ...n, ...data } : n,
                  ),
                });
                setModal(null);
              }}
            />
          )}
        </Modal>
      )}
    </div>
  );
}
export { App };
