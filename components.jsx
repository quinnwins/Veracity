// Small shared components — pills, inspector, tables, lists.

const { useState, useEffect, useMemo, useRef, useLayoutEffect, useCallback } = React;

const KIND_LABEL = {
  claim: "Claim",
  subclaim: "Subclaim",
  premise: "Premise",
  atomic: "Atomic",
  prior: "Tunable prior"
};

const TYPE_LABEL = {
  claim: "claim",
  causal: "causal",
  empirical: "empirical",
  statistical: "statistical",
  definition: "definition",
  interpretive: "interpretive",
  source: "source",
  logic: "logic",
  value: "value"
};

// Provenance test: a node is "ungrounded" if it has no evidence basis AND no
// children to inherit grounding from AND no depends pointing to other grounded
// nodes. Used by the Inspector to flag claims that float without primary
// source support — the operator can't track them back to anything.
function isUngrounded(node, analysis) {
  if (!node) return false;
  if (node.evidence && String(node.evidence).trim()) return false;
  // Has children that could carry the provenance?
  const hasChildren = Object.values(analysis.nodes || {}).some(n => n.parent === node.id);
  if (hasChildren) return false;
  // Depends references that point at grounded nodes?
  if (Array.isArray(node.depends) && node.depends.length > 0) {
    const someGrounded = node.depends.some(id => {
      const dep = analysis.nodes?.[id];
      return dep && dep.evidence && String(dep.evidence).trim();
    });
    if (someGrounded) return false;
  }
  return true;
}

// Falsifiability test: a node is "low-falsifiability" if it has neither a
// verification path nor a clear "what would change it" — meaning no observation
// is named that could disconfirm it. Also flags explicit unfalsifiability
// language. Truth-seeking requires that every claim node names what would
// disconfirm it; unfalsifiable claims get their LR compressed toward 1.
function isLowFalsifiability(node) {
  if (!node) return false;
  const hasVerif = node.verification && String(node.verification).trim();
  const hasChanges = node.changes && String(node.changes).trim();
  if (!hasVerif && !hasChanges) return true;
  const txt = `${node.verification || ""} ${node.changes || ""}`.toLowerCase();
  if (/\bunfalsifiable\b|\bnot falsifiable\b|\bno observation\b|cannot be (tested|disproven|falsified)/.test(txt)) {
    return true;
  }
  return false;
}

const fmtRange = (value) => (window.formatRange
  ? window.formatRange(value)
  : `${Math.round(value[0] * 100)}-${Math.round(value[1] * 100)}%`);

// Mode-aware estimate text. In plain mode, collapses [lo, hi] to the midpoint
// (e.g. "75%"). In nerd mode, keeps the full range (e.g. "60-90%"). The owner's
// research found that ranges break the reader's flow on casual surfaces;
// nerd mode is where the spread carries meaning.
const fmtEstimate = (value, mode) => {
  if (window.pointEstimate) {
    return window.pointEstimate(value, { mode: mode === "nerd" ? "nerd" : "plain" }).text;
  }
  return fmtRange(value);
};

const truncate = (s, n) => {
  if (!s) return "";
  const t = String(s);
  return t.length > n ? t.slice(0, n - 1).replace(/\s+$/, "") + "…" : t;
};

function ConfPill({ value }) {
  if (!value) return null;
  return <span className={`conf-pill ${value.toLowerCase()}`}>{value}</span>;
}

function EstimatePill({ value, mode }) {
  if (!value) return null;
  return <span className="estimate-pill">{fmtEstimate(value, mode)}</span>;
}

function TypeBadge({ value }) {
  if (!value) return null;
  return <span className="node-type-badge">{TYPE_LABEL[value] || value}</span>;
}

function WeakFlag({ short }) {
  return <span className="weak-flag">{short ? "weak" : "weak premise"}</span>;
}

// ── Inspector ───────────────────────────────────────────────
function Inspector({ node, analysis, onJump, onClose, asDrawer, showTechnical, setPrior, resetPriors, toggleDig, isDug, hasHiddenChildren, loadBearing, conjBayes, mode }) {
  if (!node) {
    return (
      <div>
        <div className="section-label">Inspector <span className="num">— nothing selected</span></div>
        <InspectorPrimer analysis={analysis} onSelect={onJump} />
        <div style={{ marginTop: 4 }}>
          <div className="section-label">Reasoning rules</div>
          <ul className="notes-list">
            <li>Use probability ranges, not point estimates.</li>
            <li>Separate facts from values; flag value-laden premises.</li>
            <li>Surface what evidence would change the conclusion.</li>
            <li>Tunable priors can be adjusted; the credence updates live.</li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div>
      {asDrawer && (
        <div
          className="drawer-grab"
          onClick={onClose}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onClose();
            }
          }}
          tabIndex={0}
          role="button"
          aria-label="Close inspector"
        />
      )}
      <div className="insp-id-row">
        <span className="insp-id" title={node.id}>
          {showTechnical ? `${node.id} · ${KIND_LABEL[node.kind]}` : KIND_LABEL[node.kind]}
          {!showTechnical && mode === "deep" && <span className="insp-id-faint"> · {node.id}</span>}
        </span>
        {showTechnical && <span className="insp-kind">{TYPE_LABEL[node.type] || node.type}</span>}
      </div>
      <p className="insp-text">{node.text}</p>

      {/* Why this matters — leading the inspector */}
      {node.role && (
        <div className="insp-why">
          <div className="insp-why-label">Why this matters</div>
          <p className="insp-why-text">{node.role}</p>
        </div>
      )}

      {node.weak && (
        <div className="insp-flag">
          <span className="dotpad" />
          Materially limits the conclusion. See <em>What would change it</em> below.
        </div>
      )}

      {loadBearing && (
        <div className="insp-flag load-bearing" title="This node alone can move the C0 midpoint this far from its authored baseline. Above 0.15 the node is structurally load-bearing — the credence depends materially on this single authored value.">
          <span className="dotpad" />
          <div>
            <strong>Decides alone.</strong> This one assumption alone can shift the answer by{" "}
            <span className="mono">{Math.round(loadBearing.swing * 100)} pts</span>
            {" "}from the baseline of <span className="mono">{Math.round(loadBearing.baseMid * 100)}%</span>
            {" "}(→ <span className="mono">{Math.round(loadBearing.lowMid * 100)}%</span> if set to 0,
            {" "}<span className="mono">{Math.round(loadBearing.highMid * 100)}%</span> if set to 1).
            Verify the evidence beneath this node — the answer should not rest on one assumption.
          </div>
        </div>
      )}

      <div className="insp-pill-row">
        <EstimatePill value={node.estimate} mode={mode} />
        <ConfPill value={node.confidence} />
        {showTechnical && node.type && <span className="tag">{TYPE_LABEL[node.type]}</span>}
        {node.evidenceStatus && <span className={`evidence-badge es-${node.evidenceStatus.replace(/[^a-z]/g, "")}`}>{node.evidenceStatus}</span>}
        {conjBayes && Array.isArray(node.estimate) && (() => {
          const auMid = (node.estimate[0] + node.estimate[1]) / 2;
          const cbMid = (conjBayes[0] + conjBayes[1]) / 2;
          const delta = Math.abs(auMid - cbMid);
          const diverges = delta >= 0.15;
          return (
            <span
              className={`tag conj-bayes-pill${diverges ? " diverges" : ""}`}
              title={`Sub-pieces check from this node's children: ${Math.round(conjBayes[0]*100)}–${Math.round(conjBayes[1]*100)}%. ${diverges ? "Diverges from our estimate by " + Math.round(delta*100) + " pts — children's product doesn't support the credence on this node, suggesting correlation, disjunction, or external anchoring." : "Matches our estimate within tolerance."}`}
            >
              Sub-pieces check · {Math.round(conjBayes[0]*100)}–{Math.round(conjBayes[1]*100)}%{diverges ? ` · ${Math.round(delta*100)} pts off` : ""}
            </span>
          );
        })()}
        {loadBearing && (
          <span
            className="tag load-bearing-pill"
            title={`Sliding this prior 0→1 swings the C0 midpoint by ${Math.round(loadBearing.swing*100)} points — enough to flip the credence band.`}
          >
            decides alone · {Math.round(loadBearing.swing*100)} pts
          </span>
        )}
        {isUngrounded(node, analysis) && (
          <span
            className="tag ungrounded-pill"
            title="No evidence basis and no grounded children. The claim isn't traceable to primary support — a truth-seeking engine treats this as a placeholder, not a fact."
          >
            no source cited
          </span>
        )}
        {isLowFalsifiability(node) && (
          <span
            className="tag low-falsifiability-pill"
            title="No observation is named that would disconfirm this claim. Unfalsifiable claims contribute LR ≈ 1 to the posterior — they should not drive the credence."
          >
            can't be tested
          </span>
        )}
      </div>

      {node.tunable && setPrior && (
        <PriorSlider node={node} setPrior={setPrior} resetPriors={resetPriors} />
      )}

      {node.priorRationale && (
        <Stat label="Why this default" value={node.priorRationale} />
      )}

      {hasHiddenChildren && toggleDig && (
        <DigDeeper isDug={isDug} onToggle={() => toggleDig(node.id)} />
      )}

      <Stat label="How it would be checked" value={node.verification} />
      <Stat label="Evidence basis" value={node.evidence} />
      <Stat label="What would change it" value={node.changes} highlight={node.weak} />
      {showTechnical && <Stat label="Bias risk" value={node.bias} />}

      {node.depends && node.depends.length > 0 && (
        <div className="insp-stat-block">
          <div className="insp-stat-label">Depends on</div>
          <div className="insp-deps">
            {node.depends.map(id => {
              const target = analysis.nodes[id];
              if (!target) return null;
              const label = showTechnical
                ? id
                : (mode === "deep"
                    ? `${KIND_LABEL[target.kind] || ""} · ${id}`
                    : `${KIND_LABEL[target.kind] || ""}: ${truncate(target.text, 36)}`);
              return (
                <button key={id} onClick={() => onJump(id)} title={target.text}>
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {node.parent && (() => {
        const target = analysis.nodes[node.parent];
        if (!target) return null;
        const label = showTechnical
          ? node.parent
          : (mode === "deep"
              ? `${KIND_LABEL[target.kind] || ""} · ${node.parent}`
              : `${KIND_LABEL[target.kind] || ""}: ${truncate(target.text, 36)}`);
        return (
          <div className="insp-stat-block">
            <div className="insp-stat-label">Parent</div>
            <div className="insp-deps">
              <button onClick={() => onJump(node.parent)} title={target.text}>
                {label}
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// Dig-deeper toggle — exposes hidden sub-assumptions when the analyst's stopping point
// isn't deep enough for this user.
function DigDeeper({ isDug, onToggle }) {
  return (
    <div className={`dig-deeper${isDug ? " on" : ""}`}>
      <div className="dig-deeper-row">
        <div className="dig-deeper-text">
          {isDug
            ? "Deeper assumptions are visible. They participate in propagation."
            : "Hidden depth: this assumption rests on further sub-assumptions you can interrogate."}
        </div>
        <button className="dig-deeper-btn" onClick={onToggle}>
          {isDug ? "Collapse" : "Dig deeper →"}
        </button>
      </div>
      <div className="dig-deeper-note">
        Digging reveals the analyst's deeper priors so you can attack them; collapsing hides them and uses the parent's default.
      </div>
    </div>
  );
}

// Slider for tunable priors. Two range inputs (lo and hi); on change, calls setPrior.
function PriorSlider({ node, setPrior, resetPriors }) {
  const [lo, hi] = node.estimate || node.prior || [0.5, 0.5];
  const defaultRange = node.prior || [0.5, 0.5];
  const onLo = (e) => {
    const newLo = Math.min(parseFloat(e.target.value), hi);
    setPrior(node.id, [newLo, hi]);
  };
  const onHi = (e) => {
    const newHi = Math.max(parseFloat(e.target.value), lo);
    setPrior(node.id, [lo, newHi]);
  };
  const onReset = () => setPrior(node.id, defaultRange);
  const isModified = lo !== defaultRange[0] || hi !== defaultRange[1];
  return (
    <div className="prior-slider">
      <div className="prior-slider-head">
        <span className="prior-slider-label">Adjust this prior</span>
        <span className="prior-slider-current">{lo.toFixed(2)}–{hi.toFixed(2)}</span>
        {isModified && (
          <button className="prior-slider-reset" onClick={onReset} title="Reset to default">reset</button>
        )}
      </div>
      <div className="prior-slider-row">
        <span className="prior-slider-rowlabel">Lower bound</span>
        <input type="range" min="0" max="1" step="0.01" value={lo} onChange={onLo} aria-label="Lower prior bound" />
        <span className="prior-slider-rowvalue">{lo.toFixed(2)}</span>
      </div>
      <div className="prior-slider-row">
        <span className="prior-slider-rowlabel">Upper bound</span>
        <input type="range" min="0" max="1" step="0.01" value={hi} onChange={onHi} aria-label="Upper prior bound" />
        <span className="prior-slider-rowvalue">{hi.toFixed(2)}</span>
      </div>
      <div className="prior-slider-note">
        Move the slider to test how this assumption affects the credence. Default: {defaultRange[0].toFixed(2)}–{defaultRange[1].toFixed(2)}.
      </div>
    </div>
  );
}

function Stat({ label, value, mono, highlight }) {
  if (!value) return null;
  return (
    <div className={`insp-stat-block${highlight ? " hot" : ""}`}>
      <div className="insp-stat-label">{label}</div>
      <div className={`insp-stat-value${mono ? " mono" : ""}`}>{value}</div>
    </div>
  );
}

// ── Premises table ────────────────────────────────────────
function PremisesTable({ analysis, selectedId, onSelect, level, showTechnical, mode }) {
  // level = "key" (subclaims + flagged-weak premises) or "atomic" (everything below the claim)
  const all = Object.values(analysis.nodes);
  const rows = level === "atomic"
    ? all.filter(n => n.kind !== "claim")
    : all.filter(n => n.kind === "subclaim" || (n.kind === "premise" && n.weak));

  rows.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  const selectOnActionKey = (e, id) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(id);
    }
  };
  const showIds = showTechnical || mode === "deep";

  return (
    <table className="lab">
      <thead>
        <tr>
          <th>Level</th>
          <th>Statement</th>
          {showTechnical && <th>Type</th>}
          <th>P(true)</th>
          <th>Conf.</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {rows.map(n => (
          <tr
            key={n.id}
            className={`row${n.weak ? " weak" : ""}${n.id === selectedId ? " on" : ""}`}
            onClick={() => onSelect(n.id)}
            onKeyDown={(e) => selectOnActionKey(e, n.id)}
            tabIndex={0}
            aria-label={`Inspect ${n.id}: ${n.text}`}
            title={n.id}
          >
            <td className="id" style={{ whiteSpace: "nowrap" }}>
              <span style={{ color: "var(--ink-2)" }}>{KIND_LABEL[n.kind]}</span>
              {showIds && <span style={{ color: "var(--muted-2)", marginLeft: 6 }}>{n.id}</span>}
            </td>
            <td>{n.text}</td>
            {showTechnical && <td><span className="tag">{TYPE_LABEL[n.type] || n.type}</span></td>}
            <td className="mono">{n.estimate ? fmtRange(n.estimate) : "—"}</td>
            <td><span className={`tbl-conf ${(n.confidence||"").toLowerCase()}`}>{n.confidence || "—"}</span></td>
            <td>{n.weak ? <span className="tag weak">weak</span> : ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Stress test ──────────
function StressList({ items }) {
  return (
    <div>
      {items.map((s, i) => (
        <div className="stress-row" key={i}>
          <div className="stress-perturb">{s.perturb}</div>
          <div className="stress-effect">{s.effect}</div>
        </div>
      ))}
    </div>
  );
}

// ── Hypotheses ──────────
// Conjunctive Bayes for an alternative hypothesis from its decomposition.
// Returns [lo, hi] = product of children's estimate endpoints, or null if no
// decomposition is present.
function altConjBayes(h) {
  if (!Array.isArray(h.decomposition) || h.decomposition.length === 0) return null;
  let lo = 1, hi = 1;
  for (const sub of h.decomposition) {
    if (!Array.isArray(sub.estimate) || sub.estimate.length !== 2) return null;
    lo *= sub.estimate[0];
    hi *= sub.estimate[1];
  }
  return [lo, hi];
}

function HypothesesList({ items, evidenceBudget }) {
  const supportPct = (s) => ({
    "High": 90, "Medium-High": 70, "Medium": 50, "Low-Medium": 35, "Low": 18, "Very Low": 8
  })[s] || 50;
  // Compute proper Bayesian posterior across the hypothesis space if any
  // evidence item carries lrPerH data. Otherwise the support labels are the
  // only honest signal available.
  const bayesPosteriors = window.computeHypothesisPosterior
    ? window.computeHypothesisPosterior(items, evidenceBudget)
    : null;
  const byId = {};
  if (bayesPosteriors) {
    for (let i = 0; i < bayesPosteriors.length; i++) {
      byId[bayesPosteriors[i].id || `H${i}`] = bayesPosteriors[i];
    }
  }
  const anyDecomposed = items.some(h => Array.isArray(h.decomposition) && h.decomposition.length > 0);
  return (
    <div>
      {bayesPosteriors && (
        <div className="hyp-bayes-meta mono"
             title="Bayesian posterior distribution over competing hypotheses. Computed from per-hypothesis LRs declared on evidence items, starting from uniform priors. Replaces hand-assigned 'support' labels with a normalized probability distribution (sums to 100%).">
          Bayesian posterior over hypotheses · uniform prior · normalized
        </div>
      )}
      {anyDecomposed && (
        <div className="hyp-decomp-meta mono"
             title="Each alternative below is decomposed into its own subclaim tree — satisfying the symmetric-effort gate. The per-alternative conjBayes (product of subclaim credences under independence) is shown alongside the operator's hand-assigned support label.">
          Alternatives decomposed · per-hypothesis conjunctive Bayes shown
        </div>
      )}
      {items.map((h, i) => {
        const id = h.id || `H${i}`;
        const post = byId[id];
        const cb = altConjBayes(h);
        return (
          <div className="hyp-row" key={i}>
            <div className="hyp-text">
              {h.h}
              {post && (() => {
                // Cromwell display floor: a 0.0% posterior reads as "ruled out",
                // which truth-seeking forbids. Render `<0.5%` below the floor.
                const fmtP = window.formatPercent
                  ? window.formatPercent(post.posterior, { decimals: 1 })
                  : `${(post.posterior*100).toFixed(1)}%`;
                return (
                  <span className="hyp-bayes-pct mono"
                        title={`Bayesian posterior probability of this hypothesis given the declared evidence: ${fmtP}. Hand-assigned support label was "${h.support}".`}>
                    {fmtP}
                  </span>
                );
              })()}
              {cb && (() => {
                // Cromwell display floor on the lower bound: if the subclaim
                // product rounds to 0% it should read `<0.5%`, not "ruled out".
                const cbLo = (cb[0] > 0 && cb[0] < 0.005) ? "<0.5%" : `${Math.round(cb[0]*100)}%`;
                const cbHi = `${Math.round(cb[1]*100)}%`;
                return (
                  <span className="hyp-conjbayes-pct mono"
                        title={`Conjunctive Bayes from this hypothesis's own subclaim tree: ${cbLo}–${cbHi}. Product of subclaim credences under independence. Separate from the cross-hypothesis Bayesian posterior — this measures the internal coherence of the alternative's decomposition.`}>
                    cb {cbLo}–{cbHi}
                  </span>
                );
              })()}
            </div>
            <div>
              <div className="hyp-bar">
                <div className="fill" style={{ width: `${supportPct(h.support)}%` }} />
              </div>
              <div className="hyp-support">{h.support}</div>
              {post && (
                <div className="hyp-bayes-bar"
                     title="Bayesian posterior probability bar — distinct from the hand-assigned support label above. Bayesian computation may disagree with the authored support; that disagreement is the honest signal.">
                  <div className="bayes-fill" style={{ width: `${post.posterior*100}%` }} />
                </div>
              )}
            </div>
            {h.note && <div className="hyp-note">{h.note}</div>}
            {Array.isArray(h.decomposition) && h.decomposition.length > 0 && (
              <ul className="hyp-decomp-list">
                {h.decomposition.map((sub, j) => (
                  <li key={j} className="hyp-decomp-item">
                    <span className="hyp-decomp-text">{sub.text}</span>
                    {Array.isArray(sub.estimate) && (
                      <span className="hyp-decomp-est mono">
                        {Math.round(sub.estimate[0]*100)}–{Math.round(sub.estimate[1]*100)}%
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Ledger ──────────
function Ledger({ items }) {
  return (
    <div>
      {items.map((it, i) => (
        <div className="ledger-row" key={i}>
          <div className="ledger-kind">{it.kind}</div>
          <div>
            <div className="ledger-text">{it.item}</div>
            {it.risk && <div className="ledger-note">{it.risk}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Evidence budget ──────────
// Classify a direction string into one of: for, against, mixed, unknown.
// Used by the one-sided-evidence alarm to detect when the evidence search
// has been biased toward one direction — a common failure mode where the
// operator only enumerated observations that would update one way.
function classifyDirection(d) {
  if (!d) return "unknown";
  const s = String(d).toLowerCase();
  const hasFor = /\bfor\b/.test(s);
  const hasAgainst = /\bagainst\b/.test(s);
  if (hasFor && hasAgainst) return "mixed";
  if (hasFor) return "for";
  if (hasAgainst) return "against";
  if (/mixed|neutral|contested|split/.test(s)) return "mixed";
  return "unknown";
}

function EvidenceBudget({ items, authoredEstimate, priorRange }) {
  const weightTo = w => ({ high: 3, medium: 2, low: 1 })[w] || 1;
  const [groupByCustody, setGroupByCustody] = useState(false);
  const custodyCount = items.filter(e => e && e.custodyTier).length;
  // Stable sort by custody tier (A < B < C < D, items without a tier last).
  // Within a tier, preserve the authored order so the reader sees the LR
  // chain the way the operator wrote it.
  const tierOrder = { A: 0, B: 1, C: 2, D: 3 };
  const orderedItems = (groupByCustody && custodyCount > 0)
    ? items.map((e, i) => ({ e, i }))
        .sort((a, b) => {
          const ta = tierOrder[a.e.custodyTier] != null ? tierOrder[a.e.custodyTier] : 99;
          const tb = tierOrder[b.e.custodyTier] != null ? tierOrder[b.e.custodyTier] : 99;
          if (ta !== tb) return ta - tb;
          return a.i - b.i;
        })
        .map(x => x.e)
    : items;
  // Use the operator-provided prior if available; otherwise a neutral [0.4, 0.6]
  // prior that isolates "what do the LRs alone imply." Neutral is the right default
  // because a Bayesian sanity-check should not be anchored to the operator's
  // prior — that would defeat the purpose of comparing authored vs LR-derived.
  const lrPrior = priorRange && Array.isArray(priorRange) ? priorRange : [0.4, 0.6];
  const lrCount = window.countLrItems ? window.countLrItems(items) : 0;
  const lrPosterior = lrCount > 0 && window.lrPosteriorRange
    ? window.lrPosteriorRange(lrPrior, items)
    : null;
  // Discrepancy alarm: if the LR-derived posterior midpoint diverges from the
  // authored estimate midpoint by >15 pts, the authored estimate isn't supported
  // by the declared evidence — operator's prior is doing more work than the LRs.
  let discrepancy = null;
  if (lrPosterior && Array.isArray(authoredEstimate) && authoredEstimate.length === 2) {
    const lrMid = (lrPosterior[0] + lrPosterior[1]) / 2;
    const auMid = (authoredEstimate[0] + authoredEstimate[1]) / 2;
    const delta = Math.abs(lrMid - auMid);
    if (delta >= 0.15) discrepancy = { delta, lrMid, auMid };
  }

  // Weighted tally for the one-sided alarm. Weight scales: high=3, medium=2, low=1.
  // We count "for" vs "against" entries by weight; "mixed" and "unknown" are
  // shown but excluded from the ratio because they don't pick a side.
  let weightedFor = 0, weightedAgainst = 0, mixedCount = 0;
  for (const e of items) {
    const cls = classifyDirection(e.direction);
    const w = weightTo(e.weight);
    if (cls === "for") weightedFor += w;
    else if (cls === "against") weightedAgainst += w;
    else if (cls === "mixed") mixedCount += 1;
  }
  const totalSided = weightedFor + weightedAgainst;
  const forShare = totalSided > 0 ? weightedFor / totalSided : null;
  // Trigger at 80% one-sided OR when there are at least 3 sided entries and
  // ALL of them lean one way (catches the case where the search returned
  // zero counter-evidence, even at small N).
  let alarm = null;
  if (totalSided >= 3 && weightedAgainst === 0) {
    alarm = { side: "for", forShare: 1, severity: "high", reason: "zero counter-evidence weighted" };
  } else if (totalSided >= 3 && weightedFor === 0) {
    alarm = { side: "against", forShare: 0, severity: "high", reason: "zero supporting evidence weighted" };
  } else if (forShare !== null && forShare >= 0.80) {
    alarm = { side: "for", forShare, severity: "moderate", reason: ">=80% of weighted evidence favors C0" };
  } else if (forShare !== null && forShare <= 0.20) {
    alarm = { side: "against", forShare, severity: "moderate", reason: ">=80% of weighted evidence opposes C0" };
  }

  return (
    <>
      {alarm && (
        <div className={`evidence-asymmetry-alarm sev-${alarm.severity}`}
             title="The evidence search appears one-sided. Bayesian honesty requires symmetric collection: enumerate observations expected under both H and ¬H, and search equally hard for each. Operator should verify counter-evidence was actually looked for, not just absent.">
          <span className="evidence-asymmetry-dot" />
          <div>
            <strong>One-sided evidence search.</strong>{" "}
            {alarm.severity === "high"
              ? <>No counter-evidence in the budget (weighted total {alarm.side === "for" ? weightedFor : weightedAgainst}{" "}
                  {alarm.side === "for" ? "for" : "against"}, 0 against the other side).</>
              : <>Roughly {Math.round((alarm.side === "for" ? alarm.forShare : 1 - alarm.forShare) * 100)}% of weighted evidence points {alarm.side === "for" ? "for" : "against"} C0.</>
            }
            {" "}Verify that observations under ¬H were genuinely searched for, not just absent.
          </div>
        </div>
      )}
      <div className="evidence-budget-meta mono">
        weighted: {weightedFor} for / {weightedAgainst} against / {mixedCount} mixed
        {lrCount > 0 && <> · {lrCount}/{items.length} with LR</>}
      </div>
      {lrPosterior && (
        <div className={`lr-posterior-panel${discrepancy ? " discrepancy" : ""}`}
             title="Likelihood-ratio posterior: starting from the analysis priorRange when authored (or a neutral 40-60% default), multiply odds by each item's LR. Compares to authored estimate; large divergence means the authored estimate is not fully supported by the declared evidence.">
          <div className="lr-posterior-row">
            <div>
              <div className="lr-posterior-label">Bayesian posterior from declared LRs</div>
              <div className="lr-posterior-value mono">{window.formatRange ? window.formatRange(lrPosterior) : `${Math.round(lrPosterior[0]*100)}–${Math.round(lrPosterior[1]*100)}%`}</div>
              <div className="lr-posterior-prior mono">from prior {Math.round(lrPrior[0]*100)}–{Math.round(lrPrior[1]*100)}%</div>
            </div>
            {Array.isArray(authoredEstimate) && authoredEstimate.length === 2 && (
              <div>
                <div className="lr-posterior-label">Compare: authored C0</div>
                <div className="lr-posterior-value mono">{window.formatRange ? window.formatRange(authoredEstimate) : `${Math.round(authoredEstimate[0]*100)}–${Math.round(authoredEstimate[1]*100)}%`}</div>
                {discrepancy && (
                  <div className="lr-posterior-delta mono">
                    Δ {Math.round(discrepancy.delta*100)} pts — author's prior diverges from LRs
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {custodyCount > 0 && (
        <div className="evidence-budget-controls">
          <label title="Group rows by chain-of-custody tier (A→D). Items without a custodyTier sort last.">
            <input
              type="checkbox"
              checked={groupByCustody}
              onChange={(e) => setGroupByCustody(e.target.checked)}
            />
            <span>Group by custody tier</span>
          </label>
          <span className="dim">· {custodyCount}/{items.length} items carry a custody tier</span>
        </div>
      )}
      <table className="lab">
        <thead>
          <tr>
            <th>Source</th>
            <th>Weight</th>
            <th>Direction</th>
            {custodyCount > 0 && <th>Custody</th>}
            {lrCount > 0 && <th>LR</th>}
          </tr>
        </thead>
        <tbody>
          {(() => {
            const rows = [];
            let lastTier = null;
            orderedItems.forEach((e, i) => {
              const cls = classifyDirection(e.direction);
              const lrText = typeof e.lrLow === "number" && typeof e.lrHigh === "number"
                ? `${e.lrLow}–${e.lrHigh}`
                : (typeof e.lr === "number" ? `${e.lr}` : null);
              const tier = e.custodyTier || null;
              if (groupByCustody && custodyCount > 0 && tier !== lastTier) {
                const colspan = 3 + (custodyCount > 0 ? 1 : 0) + (lrCount > 0 ? 1 : 0);
                rows.push(
                  <tr key={`hdr-${tier || "none"}-${i}`} className="evidence-budget-tier-row">
                    <td colSpan={colspan}>
                      {tier ? `Tier ${tier}` : "No custody tier declared"}
                    </td>
                  </tr>
                );
                lastTier = tier;
              }
              rows.push(
                <tr key={i}>
                  <td>{e.item}</td>
                  <td>
                    {Array.from({ length: 3 }).map((_, k) => (
                      <span key={k} style={{
                        display: "inline-block", width: 8, height: 8, marginRight: 2,
                        border: "1px solid var(--line-strong)",
                        background: k < weightTo(e.weight) ? "var(--ink)" : "var(--paper)"
                      }} />
                    ))}
                  </td>
                  <td>
                    <span className={`tag direction-${cls}`}>
                      {e.direction}
                    </span>
                  </td>
                  {custodyCount > 0 && (
                    <td>
                      {tier && window.CustodyBadge
                        ? <window.CustodyBadge tier={tier} discount={e.custodyDiscount} note={e.custodyNote} compact />
                        : <span className="muted">—</span>}
                    </td>
                  )}
                  {lrCount > 0 && (
                    <td className="mono lr-cell">
                      {lrText !== null ? lrText : <span className="muted">—</span>}
                    </td>
                  )}
                </tr>
              );
            });
            return rows;
          })()}
        </tbody>
      </table>
    </>
  );
}

function NotesList({ items }) {
  return (
    <ol className="notes-list">
      {items.map((n, i) => <li key={i}>{n}</li>)}
    </ol>
  );
}

// ════════════════════════════════════════════════════════════
// AI Courtroom widgets — adversarial tribunal surface.
// Each component is a pure render of part of an analysis.courtroom
// payload. They check for field existence and silently render null
// when absent so entries without a courtroom field aren't broken.
// ════════════════════════════════════════════════════════════

// CustodyBadge — small inline pill annotating an evidence row with its
// chain-of-custody tier (A=cleanest, D=testimony). Used by both the
// CustodyLadder header and EvidenceBudget rows in Show-the-math mode.
function CustodyBadge({ tier, discount, note, compact }) {
  if (!tier) return null;
  const discountText = typeof discount === "number" ? `· ${discount.toFixed(2)}` : "";
  return (
    <span className="custody-badge" data-tier={tier} title={note || `Custody tier ${tier}`}>
      <span>{compact ? tier : `Tier ${tier}`}</span>
      {discountText && <span className="custody-badge-discount">{discountText}</span>}
    </span>
  );
}

// CustodyLadder — 4-column horizontal strip showing the chain-of-custody tiers
// (A through D) with their discount ranges and a handful of examples per tier.
// Renders nothing if the ladder is missing or malformed.
function CustodyLadder({ ladder }) {
  if (!ladder || typeof ladder !== "object") return null;
  const order = ["A", "B", "C", "D"];
  const cols = order.filter(k => ladder[k]);
  if (cols.length === 0) return null;
  const MAX_EXAMPLES = 4;
  return (
    <div className="courtroom-custody-ladder">
      {cols.map(key => {
        const tier = ladder[key];
        const examples = Array.isArray(tier.examples) ? tier.examples : [];
        const shown = examples.slice(0, MAX_EXAMPLES);
        const remaining = examples.length - shown.length;
        const dr = Array.isArray(tier.discountRange) && tier.discountRange.length === 2
          ? `${tier.discountRange[0].toFixed(2)}–${tier.discountRange[1].toFixed(2)}`
          : "";
        return (
          <div key={key} className={`courtroom-custody-tier courtroom-custody-tier--${key}`}>
            <div className="courtroom-custody-tier-head">
              <span className="courtroom-custody-tier-name">Tier {key} · {tier.name}</span>
              {dr && <span className="courtroom-custody-tier-discount">{dr}</span>}
            </div>
            {tier.description && <div className="courtroom-custody-tier-desc">{tier.description}</div>}
            {shown.length > 0 && (
              <ul className="courtroom-custody-tier-examples">
                {shown.map((ex, i) => <li key={i}>{ex}</li>)}
              </ul>
            )}
            {remaining > 0 && (
              <div className="courtroom-custody-tier-more">+{remaining} more</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// SocraticRound — a single round of the prosecution/defense/verdict triplet.
// Controlled by the parent: `expanded` and `onToggle` come from a useState in
// the panel. Collapsed shows a single-line italic summary (first sentence of
// the verdict) so the reader can scan all five rounds without scrolling them
// open one by one.
function SocraticRound({ round, expanded, onToggle }) {
  if (!round) return null;
  const summary = (() => {
    const v = round.verdict || "";
    const m = v.match(/^[^.]+\./);
    return m ? m[0] : v.slice(0, 140);
  })();
  return (
    <div className="courtroom-round" data-expanded={expanded ? "true" : "false"}>
      <button
        type="button"
        className="courtroom-round-head"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <span className="courtroom-round-num">Round {round.round}</span>
        <span className="courtroom-round-q">{round.question}</span>
        <span className="courtroom-round-chev" aria-hidden="true">›</span>
      </button>
      {expanded ? (
        <div className="courtroom-round-body">
          <div className="courtroom-lane courtroom-lane--prosecution">
            <div className="courtroom-lane-label">Prosecution submits</div>
            <div>{round.prosecution}</div>
          </div>
          <div className="courtroom-lane courtroom-lane--defense">
            <div className="courtroom-lane-label">Defense submits</div>
            <div>{round.defense}</div>
          </div>
          <div className="courtroom-lane courtroom-lane--verdict">
            <div className="courtroom-lane-label">Tribunal verdict</div>
            <div>{round.verdict}</div>
          </div>
        </div>
      ) : (
        summary && <div className="courtroom-round-summary">{summary}</div>
      )}
    </div>
  );
}

// StipulatedFactsList — green-bordered bullets, things both sides agree on.
function StipulatedFactsList({ items }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <ul className="courtroom-stipulated-list">
      {items.map((s, i) => <li key={i}>{s}</li>)}
    </ul>
  );
}

// ContestedZonesList — amber-bordered bullets, things both sides disagree on.
function ContestedZonesList({ items }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <ul className="courtroom-contested-list">
      {items.map((c, i) => <li key={i}>{c}</li>)}
    </ul>
  );
}

// FloorCeilingBand — SVG band chart showing how the credence floor moves as
// each evidence tier is added in, with markers for the defense hard floor
// and the prosecution upper canon. Numbers are domain-specific, and the chart
// auto-scales from the data.
function FloorCeilingBand({ floor, ceiling, unit }) {
  if (!floor || typeof floor !== "object") return null;
  const bandKeys = ["underTierAOnly", "underTierAPlusB", "underFullCanon"];
  const bandLabels = {
    underTierAOnly: "Tier A only",
    underTierAPlusB: "Tier A + B",
    underFullCanon: "Full canon"
  };
  const bandColors = {
    underTierAOnly: "var(--court-band-tierA)",
    underTierAPlusB: "var(--court-band-tierAB)",
    underFullCanon: "var(--court-band-tierFull)"
  };
  const bands = bandKeys
    .map(k => ({ key: k, ...floor[k] }))
    .filter(b => Array.isArray(b.range) && b.range.length === 2);
  if (bands.length === 0) return null;

  const hardFloor = floor.defenseHardFloor;
  const upperCanon = floor.prosecutionUpperCanon;
  const allVals = [];
  bands.forEach(b => allVals.push(b.range[0], b.range[1]));
  if (hardFloor && typeof hardFloor.value === "number") allVals.push(hardFloor.value);
  if (upperCanon && typeof upperCanon.value === "number") allVals.push(upperCanon.value);
  const dataMin = Math.min(...allVals);
  const dataMax = Math.max(...allVals);
  const pad = Math.max(0.1, (dataMax - dataMin) * 0.10);
  const axisMin = Math.floor((dataMin - pad) * 10) / 10;
  const axisMax = Math.ceil((dataMax + pad) * 10) / 10;
  const W = 600, H = 180;
  const padL = 80, padR = 40, padT = 18, padB = 50;
  const x = v => padL + ((v - axisMin) / (axisMax - axisMin)) * (W - padL - padR);
  const bandH = 22;
  const bandGap = 8;
  const bandsStartY = padT + 8;

  const ticks = [];
  const step = (axisMax - axisMin) / 5;
  for (let i = 0; i <= 5; i++) {
    const v = axisMin + step * i;
    ticks.push(v);
  }
  const fmtTick = v => unit === "M" ? `${v.toFixed(1)}M` : v.toFixed(2);

  return (
    <div className="courtroom-band-chart">
      <div className="courtroom-band-chart-title">Floor and ceiling — credence by evidence tier</div>
      <svg className="courtroom-band-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Floor and ceiling band chart">
        {/* Axis baseline */}
        <line x1={padL} x2={W - padR} y1={H - padB} y2={H - padB} stroke="var(--line-strong)" strokeWidth="1" />
        {/* Tick marks + labels */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={x(t)} x2={x(t)} y1={H - padB} y2={H - padB + 4} stroke="var(--line-strong)" strokeWidth="1" />
            <text x={x(t)} y={H - padB + 18} textAnchor="middle" fontSize="11" fontFamily="var(--font-mono)" fill="var(--muted)">
              {fmtTick(t)}
            </text>
          </g>
        ))}
        {/* Bands */}
        {bands.map((b, i) => {
          const y = bandsStartY + i * (bandH + bandGap);
          const xLo = x(b.range[0]);
          const xHi = x(b.range[1]);
          const cx = typeof b.central === "number" ? x(b.central) : null;
          return (
            <g key={b.key}>
              <title>{b.basis || ""}</title>
              <rect x={xLo} y={y} width={Math.max(2, xHi - xLo)} height={bandH}
                    fill={bandColors[b.key]} stroke="var(--line-strong)" strokeWidth="0.5" />
              {cx !== null && (
                <line x1={cx} x2={cx} y1={y - 2} y2={y + bandH + 2}
                      stroke="var(--court-verdict-accent)" strokeWidth="1.2" />
              )}
              <text x={padL - 6} y={y + bandH / 2 + 4} textAnchor="end" fontSize="11"
                    fontFamily="var(--font-mono)" fill="var(--ink-2)">
                {bandLabels[b.key]}
              </text>
            </g>
          );
        })}
        {/* Defense hard floor marker */}
        {hardFloor && typeof hardFloor.value === "number" && (
          <g>
            <title>{`Defense hard floor: ${hardFloor.basis || ""}`}</title>
            <line x1={x(hardFloor.value)} x2={x(hardFloor.value)}
                  y1={bandsStartY - 6} y2={H - padB}
                  stroke="var(--court-defense-accent)" strokeWidth="1.5" strokeDasharray="4,3" />
            <text x={x(hardFloor.value)} y={bandsStartY - 8} textAnchor="middle" fontSize="10"
                  fontFamily="var(--font-mono)" fill="var(--court-defense-accent)">
              defense floor {fmtTick(hardFloor.value)}
            </text>
          </g>
        )}
        {/* Prosecution upper canon marker */}
        {upperCanon && typeof upperCanon.value === "number" && (
          <g>
            <title>{`Prosecution upper canon: ${upperCanon.basis || ""}`}</title>
            <line x1={x(upperCanon.value)} x2={x(upperCanon.value)}
                  y1={bandsStartY - 6} y2={H - padB}
                  stroke="var(--court-prosecution-accent)" strokeWidth="1.5" strokeDasharray="4,3" />
            <text x={x(upperCanon.value)} y={bandsStartY - 8} textAnchor="middle" fontSize="10"
                  fontFamily="var(--font-mono)" fill="var(--court-prosecution-ink)">
              prosecution ceiling {fmtTick(upperCanon.value)}
            </text>
          </g>
        )}
      </svg>
      <div className="courtroom-band-legend">
        {bands.map(b => (
          <span key={b.key}>
            <span className="courtroom-band-legend-swatch" style={{ background: bandColors[b.key] }} />
            {bandLabels[b.key]}
          </span>
        ))}
        <span><span className="courtroom-band-legend-swatch"
                    style={{ background: "transparent", borderLeft: "2px dashed var(--court-defense-accent)" }} /> Defense floor</span>
        <span><span className="courtroom-band-legend-swatch"
                    style={{ background: "transparent", borderLeft: "2px dashed var(--court-prosecution-accent)" }} /> Prosecution ceiling</span>
      </div>
    </div>
  );
}

// OutOfBoundsArguments — compact red-outlined list of arguments rejected by
// both counsel. The visual job is to make it unmistakable that the tribunal
// will NOT entertain these positions, distinct from the contested zones.
function OutOfBoundsArguments({ items }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <div className="courtroom-out-of-bounds">
      <div className="courtroom-out-of-bounds-label">Out of bounds — rejected by both counsel</div>
      <ul className="courtroom-out-of-bounds-list">
        {items.map((s, i) => <li key={i}>{s}</li>)}
      </ul>
    </div>
  );
}

Object.assign(window, {
  ConfPill, EstimatePill, TypeBadge, WeakFlag,
  Inspector, PremisesTable,
  StressList, HypothesesList, Ledger, EvidenceBudget, NotesList,
  TYPE_LABEL, KIND_LABEL,
  isUngrounded, isLowFalsifiability,
  CustodyBadge, CustodyLadder, SocraticRound,
  StipulatedFactsList, ContestedZonesList,
  FloorCeilingBand, OutOfBoundsArguments
});
