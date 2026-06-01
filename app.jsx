// First Principles Veracity - main app
// One essay, with an appendix.
// PlainEnglishView always renders - prose-first, zero Bayesian jargon, plain language.
// Below it, an Appendix unspools inline when the reader clicks "Show me the math":
// LR chains, posteriors, sensitivity sweeps, the decomposition diagram, and
// the audit checklist. Same paper, same wordmark, same scroll - not a destination switch.

const SAMPLES = [
  { id: "minwage", label: "Increasing the minimum wage always increases unemployment." },
  { id: "ai-engineers", label: "AI will make most software engineers obsolete within five years." },
  { id: "confidence", label: "People who sound confident are usually competent." }
];

const PUBLIC_METHOD_ITEMS = [
  {
    title: "Parse the wording",
    text: "Separate the exact claim from stronger or weaker readings, loaded terms, and hidden definitions."
  },
  {
    title: "Break it into pieces",
    text: "Decompose the claim into subclaims and atomic premises so weak links are visible instead of buried."
  },
  {
    title: "Compare rivals",
    text: "Score competing explanations with comparable effort, then show what evidence would move the answer."
  },
  {
    title: "Show the receipts",
    text: "Expose uncertainty, source basis, sensitivity checks, and the gap between authored judgment and the math."
  }
];

const displayRange = (range) => (window.formatRange
  ? window.formatRange(range)
  : `${Math.round(range[0] * 100)}-${Math.round(range[1] * 100)}%`);

// Visibility rule: a node is "visible" iff it is NOT hiddenDepth, OR its parent has been dug into.
// Recursively: visibility cascades — a deeper node is visible only if all its ancestor chains
// of hiddenDepth pass through dug parents.
function isVisible(node, analysis, digIds) {
  if (!node.hiddenDepth) return true;
  if (!node.parent) return true;
  if (digIds && digIds[node.parent]) {
    return isVisible(analysis.nodes[node.parent], analysis, digIds);
  }
  return false;
}

// Live composition: for each node, compute its effective [lo, hi] estimate.
// Rule: tunable priors take their value from userPriors (default = node.prior).
// Non-leaf nodes recompute as min(VISIBLE children's live estimates) ONLY IF
// userPriors actually contains overrides — when userPriors is empty we honor
// the analyst's authored estimate so adding `tunable: true` to a leaf doesn't
// silently shift the parent estimate.
function computeLiveEstimates(analysis, userPriors, digIds) {
  const live = {};
  const hasTunableInVisibleSubtree = {};
  const hasOverrides = userPriors && Object.keys(userPriors).length > 0;

  function visibleChildIds(id) {
    return Object.values(analysis.nodes)
      .filter(c => c.parent === id && isVisible(c, analysis, digIds))
      .map(c => c.id);
  }

  function markTunable(id) {
    if (id in hasTunableInVisibleSubtree) return hasTunableInVisibleSubtree[id];
    const n = analysis.nodes[id];
    if (!n) return (hasTunableInVisibleSubtree[id] = false);
    let result = !!n.tunable;
    for (const cid of visibleChildIds(id)) {
      if (markTunable(cid)) result = true;
    }
    return (hasTunableInVisibleSubtree[id] = result);
  }
  for (const id of Object.keys(analysis.nodes)) markTunable(id);

  function compute(id) {
    if (id in live) return live[id];
    const n = analysis.nodes[id];
    if (!n) return (live[id] = [0, 1]);
    const childIds = visibleChildIds(id);

    if (childIds.length === 0) {
      if (n.tunable && userPriors[id]) return (live[id] = userPriors[id]);
      if (n.tunable && n.prior) return (live[id] = n.prior);
      return (live[id] = n.estimate || [0, 1]);
    }

    if (!hasTunableInVisibleSubtree[id] || !hasOverrides) {
      return (live[id] = n.estimate || [0, 1]);
    }
    let lo = 1, hi = 1;
    for (const cid of childIds) {
      const [clo, chi] = compute(cid);
      if (clo < lo) lo = clo;
      if (chi < hi) hi = chi;
    }
    return (live[id] = [lo, hi]);
  }
  for (const id of Object.keys(analysis.nodes)) compute(id);
  return live;
}

// Wrap analysis: produce a copy where each node's `estimate` is replaced with the live computation,
// and the top-level `estimate` is the C0 live estimate. Coverage/stress/etc. unchanged.
function applyLiveEstimates(analysis, live) {
  const newNodes = {};
  for (const [id, n] of Object.entries(analysis.nodes)) {
    newNodes[id] = { ...n, estimate: live[id] || n.estimate };
  }
  const c0Estimate = live["C0"] || analysis.estimate;
  return { ...analysis, nodes: newNodes, estimate: c0Estimate };
}

// Conjunctive-Bayes tree propagation.
// The existing computeLiveEstimates uses min() across visible children — the
// "weakest-link" rule, conservative under disjunction but generous under
// conjunction. For a conjunctive argument (C0 holds iff ALL subclaims hold),
// proper Bayesian aggregation under independence is the PRODUCT of subclaim
// probabilities, not the minimum. Min() gives the analyst the floor; product
// gives the ceiling under independence. Both are honest signals.
//
// This function computes each node's product-Bayes credence by recursing
// through visible children. Leaves use their authored estimate (or tunable
// override) as the conjunctive base. Interior nodes multiply children.
// Returns a map nodeId → [lo, hi].
//
// Independence is assumed — if subclaims are correlated, the product
// understates posterior; if they're disjunctive, it overstates. The honest
// move is to surface both min() and product so the operator sees the bounds.
function computeConjBayes(analysis, userPriors, digIds) {
  const result = {};
  const seen = {};
  function isVisible(node) {
    if (!node.hiddenDepth) return true;
    if (!node.parent) return true;
    if (digIds && digIds[node.parent]) return isVisible(analysis.nodes[node.parent]);
    return false;
  }
  function visibleChildIds(id) {
    return Object.values(analysis.nodes)
      .filter(c => c.parent === id && isVisible(c))
      .map(c => c.id);
  }
  function compute(id) {
    if (id in result) return result[id];
    if (seen[id]) return [0, 1];
    seen[id] = true;
    const n = analysis.nodes[id];
    if (!n) return (result[id] = [0, 1]);
    const childIds = visibleChildIds(id);
    if (childIds.length === 0) {
      // Leaf: use tunable override → tunable default → authored estimate.
      if (n.tunable && userPriors && userPriors[id]) return (result[id] = userPriors[id]);
      if (n.tunable && n.prior) return (result[id] = n.prior);
      return (result[id] = n.estimate || [0, 1]);
    }
    // Interior: product across children, propagated per endpoint.
    let lo = 1, hi = 1;
    for (const cid of childIds) {
      const [clo, chi] = compute(cid);
      lo *= clo;
      hi *= chi;
    }
    return (result[id] = [lo, hi]);
  }
  for (const id of Object.keys(analysis.nodes)) compute(id);
  return result;
}

// Drag-to-zero load-bearing detector.
// For each tunable node, compute how far that node alone can drag C0 away from
// the baseline midpoint (i.e., the authored estimate). We measure both extremes
// independently against the baseline, then take the larger displacement as the
// node's "drag." Comparing extremes-against-each-other underestimates load-bearing
// because the min()-composition rule pulls other tunables back to their priors
// whenever any override is active — comparing against baseline isolates the
// marginal impact of THIS node's authored value.
// Returns { [nodeId]: { swing, lowMid, highMid, baseMid } } for nodes above threshold.
function detectLoadBearing(analysis, digIds, threshold = 0.15) {
  const result = {};
  const baseLive = computeLiveEstimates(analysis, {}, digIds);
  const baseC0 = baseLive["C0"];
  if (!baseC0) return result;
  const baseMid = (baseC0[0] + baseC0[1]) / 2;

  const tunableNodes = Object.values(analysis.nodes).filter(n => n.tunable);
  for (const node of tunableNodes) {
    const lowLive  = computeLiveEstimates(analysis, { [node.id]: [0, 0] }, digIds);
    const highLive = computeLiveEstimates(analysis, { [node.id]: [1, 1] }, digIds);
    const lowC0  = lowLive["C0"];
    const highC0 = highLive["C0"];
    if (!lowC0 || !highC0) continue;
    const lowMid  = (lowC0[0] + lowC0[1]) / 2;
    const highMid = (highC0[0] + highC0[1]) / 2;
    const dragLow  = Math.abs(baseMid - lowMid);
    const dragHigh = Math.abs(baseMid - highMid);
    const swing = Math.max(dragLow, dragHigh);
    if (swing >= threshold) {
      result[node.id] = { swing, lowMid, highMid, baseMid };
    }
  }
  return result;
}

// Compute one C0 range per epistemic profile. This is a parallel exploration:
// it ignores the user's current per-node prior tweaks (the Inspector sliders)
// and instead re-runs the live computation with each profile's adjustments
// applied as if they were userPriors. The result is a snapshot of how the
// verdict moves across a small set of pre-defined worldviews.
function computeProfileEstimates(analysis, analysisId, digIds) {
  return (window.PROFILES || []).map(profile => {
    const overrides = (profile.adjustments && profile.adjustments[analysisId]) || {};
    const live = computeLiveEstimates(analysis, overrides, digIds);
    return {
      id: profile.id,
      name: profile.name,
      desc: profile.desc,
      range: live["C0"] || analysis.estimate
    };
  });
}

// SensitivityPanel renders the C0 estimate across all epistemic profiles.
// Inputs: rows = [{ id, name, desc, range: [lo, hi] }, ...]
// Above the table it shows two things:
//   1. The assessment label of the "balanced" row (baseline).
//   2. A robustness classification derived from the spread = max(hi) - min(lo).
//      Spread < 0.15 → "Robust"
//      Spread > 0.30 → "Parameter-dependent"
//      Otherwise    → "Moderately sensitive"
function SensitivityPanel({ rows }) {
  if (!rows || rows.length === 0) {
    return (
      <div className="sensitivity-empty mono">
        No profiles defined.
      </div>
    );
  }
  // Robustness classification across all profiles.
  let minLo = Infinity, maxHi = -Infinity;
  for (const r of rows) {
    const [lo, hi] = r.range;
    if (lo < minLo) minLo = lo;
    if (hi > maxHi) maxHi = hi;
  }
  const spread = maxHi - minLo;
  let robustnessLabel, robustnessCls;
  if (spread < 0.15) {
    robustnessLabel = "Robust";
    robustnessCls = "robust";
  } else if (spread > 0.30) {
    robustnessLabel = "Parameter-dependent";
    robustnessCls = "param-dep";
  } else {
    robustnessLabel = "Moderately sensitive";
    robustnessCls = "moderate";
  }

  // Baseline = the "balanced" row if present, else the first row.
  const baseline = rows.find(r => r.id === "balanced") || rows[0];
  const v = (window.veracityLabel || (() => ({ label: "—", cls: "" })))(baseline.range);

  return (
    <>
      <div className="sensitivity-verdict">
        <div className="sensitivity-verdict-row">
          <span className={`verdict-pill ${v.cls}`}>{v.label}</span>
          <span className="sensitivity-verdict-note">
            balanced reading · {displayRange(baseline.range)}
          </span>
        </div>
        <div className={`sensitivity-robustness ${robustnessCls}`}>
          <span className="sensitivity-robustness-label">{robustnessLabel}</span>
          <span className="sensitivity-robustness-spread mono">
            spread {Math.round(spread * 100)} pts across {rows.length} profiles
          </span>
        </div>
      </div>
      <table className="lab">
        <thead>
          <tr>
            <th>Profile</th>
            <th>P(true)</th>
            <th style={{ width: 78 }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const [lo, hi] = r.range;
            const isBaseline = r.id === "balanced";
            return (
              <tr key={r.id} className={`row sensitivity-row${isBaseline ? " baseline" : ""}`} title={r.desc}>
                <td>
                  <div className="sensitivity-name">{r.name}</div>
                  <div className="sensitivity-desc">{r.desc}</div>
                </td>
                <td>
                  <div className="sensitivity-bar">
                    <div
                      className={`sensitivity-bar-fill${isBaseline ? " baseline" : ""}`}
                      style={{
                        left: `${lo * 100}%`,
                        width: `${Math.max((hi - lo) * 100, 0.5)}%`
                      }}
                    />
                  </div>
                </td>
                <td className="mono sensitivity-numeric">
                  {displayRange(r.range)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

function Stage0Panel({ audit }) {
  if (!audit) return null;
  const rows = [
    ["Starting prior", audit.prior],
    ["Reference class", audit.referenceClass],
    ["Pressure", audit.pressure],
    ["Uncomfortable conclusion", audit.uncomfortableVerdict]
  ].filter(([, value]) => value);
  return (
    <div className="audit-grid">
      {rows.map(([label, value]) => (
        <div className="audit-cell" key={label}>
          <div className="audit-label">{label}</div>
          <div className="audit-text">{value}</div>
        </div>
      ))}
    </div>
  );
}

function ReadingSplitPanel({ items }) {
  if (!items || !items.length) return null;
  return (
    <div className="reading-grid">
      {items.map((it, i) => {
        const verdict = window.veracityLabel ? window.veracityLabel(it.range) : { label: "", cls: "" };
        return (
          <div className="reading-card" key={i}>
            <div className="reading-head">
              <span className="reading-label">{it.label}</span>
              <span className={`verdict-pill ${verdict.cls}`}>{verdict.label}</span>
            </div>
            <div className="reading-range mono">{displayRange(it.range)}</div>
            <div className="reading-note">{it.note}</div>
          </div>
        );
      })}
    </div>
  );
}

function RangeAnchorPanel({ anchors }) {
  if (!anchors) return null;
  return (
    <div className="anchor-grid">
      <div className="anchor-card lower">
        <div className="anchor-label">Lower bound anchor</div>
        <div className="anchor-text">{anchors.lower}</div>
      </div>
      <div className="anchor-card upper">
        <div className="anchor-label">Upper bound anchor</div>
        <div className="anchor-text">{anchors.upper}</div>
      </div>
    </div>
  );
}

// Classify a crux's would-move direction. Conservation of expected evidence:
// the operator should be able to name observations that would BOTH raise and
// lower the posterior. If all enumerated cruxes only point one way, the
// operator has been thinking asymmetrically — a known failure mode.
function classifyCruxDirection(crux) {
  if (crux.direction === "up" || crux.direction === "down" || crux.direction === "either") {
    return crux.direction;
  }
  const text = String(crux.wouldMove || "").toLowerCase();
  const upWords = /\b(raise|raises|rises|rose|higher|strengthen|stronger|support|reinforc|increase|boost|defensible)\b/;
  const downWords = /\b(lower|lowers|fall|falls|fell|weaken|weakens|undermine|falsif|reject|drop|drops|disconfirm)\b/;
  const hasUp = upWords.test(text);
  const hasDown = downWords.test(text);
  if (hasUp && hasDown) return "either";
  if (hasUp) return "up";
  if (hasDown) return "down";
  return "either";
}

function CruxLedger({ items }) {
  if (!items || !items.length) return null;
  let upCount = 0, downCount = 0, eitherCount = 0;
  const classified = items.map(it => {
    const dir = classifyCruxDirection(it);
    if (dir === "up") upCount++;
    else if (dir === "down") downCount++;
    else eitherCount++;
    return { ...it, _dir: dir };
  });
  const total = upCount + downCount;
  // Fire when the operator has named ≥3 sided cruxes and all point one way.
  let alarm = null;
  if (total >= 3 && downCount === 0) alarm = { side: "up" };
  else if (total >= 3 && upCount === 0) alarm = { side: "down" };

  return (
    <div className="crux-list">
      <div className="crux-balance mono"
           title="Conservation of expected evidence: the operator should be able to name observations that would BOTH raise and lower the posterior. All-one-direction crux enumeration means the operator is only thinking about updates in one direction.">
        {upCount} ↑ · {downCount} ↓ · {eitherCount} either
      </div>
      {alarm && (
        <div className="crux-direction-alarm" title="The operator has only enumerated observations that would shift the posterior in one direction. Truth-seeking requires equal-effort thinking about what would update the credence the OTHER way. If you can't name a counter-update, you may be hindsight-biased to the conclusion you started with.">
          <span className="evidence-asymmetry-dot" />
          <div>
            <strong>One-direction cruxes.</strong>{" "}
            All sided cruxes point {alarm.side === "up" ? "↑ (would raise)" : "↓ (would lower)"} the posterior.
            What observation would update the credence the OTHER way? If none can be named, the enumeration is asymmetric.
          </div>
        </div>
      )}
      {classified.map((it, i) => (
        <div className={`crux-row crux-dir-${it._dir}`} key={i}>
          <div className="crux-title">
            <span className="crux-dir-marker mono" title={`Direction: ${it._dir === "up" ? "would raise posterior" : it._dir === "down" ? "would lower posterior" : "could move either way"}`}>
              {it._dir === "up" ? "↑" : it._dir === "down" ? "↓" : "↔"}
            </span>
            {it.crux}
          </div>
          <div className="crux-current">{it.current}</div>
          <div className="crux-move">{it.wouldMove}</div>
        </div>
      ))}
    </div>
  );
}

function FairnessAuditPanel({ items }) {
  if (!items || !items.length) return null;
  return (
    <div className="fairness-list">
      {items.map((it, i) => (
        <div className="fairness-row" key={i}>
          <div className="fairness-status">{it.status}</div>
          <div>
            <div className="fairness-test">{it.test}</div>
            <div className="fairness-note">{it.note}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Calibration reference — static legend showing what likelihood-ratio magnitudes
// mean in terms of posterior shift, with concrete examples per band. Anchors the
// operator's intuition before they author LR values: an LR of 100 is reserved
// for evidence that is essentially impossible under ¬H, not for "I think this
// strongly supports my position." Miscalibrated LRs are the silent failure mode
// of Bayesian truth-seeking — the math is right but the inputs are wrong.
function CalibrationReference() {
  const bands = [
    { range: "1.0 – 1.5", label: "Negligible", shift: "≤10 pts from 50% prior", examples: "Single anecdote consistent with H; correlation noted but unmeasured" },
    { range: "1.5 – 3", label: "Weak", shift: "+7–25 pts from 50%", examples: "One survey reading the right direction; expert opinion without primary cite; pattern noted in a small sample" },
    { range: "3 – 10", label: "Moderate", shift: "+25–41 pts from 50%", examples: "Multiple independent studies aligned; named-source primary record consistent with claim; preregistered finding" },
    { range: "10 – 30", label: "Strong", shift: "+41–47 pts from 50%", examples: "Direct observation of the event; statement against interest; physical evidence with chain of custody" },
    { range: "30 – 100", label: "Very strong", shift: "+47–49 pts from 50%", examples: "Multiple independent classes of direct evidence (documents + physical + testimony); essentially no ¬H mechanism that produces this observation" },
    { range: "≥ 100", label: "Decisive", shift: "+49 pts (asymptotic)", examples: "Mathematical proof; logical impossibility under ¬H; reserved — claims of LR > 100 should be challenged hard" }
  ];
  return (
    <section className="calibration-ref">
      <details>
        <summary className="calibration-ref-summary">
          <span className="calibration-ref-chevron" aria-hidden="true">›</span>
          <span className="calibration-ref-title">Reference: what evidence strengths mean</span>
          <span className="calibration-ref-hint">click to expand</span>
        </summary>
        <div className="calibration-ref-body">
          <p className="calibration-ref-intro">
            LR = P(evidence | claim true) / P(evidence | claim false). Below is the magnitude scale operators should use when authoring LRs. Reciprocals (0.5, 0.2, 0.1...) mean evidence pointing the OTHER way at the same strength. Miscalibrated LRs are the silent failure mode of Bayesian truth-seeking.
          </p>
          <table className="calibration-ref-table lab">
            <thead>
              <tr><th>LR range</th><th>Label</th><th>Posterior shift</th><th>Example evidence</th></tr>
            </thead>
            <tbody>
              {bands.map((b, i) => (
                <tr key={i}>
                  <td className="mono">{b.range}</td>
                  <td><strong>{b.label}</strong></td>
                  <td className="mono">{b.shift}</td>
                  <td>{b.examples}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="calibration-ref-warn">
            <strong>Common miscalibration:</strong> operators routinely overstate LRs by 5–10×. An LR of 100 means "this observation is virtually impossible if the claim is false" — most evidence isn't that strong. When you find yourself reaching for LR ≥ 30, check that you can articulate the ¬H world in which this evidence would NOT appear.
          </p>
        </div>
      </details>
    </section>
  );
}

// Audit checklist — renders all 8 honesty checks with pass/flag/n/a status
// in a persistent panel below the SummaryCard. The eyebrow audit-stamp shows
// the headline count; this panel shows the detail so the operator doesn't have
// to hover to learn what needs review.
function AuditChecklist({ summary }) {
  if (!summary || !Array.isArray(summary.checks)) return null;
  return (
    <section className="audit-checklist">
      <div className="audit-checklist-head">
        <div className="audit-checklist-title">Self-checks on this analysis</div>
        <div className="audit-checklist-counts mono">
          <span className="audit-count-flag">{summary.flagCount} flagged</span>
          <span className="audit-count-pass">{summary.passCount} passed</span>
          {summary.naCount > 0 && <span className="audit-count-na">{summary.naCount} n/a</span>}
        </div>
      </div>
      <ul className="audit-checklist-list">
        {summary.checks.map(c => (
          <li key={c.id} className={`audit-checklist-row audit-row-${c.status === "n/a" ? "na" : c.status}`}>
            <span className="audit-row-status mono">
              {c.status === "flag" ? "FLAG" : c.status === "pass" ? "PASS" : "—"}
            </span>
            <span className="audit-row-label">{c.label}</span>
            <span className="audit-row-detail">{c.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Compact vertical decomposition: each direct child of C0 as a
// card showing {kind icon} {text} {plain-English veracity label}. No diagram,
// no inspector, no methodology — just the headline reasons.
function VerdictDecomposition({ analysis }) {
  const c0Children = Object.values(analysis.nodes)
    .filter(n => n.parent === "C0")
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  if (c0Children.length === 0) return null;
  const veracity = window.veracityLabel || (() => ({ label: "—", cls: "" }));
  const kindIcon = (k) => {
    switch (k) {
      case "subclaim": return "▸";
      case "premise":  return "·";
      case "atomic":   return "○";
      default:         return "▸";
    }
  };
  return (
    <section className="verdict-decomp">
      <h2 className="verdict-decomp-h">The headline reasons</h2>
      <p className="verdict-decomp-intro">
        Here's what the claim breaks down into. Each piece carries its own confidence.
      </p>
      <div className="verdict-decomp-list">
        {c0Children.map(n => {
          const v = veracity(n.estimate);
          return (
            <div className={`verdict-decomp-card${n.weak ? " weak" : ""}`} key={n.id} title={n.id}>
              <span className="verdict-decomp-icon" aria-hidden="true">{kindIcon(n.kind)}</span>
              <div className="verdict-decomp-body">
                <p className="verdict-decomp-text">{n.text}</p>
                <div className="verdict-decomp-meta">
                  <span className={`verdict-pill ${v.cls}`}>{v.label}</span>
                  <span className="verdict-decomp-range mono">{displayRange(n.estimate)}</span>
                  {n.weak && <span className="tag weak">weak link</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SourceWalkdown({ items }) {
  if (!items || !items.length) return null;
  return (
    <table className="lab source-walkdown">
      <thead>
        <tr>
          <th>Source</th>
          <th>Primary basis</th>
          <th>Independence</th>
          <th>Supports</th>
        </tr>
      </thead>
      <tbody>
        {items.map((it, i) => (
          <tr key={i}>
            <td>{it.source}</td>
            <td>{it.basis}</td>
            <td><span className="tag">{it.independence}</span></td>
            <td>{it.supports}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// CourtroomPanel — the primary tribunal surface for entries that have an
// analysis.courtroom field. Composes the tribunal banner, charge, opening
// statements, custody ladder, Socratic rounds, stipulated/contested record,
// floor/ceiling band, structured verdict, and out-of-bounds argument panel
// into a single ordered block. Returns null for entries without a
// courtroom payload so the existing layout falls through.
function CourtroomPanel({ analysis, valueUnit }) {
  const courtroom = analysis && analysis.courtroom;
  const initialExpanded = useMemo(() => {
    const out = {};
    const rounds = (courtroom && Array.isArray(courtroom.socraticRounds)) ? courtroom.socraticRounds : [];
    rounds.forEach((r, i) => { out[r.round != null ? r.round : i] = i === 0; });
    return out;
  }, [courtroom]);
  const [expandedRounds, setExpandedRounds] = useState(initialExpanded);
  useEffect(() => { setExpandedRounds(initialExpanded); }, [initialExpanded]);
  if (!courtroom) return null;

  const toggleRound = (key) => {
    setExpandedRounds(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <section className="courtroom-panel" aria-label="AI Courtroom tribunal">
      {/* TribunalBanner now renders at the top of PlainEnglishView so the
          tribunal verdict is the first thing on the page. Not duplicated
          here. */}
      {courtroom.charge && (
        <>
          <h2 className="courtroom-section-h">The charge</h2>
          <p className="courtroom-charge">{courtroom.charge}</p>
          {courtroom.admissibilityRule && (
            <p className="courtroom-admissibility">{courtroom.admissibilityRule}</p>
          )}
        </>
      )}

      {(courtroom.prosecutionOpening || courtroom.defenseOpening) && (
        <window.CourtroomOpenings
          prosecutionOpening={courtroom.prosecutionOpening}
          defenseOpening={courtroom.defenseOpening}
        />
      )}

      {courtroom.custodyLadder && (
        <>
          <h2 className="courtroom-section-h">Custody ladder</h2>
          <p className="courtroom-section-intro">
            Every piece of evidence carries a chain-of-custody tier. Tier A is cleanest (records held by neutral parties before the injury, or independent forensic surveys). Tier D is deepest discount (testimony alone).
          </p>
          <window.CustodyLadder ladder={courtroom.custodyLadder} />
        </>
      )}

      {Array.isArray(courtroom.socraticRounds) && courtroom.socraticRounds.length > 0 && (
        <>
          <h2 className="courtroom-section-h">Socratic rounds</h2>
          <p className="courtroom-section-intro">
            Each round distills one disputed question into prosecution + defense submissions and a tribunal verdict.
          </p>
          <div className="courtroom-socratic">
            {courtroom.socraticRounds.map((r, i) => {
              const key = r.round != null ? r.round : i;
              return (
                <window.SocraticRound
                  key={key}
                  round={r}
                  expanded={!!expandedRounds[key]}
                  onToggle={() => toggleRound(key)}
                />
              );
            })}
          </div>
        </>
      )}

      {((Array.isArray(courtroom.stipulatedFacts) && courtroom.stipulatedFacts.length > 0) ||
        (Array.isArray(courtroom.contestedZones) && courtroom.contestedZones.length > 0)) && (
        <>
          <h2 className="courtroom-section-h">Stipulated and contested</h2>
          <p className="courtroom-section-intro">
            What both sides agree on, and what they still dispute after five rounds.
          </p>
          <div className="courtroom-record-split">
            {Array.isArray(courtroom.stipulatedFacts) && courtroom.stipulatedFacts.length > 0 && (
              <div className="courtroom-record-col courtroom-record-col--stipulated">
                <h3>Stipulated · both sides agree</h3>
                <window.StipulatedFactsList items={courtroom.stipulatedFacts} />
              </div>
            )}
            {Array.isArray(courtroom.contestedZones) && courtroom.contestedZones.length > 0 && (
              <div className="courtroom-record-col courtroom-record-col--contested">
                <h3>Contested · still in dispute</h3>
                <window.ContestedZonesList items={courtroom.contestedZones} />
              </div>
            )}
          </div>
        </>
      )}

      {courtroom.floorAnalysis && (
        <>
          <h2 className="courtroom-section-h">Where the credence lands</h2>
          <p className="courtroom-section-intro">
            As cleaner-custody evidence is layered in, the credence band moves. Tier A alone gives the defense floor; adding Tier B and Tier C raises the central estimate to where both counsel converge.
          </p>
          <window.FloorCeilingBand floor={courtroom.floorAnalysis} ceiling={courtroom.ceilingAnalysis} unit={valueUnit || "M"} />
        </>
      )}

      {courtroom.verdict && (
        <window.CourtroomVerdictCard verdict={courtroom.verdict} />
      )}

      {Array.isArray(courtroom.outOfBoundsArguments) && courtroom.outOfBoundsArguments.length > 0 && (
        <window.OutOfBoundsArguments items={courtroom.outOfBoundsArguments} />
      )}
    </section>
  );
}

function PublicLanding() {
  return (
    <section className="public-landing" aria-labelledby="public-landing-title">
      <div className="public-landing-backdrop" aria-hidden="true">
        <div className="public-backdrop-row public-backdrop-row-a">
          <span>claim</span>
          <span>loaded terms</span>
          <span>subclaims</span>
          <span>rival hypotheses</span>
        </div>
        <div className="public-backdrop-row public-backdrop-row-b">
          <span>prior</span>
          <span>evidence weights</span>
          <span>sensitivity</span>
          <span>what would change the answer</span>
        </div>
        <div className="public-backdrop-row public-backdrop-row-c">
          <span>source walkdown</span>
          <span>coverage gaps</span>
          <span>truthful revision</span>
        </div>
      </div>

      <div className="public-landing-inner">
        <p className="public-kicker">Veracity v0.9 browser prototype</p>
        <h1 id="public-landing-title" className="public-title">
          First-principles truth audits for claims that deserve more than vibes.
        </h1>
        <p className="public-subtitle">
          Veracity turns "is this true?" into an inspectable chain of reasons. It breaks a claim into testable pieces,
          makes uncertainty explicit, compares rival explanations, and shows the receipts behind the answer.
        </p>
        <div className="public-actions" aria-label="Public landing actions">
          <a className="public-action public-action-primary" href="#sample-audit">View a sample audit</a>
          <a className="public-action" href="#public-method">How it works</a>
        </div>
        <dl className="public-facts" aria-label="Project facts">
          <div>
            <dt>3</dt>
            <dd>public demo claims</dd>
          </div>
          <div>
            <dt>0/1</dt>
            <dd>no forced yes/no answers</dd>
          </div>
          <div>
            <dt>open</dt>
            <dd>schema, math, and checks</dd>
          </div>
        </dl>
      </div>

      <div className="public-method" id="public-method" aria-label="How Veracity works">
        {PUBLIC_METHOD_ITEMS.map((item, index) => (
          <article className="public-method-item" key={item.title}>
            <span className="public-method-step">{String(index + 1).padStart(2, "0")}</span>
            <h2>{item.title}</h2>
            <p>{item.text}</p>
          </article>
        ))}
      </div>

      <p className="public-caveat">
        This is a prototype and operator method, not an oracle. The bundled analyses are demos; source-complete public reports
        should capture dated primary sources before publication.
      </p>
    </section>
  );
}

function App() {
  const [analysisId, setAnalysisId] = useState("minwage");
  // Appendix is closed on first load — reader lands on the prose, the math
  // is one click away (and unspools inline, not as a destination switch).
  const [appendixOpen, setAppendixOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [draftText, setDraftText] = useState(SAMPLES[0].label);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showTechnical, setShowTechnical] = useState(true);
  // Flip-the-assumption: when true, the SummaryCard re-renders the analysis from
  // the ¬H perspective — claim text is negated, credences are inverted (1-P).
  // Forces the operator to see what credence the ALTERNATIVE position carries.
  // Resets when analysis changes.
  const [flipped, setFlipped] = useState(false);
  // Tunable priors: { [analysisId]: { [nodeId]: [lo, hi] } }
  const [userPriors, setUserPriors] = useState({});
  // Dug-in nodes: { [analysisId]: { [nodeId]: true } } — parent IDs whose hidden children are revealed
  const [digIds, setDigIds] = useState({});
  const [stamp] = useState(() => {
    const now = new Date();
    return "FPV-" + now.toISOString().slice(0, 10).replace(/-/g, "") + "-" + Math.floor(Math.random()*900+100);
  });

  const rawAnalysis = window.ANALYSES[analysisId];
  const priorsForThisAnalysis = userPriors[analysisId] || {};
  const priorsModified = Object.keys(priorsForThisAnalysis).length > 0;
  const digsForThisAnalysis = digIds[analysisId] || {};
  const liveEstimates = useMemo(
    () => computeLiveEstimates(rawAnalysis, priorsForThisAnalysis, digsForThisAnalysis),
    [rawAnalysis, priorsForThisAnalysis, digsForThisAnalysis]
  );
  const analysis = useMemo(
    () => applyLiveEstimates(rawAnalysis, liveEstimates),
    [rawAnalysis, liveEstimates]
  );

  const setPrior = useCallback((nodeId, newRange) => {
    setUserPriors(prev => ({
      ...prev,
      [analysisId]: { ...(prev[analysisId] || {}), [nodeId]: newRange }
    }));
  }, [analysisId]);

  const resetPriors = useCallback(() => {
    setUserPriors(prev => ({ ...prev, [analysisId]: {} }));
  }, [analysisId]);

  const toggleDig = useCallback((nodeId) => {
    setDigIds(prev => {
      const cur = prev[analysisId] || {};
      const next = { ...cur };
      if (next[nodeId]) delete next[nodeId];
      else next[nodeId] = true;
      return { ...prev, [analysisId]: next };
    });
  }, [analysisId]);

  // Helper: does a node have hidden children authored under it?
  const nodeHasHiddenChildren = useCallback((nodeId) => {
    return Object.values(rawAnalysis.nodes).some(n => n.parent === nodeId && n.hiddenDepth);
  }, [rawAnalysis]);

  // When analysis changes, clear the inspector, reset flip state, tuck the
  // appendix away, and scroll back to the top — a new claim should land on
  // the prose, not on the receipts of the previous one. Without the scroll
  // reset the reader can find themselves staring at empty space where the
  // previous analysis's appendix used to be.
  useEffect(() => {
    setSelectedId(null);
    setFlipped(false);
    setAppendixOpen(false);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  }, [analysisId]);

  const [narrow, setNarrow] = useState(() => window.innerWidth < 980);
  useEffect(() => {
    const onR = () => setNarrow(window.innerWidth < 980);
    window.addEventListener("resize", onR);
    return () => window.removeEventListener("resize", onR);
  }, []);

  const selectedNode = selectedId ? analysis.nodes[selectedId] : null;

  const handleSelect = useCallback((id) => {
    setSelectedId(id);
    if (window.innerWidth < 980) setDrawerOpen(true);
  }, []);

  const loadSample = (id) => {
    const s = SAMPLES.find(x => x.id === id);
    setAnalysisId(id);
    setDraftText(s.label);
  };

  // Composition data (for Standard/Deep)
  const composition = useMemo(() => {
    const subs = Object.values(analysis.nodes).filter(n => n.kind === "subclaim");
    return subs.map(s => {
      const [lo, hi] = s.estimate || [0, 0];
      return { id: s.id, text: s.text, mid: (lo + hi) / 2, lo, hi, conf: s.confidence, weak: !!s.weak };
    });
  }, [analysis]);

  // Sensitivity: one C0 range per epistemic profile. Uses rawAnalysis (not analysis)
  // so the profile sweep ignores the user's current per-node prior tweaks — this is
  // a parallel exploration, not a re-render of the user's current state.
  const sensitivity = useMemo(
    () => computeProfileEstimates(rawAnalysis, analysisId, digsForThisAnalysis),
    [rawAnalysis, analysisId, digsForThisAnalysis]
  );

  // Conjunctive-Bayes C0 derived from subclaim credences under independence.
  // The min() rule (in computeLiveEstimates) gives the conservative floor;
  // the product rule gives the conjunctive-Bayes credence. Both signal honestly.
  const conjBayes = useMemo(
    () => computeConjBayes(rawAnalysis, priorsForThisAnalysis, digsForThisAnalysis),
    [rawAnalysis, priorsForThisAnalysis, digsForThisAnalysis]
  );

  // Load-bearing nodes: any tunable whose extremes shift C0 enough to flip the credence band.
  const loadBearing = useMemo(
    () => detectLoadBearing(rawAnalysis, digsForThisAnalysis),
    [rawAnalysis, digsForThisAnalysis]
  );
  const loadBearingCount = Object.keys(loadBearing).length;
  const tunableCount = useMemo(
    () => Object.values(rawAnalysis.nodes).filter(n => n.tunable).length,
    [rawAnalysis]
  );

  // Provenance & falsifiability quality counts. Atomic premises (leaf-level
  // observable claims) are the right denominator: subclaims and the claim
  // itself inherit grounding from their decomposition. Walk only leaves.
  const qualityCounts = useMemo(() => {
    const leaves = Object.values(rawAnalysis.nodes).filter(n =>
      !Object.values(rawAnalysis.nodes).some(c => c.parent === n.id)
    );
    let ungrounded = 0, unfalsifiable = 0;
    for (const n of leaves) {
      if (window.isUngrounded && window.isUngrounded(n, rawAnalysis)) ungrounded++;
      if (window.isLowFalsifiability && window.isLowFalsifiability(n)) unfalsifiable++;
    }
    return { ungrounded, unfalsifiable, leafCount: leaves.length };
  }, [rawAnalysis]);

  // Aggregated audit across all honesty checks. Each check produces a
  // structured item { id, label, status: "pass"|"flag"|"n/a", detail }.
  // SummaryCard renders a compact eyebrow stamp; AuditChecklist below renders
  // the full list with detail, always visible.
  const auditSummary = useMemo(() => {
    const checks = [];
    // 1. Load-bearing tunables
    if (tunableCount > 0) {
      checks.push({
        id: "load-bearing",
        label: "Does any one assumption decide the answer alone?",
        status: loadBearingCount > 0 ? "flag" : "pass",
        detail: loadBearingCount > 0
          ? `${loadBearingCount}/${tunableCount} tunable priors can each flip the credence band alone`
          : "No tunable prior alone shifts C0 by ≥15 points"
      });
    } else checks.push({ id: "load-bearing", label: "Does any one assumption decide the answer alone?", status: "n/a", detail: "No tunable priors in this analysis" });
    // 2. One-sided evidence
    const evItems = rawAnalysis.evidenceBudget || [];
    let weightedFor = 0, weightedAgainst = 0;
    const weightTo = w => ({ high: 3, medium: 2, low: 1 })[w] || 1;
    for (const e of evItems) {
      const dir = String(e.direction || "").toLowerCase();
      const hasFor = /\bfor\b/.test(dir);
      const hasAgainst = /\bagainst\b/.test(dir);
      if (hasFor && !hasAgainst) weightedFor += weightTo(e.weight);
      else if (hasAgainst && !hasFor) weightedAgainst += weightTo(e.weight);
    }
    const totalSided = weightedFor + weightedAgainst;
    if (totalSided >= 3) {
      const oneSided = weightedAgainst === 0 || weightedFor === 0;
      const lopsided = !oneSided && (weightedFor / totalSided >= 0.8 || weightedFor / totalSided <= 0.2);
      checks.push({
        id: "evidence-symmetry",
        label: "Did we look at evidence on both sides?",
        status: (oneSided || lopsided) ? "flag" : "pass",
        detail: `${weightedFor} weighted for, ${weightedAgainst} against` + (oneSided ? " — no counter-evidence searched" : lopsided ? " — search heavily one-sided" : " — balanced")
      });
    } else checks.push({ id: "evidence-symmetry", label: "Did we look at evidence on both sides?", status: "n/a", detail: "Too few sided evidence items to score" });
    // 3. Asymmetric effort across hypotheses
    const c0Nodes = Object.values(rawAnalysis.nodes).length - 1;
    const altDepths = (rawAnalysis.hypotheses || []).map(h =>
      Array.isArray(h.decomposition) && h.decomposition.length > 0 ? h.decomposition.length : 1
    );
    if (altDepths.length > 0) {
      const avgAltDepth = altDepths.reduce((a, b) => a + b, 0) / altDepths.length;
      const ratio = avgAltDepth / c0Nodes;
      checks.push({
        id: "effort-symmetry",
        label: "Did we examine alternatives just as hard?",
        status: ratio < 0.25 ? "flag" : "pass",
        detail: `C0 has ${c0Nodes} nodes; alternatives average ${avgAltDepth.toFixed(1)} (${Math.round(ratio*100)}% ratio)`
      });
    } else checks.push({ id: "effort-symmetry", label: "Did we examine alternatives just as hard?", status: "n/a", detail: "No competing hypotheses to compare against" });
    // 4. Ungrounded leaves
    checks.push({
      id: "provenance",
      label: "Provenance required",
      status: qualityCounts.ungrounded > 0 ? "flag" : "pass",
      detail: qualityCounts.ungrounded > 0
        ? `${qualityCounts.ungrounded} leaf claims lack evidence basis`
        : `All ${qualityCounts.leafCount} leaf claims trace to evidence`
    });
    // 5. Unfalsifiable leaves
    checks.push({
      id: "falsifiability",
      label: "Falsifiability required",
      status: qualityCounts.unfalsifiable > 0 ? "flag" : "pass",
      detail: qualityCounts.unfalsifiable > 0
        ? `${qualityCounts.unfalsifiable} leaf claims have no falsification path`
        : `All ${qualityCounts.leafCount} leaf claims name a disconfirming observation`
    });
    // 6. LR/authored discrepancy
    const lrPrior = rawAnalysis.priorRange || [0.4, 0.6];
    const lrPosterior = rawAnalysis.evidenceBudget && window.lrPosteriorRange
      ? window.lrPosteriorRange(lrPrior, rawAnalysis.evidenceBudget)
      : null;
    if (lrPosterior) {
      const lrMid = (lrPosterior[0] + lrPosterior[1]) / 2;
      const auMid = (rawAnalysis.estimate[0] + rawAnalysis.estimate[1]) / 2;
      const delta = Math.abs(lrMid - auMid);
      checks.push({
        id: "lr-vs-authored",
        label: "Does the evidence math agree with our estimate?",
        status: delta >= 0.15 ? "flag" : "pass",
        detail: `Our estimate ${Math.round(auMid*100)}%, evidence-check ${Math.round(lrMid*100)}% (${Math.round(delta*100)} pts off)`
      });
    } else checks.push({ id: "lr-vs-authored", label: "Does the evidence math agree with our estimate?", status: "n/a", detail: "No declared evidence strengths on items" });
    // 7. ConjBayes/authored discrepancy
    if (conjBayes && conjBayes["C0"]) {
      const cbMid = (conjBayes["C0"][0] + conjBayes["C0"][1]) / 2;
      const auMid = (rawAnalysis.estimate[0] + rawAnalysis.estimate[1]) / 2;
      const delta = Math.abs(cbMid - auMid);
      checks.push({
        id: "conjbayes-vs-authored",
        label: "Do the sub-pieces multiply out to our estimate?",
        status: delta >= 0.15 ? "flag" : "pass",
        detail: `Our estimate ${Math.round(auMid*100)}%, sub-pieces check ${Math.round(cbMid*100)}% (${Math.round(delta*100)} pts off)`
      });
    }
    // 8. One-direction cruxes
    const cruxes = rawAnalysis.cruxes || [];
    let cruxUp = 0, cruxDown = 0;
    for (const c of cruxes) {
      const txt = String(c.wouldMove || "").toLowerCase();
      const up = /\b(raise|raises|rises|rose|higher|strengthen|stronger|support|reinforc|increase|boost|defensible)\b/.test(txt);
      const dn = /\b(lower|lowers|fall|falls|fell|weaken|weakens|undermine|falsif|reject|drop|drops|disconfirm)\b/.test(txt);
      if (up && !dn) cruxUp++;
      else if (dn && !up) cruxDown++;
    }
    if (cruxUp + cruxDown >= 3) {
      const oneDir = cruxUp === 0 || cruxDown === 0;
      checks.push({
        id: "crux-symmetry",
        label: "Cruxes enumerated in both directions",
        status: oneDir ? "flag" : "pass",
        detail: `${cruxUp} ↑ · ${cruxDown} ↓` + (oneDir ? " — operator only imagined updates one way" : " — symmetric crux enumeration")
      });
    } else checks.push({ id: "crux-symmetry", label: "Cruxes enumerated in both directions", status: "n/a", detail: "Too few cruxes to score" });

    const flagCount = checks.filter(c => c.status === "flag").length;
    const passCount = checks.filter(c => c.status === "pass").length;
    const naCount = checks.filter(c => c.status === "n/a").length;
    return { checks, flags: checks.filter(c => c.status === "flag").map(c => c.detail), passes: checks.filter(c => c.status === "pass").map(c => c.detail), flagCount, passCount, naCount, total: passCount + flagCount };
  }, [rawAnalysis, tunableCount, loadBearingCount, qualityCounts, conjBayes]);

  const weakestNodes = (analysis.weakest || []).map(id => analysis.nodes[id]).filter(Boolean);

  // Appendix renders every surface available. There's no "depth slider" here —
  // when the reader chooses to open the math, they get the full record.
  const panels = {
    stage0: true, readings: true, gauge: true, weakest: true, anchors: true,
    loadedTerms: true, revision: true, composition: true, sensitivity: true,
    cruxes: true, fairness: true, atomic: true, stress: true, hypotheses: true,
    subjectivity: true, evidence: true, sources: true, verification: true,
    lrChain: true, conjBayes: true, loadBearingTable: true
  };

  const selectOnActionKey = (e, id) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleSelect(id);
    }
  };

  const activeSample = SAMPLES.find(x => x.id === analysisId);

  return (
    <>
      {/* ── App bar — wordmark only, no controls. The reader should land on the
          claim, not on a configuration surface. ── */}
      <header className="app-bar app-bar-quiet">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">Veracity</span>
        </div>
      </header>

      <PublicLanding />

      {/* ════════════════════════════════════════════════════════════
          PLAIN ESSAY — always rendered. The math unspools BELOW this
          inline (no destination switch) when the reader opens it.
          ════════════════════════════════════════════════════════════ */}
      <div id="sample-audit" className="sample-audit-anchor">
        <PlainEnglishView
          analysis={analysis}
          activeSample={activeSample}
          appendixOpen={appendixOpen}
          onToggleAppendix={() => setAppendixOpen(v => !v)}
        />
      </div>

      {/* ════════════════════════════════════════════════════════════
          APPENDIX — receipts, second opinions, decomposition, audit.
          Same paper, same wordmark, same scroll. No re-introduction of
          the claim, no return-to-plain affordance: the reader is still
          inside the same essay, just deeper in.
          ════════════════════════════════════════════════════════════ */}
      {appendixOpen && (
      <section className="appendix" id="appendix" aria-label="Appendix - the math behind the assessment">
        {/* Printed-page rule. Marks the seam between essay and appendix
            without asserting a new identity. */}
        <div className="appendix-divider">
          <div className="appendix-divider-rule" aria-hidden="true" />
          <div className="appendix-divider-text">
            <span className="appendix-eyebrow">{analysis.courtroom ? "The full proceedings" : "Appendix"}</span>
            <span className="appendix-tagline">
              {analysis.courtroom
                ? "Every step of the tribunal record - opening statements, custody ladder, Socratic rounds in full, the evidence ledger, sensitivity sweeps."
                : "The math behind the assessment - receipts, cross-checks, sensitivity, audit."}
            </span>
          </div>
        </div>

        {/* AI Courtroom panel — primary tribunal surface for entries that
            carry an analysis.courtroom payload. Renders nothing for entries
            without one (graceful fall-through to the existing math layer). */}
        {analysis.courtroom && (
          <CourtroomPanel analysis={analysis} valueUnit={analysis.courtroom.valueUnit || "M"} />
        )}

        {/* Four headline numbers, quietly. Lives where NerdHeader's hero
            used to sit, but without the duplicate claim. */}
        <div className="appendix-glance">
          {(() => {
            const baseEst = flipped ? invertRange(analysis.estimate) : analysis.estimate;
            const prior = analysis.priorRange || [0.4, 0.6];
            const rawLR = analysis.evidenceBudget && lrPosteriorRange
              ? lrPosteriorRange(prior, analysis.evidenceBudget) : null;
            const lrShown = flipped && rawLR ? invertRange(rawLR) : rawLR;
            const cbShown = flipped && conjBayes["C0"] ? invertRange(conjBayes["C0"]) : conjBayes["C0"];
            return (
              <>
                <div className="appendix-glance-cell">
                  <div className="appendix-glance-label">Our estimate</div>
                  <div className="appendix-glance-value mono">{formatRange(baseEst)}</div>
                  <div className="appendix-glance-note">{veracityLabel(baseEst).label}</div>
                </div>
                <div className="appendix-glance-cell">
                  <div className="appendix-glance-label">Starting prior</div>
                  <div className="appendix-glance-value mono">{formatRange(prior)}</div>
                  <div className="appendix-glance-note">before any evidence</div>
                </div>
                {lrShown && (
                  <div className="appendix-glance-cell">
                    <div className="appendix-glance-label">From evidence only</div>
                    <div className="appendix-glance-value mono">{formatRange(lrShown)}</div>
                    <div className="appendix-glance-note">prior × evidence weights</div>
                  </div>
                )}
                {cbShown && (
                  <div className="appendix-glance-cell">
                    <div className="appendix-glance-label">Sub-pieces multiplied</div>
                    <div className="appendix-glance-value mono">{formatRange(cbShown)}</div>
                    <div className="appendix-glance-note">conjunctive Bayes</div>
                  </div>
                )}
              </>
            );
          })()}
          <button
            type="button"
            className={`appendix-flip-btn${flipped ? " active" : ""}`}
            onClick={() => setFlipped(v => !v)}
            title="Flip the assumption — re-render everything for the claim's negation. Forces the operator to inhabit the case against the claim, not just for it."
          >
            {flipped ? "↩ Back to original" : "Show as \"claim is false\""}
          </button>
          {priorsModified && (
            <span className="priors-modified-stamp appendix-glance-stamp" title="Numbers reflect your tuned priors. Reset in the inspector below.">
              You've tuned this
            </span>
          )}
        </div>

        {/* Cross-checks — the second-opinions block (already a <details>
            that opens itself when there's a discrepancy worth a look). */}
        <div className="appendix-cross-checks">
          {(() => {
            const baseEst = flipped ? invertRange(analysis.estimate) : analysis.estimate;
            const rawLR = analysis.evidenceBudget && lrPosteriorRange
              ? lrPosteriorRange(analysis.priorRange || [0.4, 0.6], analysis.evidenceBudget) : null;
            const lrShown = flipped && rawLR ? invertRange(rawLR) : rawLR;
            const cbShown = flipped && conjBayes["C0"] ? invertRange(conjBayes["C0"]) : conjBayes["C0"];
            const lrDelta = lrShown ? Math.abs((lrShown[0]+lrShown[1])/2 - (baseEst[0]+baseEst[1])/2) : null;
            const cbDelta = cbShown ? Math.abs((cbShown[0]+cbShown[1])/2 - (baseEst[0]+baseEst[1])/2) : null;
            return (
              <CrossChecks
                baseEstimate={baseEst}
                lrPosterior={lrShown}
                lrLabel={lrShown ? veracityLabel(lrShown) : null}
                lrDelta={lrDelta}
                conjBayesShown={cbShown}
                cbLabel={cbShown ? veracityLabel(cbShown) : null}
                cbDelta={cbDelta}
                priorsModified={priorsModified}
                flipped={flipped}
                auditSummary={auditSummary}
                openOverride={true}
              />
            );
          })()}
        </div>

        {/* § A · Walking through the evidence */}
        <section className="appendix-section">
          <h2 className="appendix-h2"><span className="appendix-num">§A</span>Walking through the evidence</h2>
          <p className="appendix-intro">
            Each row is one Bayesian step: the running probability gets multiplied by an evidence weight (the likelihood ratio). Items with no LR contribute nothing.
          </p>
          <EvidenceLRChain analysis={analysis} />
        </section>

        {/* § B · Two ways to combine the sub-pieces */}
        <section className="appendix-section">
          <h2 className="appendix-h2"><span className="appendix-num">§B</span>Two ways to combine the sub-pieces</h2>
          <p className="appendix-intro">
            The authored estimate takes the weakest link; the conjunctive view multiplies the pieces together under independence. Real claims usually sit between the two. A wide gap means the pieces are correlated, or the composition isn't strictly conjunctive.
          </p>
          <ConjunctiveBayesPanel analysis={analysis} conjBayesC0={conjBayes["C0"]} />
        </section>

        {/* § C · Which assumptions decide it alone? */}
        <section className="appendix-section">
          <h2 className="appendix-h2"><span className="appendix-num">§C</span>Which assumptions decide the assessment alone?</h2>
          <p className="appendix-intro">
            Each tunable value swept across its full range. If one assumption can move the main claim by 15 points or more on its own, it's flagged as load-bearing — the kind of input that's being treated as fact when it shouldn't be.
          </p>
          <LoadBearingTable analysis={analysis} loadBearing={loadBearing} />
        </section>

        {/* § D · How robust to a different worldview? */}
        <section className="appendix-section">
          <h2 className="appendix-h2"><span className="appendix-num">§D</span>How robust is the assessment to a different worldview?</h2>
          <p className="appendix-intro">
            The same analysis re-run under {sensitivity.length} different epistemic profiles. A small spread means the assessment doesn't hinge on any one starting assumption.
          </p>
          <SensitivityPanel rows={sensitivity} />
        </section>

        {/* § E · Analyst starting point — moved into the Tribunal record
            accordion when an analysis.courtroom payload is present. */}
        {panels.stage0 && analysis.stage0 && !analysis.courtroom && (
          <section className="appendix-section">
            <h2 className="appendix-h2"><span className="appendix-num">§E</span>Analyst starting point</h2>
            <p className="appendix-intro">
              What the analyst brought into the analysis before scoring - the prior, the reference class, and the conclusion they'd be reluctant to reach.
            </p>
            <Stage0Panel audit={analysis.stage0} />
          </section>
        )}

        {/* § F · Different readings of the claim */}
        {panels.readings && analysis.readings && (
          <section className="appendix-section">
            <h2 className="appendix-h2"><span className="appendix-num">§F</span>Different ways to read the claim</h2>
            <p className="appendix-intro">
              When the wording is ambiguous, each meaning gets its own credence — refusing motte-and-bailey averaging across readings.
            </p>
            <ReadingSplitPanel items={analysis.readings} />
          </section>
        )}

        {/* § G · Weakest premises */}
        {panels.weakest && weakestNodes.length > 0 && (
          <section className="appendix-section">
            <h2 className="appendix-h2"><span className="appendix-num">§G</span>Weakest premises</h2>
            <p className="appendix-intro">
              The pieces that materially limit the conclusion. Strengthening or replacing one of these is what would shift the assessment.
            </p>
            <table className="lab appendix-table">
              <tbody>
                {weakestNodes.map(n => (
                  <tr
                    key={n.id}
                    className={`row weak${n.id === selectedId ? " on" : ""}`}
                    onClick={() => handleSelect(n.id)}
                    onKeyDown={(e) => selectOnActionKey(e, n.id)}
                    tabIndex={0}
                    aria-label={`Inspect ${n.id}: ${n.text}`}
                  >
                    <td className="id" style={{ width: 130, whiteSpace: "nowrap" }} title={n.id}>
                      <span style={{ color: "var(--ink-2)" }}>{KIND_LABEL[n.kind]}</span>
                      <span style={{ color: "var(--muted-2)", marginLeft: 6, fontFamily: "var(--font-mono)" }}>{n.id}</span>
                    </td>
                    <td>
                      <div style={{ fontSize: 13 }}>{n.text}</div>
                      <div className="dim" style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, marginTop: 2 }}>
                        → {n.changes}
                      </div>
                    </td>
                    <td className="mono" style={{ whiteSpace: "nowrap" }}>{displayRange(n.estimate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* § H · Range anchors */}
        {panels.anchors && analysis.rangeAnchors && (
          <section className="appendix-section">
            <h2 className="appendix-h2"><span className="appendix-num">§H</span>Range anchors</h2>
            <p className="appendix-intro">
              Why the endpoints of the probability range aren't pulled from vibes — what would have to be true at the floor, and what would have to be true at the ceiling.
            </p>
            <RangeAnchorPanel anchors={analysis.rangeAnchors} />
          </section>
        )}

        {/* § I · Loaded terms */}
        {panels.loadedTerms && (analysis.loadedTerms || []).length > 0 && (
          <section className="appendix-section">
            <h2 className="appendix-h2"><span className="appendix-num">§I</span>Loaded terms</h2>
            <p className="appendix-intro">
              Words in the claim that hide judgment calls — which meaning we chose, and why.
            </p>
            <LoadedTermsTable items={analysis.loadedTerms || []} />
          </section>
        )}

        {/* § J · Composition */}
        {panels.composition && composition.length > 0 && (
          <section className="appendix-section">
            <h2 className="appendix-h2"><span className="appendix-num">§J</span>Composition</h2>
            <p className="appendix-intro">
              Each sub-claim's authored credence with the weak-link highlighting — the authored synthesis, not a formula-derived aggregate.
            </p>
            <table className="lab appendix-table">
              <thead>
                <tr>
                  <th>Subclaim</th>
                  <th>Statement</th>
                  <th>P(true)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {composition.map(c => (
                  <tr
                    key={c.id}
                    className={`row${c.weak ? " weak" : ""}${c.id === selectedId ? " on" : ""}`}
                    onClick={() => handleSelect(c.id)}
                    onKeyDown={(e) => selectOnActionKey(e, c.id)}
                    tabIndex={0}
                    aria-label={`Inspect ${c.id}: ${c.text}`}
                  >
                    <td className="id mono" style={{ whiteSpace: "nowrap" }} title={c.id}>
                      {c.id}
                    </td>
                    <td>{c.text}</td>
                    <td style={{ width: 110 }}>
                      <div style={{ position: "relative", height: 6, background: "var(--paper-3)", border: "1px solid var(--line)" }}>
                        <div style={{
                          position: "absolute",
                          top: -1, bottom: -1,
                          left: `${c.lo * 100}%`,
                          width: `${(c.hi - c.lo) * 100}%`,
                          background: c.weak ? "var(--weak)" : "var(--ink)"
                        }} />
                      </div>
                      <div className="mono" style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
                        {displayRange([c.lo, c.hi])}
                      </div>
                    </td>
                    <td>{c.weak ? <span className="tag weak">weak</span> : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* § K · Crux ledger */}
        {panels.cruxes && analysis.cruxes && (
          <section className="appendix-section">
            <h2 className="appendix-h2"><span className="appendix-num">§K</span>Crux ledger</h2>
            <p className="appendix-intro">
              What would actually move the credence, and in which direction. If every named crux points the same way, the operator was thinking asymmetrically.
            </p>
            <CruxLedger items={analysis.cruxes} />
          </section>
        )}

        {/* § L · Fairness audit — moved into the Tribunal record accordion
            when an analysis.courtroom payload is present. */}
        {panels.fairness && analysis.fairnessAudit && !analysis.courtroom && (
          <section className="appendix-section">
            <h2 className="appendix-h2"><span className="appendix-num">§L</span>Fairness audit</h2>
            <p className="appendix-intro">
              Tests for steelman quality without manufacturing false balance.
            </p>
            <FairnessAuditPanel items={analysis.fairnessAudit} />
          </section>
        )}

        {/* § M · Stress test */}
        {panels.stress && analysis.stress && (
          <section className="appendix-section">
            <h2 className="appendix-h2"><span className="appendix-num">§M</span>Stress test</h2>
            <p className="appendix-intro">
              How the assessment responds to perturbing the inputs.
            </p>
            <StressList items={analysis.stress} />
          </section>
        )}

        {/* § N · Alternative explanations */}
        {panels.hypotheses && analysis.hypotheses && analysis.hypotheses.length > 0 && (
          <section className="appendix-section">
            <h2 className="appendix-h2"><span className="appendix-num">§N</span>Alternative explanations</h2>
            <p className="appendix-intro">
              Other readings of the evidence that survive scrutiny — and the symmetric-effort gate that flags when the alternatives haven't been steel-manned to comparable depth.
            </p>
            {(() => {
              const c0Nodes = Object.values(analysis.nodes).length - 1;
              const altCount = (analysis.hypotheses || []).length;
              if (altCount === 0 || c0Nodes === 0) return null;
              const altDepths = (analysis.hypotheses || []).map(h =>
                Array.isArray(h.decomposition) && h.decomposition.length > 0
                  ? h.decomposition.length
                  : 1
              );
              const avgAltDepth = altDepths.reduce((a, b) => a + b, 0) / altDepths.length;
              const ratio = avgAltDepth / c0Nodes;
              if (ratio >= 0.25) return null;
              const allHaveDecomp = (analysis.hypotheses || []).every(h =>
                Array.isArray(h.decomposition) && h.decomposition.length > 0
              );
              return (
                <div className="effort-asymmetry-alarm" title="C0 is decomposed deeper than the competing hypotheses. Without comparable Bayesian work on the alternatives, the posterior is anchored to the operator's starting hypothesis.">
                  <span className="evidence-asymmetry-dot" />
                  <div>
                    <strong>Asymmetric effort.</strong>{" "}
                    The main claim has <span className="mono">{c0Nodes}</span> decomposed nodes; alternatives average <span className="mono">{avgAltDepth.toFixed(1)}</span> subclaim{avgAltDepth !== 1 ? "s" : ""} each (effort ratio {Math.round(ratio*100)}%).
                    {allHaveDecomp
                      ? " Each alternative carries a partial subclaim tree — deepen them until the ratio reaches 25% to silence this flag."
                      : " To make the posterior honest, decompose each alternative to comparable depth — otherwise the credence reflects the operator's anchoring, not the evidence."}
                  </div>
                </div>
              );
            })()}
            <HypothesesList items={analysis.hypotheses} evidenceBudget={analysis.evidenceBudget} />
          </section>
        )}

        {/* § O · All premises */}
        {panels.atomic && (
          <section className="appendix-section">
            <h2 className="appendix-h2"><span className="appendix-num">§O</span>All premises</h2>
            <p className="appendix-intro">
              Every assumption in the decomposition. Click any row to inspect it in the diagram below.
            </p>
            <PremisesTable
              analysis={analysis}
              selectedId={selectedId}
              onSelect={handleSelect}
              level="atomic"
              showTechnical={showTechnical}
              mode="nerd"
            />
          </section>
        )}

        {/* § P · Subjectivity ledger */}
        {panels.subjectivity && analysis.subjectivity && (
          <section className="appendix-section">
            <h2 className="appendix-h2"><span className="appendix-num">§P</span>Subjectivity ledger</h2>
            <p className="appendix-intro">
              Where the analyst's judgment enters the analysis.
            </p>
            <Ledger items={analysis.subjectivity} />
          </section>
        )}

        {/* § Q · Evidence budget */}
        {panels.evidence && (
          <section className="appendix-section">
            <h2 className="appendix-h2"><span className="appendix-num">§Q</span>Evidence budget</h2>
            <p className="appendix-intro">
              Everything that pushed the credence one way or the other, with declared LR and direction.
            </p>
            <EvidenceBudget
              items={analysis.evidenceBudget}
              authoredEstimate={analysis.estimate}
              priorRange={analysis.priorRange}
            />
          </section>
        )}

        {/* § R · Source walkdown — moved into the Tribunal record accordion
            when an analysis.courtroom payload is present. */}
        {panels.sources && analysis.sourceWalkdown && !analysis.courtroom && (
          <section className="appendix-section">
            <h2 className="appendix-h2"><span className="appendix-num">§R</span>Source walkdown</h2>
            <p className="appendix-intro">
              Sources counted by their primary basis, with independence noted — so the same underlying fact isn't smuggled in three times.
            </p>
            <SourceWalkdown items={analysis.sourceWalkdown} />
          </section>
        )}

        {/* § S · Verification notes */}
        {panels.verification && analysis.verificationNotes && (
          <section className="appendix-section">
            <h2 className="appendix-h2"><span className="appendix-num">§S</span>Verification notes</h2>
            <p className="appendix-intro">
              What to specify before re-running this analysis - open questions and gaps the operator should close before relying on the assessment.
            </p>
            <NotesList items={analysis.verificationNotes} />
          </section>
        )}

        {/* § T · The decomposition, piece by piece — interactive workspace */}
        <section className="appendix-section appendix-workspace-section">
          <h2 className="appendix-h2"><span className="appendix-num">§T</span>The decomposition, piece by piece</h2>
          <p className="appendix-intro">
            Each box is one piece of the argument. Click any box to see its reasoning, what would change it, and the evidence beneath it.
          </p>
          <label className="tech-toggle appendix-tech-toggle" title="Show node IDs and reasoning-type badges">
            <input
              type="checkbox"
              checked={showTechnical}
              onChange={(e) => setShowTechnical(e.target.checked)}
            />
            <span>Technical labels</span>
          </label>

          <div className="appendix-workspace workspace" id="workspace">
            <aside className="outline-col">
              <h3 className="section-label">Breakdown <span className="num">{Object.keys(analysis.nodes).length}</span></h3>
              {Object.values(analysis.nodes)
                .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
                .filter(n => isVisible(n, analysis, digsForThisAnalysis))
                .map(n => (
                  <div
                    key={n.id}
                    className={`outline-item${n.id === selectedId ? " on" : ""}${n.weak ? " weak" : ""}`}
                    onClick={() => handleSelect(n.id)}
                    onKeyDown={(e) => selectOnActionKey(e, n.id)}
                    tabIndex={0}
                    role="button"
                    aria-label={`Inspect ${n.id}: ${n.text}`}
                    aria-current={n.id === selectedId ? "true" : undefined}
                    title={`${n.id}: ${n.text}`}
                  >
                    <span className="outline-id">{n.id}</span>
                    <span className="outline-kindmark">{KIND_LABEL[n.kind]}</span>
                    <span className="outline-text">{n.text}</span>
                  </div>
                ))}

              <h3 className="section-label" style={{ marginTop: 22 }}>What we did and didn't check</h3>
              {analysis.coverage.map((c, i) => (
                <div className="coverage-row" key={i}>
                  <span>{c.area}</span>
                  <span className={`coverage-status ${c.status}`}>{c.status}</span>
                  {c.note && <span className="coverage-note">{c.note}</span>}
                </div>
              ))}
            </aside>

            <Diagram
              analysis={analysis}
              mode="nerd"
              selectedId={selectedId}
              onSelect={handleSelect}
              showTechnical={showTechnical}
              digIds={digsForThisAnalysis}
            />

            <aside className="inspector-col">
              <Inspector
                node={selectedNode}
                analysis={analysis}
                onJump={handleSelect}
                showTechnical={showTechnical}
                setPrior={setPrior}
                resetPriors={resetPriors}
                toggleDig={toggleDig}
                isDug={selectedId ? !!digsForThisAnalysis[selectedId] : false}
                hasHiddenChildren={selectedId ? nodeHasHiddenChildren(selectedId) : false}
                loadBearing={selectedId ? loadBearing[selectedId] : null}
                conjBayes={selectedId ? conjBayes[selectedId] : null}
                mode="nerd"
              />
            </aside>

            <div className={`inspector-drawer${narrow && drawerOpen && selectedNode ? " open" : ""}`}>
              <Inspector
                node={selectedNode}
                analysis={analysis}
                onJump={handleSelect}
                onClose={() => setDrawerOpen(false)}
                asDrawer
                showTechnical={showTechnical}
                setPrior={setPrior}
                resetPriors={resetPriors}
                toggleDig={toggleDig}
                isDug={selectedId ? !!digsForThisAnalysis[selectedId] : false}
                hasHiddenChildren={selectedId ? nodeHasHiddenChildren(selectedId) : false}
                loadBearing={selectedId ? loadBearing[selectedId] : null}
                conjBayes={selectedId ? conjBayes[selectedId] : null}
                mode="nerd"
              />
            </div>
          </div>
        </section>

        {/* § U · Self-checks on this analysis */}
        <section className="appendix-section">
          <h2 className="appendix-h2"><span className="appendix-num">§U</span>Self-checks on this analysis</h2>
          <p className="appendix-intro">
            Honesty checks that flag patterns known to bias Bayesian truth-seeking — one-sided evidence, asymmetric effort across hypotheses, ungrounded leaves, single-assumption fragility.
          </p>
          <AuditChecklist summary={auditSummary} />
        </section>

        {/* § V · What evidence strengths mean */}
        <section className="appendix-section">
          <h2 className="appendix-h2"><span className="appendix-num">§V</span>What evidence strengths mean</h2>
          <p className="appendix-intro">
            A calibration reference for the likelihood-ratio scale used above. Most evidence is weaker than operators reach for.
          </p>
          <CalibrationReference />
        </section>

        {/* Tribunal record — collapsed accordion of supplementary
            documentation (analyst starting point, fairness audit, source
            walkdown). Only rendered when the entry carries a courtroom
            payload; otherwise these sections render inline as §E, §L, §R
            above. */}
        {analysis.courtroom && (analysis.stage0 || analysis.fairnessAudit || analysis.sourceWalkdown) && (
          <details className="tribunal-record-accordion">
            <summary>Tribunal record — supplementary documentation</summary>
            <div className="tribunal-record-accordion-body">
              {analysis.stage0 && (
                <section className="tribunal-record-accordion-section">
                  <h3>Analyst starting point</h3>
                  <Stage0Panel audit={analysis.stage0} />
                </section>
              )}
              {analysis.fairnessAudit && (
                <section className="tribunal-record-accordion-section">
                  <h3>Fairness audit</h3>
                  <FairnessAuditPanel items={analysis.fairnessAudit} />
                </section>
              )}
              {analysis.sourceWalkdown && (
                <section className="tribunal-record-accordion-section">
                  <h3>Source walkdown</h3>
                  <SourceWalkdown items={analysis.sourceWalkdown} />
                </section>
              )}
            </div>
          </details>
        )}

        {/* Closing strip — tucks the appendix away. Symmetric with the
            "Show me the math" CTA at the bottom of the plain essay. */}
        <div className="appendix-close-strip">
          <button
            type="button"
            className="appendix-close-btn"
            onClick={() => setAppendixOpen(false)}
          >
            Tuck the receipts away <span aria-hidden="true">↑</span>
          </button>
        </div>
      </section>
      )}

      {/* ── More claims to audit — an exploration shelf, not a top-of-page chip strip ── */}
      <ClaimShelf
        samples={SAMPLES}
        activeId={analysisId}
        onLoadSample={loadSample}
      />

      {/* ── Footer with audit stamp (moved from eyebrow into a muted footer) ── */}
      <footer className="app-footer">
        <span className="app-footer-stamp mono">{stamp}</span>
        <span className="app-footer-meta mono">first principles veracity · v0.9</span>
      </footer>
    </>
  );
}

// ClaimShelf — horizontal exploration row at the bottom. Replaces the top-of-page
// sample-chip strip. Frames cross-claim navigation as something the reader does
// after they've finished, not before they've started.
function ClaimShelf({ samples, activeId, onLoadSample }) {
  return (
    <section className="claim-shelf" aria-label="More claims to audit">
      <header className="claim-shelf-head">
        <h3 className="claim-shelf-title">More claims to audit</h3>
        <p className="claim-shelf-sub">Each one is a separate analysis — try one that catches your eye.</p>
      </header>
      <div className="claim-shelf-row" role="list">
        {samples.filter(s => s.id !== activeId).map(s => (
          <button
            key={s.id}
            role="listitem"
            className="claim-shelf-card"
            onClick={() => onLoadSample(s.id)}
            title={s.label}
          >
            <span className="claim-shelf-card-text">{s.label}</span>
            <span className="claim-shelf-card-arrow" aria-hidden="true">→</span>
          </button>
        ))}
      </div>
    </section>
  );
}

// VeracityGauge — moved out of components.jsx because Quick mode no longer needs it.
function VeracityGauge({ range, confidence, claimType, priorsModified }) {
  const [lo, hi] = range;
  const leftPct = lo * 100;
  const widthPct = (hi - lo) * 100;
  return (
    <div className="gauge">
      {priorsModified && (
        <span
          className="priors-modified-stamp gauge-stamp"
          title="Not the default analysis — credence reflects your tuned priors. Reset in the inspector to restore."
        >
          You've tuned this
        </span>
      )}
      <div className="gauge-num">
        <span>{displayRange(range)}</span>
        <span className="pct">P(true)</span>
      </div>
      <div className="gauge-bar">
        <div className="ticks">
          {[0,1,2,3,4,5,6,7,8,9,10].map(i => <div className="tick" key={i} />)}
        </div>
        <div className="range" style={{ left: `${leftPct}%`, width: `${widthPct}%` }} />
      </div>
      <div className="gauge-labels">
        <span>0.0 false</span>
        <span>0.5</span>
        <span>1.0 true</span>
      </div>
      <div className="gauge-caveat">
        Confidence: <span style={{ color: "var(--ink)" }}>{confidence}</span>. Treated as: <span style={{ color: "var(--ink)" }}>{claimType}</span>.
      </div>
    </div>
  );
}

// LoadedTermsTable — renders each loaded word in the claim with its possible meanings
// and the operational meaning we chose for the analysis. Pipe-separated meanings appear
// dimmed below the term; the chosen meaning is bold; the reason is small dim text.
function LoadedTermsTable({ items }) {
  if (!items || items.length === 0) {
    return (
      <div className="loaded-terms-empty mono">
        No loaded-term entries authored for this claim.
      </div>
    );
  }
  return (
    <table className="lab loaded-terms-table">
      <thead>
        <tr>
          <th style={{ width: "26%" }}>Term</th>
          <th>Operational meaning chosen</th>
        </tr>
      </thead>
      <tbody>
        {items.map((it, i) => (
          <tr key={i} className="row loaded-terms-row">
            <td className="loaded-terms-term-cell">
              <div className="loaded-terms-term">"{it.term}"</div>
              <div className="loaded-terms-meanings dim mono">
                possible: {(it.meanings || []).join(" | ")}
              </div>
            </td>
            <td className="loaded-terms-chosen-cell">
              <div className="loaded-terms-chosen">{it.chosen}</div>
              {it.reason && (
                <div className="loaded-terms-reason dim">{it.reason}</div>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
