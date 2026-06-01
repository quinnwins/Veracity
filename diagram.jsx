// Argument diagram — top-down recursive tree.
// Lays out nodes by post-order (children first, parents centered).

const NODE_W = 196;
const NODE_W_CLAIM = 280;
const NODE_H = 100;
const GAP_X = 22;
const ROW_GAP = 76;
const PAD = 24;

function layoutDiagram(analysis, modeFilter) {
  const allNodes = Object.values(analysis.nodes);
  const visible = allNodes.filter(modeFilter);
  const visibleIds = new Set(visible.map(n => n.id));

  // Build children map limited to visible nodes
  const children = {};
  visible.forEach(n => {
    if (n.parent && visibleIds.has(n.parent)) {
      children[n.parent] = children[n.parent] || [];
      children[n.parent].push(n.id);
    }
  });

  // Roots = visible nodes whose parent isn't visible (typically the claim).
  const roots = visible.filter(n => !n.parent || !visibleIds.has(n.parent));

  // Compute depth from root.
  const depth = {};
  function computeDepth(id, d) {
    depth[id] = d;
    (children[id] || []).forEach(c => computeDepth(c, d + 1));
  }
  roots.forEach(r => computeDepth(r.id, 0));

  // Post-order layout
  let cursor = 0;
  const placed = {};
  function walk(id) {
    const kids = (children[id] || []).slice().sort((a, b) => {
      const an = analysis.nodes[a]; const bn = analysis.nodes[b];
      return (an.col ?? 0) - (bn.col ?? 0) || a.localeCompare(b);
    });
    if (kids.length === 0) {
      const w = analysis.nodes[id].kind === "claim" ? NODE_W_CLAIM : NODE_W;
      placed[id] = { x: cursor + w / 2, w };
      cursor += w + GAP_X;
      return placed[id].x;
    }
    const childCenters = kids.map(walk);
    const center = (Math.min(...childCenters) + Math.max(...childCenters)) / 2;
    const w = analysis.nodes[id].kind === "claim" ? NODE_W_CLAIM : NODE_W;
    placed[id] = { x: center, w };
    return center;
  }
  roots.forEach(r => walk(r.id));

  // Convert to absolute positions
  const positions = {};
  Object.entries(placed).forEach(([id, p]) => {
    positions[id] = {
      cx: p.x + PAD,
      x: p.x - p.w / 2 + PAD,
      y: depth[id] * (NODE_H + ROW_GAP) + PAD,
      w: p.w,
      h: NODE_H,
      depth: depth[id]
    };
  });

  const maxX = Math.max(...Object.values(positions).map(p => p.x + p.w));
  const maxY = Math.max(...Object.values(positions).map(p => p.y + p.h));

  return {
    positions,
    width: maxX + PAD,
    height: maxY + PAD,
    visibleIds,
    children
  };
}

// Smooth S-curve edge between parent bottom and child top
function edgePath(p, c) {
  const x1 = p.cx, y1 = p.y + p.h;
  const x2 = c.cx, y2 = c.y;
  const dy = (y2 - y1) * 0.55;
  return `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`;
}

function Diagram({ analysis, mode, selectedId, onSelect, showTechnical, digIds }) {
  const modeFilter = useMemo(() => {
    // Hidden-depth nodes are only visible if their parent is dug into.
    const visGate = (n) => {
      if (!n.hiddenDepth) return true;
      if (!n.parent) return true;
      if (digIds && digIds[n.parent]) {
        const parentNode = analysis.nodes[n.parent];
        return parentNode ? visGate(parentNode) : false;
      }
      return false;
    };
    if (mode === "deep") return n => visGate(n);
    if (mode === "standard") return n => visGate(n) && n.level <= 2;
    return n => visGate(n) && (n.kind === "claim" || n.kind === "subclaim" || (n.kind === "premise" && n.weak));
  }, [mode, digIds, analysis]);

  const layout = useMemo(
    () => layoutDiagram(analysis, modeFilter),
    [analysis, modeFilter]
  );

  // Compute set of ancestor/descendant ids for selection emphasis
  const emphasis = useMemo(() => {
    if (!selectedId) return { ids: new Set(), edges: new Set() };
    const ids = new Set([selectedId]);
    const edges = new Set();
    // ancestors
    let cur = analysis.nodes[selectedId];
    while (cur && cur.parent && layout.visibleIds.has(cur.parent)) {
      edges.add(`${cur.parent}->${cur.id}`);
      ids.add(cur.parent);
      cur = analysis.nodes[cur.parent];
    }
    // descendants
    const stack = [selectedId];
    while (stack.length) {
      const id = stack.pop();
      (layout.children[id] || []).forEach(c => {
        ids.add(c); edges.add(`${id}->${c}`); stack.push(c);
      });
    }
    return { ids, edges };
  }, [selectedId, analysis, layout]);

  const visibleNodes = Object.values(analysis.nodes).filter(n => layout.visibleIds.has(n.id));
  const selectOnActionKey = (e, id) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(id);
    }
  };

  const modeBlurb = mode === "deep"
    ? "Showing every assumption, all the way down."
    : mode === "standard"
      ? "Showing the claim, its sub-claims, and the premises behind them."
      : "Showing only the weak links — the parts of the argument that fail.";

  return (
    <div className="diagram-col">
      <div className="diagram-head">
        <div className="diagram-head-left">
          <div className="diagram-title">
            Argument Map · {visibleNodes.length} nodes · {mode === "deep" ? "Full audit" : mode === "standard" ? "Reasoning" : "Verdict"}
          </div>
          <div className="diagram-subtitle">{modeBlurb} Click any box to read its full reasoning.</div>
        </div>
        <div className="diagram-legend">
          <span title="A standard premise — a testable assumption that supports its parent."><span className="legend-swatch" /> premise</span>
          <span title="A weak node — the load-bearing failure. Strengthen this and the conclusion moves."><span className="legend-swatch weak" /> weak (broken link)</span>
          <span title="The branch currently selected, from this node up to the claim and down to its supporting nodes."><span className="legend-swatch selected" /> selected branch</span>
        </div>
      </div>

      <div className="diagram-canvas" style={{ width: layout.width, height: layout.height + 20 }}>
        <svg className="edges" width={layout.width} height={layout.height + 20}>
          {visibleNodes.map(n => {
            if (!n.parent || !layout.visibleIds.has(n.parent)) return null;
            const p = layout.positions[n.parent];
            const c = layout.positions[n.id];
            const key = `${n.parent}->${n.id}`;
            const isSelected = emphasis.edges.has(key);
            const isWeakEdge = n.weak;
            const cls = `edge${isSelected ? " selected" : isWeakEdge ? " weak" : (selectedId && !isSelected ? " dim" : "")}`;
            return <path key={key} className={cls} d={edgePath(p, c)} />;
          })}
        </svg>

        {visibleNodes.map(n => {
          const pos = layout.positions[n.id];
          const isSelected = n.id === selectedId;
          const inFocus = !selectedId || emphasis.ids.has(n.id);
          return (
            <div
              key={n.id}
              className={
                `node ${n.kind}${n.weak ? " weak" : ""}${isSelected ? " on" : ""}`
              }
              style={{
                left: pos.x,
                top: pos.y,
                width: pos.w,
                opacity: inFocus ? 1 : 0.45
              }}
              onClick={() => onSelect(n.id)}
              onKeyDown={(e) => selectOnActionKey(e, n.id)}
              tabIndex={0}
              role="button"
              aria-label={`Inspect ${n.id}: ${n.text}`}
              aria-current={isSelected ? "true" : undefined}
            >
              <div className="node-id-row" title={n.id}>
                <span className="node-id">
                  {showTechnical
                    ? <>{n.id} <span className="node-id-sep">·</span> {KIND_LABEL[n.kind]}</>
                    : (mode === "deep"
                        ? <>{KIND_LABEL[n.kind]} <span className="node-id-sep">·</span> <span className="node-id-faint">{n.id}</span></>
                        : <>{KIND_LABEL[n.kind]}</>)
                  }
                </span>
                {showTechnical && <TypeBadge value={n.type} />}
              </div>
              <div className="node-text">{n.text}</div>
              <div className="node-meta-row">
                <EstimatePill value={n.estimate} mode={mode} />
                <ConfPill value={n.confidence} />
                {n.weak && <WeakFlag short />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

window.Diagram = Diagram;
