// Summary card + how-to-read strip + glossary tooltip helper.

const GLOSSARY = {
  "P(true)": "Probability the claim is true. We use a range, not a single number, because the underlying evidence is itself uncertain.",
  "bite": "How much a wage floor exceeds prevailing wages. A floor that 'bites' affects more workers and more firms.",
  "monopsony": "A labor market where few employers compete for workers, giving employers wage-setting power. Under monopsony, a higher minimum wage can raise employment.",
  "ceteris paribus": "Latin for 'all else equal' — a reasoning shorthand that holds other variables fixed. Useful for theory; often violated in real-world settings.",
  "elasticity": "How responsive one variable is to another. Demand elasticity of −0.3 means a 10% wage hike cuts employment by 3%.",
  "Jevons": "The Jevons paradox: when something becomes more efficient, total use of it can rise rather than fall.",
  "subclaim": "A premise that must hold for the main claim to be true. Subclaims decompose a big assertion into testable pieces.",
  "atomic premise": "The lowest-level assumption we can identify. Atomic premises are evaluated directly against evidence.",
  "weak premise": "A premise rated low enough that it materially limits the conclusion. Strengthening or replacing it would shift the credence.",
  "Dunning-Kruger": "A pattern observed in some studies where lower performers overestimate their competence; expert calibration varies by domain and feedback quality.",
  "universal quantifier": "A logical word like 'always', 'every', or 'all' that demands the claim hold in 100% of cases. One credible counterexample falsifies it."
};

function Term({ k, children }) {
  const def = GLOSSARY[k] || k;
  return (
    <span className="term" tabIndex={0}>
      {children || k}
      <span className="tip" role="tooltip">{def}</span>
    </span>
  );
}

// Verdict labels use credence language, not true/false language. A Bayesian
// truth-seeker outputs a posterior probability — never a verdict. CSS classes
// (.false/.true/.mixed/.uncertain) are retained for color tokens only; the
// labels themselves describe the credence band the operator should hold.
function veracityLabel(range) {
  const mid = (range[0] + range[1]) / 2;
  if (mid < 0.2)  return { label: "Very unlikely",        cls: "false" };
  if (mid < 0.35) return { label: "Unlikely",             cls: "false" };
  if (mid < 0.5)  return { label: "Probably false",       cls: "mixed" };
  if (mid < 0.65) return { label: "Genuinely uncertain",  cls: "uncertain" };
  if (mid < 0.8)  return { label: "Probably true",        cls: "true" };
  return { label: "Likely true", cls: "true" };
}

// Display floor — Cromwell's rule applied to the UI. A posterior that the
// math computes as 0.0001 should not be rendered as "0.0%": Cromwell forbids
// assigning probability 0 to any non-impossible event, and 0.0% in the UI
// reads as "ruled out." When the value is below 0.005 (rounds to 0.0%),
// render `<0.5%` instead. Anything above the floor renders normally.
function formatPercent(p, opts) {
  if (typeof p !== "number" || !Number.isFinite(p)) return "—";
  const decimals = (opts && typeof opts.decimals === "number") ? opts.decimals : 0;
  if (p > 0 && p < 0.005) return "<0.5%";
  return decimals === 0
    ? `${Math.round(p * 100)}%`
    : `${(p * 100).toFixed(decimals)}%`;
}

function formatRange(range) {
  if (!range || range.length !== 2) return "unscored";
  // Apply the Cromwell floor to each bound so a range like [0.0001, 0.04]
  // renders as `<0.5%-4%` rather than `0%-4%`. The floor only affects the
  // lower bound for posteriors near zero, and the upper bound symmetrically
  // for posteriors near one (where the rounded display would otherwise be
  // 100% — also a forbidden certainty).
  const lo = range[0], hi = range[1];
  const loStr = (lo > 0 && lo < 0.005) ? "<0.5%" : `${Math.round(lo * 100)}%`;
  const hiStr = (hi < 1 && hi > 0.995) ? ">99.5%" : `${Math.round(hi * 100)}%`;
  // Preserve historic format `X-Y%` when neither bound hit the floor — keeps
  // the test suite stable on midrange ranges.
  if (loStr.endsWith("%") && hiStr.endsWith("%") && !loStr.startsWith("<") && !hiStr.startsWith(">")) {
    return `${Math.round(lo * 100)}-${Math.round(hi * 100)}%`;
  }
  return `${loStr}-${hiStr}`;
}

// Single-number rendering for casual surfaces. The owner's research found that
// readers struggle to wrap their head around "85-95%" — they want a single
// number. The underlying data and math still produce a range; this helper
// just collapses it to the midpoint for display.
//
//   pointEstimate([0.6, 0.9])                   → { text: "75%", wide: true, ... }
//   pointEstimate([0.6, 0.9], { mode: "nerd" }) → { text: "60-90%", ... }
//
// When the spread is ≥ threshold (default 0.20), `wide` is true and
// `annotation` is "could be as low as X%, as high as Y%" so the caller can
// render it as a small parenthetical. Caller decides formatting.
function pointEstimate(range, opts) {
  const mode = (opts && opts.mode) || "plain";
  const threshold = (opts && typeof opts.threshold === "number") ? opts.threshold : 0.20;
  if (!range || range.length !== 2) {
    return { text: "unscored", lowPct: null, highPct: null, midPct: null, wide: false, range, annotation: null };
  }
  const lowPct = Math.round(range[0] * 100);
  const highPct = Math.round(range[1] * 100);
  const midPct = Math.round(((range[0] + range[1]) / 2) * 100);
  const wide = (range[1] - range[0]) >= threshold;
  if (mode === "nerd") {
    return { text: formatRange(range), lowPct, highPct, midPct, wide, range, annotation: null };
  }
  return {
    text: `${midPct}%`,
    lowPct, highPct, midPct, wide, range,
    annotation: wide ? `could be as low as ${lowPct}%, as high as ${highPct}%` : null
  };
}

// Per-tier LR caps — Cromwell's rule applied to evidence strength.
//
// An atomic fact at Tier 2 (named-source institutional aggregation) cannot
// carry the same effective likelihood ratio as a Tier 0 directly-sensible
// primitive. A 100× LR computed against a database report assumes the
// database is incapable of being systematically wrong; Cromwell forbids
// assigning probability 1 to that assumption. We therefore clamp the
// effective |log(LR)| of each evidence item by its source's sensory tier.
//
//   Tier 0 (or unspecified): no cap (backward compatible — full strength).
//   Tier 1: |log(LR)| ≤ ln(10) → LR ∈ [0.1, 10].
//   Tier 2: |log(LR)| ≤ ln(5)  → LR ∈ [0.2, 5].
//   Tier 3: |log(LR)| ≤ ln(3)  → LR ∈ [1/3, 3].
//
// Apply per-LR, per-hypothesis, per-direction — so the cap binds for both
// the supportive and opposing arms of a range, and for every hypothesis in
// `lrPerH`. Tier 0 items pass through untouched.
function tierLRBounds(tier) {
  if (tier === 1) return [0.1, 10];
  if (tier === 2) return [0.2, 5];
  if (tier === 3) return [1 / 3, 3];
  return null; // Tier 0 or unspecified: no cap.
}

function clampLRByTier(lr, tier) {
  const bounds = tierLRBounds(tier);
  if (!bounds) return lr;
  if (!(typeof lr === "number") || !Number.isFinite(lr) || lr <= 0) return lr;
  return Math.min(Math.max(lr, bounds[0]), bounds[1]);
}

// Bayesian posterior from likelihood ratios. The truth-seeking engine's core
// math: starting from a prior, each independent evidence item updates the
// log-odds by log(LR_i). Independence is assumed across items — correlated
// sources must be collapsed to a single combined LR upstream of this call.
//
// Each item provides an LR via one of:
//   { lr: number }                              — point estimate
//   { lrLow: number, lrHigh: number }           — range estimate (preferred)
//   { pH: number, pNotH: number }               — explicit P(E|H), P(E|¬H)
//
// Each item MAY carry a `tier: 0 | 1 | 2 | 3` referencing the sensory tier
// of the underlying atomic. Higher tiers clamp the effective |log(LR)| so
// named-source aggregations cannot act with Tier-0 strength (see
// `tierLRBounds` above).
//
// Items without LR data are skipped (they contribute LR ≈ 1 — no update).
function lrPosteriorRange(priorRange, items) {
  if (!Array.isArray(priorRange) || priorRange.length !== 2) return null;
  // Clamp to (0, 1) to keep log-odds finite.
  const pLo = Math.max(Math.min(priorRange[0], 1 - 1e-6), 1e-6);
  const pHi = Math.max(Math.min(priorRange[1], 1 - 1e-6), 1e-6);
  let logOddsLo = Math.log(pLo / (1 - pLo));
  let logOddsHi = Math.log(pHi / (1 - pHi));
  let anyLR = false;
  for (const it of items || []) {
    // Skip structural items: these encode doctrinal/definitional anchors that
    // are already baked into a hypothesis label; counting their LR would
    // double-count the standard against the hypothesis it defines.
    if (it.kind === "structural") continue;
    let lo = null, hi = null;
    if (typeof it.lrLow === "number" && typeof it.lrHigh === "number" && it.lrLow > 0 && it.lrHigh > 0) {
      lo = Math.min(it.lrLow, it.lrHigh);
      hi = Math.max(it.lrLow, it.lrHigh);
    } else if (typeof it.lr === "number" && it.lr > 0) {
      lo = hi = it.lr;
    } else if (typeof it.pH === "number" && typeof it.pNotH === "number" && it.pH > 0 && it.pNotH > 0) {
      lo = hi = it.pH / it.pNotH;
    }
    if (lo !== null) {
      // Tier cap (Cromwell's rule): clamp each direction so named-source
      // aggregations can't act with Tier-0 sensory strength.
      lo = clampLRByTier(lo, it.tier);
      hi = clampLRByTier(hi, it.tier);
      logOddsLo += Math.log(lo);
      logOddsHi += Math.log(hi);
      anyLR = true;
    }
  }
  if (!anyLR) return null;
  const oddsLo = Math.exp(logOddsLo);
  const oddsHi = Math.exp(logOddsHi);
  return [oddsLo / (1 + oddsLo), oddsHi / (1 + oddsHi)];
}

// Counts how many evidence items carry LR data — used by the UI to decide
// whether to render the LR-based posterior panel.
function countLrItems(items) {
  let n = 0;
  for (const it of items || []) {
    if ((typeof it.lr === "number" && it.lr > 0) ||
        (typeof it.lrLow === "number" && typeof it.lrHigh === "number") ||
        (typeof it.pH === "number" && typeof it.pNotH === "number")) {
      n++;
    }
  }
  return n;
}

// Multi-hypothesis Bayesian posterior. Given a set of competing hypotheses and
// evidence items each carrying an LR vector (lrPerH[hypothesisId] = LR for that
// hypothesis), compute the posterior probability distribution over the full
// hypothesis space. This is the proper truth-seeking computation: rather than
// hand-assigning a "support" label to each alternative, the LRs across the
// hypothesis space are multiplied (in log space) against each hypothesis's prior,
// then normalized so the posterior sums to 1.
//
// Hypotheses can carry an explicit `prior` (between 0 and 1). If absent, the
// function uses a uniform prior (1/N across N hypotheses). Evidence items
// without lrPerH data are skipped (they contribute 1 to every hypothesis,
// no update).
function computeHypothesisPosterior(hypotheses, items) {
  if (!Array.isArray(hypotheses) || hypotheses.length === 0) return null;
  const ids = hypotheses.map((h, i) => h.id || `H${i}`);
  const priors = hypotheses.map(h =>
    typeof h.prior === "number" && h.prior > 0 ? h.prior : 1 / hypotheses.length
  );
  // Normalize priors so they sum to 1 (in case operator authored mixed).
  const priorSum = priors.reduce((a, b) => a + b, 0);
  const normPriors = priors.map(p => p / priorSum);
  // Start each hypothesis at its log-prior.
  const logPosts = normPriors.map(p => Math.log(Math.max(p, 1e-12)));
  let anyEvidence = false;
  for (const it of items || []) {
    // Skip structural items: doctrinal anchors already baked into a hypothesis
    // label should not also act as evidence against that hypothesis.
    if (it.kind === "structural") continue;
    const lrMap = it.lrPerH;
    if (!lrMap || typeof lrMap !== "object") continue;
    for (let i = 0; i < ids.length; i++) {
      const lr = lrMap[ids[i]];
      if (typeof lr === "number" && lr > 0) {
        // Tier cap (Cromwell's rule): clamp per-hypothesis so a Tier-2
        // named-source aggregation can't carry Tier-0 strength against
        // any single hypothesis.
        const clamped = clampLRByTier(lr, it.tier);
        logPosts[i] += Math.log(clamped);
        anyEvidence = true;
      }
    }
  }
  if (!anyEvidence) return null;
  // Convert back to probabilities and normalize via log-sum-exp.
  const maxLog = Math.max(...logPosts);
  const expShifted = logPosts.map(l => Math.exp(l - maxLog));
  const sum = expShifted.reduce((a, b) => a + b, 0);
  const posteriors = expShifted.map(e => e / sum);
  return hypotheses.map((h, i) => ({
    id: ids[i],
    h: h.h,
    note: h.note,
    support: h.support,
    posterior: posteriors[i],
    prior: normPriors[i]
  }));
}

// Plain-English explanation of the probability range. Uses credence framing —
// we hold a posterior over the claim, we don't decree it true or false. The
// "across fair interpretations" framing acknowledges that the range itself is
// uncertainty over our model, not just about the world.
function plainEnglishRange(range) {
  const [lo, hi] = range;
  const loP = Math.round(lo * 100), hiP = Math.round(hi * 100);
  const mid = (lo + hi) / 2;
  if (mid < 0.35) {
    return `Posterior credence ${loP}–${hiP}% across fair readings of the claim. The evidence accumulated so far weighs against it, but the claim isn't ruled out in narrower formulations.`;
  }
  if (mid < 0.5) {
    return `Posterior credence ${loP}–${hiP}%. Evidence tilts against, but not decisively — the claim could survive with caveats or restrictions.`;
  }
  if (mid < 0.65) {
    return `Posterior credence ${loP}–${hiP}%. The evidence is genuinely split — neither direction has accumulated enough weight to dominate.`;
  }
  return `Posterior credence ${loP}–${hiP}%. The evidence broadly supports the claim, with caveats called out below.`;
}

// Invert a [lo, hi] probability range: P → 1-P. Used by the flip-the-assumption
// toggle to show ¬H credences alongside H credences.
function invertRange(r) {
  if (!Array.isArray(r) || r.length !== 2) return r;
  return [1 - r[1], 1 - r[0]];
}

// Plain-English one-liner that pairs with the assessment label. Used in the hero
// banner so the operator gets headline + one sentence, no jargon.
function verdictHeadline(label) {
  switch (label) {
    case "Very unlikely":       return "The evidence strongly weighs against this claim.";
    case "Unlikely":            return "The evidence leans against this claim.";
    case "Probably false":      return "Evidence tilts against, but it's not ruled out in narrower forms.";
    case "Genuinely uncertain": return "The evidence is genuinely split — neither side dominates.";
    case "Probably true":       return "The evidence broadly supports this claim, with caveats.";
    case "Likely true":         return "The evidence strongly supports this claim.";
    default:                    return "";
  }
}

function HeroVerdict({ analysis, stamp, priorsModified, flipped, onToggleFlipped, baseEstimate, v, mode }) {
  const onSeeReasoning = (e) => {
    e.preventDefault();
    const target = document.querySelector(".workspace") || document.querySelector(".results");
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const pe = pointEstimate(baseEstimate, { mode: mode === "nerd" ? "nerd" : "plain" });
  return (
    <section className="hero-verdict">
      <div className="hero-eyebrow">
        <span>Claim under test</span>
      </div>
      <h1 className="hero-claim">
        {flipped && <span className="claim-neg-prefix" title="Showing the analysis from the ¬H perspective: credence over the claim's NEGATION.">¬H · </span>}
        {flipped
          ? <span title="Negation of the original claim — under ¬H, the analysis is reinterpreted as bearing on this assertion instead.">It is NOT the case that: <em>{analysis.claim}</em></span>
          : analysis.claim}
      </h1>

      <div className={`hero-banner verdict-bg-${v.cls}`}>
        <div className="hero-banner-label">{v.label}</div>
        <div className="hero-banner-range mono">
          {pe.text}
          {pe.annotation && <span className="hero-banner-spread"> ({pe.annotation})</span>}
        </div>
        <div className="hero-banner-sub">
          {verdictHeadline(v.label)}{" "}
          <span className="hero-banner-confidence">Confidence: <span className="hero-banner-confidence-value">{analysis.confidence}</span>.</span>
          {mode === "nerd" && (
            <> <span className="hero-banner-rangenote">Range reflects uncertainty over fair readings.</span></>
          )}
        </div>
      </div>

      {analysis.bottomLine && (
        <p className="hero-why">
          <span className="hero-why-label">Why we think so:</span>{" "}
          {analysis.bottomLine}
        </p>
      )}

      <div className="hero-actions">
        <a href="#workspace" className="hero-cta" onClick={onSeeReasoning}>
          See the reasoning <span aria-hidden="true">↓</span>
        </a>
        {priorsModified && (
          <span className="priors-modified-stamp" title="Not the default analysis — credence reflects your tuned priors. Reset in the inspector to restore.">
            You've tuned this
          </span>
        )}
        {typeof onToggleFlipped === "function" && (
          <button
            type="button"
            className={`flip-assumption-btn${flipped ? " active" : ""}`}
            onClick={onToggleFlipped}
            title="Flip the assumption: re-orient the analysis around ¬H (the claim's negation). Forces the operator to see what credence the alternative position carries. Honest truth-seeking requires the operator to be equally able to inhabit the case AGAINST the claim, not just for it."
          >
            {flipped ? "↩ Return to original claim" : "Show as \"claim is false\" instead"}
          </button>
        )}
      </div>
    </section>
  );
}

function CrossChecks({ baseEstimate, lrPosterior, lrLabel, lrDelta, conjBayesShown, cbLabel, cbDelta, priorsModified, flipped, auditSummary, openOverride }) {
  // Determine agreement: open by default if either cross-check disagrees by ≥15 pts,
  // or audit has any flags. Otherwise collapsed with a single "✓ agree" line.
  const lrDisagrees = lrPosterior && lrDelta >= 0.15;
  const cbDisagrees = conjBayesShown && cbDelta >= 0.15;
  const hasAuditFlags = auditSummary && auditSummary.flagCount > 0;
  const shouldOpen = openOverride === true || lrDisagrees || cbDisagrees || hasAuditFlags;
  const allAgree = !lrDisagrees && !cbDisagrees && !hasAuditFlags && (lrPosterior || conjBayesShown);

  // If neither cross-check is available, render nothing.
  if (!lrPosterior && !conjBayesShown && !priorsModified && !hasAuditFlags) return null;

  return (
    <details className="cross-checks" open={shouldOpen}>
      <summary className="cross-checks-summary">
        <span className="cross-checks-chevron" aria-hidden="true">›</span>
        <span className="cross-checks-title">Second opinions</span>
        {allAgree && (
          <span className="cross-checks-agree" title="Both alternative computations land within 15 points of our estimate, and every self-check on this analysis passed.">
            All on the same page
          </span>
        )}
        {(lrDisagrees || cbDisagrees) && (
          <span className="cross-checks-disagree" title="An alternative computation reaches a notably different assessment - a soft prompt to look closer at why the two approaches diverge.">
            A different lens disagrees
          </span>
        )}
        {hasAuditFlags && (
          <span className="cross-checks-flagged" title="One or more self-checks on this analysis raised a flag worth re-reading before relying on the assessment.">
            {auditSummary.flagCount} thing{auditSummary.flagCount === 1 ? "" : "s"} to re-read
          </span>
        )}
      </summary>
      <div className="cross-checks-body">
        {lrPosterior && (
          <div className={`summary-lr-row${lrDelta >= 0.15 ? " discrepancy" : ""}`}
               title="An alternative Bayesian posterior, computed bottom-up from the declared evidence LRs against the analysis prior. When this lens diverges materially from the authored credence, the authored number is being held up by something other than the evidence on the page.">
            <span className={`verdict-pill lr-pill ${lrLabel.cls}`}>{lrLabel.label} — read from the evidence</span>
            <span className="summary-meta">
              <span className="k">{formatRange(lrPosterior)}</span>
              <span>Same question, different lens: the evidence-only computation</span>
            </span>
            {lrDelta >= 0.15 && (
              <span className="lr-delta-stamp" title="The authored credence and the evidence-only computation differ by this much. Not a contradiction — it just means the gap is being filled by something beyond the listed evidence (a prior, a model assumption, etc).">
                {Math.round(lrDelta*100)}-point gap
              </span>
            )}
          </div>
        )}

        {conjBayesShown && (
          <div className={`summary-lr-row conj-bayes${cbDelta >= 0.15 ? " discrepancy" : ""}`}
               title="Conjunctive Bayes: assuming the main claim holds only when ALL sub-claims hold and the sub-claims are independent, the joint probability is their product. A gap with the authored estimate suggests sub-claim correlation or a non-strict composition rule.">
            <span className={`verdict-pill lr-pill ${cbLabel.cls}`}>{cbLabel.label} — read from the sub-pieces</span>
            <span className="summary-meta">
              <span className="k">{formatRange(conjBayesShown)}</span>
              <span>Same question, different lens: multiplying the sub-pieces{flipped ? " (¬H view)" : ""}</span>
            </span>
            {cbDelta >= 0.15 && (
              <span className="lr-delta-stamp" title="The authored credence and the product-of-sub-pieces computation differ by this much. Usually means the sub-claims are correlated or the composition isn't strictly conjunctive.">
                {Math.round(cbDelta*100)}-point gap
              </span>
            )}
          </div>
        )}

        {hasAuditFlags && auditSummary && (
          <div className="cross-checks-audit"
            title={`Self-checks on this analysis across ${auditSummary.total} checks.\n\nFLAGGED (${auditSummary.flags.length}):\n${auditSummary.flags.map(f => "• " + f).join("\n") || "(none)"}\n\nPASSED (${auditSummary.passes.length}):\n${auditSummary.passes.map(p => "• " + p).join("\n") || "(none)"}\n\nFlags aren't invalidating - they're aspects of the analysis worth re-reading before relying on the assessment.`}>
            <span className="cross-checks-audit-label">Things to re-read:</span>{" "}
            {auditSummary.flagCount} of {auditSummary.total} self-checks raised a flag.
            {" "}Full list below in <em>Self-checks on this analysis</em>.
          </div>
        )}
      </div>
    </details>
  );
}

function KeyPremise({ analysis, onSelect }) {
  const firstClick = analysis.weakest && analysis.weakest[0];
  const firstClickNode = firstClick ? analysis.nodes[firstClick] : null;
  if (!firstClickNode) return null;
  return (
    <button className="key-premise-btn" onClick={() => onSelect(firstClick)} title={firstClick}>
      <span className="key-premise-label">Read the key premise first</span>
      <span className="key-premise-text">{firstClickNode.text}</span>
      <span className="key-premise-go" aria-hidden="true">→</span>
    </button>
  );
}

function SummaryCard({ analysis, stamp, onSelect, priorsModified, conjBayesC0, auditSummary, flipped, onToggleFlipped, mode }) {
  // When flipped, render credences for ¬H instead of H. The structural alarms
  // (load-bearing, asymmetric effort, etc.) are NOT inverted — they describe the
  // analysis itself, not the truth/falsity of the claim.
  const baseEstimate = flipped ? invertRange(analysis.estimate) : analysis.estimate;
  const v = veracityLabel(baseEstimate);

  // LR-derived posterior: computed from the analysis's declared evidence LRs
  // (if any) against the operator's prior range (default neutral 40-60% if no
  // prior is authored). Surfaces the Bayesian credence at the top of the page
  // so the operator sees BOTH numbers immediately: what they authored, and
  // what the declared evidence actually implies.
  const lrPrior = analysis.priorRange || [0.4, 0.6];
  const rawLrPosterior = analysis.evidenceBudget && window.lrPosteriorRange
    ? window.lrPosteriorRange(lrPrior, analysis.evidenceBudget)
    : null;
  const lrPosterior = flipped && rawLrPosterior ? invertRange(rawLrPosterior) : rawLrPosterior;
  const auMid = (baseEstimate[0] + baseEstimate[1]) / 2;
  let lrLabel = null, lrDelta = null;
  if (lrPosterior) {
    lrLabel = veracityLabel(lrPosterior);
    const lrMid = (lrPosterior[0] + lrPosterior[1]) / 2;
    lrDelta = Math.abs(lrMid - auMid);
  }

  // Conjunctive-Bayes from the decomposition tree (product of subclaim credences
  // under independence).
  const conjBayesShown = flipped && conjBayesC0 ? invertRange(conjBayesC0) : conjBayesC0;
  let cbLabel = null, cbDelta = null;
  if (conjBayesShown) {
    cbLabel = veracityLabel(conjBayesShown);
    const cbMid = (conjBayesShown[0] + conjBayesShown[1]) / 2;
    cbDelta = Math.abs(cbMid - auMid);
  }

  return (
    <section className="summary-card hero-mode">
      <HeroVerdict
        analysis={analysis}
        stamp={stamp}
        priorsModified={priorsModified}
        flipped={flipped}
        onToggleFlipped={onToggleFlipped}
        baseEstimate={baseEstimate}
        v={v}
        mode={mode}
      />
      <KeyPremise analysis={analysis} onSelect={onSelect} />
      <CrossChecks
        baseEstimate={baseEstimate}
        lrPosterior={lrPosterior}
        lrLabel={lrLabel}
        lrDelta={lrDelta}
        conjBayesShown={conjBayesShown}
        cbLabel={cbLabel}
        cbDelta={cbDelta}
        priorsModified={priorsModified}
        flipped={flipped}
        auditSummary={auditSummary}
      />
    </section>
  );
}

// Compact horizontal strip above the diagram. Wrapped in <details> so first-time
// readers see "How to read this ▾" but it isn't shouting at returning users.
function HowToStrip() {
  const items = [
    { kind: "Claim",      desc: "The assertion under test." },
    { kind: "Sub-claim",  desc: "What must hold for the claim to be true." },
    { kind: "Premise",    desc: "Testable assumption behind a sub-claim." },
    { kind: "Fact",       desc: "Lowest-level observation. Checked against evidence." }
  ];
  return (
    <details className="howto-strip-wrap" aria-label="How to read the diagram">
      <summary className="howto-strip-summary">
        <span className="howto-strip-chevron" aria-hidden="true">›</span>
        <span>How to read this</span>
      </summary>
      <div className="howto-strip" aria-hidden="false">
        <div className="howto-strip-rows">
          <div className="howto-strip-row">
            <div className="howto-strip-orient" title="Each level decomposes into the level below it. A box is true only if everything beneath it holds.">
              <span className="howto-strip-orient-arrow" aria-hidden="true">↓</span>
              <span>Top is the claim. Each row below is what must hold for the row above.</span>
            </div>
            {items.map((it, i) => (
              <React.Fragment key={it.kind}>
                <div className="howto-strip-item">
                  <span className="howto-strip-kind">{it.kind}</span>
                  <span className="howto-strip-desc">{it.desc}</span>
                </div>
                {i < items.length - 1 && <span className="howto-strip-sep" aria-hidden="true">→</span>}
              </React.Fragment>
            ))}
          </div>
          <div className="howto-strip-row howto-strip-row-2">
            <div className="howto-strip-label">On each box</div>
            <div className="howto-strip-key" title="The estimate is a probability range: low–high percent likely to be true.">
              <span className="howto-strip-sample estimate-sample">65–85%</span>
              <span className="howto-strip-desc">how likely it&apos;s true</span>
            </div>
            <div className="howto-strip-key" title="Confidence is how sure we are in the estimate itself — independent of the estimate's value.">
              <span className="howto-strip-sample conf-sample">MED</span>
              <span className="howto-strip-desc">how sure we are of that estimate</span>
            </div>
            <div className="howto-strip-key" title="A weak node is the load-bearing failure: strengthen it, or qualify it, and the conclusion moves.">
              <span className="howto-strip-sample weak-sample" aria-hidden="true" />
              <span className="howto-strip-desc">red outline = the broken link</span>
            </div>
          </div>
        </div>
      </div>
    </details>
  );
}

function InspectorPrimer({ analysis, onSelect }) {
  const tries = [];
  const weak = (analysis.weakest || [])[0];
  if (weak) {
    const n = analysis.nodes[weak];
    if (n) tries.push({ id: weak, text: n.text, em: "Start here", why: "see why the claim fails here" });
  }
  const subClaim = Object.values(analysis.nodes).find(n => n.kind === "subclaim" && !n.weak);
  if (subClaim) tries.push({ id: subClaim.id, text: subClaim.text, em: "Contrast", why: "a sub-claim that mostly holds" });
  const premise = Object.values(analysis.nodes).find(n => n.kind === "premise" && !n.weak);
  if (premise) tries.push({ id: premise.id, text: premise.text, em: "Evidence", why: "see the evidence basis on a normal premise" });

  return (
    <div className="primer-card">
      <div className="primer-empty-arrow" aria-hidden="true">
        <svg width="44" height="20" viewBox="0 0 44 20" fill="none">
          <path d="M43 10 L4 10 M11 4 L4 10 L11 16" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h4 className="primer-h">Pick a box to inspect</h4>
      <p className="primer-text">
        Click any box in the diagram to see its full reasoning — what the premise is for, how it would be checked, and what would change it.
      </p>
      <div className="primer-tries">
        {tries.map(t => (
          <button className="primer-try primer-chip" key={t.id} onClick={() => onSelect(t.id)} title={t.id}>
            <span className="primer-chip-tag">{t.em}</span>
            <span className="primer-chip-text">{t.text}</span>
            <span className="primer-chip-why">— {t.why}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Plain-English mode helpers + view
// ════════════════════════════════════════════════════════════════════
//
// Design contract: Plain English mode renders ZERO Bayesian jargon. No
// "LR", "posterior", "conjunctive", "credence", "log-odds", node IDs,
// or Greek letters. Every percentage is paired with a verbal companion
// ("about 7 in 10"). The text is what a smart, non-statistician friend
// would say — prose, sentences, no tables of node IDs.
//
// When source data (bottomLine, revision, hypothesis notes) contains
// jargon, we sanitize it here on the way out rather than mutating data.js.

// Convert a probability midpoint to a plain "X in 10" companion phrase.
// 0.85 → "about 8 or 9 in 10". 0.27 → "about 1 in 4". Always rounds toward
// a friendly fraction the reader can hold in their head.
function plainOdds(p) {
  if (p >= 0.97) return "near-certain";
  if (p >= 0.88) return "about 9 in 10";
  if (p >= 0.78) return "roughly 4 in 5";
  if (p >= 0.68) return "about 7 in 10";
  if (p >= 0.55) return "a bit better than even";
  if (p >= 0.45) return "roughly even odds";
  if (p >= 0.32) return "about 1 in 3";
  if (p >= 0.22) return "roughly 1 in 4";
  if (p >= 0.12) return "about 1 in 7";
  if (p >= 0.05) return "fewer than 1 in 10";
  return "very nearly ruled out";
}

// Plain-English single-number percentage — pairs the midpoint percentage
// with a verbal companion ("roughly 9 in 10"). When the range is wide enough
// the spread is noted parenthetically, kept terse so the headline number stays
// the focal point. Replaces the previous "low-high%" rendering — readers were
// struggling to wrap their heads around two-ended numbers.
function plainRangePhrase(range) {
  const pe = pointEstimate(range, { mode: "plain" });
  return `${pe.text} — ${plainOdds(pe.midPct / 100)}`;
}

// Plain-English confidence word.
function plainConfidence(c) {
  const s = String(c || "").toLowerCase();
  if (s.includes("high")) return "we're fairly sure of this read";
  if (s.includes("medium")) return "we're moderately sure of this read";
  if (s.includes("low"))  return "this read itself is shaky";
  return "this read carries its own uncertainty";
}

// Sanitize source prose of any Bayesian jargon for use in Plain English mode.
// We rewrite-in-place rather than touching the data file. Conservative: when
// in doubt we leave the text alone (the reader will tolerate a long technical
// word better than a mistranslation).
function plainSanitize(text) {
  if (!text) return "";
  return String(text)
    // Numeric/operator notation
    .replace(/\bLRs?\b/g, "evidence weights")
    .replace(/\blog-?odds?\b/gi, "the running tally")
    .replace(/\bsoftmax\(.*?\)/g, "competing-hypothesis math")
    .replace(/\bp\(true\)/gi, "probability the claim is true")
    .replace(/\bP\(true\)/g, "probability the claim is true")
    .replace(/\bP\(E\s*\|\s*H\)/g, "probability of this evidence if true")
    .replace(/\bP\(E\s*\|\s*¬H\)/g, "probability of this evidence if false")
    .replace(/\b¬H\b/g, "the claim is false")
    .replace(/\bC0\b/g, "the main claim")
    .replace(/\b(S\d+(?:\.\d+)?)\b/g, "")  // strip leaf IDs
    .replace(/\b(P\d+(?:\.\d+)?)\b/g, "")
    .replace(/\bH(\d+)\b/g, "alternative $1")
    // Greek + math operators
    .replace(/[δΔ]/g, "shift")
    .replace(/×/g, "by")
    .replace(/\bmin\(\)/g, "the weakest piece")
    .replace(/\bproduct\b/gi, "multiplied")
    // Jargon words
    .replace(/\bconjunctive Bayes\b/gi, "the sub-pieces multiplied together")
    .replace(/\bposterior credence\b/gi, "our best estimate")
    .replace(/\bposteriors?\b/gi, "our best estimate")
    .replace(/\bcredences?\b/gi, "best estimates")
    .replace(/\bprior(s)?\b/gi, (m, plural) => plural ? "starting assumptions" : "starting assumption")
    .replace(/\blikelihood ratios?\b/gi, "evidence weights")
    .replace(/\blikelihood-ratio\b/gi, "evidence-weight")
    .replace(/\bBayesian\b/gi, "evidence-based")
    .replace(/\btunable\b/gi, "adjustable")
    .replace(/\bload-bearing\b/gi, "decisive")
    // Tidy double-spaces from stripped IDs
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

// Translate any "85–95%" or "85-95%" raw range strings embedded in prose into
// a single-number rendering for plain mode. The owner's research found that
// ranges in prose break the reader's flow — they want one number to anchor on.
// If the spread is ≥ 20 points, append a small "(could be as low as X, as high
// as Y)" so the underlying uncertainty isn't hidden from the curious reader.
function plainifyRanges(text) {
  return String(text || "").replace(/(\d{1,3})\s*[-–]\s*(\d{1,3})\s*%/g, (m, lo, hi) => {
    const loNum = parseInt(lo), hiNum = parseInt(hi);
    const mid = Math.round((loNum + hiNum) / 2);
    const spread = Math.abs(hiNum - loNum);
    const wide = spread >= 20;
    return wide
      ? `${mid}% (${plainOdds(mid / 100)}; could be as low as ${loNum}%, as high as ${hiNum}%)`
      : `${mid}% (${plainOdds(mid / 100)})`;
  });
}

// Plain-English assessment - what the headline percentage means in plain language.
function plainVerdictExplanation(v, baseEstimate, confidence) {
  const mid = (baseEstimate[0] + baseEstimate[1]) / 2;
  const oddsPhrase = plainOdds(mid);
  const confPhrase = plainConfidence(confidence);
  switch (v.label) {
    case "Very unlikely":
      return `We think this is very unlikely — ${oddsPhrase} chance it's true. ${capitalize(confPhrase)}.`;
    case "Unlikely":
      return `We think this is unlikely — ${oddsPhrase} chance it's true. ${capitalize(confPhrase)}.`;
    case "Probably false":
      return `The evidence leans against the claim — ${oddsPhrase} chance it holds up. ${capitalize(confPhrase)}.`;
    case "Genuinely uncertain":
      return `We don't think the evidence settles this — ${oddsPhrase} chance it's true. ${capitalize(confPhrase)}.`;
    case "Probably true":
      return `We think this is probably true — ${oddsPhrase} chance it holds up. ${capitalize(confPhrase)}.`;
    case "Likely true":
      return `We think this is likely true — ${oddsPhrase} chance it holds up. ${capitalize(confPhrase)}.`;
    default:
      return `${capitalize(oddsPhrase)} chance the claim is true. ${capitalize(confPhrase)}.`;
  }
}

function capitalize(s) {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Build a plain-English sentence for each direct child of the main claim.
// We use the node's text directly (already prose), pair with a plain assessment
// word, and explain confidence in plain language. No IDs, no percentage bars,
// no "subclaim" label — just "First, ..." / "Second, ..." / "Third, ...".
function plainReasonsList(analysis) {
  const c0Children = Object.values(analysis.nodes)
    .filter(n => n.parent === "C0")
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  return c0Children.map(n => {
    const v = veracityLabel(n.estimate);
    const pe = pointEstimate(n.estimate, { mode: "plain" });
    return {
      text: n.text,
      verdictWord: v.label.toLowerCase(),
      verdictCls: v.cls,
      oddsPhrase: plainOdds(pe.midPct / 100),
      pointText: pe.text,                // "73%"
      pointAnnotation: pe.annotation,    // "could be as low as 60%, as high as 85%" or null
      weak: !!n.weak,
      role: n.role ? plainSanitize(n.role) : null
    };
  });
}

// Steelman built from the strongest alternative hypothesis. If the analysis
// includes `hypotheses`, we pick the one with the highest support tag (or, if
// tied, the first non-default hypothesis) and render it as prose. This is the
// "strongest case against our assessment" the reader sees in plain mode.
function plainSteelman(analysis) {
  const items = analysis.hypotheses || [];
  if (!items.length) return null;
  const rank = { "High": 6, "Medium-High": 5, "Medium": 4, "Low-Medium": 3, "Low": 2, "Very Low": 1 };
  // The "case against" is whichever alternative most strongly contradicts the
  // authored estimate. For low estimates (probably false), pick the strongest
  // "true" hypothesis. For high estimates, pick the strongest "false" one.
  // Heuristic: highest-support hypothesis other than the first (which usually
  // restates the claim).
  const sorted = items
    .map((h, i) => ({ ...h, _rank: rank[h.support] || 0, _idx: i }))
    .sort((a, b) => b._rank - a._rank);
  const best = sorted.find(h => h._idx !== 0) || sorted[0];
  if (!best) return null;
  return {
    statement: plainSanitize(best.h),
    note: best.note ? plainSanitize(best.note) : null
  };
}

// Cruxes in plain prose: what observation would make us change our minds.
function plainCruxes(analysis) {
  return (analysis.cruxes || []).map(c => ({
    crux: plainSanitize(c.crux),
    current: plainSanitize(c.current),
    wouldMove: plainSanitize(c.wouldMove)
  }));
}

// What we deliberately didn't check — pulled from coverage with status `gap`
// or `out-of-scope`. Notes are sanitized to keep plain-mode jargon-free.
function plainGaps(analysis) {
  return (analysis.coverage || [])
    .filter(c => c.status === "gap" || c.status === "out-of-scope")
    .map(c => ({
      area: plainSanitize(c.area),
      note: c.note ? plainSanitize(c.note) : null,
      status: c.status === "gap" ? "we didn't fully answer this" : "we deliberately left this out"
    }));
}

// ── PlainEnglishView ──
// The plain essay — always rendered. Below it, an Appendix can unspool
// inline (controlled by App via appendixOpen / onToggleAppendix). The CTA
// at the bottom expands the appendix on the same scroll instead of
// switching to a separate destination.
//
// Layout contract: the first fold contains only the claim and a single
// confidence line. Everything else - assessment prose, evidence, cruxes - sits
// below the fold and rewards a deliberate scroll. This is the "0 cognitive
// load" surface: one question per screen, one answer per screen.
// renderCourtroomPlain — the FULL plain-mode tribunal proceeding for entries
// that carry a courtroom payload. This REPLACES the analyst-voice essay
// (Why we think so / The reasoning piece by piece / How we'd rewrite / The
// strongest case against / What would change our mind / What we didn't
// check) on courtroom entries — the courtroom IS the plain-mode body, not
// an addition to it. Returns null when the entry has no courtroom field
// (so non-courtroom entries fall through to the analyst essay unchanged).
//
// Order: the charge → "after hearing both counsel" → both sides agree → both
// sides disagree → 5 Socratic rounds (question + tribunal-verdict only, no
// LR jargon, no prosecution/defense submissions) → final band as point
// estimate with italicized range → CTA to expand the full proceedings.
// Pull the first sentence (or first ~240 chars) of a paragraph. Used to
// surface the strongest exhibit a counsel cites without dumping the full
// 400-word submission into plain view. Keeps the reader scanning, but
// guarantees at least one named primary source per round.
function firstSentence(text, max) {
  if (!text) return null;
  const s = String(text).trim();
  const limit = max || 260;
  // Prefer ending at the first sentence boundary that isn't inside parens.
  const m = s.match(/^[^.!?]+[.!?]/);
  if (m && m[0].length <= limit + 80) return m[0].trim();
  if (s.length <= limit) return s;
  return s.slice(0, limit).replace(/\s+\S*$/, "") + "…";
}

function renderCourtroomPlain(analysis, onSeeMath, appendixOpen) {
  const c = analysis && analysis.courtroom;
  if (!c) return null;

  const stipulated = Array.isArray(c.stipulatedFacts) ? c.stipulatedFacts.slice(0, 3) : [];
  const contested = Array.isArray(c.contestedZones) ? c.contestedZones.slice(0, 3) : [];
  const rounds = Array.isArray(c.socraticRounds) ? c.socraticRounds : [];
  const notes = c.verdict && c.verdict.notes ? plainifyRanges(plainSanitize(c.verdict.notes)) : null;

  // Key exhibits on the record — top Tier-A clean-custody evidence items.
  // Sort by (custodyDiscount × max(lrHigh, lr)) descending so the highest-LR
  // cleanest-custody items lead. Cap at 5 so the list stays scannable; the
  // full evidenceBudget lives in the appendix.
  const evList = Array.isArray(analysis.evidenceBudget) ? analysis.evidenceBudget : [];
  const tierAItems = evList
    .filter(e => e && e.custodyTier === "A")
    .map(e => {
      const lr = typeof e.lrHigh === "number" ? e.lrHigh : (typeof e.lr === "number" ? e.lr : 1);
      const disc = typeof e.custodyDiscount === "number" ? e.custodyDiscount : 1;
      return { e, score: lr * disc };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(x => x.e);

  // Final band: prefer floorAnalysis (operator-authored band) when present so
  // the same numbers the math view shows are the ones the plain view shows.
  // For probability claims the floor values are in [0,1] — render via
  // pointEstimate to share the same rendering helpers used elsewhere. For numeric
  // claims (death toll, dollars, etc.) render the raw numbers with a unit.
  let bandBlock = null;
  const fa = c.floorAnalysis;
  if (fa && fa.defenseHardFloor && fa.prosecutionUpperCanon) {
    const lo = typeof fa.defenseHardFloor.value === "number" ? fa.defenseHardFloor.value : null;
    const hi = typeof fa.prosecutionUpperCanon.value === "number" ? fa.prosecutionUpperCanon.value : null;
    const central = fa.underFullCanon && typeof fa.underFullCanon.central === "number"
      ? fa.underFullCanon.central : null;
    if (lo !== null && hi !== null) {
      const looksLikeProbability = lo >= 0 && hi <= 1 && (hi - lo) <= 1;
      if (looksLikeProbability) {
        const pe = pointEstimate([lo, hi], { mode: "plain" });
        bandBlock = (
          <div className="plain-courtroom-section plain-courtroom-section--band">
            <span className="plain-courtroom-label">Final band</span>
            <span className="plain-courtroom-band-point">About a {pe.text} chance the claim is true.</span>
            {pe.annotation && (
              <span className="plain-courtroom-band-range">({pe.annotation})</span>
            )}
          </div>
        );
      } else {
        const fmt = (v) => v >= 100 ? v.toFixed(0) : v >= 1 ? `${v.toFixed(1)}M` : `${Math.round(v*100)}%`;
        bandBlock = (
          <div className="plain-courtroom-section plain-courtroom-section--band">
            <span className="plain-courtroom-label">Final band</span>
            <span className="plain-courtroom-band-point">
              {central !== null ? `Most likely around ${fmt(central)}.` : `Band: ${fmt(lo)} to ${fmt(hi)}.`}
            </span>
            <span className="plain-courtroom-band-range">(range: {fmt(lo)} to {fmt(hi)})</span>
          </div>
        );
      }
    }
  }

  return (
    <div className="plain-section plain-courtroom">
      {c.charge && (
        <div className="plain-courtroom-charge">
          <strong>The charge</strong>
          {plainifyRanges(plainSanitize(c.charge))}
        </div>
      )}
      {notes && (
        <p className="plain-prose">
          <em>After hearing both counsel: </em>{notes}
        </p>
      )}
      {stipulated.length > 0 && (
        <div className="plain-courtroom-section plain-courtroom-section--stipulated">
          <span className="plain-courtroom-label">Both sides agree</span>
          <ul className="plain-courtroom-bullets">
            {stipulated.map((s, i) => <li key={i}>{plainifyRanges(plainSanitize(s))}</li>)}
          </ul>
        </div>
      )}
      {contested.length > 0 && (
        <div className="plain-courtroom-section plain-courtroom-section--contested">
          <span className="plain-courtroom-label">Both sides disagree about</span>
          <ul className="plain-courtroom-bullets">
            {contested.map((s, i) => <li key={i}>{plainifyRanges(plainSanitize(s))}</li>)}
          </ul>
        </div>
      )}
      {tierAItems.length > 0 && (
        <div className="plain-courtroom-exhibits">
          <div className="plain-courtroom-label" style={{ marginBottom: 8 }}>
            Key exhibits on the record · Tier A · chain-of-custody clean
          </div>
          <ul className="plain-courtroom-exhibit-list">
            {tierAItems.map((e, i) => (
              <li key={i} className="plain-courtroom-exhibit-item">
                <span className="plain-courtroom-exhibit-text">{e.item}</span>
                {typeof e.lrLow === "number" && typeof e.lrHigh === "number" && (
                  <span className="plain-courtroom-exhibit-lr">LR {e.lrLow}–{e.lrHigh}</span>
                )}
              </li>
            ))}
          </ul>
          <div className="plain-courtroom-exhibit-note">
            These are the cleanest-custody pieces of evidence on the record. The full evidence ledger is in the proceedings below.
          </div>
        </div>
      )}
      {rounds.length > 0 && (
        <div className="plain-courtroom-rounds">
          <div className="plain-courtroom-label" style={{ marginBottom: 8 }}>The proceeding, round by round</div>
          <ol className="plain-courtroom-roundlist">
            {rounds.map((r, i) => {
              const verdictText = r.verdict ? plainifyRanges(plainSanitize(r.verdict)) : null;
              // Trim to the first 2 sentences so the plain view stays scannable.
              const trimmed = verdictText
                ? (verdictText.match(/^[^.]+\.[^.]+\.|^[^.]+\./) || [verdictText])[0]
                : null;
              const pSnippet = r.prosecution ? plainifyRanges(plainSanitize(firstSentence(r.prosecution, 320))) : null;
              const dSnippet = r.defense ? plainifyRanges(plainSanitize(firstSentence(r.defense, 320))) : null;
              return (
                <li key={i} className="plain-courtroom-round">
                  <div className="plain-courtroom-round-q">
                    <span className="plain-courtroom-round-num">Round {r.round != null ? r.round : i + 1}</span>
                    {r.question}
                  </div>
                  {pSnippet && (
                    <div className="plain-courtroom-round-p">
                      <strong>Prosecution:</strong> {pSnippet}
                    </div>
                  )}
                  {dSnippet && (
                    <div className="plain-courtroom-round-d">
                      <strong>Defense:</strong> {dSnippet}
                    </div>
                  )}
                  {trimmed && (
                    <div className="plain-courtroom-round-v">
                      <strong>Tribunal:</strong> {trimmed}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}
      {bandBlock}
      {!appendixOpen && typeof onSeeMath === "function" && (
        <button type="button" className="plain-courtroom-cta" onClick={onSeeMath}>
          Open the full proceedings <span aria-hidden="true">↓</span>
        </button>
      )}
    </div>
  );
}

function PlainEnglishView({ analysis, activeSample, appendixOpen, onToggleAppendix }) {
  const isCourtroom = !!analysis.courtroom;
  const v = veracityLabel(analysis.estimate);
  // Analyst-essay sections only consumed in the non-courtroom branch.
  const reasons = isCourtroom ? [] : plainReasonsList(analysis);
  const steelman = isCourtroom ? null : plainSteelman(analysis);
  const cruxes = isCourtroom ? [] : plainCruxes(analysis);
  const gaps = isCourtroom ? [] : plainGaps(analysis);
  const bottomLine = isCourtroom ? null : plainifyRanges(plainSanitize(analysis.bottomLine || ""));
  const revision = isCourtroom ? null : plainifyRanges(plainSanitize(analysis.revision || ""));
  const [lo, hi] = analysis.estimate;
  const onSeeReasoning = (e) => {
    e.preventDefault();
    const target = document.querySelector(".plain-section-anchor");
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const openAppendix = () => {
    if (typeof onToggleAppendix === "function") onToggleAppendix();
    if (!appendixOpen) {
      window.requestAnimationFrame(() => {
        const target = document.getElementById("appendix");
        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  };

  return (
    <section className="plain-english">
      {/* Tribunal banner — courtroom-bearing entries land on the tribunal
          verdict before anything else. */}
      {isCourtroom && window.TribunalBanner && (
        <window.TribunalBanner courtroom={analysis.courtroom} />
      )}

      {/* HERO — for courtroom entries: charge framing only (the verdict is
          in the banner above). For non-courtroom entries: the existing
          claim + verdict-word + confidence line. */}
      <div className={`plain-hero${isCourtroom ? " courtroom" : ""}`}>
        <div className="plain-eyebrow">
          {isCourtroom ? "Before the tribunal — the charge" : "A claim, audited"}
        </div>
        <h1 className="plain-claim">{analysis.claim}</h1>

        {!isCourtroom && (
          <>
            <div className={`plain-verdict-line verdict-text-${v.cls}`}>
              <span className="plain-verdict-word">{v.label}.</span>
              <span className="plain-verdict-odds"> {plainOdds((lo + hi) / 2)}.</span>
            </div>
            <p className="plain-confidence-line">
              {capitalize(plainConfidence(analysis.confidence))}.{" "}
              {(() => {
                const pe = pointEstimate(analysis.estimate, { mode: "plain" });
                return (
                  <span className="plain-range-inline">
                    About a {pe.text} chance the claim is true.
                    {pe.annotation && (
                      <span className="plain-range-spread"> ({pe.annotation}.)</span>
                    )}
                  </span>
                );
              })()}
            </p>
          </>
        )}

        {activeSample && activeSample.note && (
          <p className="plain-context-note">{activeSample.note}</p>
        )}

        <div className="plain-hero-actions">
          <a href="#plain-reasoning" className="plain-hero-cta" onClick={onSeeReasoning}>
            {isCourtroom ? "Read the proceedings" : "Read the reasoning"} <span aria-hidden="true">↓</span>
          </a>
        </div>
      </div>

      <div className="plain-section-anchor" id="plain-reasoning" aria-hidden="true" />

      {/* For courtroom entries the courtroom proceeding REPLACES the
          analyst essay. For non-courtroom entries it renders nothing here
          and the analyst essay below is the body. */}
      {isCourtroom && renderCourtroomPlain(analysis, openAppendix, appendixOpen)}

      {/* ── Analyst essay (non-courtroom entries only) ──
          Suppressed entirely when analysis.courtroom is present so the
          plain view reads as a tribunal proceeding, not a fact-check. */}

      {bottomLine && (
        <div className="plain-section plain-why-section">
          <h2 className="plain-h2">Why we think so</h2>
          <p className="plain-prose">{bottomLine}</p>
        </div>
      )}

      {reasons.length > 0 && (
        <div className="plain-section">
          <h2 className="plain-h2">The reasoning, piece by piece</h2>
          <p className="plain-prose plain-prose-intro">
            For the claim to hold, each of these has to be true. Here's what we found for each.
          </p>
          <ol className="plain-reasons">
            {reasons.map((r, i) => (
              <li key={i} className={`plain-reason${r.weak ? " weak" : ""}`}>
                <div className="plain-reason-text">{r.text}</div>
                <div className="plain-reason-judgment">
                  <span className={`plain-reason-verdict verdict-text-${r.verdictCls}`}>
                    {capitalize(r.verdictWord)}
                  </span>
                  <span className="plain-reason-odds"> — about {r.pointText} chance it holds ({r.oddsPhrase}).</span>
                  {r.pointAnnotation && (
                    <span className="plain-reason-spread"> {r.pointAnnotation}.</span>
                  )}
                  {r.weak && <span className="plain-reason-weak"> The whole claim leans on this piece.</span>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {revision && (
        <div className="plain-section">
          <h2 className="plain-h2">How we'd rewrite the claim to match what we actually found</h2>
          <p className="plain-prose plain-revision">{revision}</p>
        </div>
      )}

      {steelman && (
        <div className="plain-section plain-steelman">
          <h2 className="plain-h2">The strongest case against our assessment</h2>
          <p className="plain-prose">
            A reasonable person could push back this way: <em>{steelman.statement}</em>
            {steelman.note && <> &nbsp;{steelman.note}</>}
          </p>
        </div>
      )}

      {cruxes.length > 0 && (
        <div className="plain-section">
          <h2 className="plain-h2">What would change our mind</h2>
          <p className="plain-prose plain-prose-intro">
            These are the observations that would actually move our answer - what to look for if you want to challenge the analysis.
          </p>
          <ul className="plain-cruxes">
            {cruxes.map((c, i) => (
              <li key={i} className="plain-crux">
                <div className="plain-crux-title">{c.crux}</div>
                {c.current && <div className="plain-crux-current">Right now: {c.current}</div>}
                {c.wouldMove && <div className="plain-crux-move">What would shift things: {c.wouldMove}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {gaps.length > 0 && (
        <div className="plain-section plain-gaps">
          <h2 className="plain-h2">What we didn't check</h2>
          <p className="plain-prose plain-prose-intro">
            Being honest about the holes in this analysis. These are questions we either skipped or only partially answered.
          </p>
          <ul className="plain-gap-list">
            {gaps.map((g, i) => (
              <li key={i} className="plain-gap">
                <span className="plain-gap-area">{g.area}</span>
                <span className="plain-gap-status">— {g.status}</span>
                {g.note && <div className="plain-gap-note">{g.note}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Receipts invitation — language adapts to courtroom voice when an
          analysis.courtroom is present. */}
      <div className="plain-receipts-invite">
        <div className="plain-receipts-rule" aria-hidden="true" />
        <h3 className="plain-receipts-h">
          {isCourtroom
            ? (appendixOpen ? "The full proceedings are open below." : "Want the full proceedings?")
            : (appendixOpen ? "The receipts are unspooled below." : "Want the receipts?")}
        </h3>
        <p className="plain-receipts-sub">
          {isCourtroom
            ? (appendixOpen
                ? "The complete tribunal record: opening statements in full, custody ladder with every example, all five Socratic rounds with prosecution + defense submissions, the evidence ledger with custody discounts, the sensitivity sweeps."
                : "Below this sits the full tribunal record: openings, custody ladder, every Socratic round in full, the evidence ledger with custody discounts, sensitivity sweeps, the audit checklist. Optional — but it's all there.")
            : (appendixOpen
                ? "Walk through the evidence, the cross-checks, the sensitivity sweeps, the audit ledger - every number that feeds the assessment above."
                : "Underneath this analysis sits the math: the prior, the evidence weights, the cross-checks, the sensitivity sweeps, the audit ledger. It's optional — but it's all there.")}
        </p>
        <button
          type="button"
          className={`plain-receipts-btn${appendixOpen ? " open" : ""}`}
          onClick={openAppendix}
        >
          {isCourtroom
            ? (appendixOpen
                ? <>Close the proceedings <span aria-hidden="true">↑</span></>
                : <>Open the full proceedings <span aria-hidden="true">↓</span></>)
            : (appendixOpen
                ? <>Tuck the receipts away <span aria-hidden="true">↑</span></>
                : <>Show me the math <span aria-hidden="true">↓</span></>)}
        </button>
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════
// Show-the-math technical components
// ════════════════════════════════════════════════════════════════════
//
// Aesthetic contract: this view leans into technical notation.
// Monospace for formulas, IDs, and numeric outputs. Greek and operator
// notation are welcome. Brief inline glossary tooltips let the
// technically curious readers learn the vocabulary without condescending text. Layout
// evokes a research notebook, not a consumer dashboard.

// Inline glossary tooltip for the technical header. Picks up technical
// terms on first occurrence per page (handled at the component level —
// each header element renders its own first-occurrence tooltip).
const NERD_GLOSSARY = {
  "LR": "Likelihood ratio. P(evidence | claim true) / P(evidence | claim false). LR > 1 supports the claim; LR < 1 weighs against it.",
  "posterior": "Updated probability after applying evidence. posterior = prior · LR (in odds form, then converted back).",
  "prior": "Probability assigned to the claim BEFORE looking at the current evidence. Authored in data.priorRange.",
  "log-odds": "ln(p/(1-p)). Bayesian updating is additive in log-odds: log-odds_post = log-odds_prior + Σ log(LR_i).",
  "conjunctive Bayes": "Joint probability under independence: P(A∧B) = P(A)·P(B). When the main claim holds iff ALL sub-claims hold and they're independent, the joint is the product.",
  "min()": "Weakest-link aggregation. Under disjunctive interpretation (any one sub-claim sufficient) min() is the floor.",
  "C0": "The root claim node. All sub-claims (S1, S2, ...) decompose from C0.",
  "swing": "How far a single tunable node alone can drag the C0 midpoint from its authored baseline. Above the 15-pt threshold the node is flagged as load-bearing.",
  "log10(LR)": "Base-10 logarithm of the likelihood ratio. Each +1 in log10(LR) ≈ a 10× swing in odds. Useful for visualizing additive updates."
};

function NerdTerm({ k, children }) {
  const def = NERD_GLOSSARY[k] || GLOSSARY[k] || k;
  return (
    <span className="nerd-term" tabIndex={0}>
      {children || k}
      <span className="nerd-tip" role="tooltip">{def}</span>
    </span>
  );
}

// ── NerdHeader ── research-notebook framing for the claim
function NerdHeader({ analysis, baseEstimate, lrPosterior, conjBayesC0, priorsModified }) {
  const v = veracityLabel(baseEstimate);
  const prior = analysis.priorRange || [0.4, 0.6];
  return (
    <section className="nerd-header">
      <div className="nerd-meta-row mono">
        <span className="nerd-meta-key">node</span>
        <span className="nerd-meta-val">C0</span>
        <span className="nerd-meta-sep">·</span>
        <span className="nerd-meta-key">type</span>
        <span className="nerd-meta-val">{analysis.claimType || "claim"}</span>
        <span className="nerd-meta-sep">·</span>
        <span className="nerd-meta-key">confidence</span>
        <span className="nerd-meta-val">{analysis.confidence}</span>
        {priorsModified && (
          <span className="nerd-meta-tuned" title="userPriors override active — non-default propagation through computeLiveEstimates">
            user-tuned
          </span>
        )}
      </div>
      <h1 className="nerd-claim">{analysis.claim}</h1>
      <div className="nerd-posterior-row">
        <div className="nerd-posterior-cell">
          <div className="nerd-cell-label mono">authored <NerdTerm k="posterior" /></div>
          <div className="nerd-cell-value mono">{formatRange(baseEstimate)}</div>
          <div className="nerd-cell-note">{v.label}</div>
        </div>
        <div className="nerd-posterior-cell">
          <div className="nerd-cell-label mono"><NerdTerm k="prior" /> range</div>
          <div className="nerd-cell-value mono">{formatRange(prior)}</div>
          <div className="nerd-cell-note">priorRange (data.js)</div>
        </div>
        {lrPosterior && (
          <div className="nerd-posterior-cell">
            <div className="nerd-cell-label mono">LR-derived posterior</div>
            <div className="nerd-cell-value mono">{formatRange(lrPosterior)}</div>
            <div className="nerd-cell-note">prior × Π LR_i</div>
          </div>
        )}
        {conjBayesC0 && (
          <div className="nerd-posterior-cell">
            <div className="nerd-cell-label mono">conjunctive Bayes (C0)</div>
            <div className="nerd-cell-value mono">{formatRange(conjBayesC0)}</div>
            <div className="nerd-cell-note">Π P(S_i) | independence</div>
          </div>
        )}
      </div>
    </section>
  );
}

// ── EvidenceLRChain ── prior → posterior chain, every item, with log10(LR)
function EvidenceLRChain({ analysis }) {
  const items = (analysis.evidenceBudget || []).filter(it => it.kind !== "structural");
  const prior = analysis.priorRange || [0.4, 0.6];
  if (!items.length) return null;

  // Build the running posterior step-by-step so the chain is visible.
  // Show each item: its LR (low/high), log10(LR), and the running posterior after.
  const pLo = Math.max(Math.min(prior[0], 1 - 1e-6), 1e-6);
  const pHi = Math.max(Math.min(prior[1], 1 - 1e-6), 1e-6);
  let logOddsLo = Math.log(pLo / (1 - pLo));
  let logOddsHi = Math.log(pHi / (1 - pHi));
  const rows = [];
  for (const it of items) {
    let lo = null, hi = null;
    if (typeof it.lrLow === "number" && typeof it.lrHigh === "number" && it.lrLow > 0 && it.lrHigh > 0) {
      lo = Math.min(it.lrLow, it.lrHigh);
      hi = Math.max(it.lrLow, it.lrHigh);
    } else if (typeof it.lr === "number" && it.lr > 0) {
      lo = hi = it.lr;
    }
    if (lo === null) {
      rows.push({ item: it.item, lr: null, logLR: null, postLo: null, postHi: null });
      continue;
    }
    // Tier cap — keep the displayed chain consistent with the math used by
    // `lrPosteriorRange` and `computeHypothesisPosterior`.
    lo = clampLRByTier(lo, it.tier);
    hi = clampLRByTier(hi, it.tier);
    logOddsLo += Math.log(lo);
    logOddsHi += Math.log(hi);
    const oLo = Math.exp(logOddsLo), oHi = Math.exp(logOddsHi);
    rows.push({
      item: it.item,
      lrLo: lo, lrHi: hi,
      logLRLo: Math.log10(lo), logLRHi: Math.log10(hi),
      postLo: oLo / (1 + oLo),
      postHi: oHi / (1 + oHi)
    });
  }

  return (
    <div className="nerd-lr-chain">
      <div className="nerd-lr-prior mono">
        start: prior = [{prior[0].toFixed(2)}, {prior[1].toFixed(2)}] · <NerdTerm k="log-odds">log-odds</NerdTerm> = [{Math.log(pLo/(1-pLo)).toFixed(2)}, {Math.log(pHi/(1-pHi)).toFixed(2)}]
      </div>
      <table className="lab nerd-lr-table">
        <thead>
          <tr>
            <th className="mono">evidence item</th>
            <th className="mono" style={{textAlign: "right"}}><NerdTerm k="LR" /></th>
            <th className="mono" style={{textAlign: "right"}}><NerdTerm k="log10(LR)" /></th>
            <th className="mono" style={{textAlign: "right"}}>running posterior</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={r.lr === null ? "nerd-lr-skip" : ""}>
              <td className="nerd-lr-item">{r.item}</td>
              <td className="mono nerd-lr-num">
                {r.lrLo !== null ? `${r.lrLo}-${r.lrHi}` : <span className="dim">no LR</span>}
              </td>
              <td className="mono nerd-lr-num">
                {r.logLRLo !== null
                  ? `${r.logLRLo >= 0 ? "+" : ""}${r.logLRLo.toFixed(2)} to ${r.logLRHi >= 0 ? "+" : ""}${r.logLRHi.toFixed(2)}`
                  : <span className="dim">—</span>}
              </td>
              <td className="mono nerd-lr-num">
                {r.postLo !== null
                  ? `${Math.round(r.postLo*100)}-${Math.round(r.postHi*100)}%`
                  : <span className="dim">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="nerd-lr-footnote mono">
        Updates are additive in log-odds. Final posterior = sigmoid(Σ log-odds_prior + Σ log(LR_i)).
        Items without LR contribute LR=1 (no update).
      </div>
    </div>
  );
}

// ── ConjunctiveBayesPanel ── min() vs product, side-by-side, with rationale
function ConjunctiveBayesPanel({ analysis, conjBayesC0 }) {
  const cMin = analysis.estimate;  // authored, which uses min() under the live engine
  const cProd = conjBayesC0;
  return (
    <div className="nerd-conjbayes">
      <div className="nerd-conjbayes-row">
        <div className="nerd-conjbayes-cell">
          <div className="nerd-cell-label mono">min(S_i) — weakest link</div>
          <div className="nerd-cell-value mono">{formatRange(cMin)}</div>
          <div className="nerd-cell-note">authored / disjunctive ceiling</div>
        </div>
        <div className="nerd-conjbayes-cell">
          <div className="nerd-cell-label mono">Π S_i — product under independence</div>
          <div className="nerd-cell-value mono">{cProd ? formatRange(cProd) : "—"}</div>
          <div className="nerd-cell-note">conjunctive floor</div>
        </div>
      </div>
      <p className="nerd-conjbayes-rationale mono">
        Why both: min() is generous under disjunction (any sub-claim sufficient).
        Π is generous under conjunction with independence (all sub-claims required, uncorrelated).
        Real claims sit between. A wide gap = correlation or asymmetric composition; investigate.
      </p>
    </div>
  );
}

// ── LoadBearingTable ── shows each tunable + its full swing range
function LoadBearingTable({ analysis, loadBearing }) {
  const tunables = Object.values(analysis.nodes).filter(n => n.tunable);
  if (tunables.length === 0) return <div className="dim mono">No tunable nodes in this analysis.</div>;
  return (
    <table className="lab nerd-loadbearing-table">
      <thead>
        <tr>
          <th className="mono">node</th>
          <th className="mono">text</th>
          <th className="mono" style={{textAlign: "right"}}>baseline C0 mid</th>
          <th className="mono" style={{textAlign: "right"}}>C0 at [0,0]</th>
          <th className="mono" style={{textAlign: "right"}}>C0 at [1,1]</th>
          <th className="mono" style={{textAlign: "right"}}><NerdTerm k="swing" /></th>
          <th className="mono">flag</th>
        </tr>
      </thead>
      <tbody>
        {tunables.map(n => {
          const lb = loadBearing && loadBearing[n.id];
          const flagged = !!lb;
          return (
            <tr key={n.id} className={flagged ? "nerd-lb-flagged" : ""}>
              <td className="mono">{n.id}</td>
              <td className="nerd-lb-text">{n.text}</td>
              <td className="mono" style={{textAlign: "right"}}>
                {lb ? `${Math.round(lb.baseMid*100)}%` : <span className="dim">—</span>}
              </td>
              <td className="mono" style={{textAlign: "right"}}>
                {lb ? `${Math.round(lb.lowMid*100)}%` : <span className="dim">—</span>}
              </td>
              <td className="mono" style={{textAlign: "right"}}>
                {lb ? `${Math.round(lb.highMid*100)}%` : <span className="dim">—</span>}
              </td>
              <td className="mono nerd-lb-swing" style={{textAlign: "right"}}>
                {lb ? `${Math.round(lb.swing*100)} pts` : <span className="dim">—</span>}
              </td>
              <td className="mono">
                {flagged
                  ? <span className="nerd-lb-flag-yes">load-bearing (≥15 pts)</span>
                  : <span className="dim">ok</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ════════════════════════════════════════════════════════════
// AI Courtroom verdict-tier components.
//
// These render the prosecution/defense/tribunal-verdict surface for
// entries that carry an analysis.courtroom payload. They are
// rendering-only; no math lives here. Math stays in the existing
// veracityLabel / pointEstimate / lrPosteriorRange helpers above.
// ════════════════════════════════════════════════════════════

// TribunalBanner — compact ~80px horizontal banner with three cells:
// the scale-band headline, a mini floor → central → ceiling band, and a
// row of reading pills (Exact / Approximate / Conventional). Renders
// nothing when courtroom is missing — graceful degradation for entries
// that don't have a courtroom field.
function TribunalBanner({ courtroom }) {
  if (!courtroom || !courtroom.verdict) return null;
  const v = courtroom.verdict;
  const floor = courtroom.floorAnalysis || {};
  const ceiling = courtroom.ceilingAnalysis || {};
  const readingOrder = ["Exact", "Approximate", "Conventional"];
  const readingRange = (k) => {
    const map = { Exact: ceiling.exactReading, Approximate: ceiling.approximateReading, Conventional: ceiling.conventionalReading };
    const r = map[k];
    if (r && Array.isArray(r.range) && r.range.length === 2) {
      return `${Math.round(r.range[0]*100)}–${Math.round(r.range[1]*100)}%`;
    }
    return null;
  };
  const central = floor.underFullCanon && typeof floor.underFullCanon.central === "number"
    ? floor.underFullCanon.central : null;
  const fmtVal = (val) => {
    if (typeof val !== "number") return "—";
    return val >= 100 ? val.toFixed(0) : val >= 1 ? val.toFixed(1) + "M" : `${Math.round(val*100)}%`;
  };

  return (
    <div className="courtroom-banner" role="region" aria-label="Tribunal verdict banner">
      <div className="courtroom-banner-cell">
        <div className="courtroom-banner-label">Tribunal verdict</div>
        {v.scaleBand && <div className="courtroom-banner-headline">{v.scaleBand}</div>}
      </div>
      <div className="courtroom-banner-cell">
        <div className="courtroom-banner-label">Floor — central — ceiling</div>
        <div className="courtroom-banner-band">
          <div className="courtroom-banner-band-col" title={floor.defenseHardFloor && floor.defenseHardFloor.basis}>
            <strong>{floor.defenseHardFloor ? fmtVal(floor.defenseHardFloor.value) : "—"}</strong>
            <span>Defense floor</span>
          </div>
          <div className="courtroom-banner-band-col" title={floor.underFullCanon && floor.underFullCanon.basis}>
            <strong>{central !== null ? fmtVal(central) : "—"}</strong>
            <span>Central (full canon)</span>
          </div>
          <div className="courtroom-banner-band-col" title={floor.prosecutionUpperCanon && floor.prosecutionUpperCanon.basis}>
            <strong>{floor.prosecutionUpperCanon ? fmtVal(floor.prosecutionUpperCanon.value) : "—"}</strong>
            <span>Prosecution ceiling</span>
          </div>
        </div>
      </div>
      <div className="courtroom-banner-cell">
        <div className="courtroom-banner-label">Reading-by-reading credence</div>
        <div className="courtroom-banner-readings">
          {readingOrder.map(k => {
            const r = readingRange(k);
            if (!r) return null;
            return (
              <span key={k} className="courtroom-banner-pill"
                    title={(ceiling[k.charAt(0).toLowerCase() + k.slice(1) + "Reading"] || {}).note || ""}>
                <em>{k}</em>{r}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// CourtroomOpenings — collapsible side-by-side prosecution + defense opening
// statements. Default closed; expanded reveals ~400 words from each side.
function CourtroomOpenings({ prosecutionOpening, defenseOpening, defaultOpen }) {
  if (!prosecutionOpening && !defenseOpening) return null;
  return (
    <details className="courtroom-openings" {...(defaultOpen ? { open: true } : {})}>
      <summary>
        <span className="courtroom-openings-chev" aria-hidden="true">›</span>
        <span>Opening statements — prosecution & defense</span>
      </summary>
      <div className="courtroom-openings-body">
        {prosecutionOpening && (
          <div className="courtroom-opening courtroom-opening--prosecution">
            <div className="courtroom-opening-label">Prosecution opening</div>
            <div>{prosecutionOpening}</div>
          </div>
        )}
        {defenseOpening && (
          <div className="courtroom-opening courtroom-opening--defense">
            <div className="courtroom-opening-label">Defense opening</div>
            <div>{defenseOpening}</div>
          </div>
        )}
      </div>
    </details>
  );
}

// CourtroomVerdictCard — the final synthesis card rendering the structured
// tribunal verdict (event, policy, scaleBand, readings, notes).
function CourtroomVerdictCard({ verdict }) {
  if (!verdict) return null;
  const readings = verdict.readings || {};
  const readingOrder = ["Exact", "Approximate", "Conventional"];
  return (
    <div className="courtroom-verdict-card">
      <div className="courtroom-verdict-card-eyebrow">Tribunal verdict — final synthesis</div>
      <dl className="courtroom-verdict-grid">
        {verdict.eventOccurred && (<><dt>Event occurred</dt><dd>{verdict.eventOccurred}</dd></>)}
        {verdict.policyTargetedGroup && (<><dt>Policy targeted</dt><dd>{verdict.policyTargetedGroup}</dd></>)}
        {verdict.scaleBand && (<><dt>Scale band</dt><dd>{verdict.scaleBand}</dd></>)}
        {readingOrder.filter(k => readings[k]).map(k => (
          <React.Fragment key={k}>
            <dt>{k} reading</dt>
            <dd>{readings[k]}</dd>
          </React.Fragment>
        ))}
      </dl>
      {verdict.notes && <p className="courtroom-verdict-notes">{verdict.notes}</p>}
    </div>
  );
}

// First-visit toast — quick onboarding for the audience choice.
function FirstVisitToast({ onPick }) {
  const [dismissed, setDismissed] = React.useState(false);
  React.useEffect(() => {
    try {
      if (window.localStorage && window.localStorage.getItem("fpv-mode-pick-seen")) {
        setDismissed(true);
      }
    } catch (e) { /* localStorage unavailable */ }
  }, []);
  if (dismissed) return null;
  const dismiss = (which) => {
    try { window.localStorage && window.localStorage.setItem("fpv-mode-pick-seen", "1"); } catch (e) {}
    setDismissed(true);
    if (which && onPick) onPick(which);
  };
  return (
    <div className="first-visit-toast" role="dialog" aria-label="Pick a view">
      <div className="first-visit-toast-head">
        <strong>Two views — pick the one that fits.</strong>
        <button className="first-visit-toast-close" onClick={() => dismiss(null)} aria-label="Dismiss">×</button>
      </div>
      <div className="first-visit-toast-body">
        <button className="first-visit-toast-btn" onClick={() => dismiss("plain")}>
          <span className="first-visit-toast-btn-label">Plain English</span>
          <span className="first-visit-toast-btn-sub">Answer + reasoning, in prose. No math.</span>
        </button>
        <button className="first-visit-toast-btn nerd" onClick={() => dismiss("nerd")}>
          <span className="first-visit-toast-btn-label">Show the math</span>
          <span className="first-visit-toast-btn-sub">Posteriors, LRs, sensitivity, the full ledger.</span>
        </button>
      </div>
    </div>
  );
}

Object.assign(window, {
  SummaryCard, HowToStrip, InspectorPrimer, Term, GLOSSARY, veracityLabel, formatRange, formatPercent, plainEnglishRange,
  pointEstimate,
  lrPosteriorRange, countLrItems, computeHypothesisPosterior,
  clampLRByTier, tierLRBounds,
  HeroVerdict, CrossChecks, KeyPremise, verdictHeadline,
  // Plain English mode exports
  PlainEnglishView, plainOdds, plainRangePhrase, plainSanitize, plainifyRanges,
  plainVerdictExplanation, plainReasonsList, plainSteelman, plainCruxes, plainGaps,
  // Nerd mode exports
  NerdHeader, EvidenceLRChain, ConjunctiveBayesPanel, LoadBearingTable, NerdTerm, NERD_GLOSSARY,
  FirstVisitToast,
  // Courtroom-mode exports
  TribunalBanner, CourtroomOpenings, CourtroomVerdictCard
});
