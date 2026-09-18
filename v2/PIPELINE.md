# Production pipeline

This is the target execution path for a controversial factual question.

## Stage 0 — claim contract
Preserve exact wording. Extract population, geography, horizon, outcome, quantifiers, causal language, and loaded terms. Generate separate readings when wording materially changes the truth conditions. Values/normative preferences are separated from empirical premises.

## Stage 1 — adversarial decomposition
A capable reasoning model creates the first graph. A second atomicity pass attacks every leaf for hidden empirical assumptions. Continue until each leaf can be assessed by a compact evidence packet and has a concrete falsifier. Validate graph structure before scoring.

## Stage 2 — rival generation
Generate materially distinct rival explanations to comparable depth. Do not force them into a probability simplex unless they form a genuine exclusive/exhaustive partition.

## Stage 3 — evidence acquisition
Search specifically for each atomic leaf and its falsifier, not just for the root claim. Prefer root observations/primary materials where available. Store exact spans and dates. Search explicitly for counterevidence.

## Stage 4 — evidence clustering
Trace reports to their root study/dataset/event/witness. Jev or another fast judge can propose duplicate/correlation links; the ledger stores the verified cluster. One cluster produces at most one Bayesian update unless a dependence model says otherwise.

## Stage 5 — local judgment
Use pinned, benchmarked model versions for relevance, direction, measurement fit, and duplicate detection. Store the full probability distribution and exact question. Never convert model confidence directly into world-claim probability.

## Stage 6 — probability elicitation
For each atomic claim:
- establish a reference-class prior range;
- estimate P(E|H) and P(E|not H), or an LR range, per independent evidence cluster;
- record rationale and provenance;
- abstain if the estimate cannot be defended.

For high-impact nodes, use independent elicitation passes and reconcile disagreement by widening the range, not averaging it away.

## Stage 7 — deterministic inference
Run only through `engine.mjs`. Explicit graph semantics determine composition. Unknown dependence yields bounds. Missing semantics abstains. UI state is not an input.

## Stage 8 — adversarial self-audit
Run at least:
- strongest case against the current root posterior;
- search-asymmetry audit;
- double-counting audit;
- prior sensitivity;
- LR sensitivity;
- claim-reading sensitivity;
- dependence sensitivity;
- source-date/freshness audit.

## Stage 9 — crux and value-of-information
Rank uncertain inputs by root swing. Where outcome probabilities can be defended, compute expected information gain. Otherwise report potential swing. Recommend the cheapest observation likely to reduce the most consequential uncertainty.

## Stage 10 — user output
Lead with:
- exact reading being assessed;
- credence range;
- grounding;
- stability;
- 2–4 live cruxes;
- strongest evidence on both sides;
- best next investigation.

Every number expands to provenance and math. Every material update creates a snapshot.

## Safety against pseudo-objectivity
The system must never call itself unbiased or objectively correct. Its claim is narrower and testable: **auditable, symmetric, provenance-preserving, probabilistically coherent under declared assumptions, and empirically calibrated where benchmark data exists.**

## Production gates
Do not ship as "production" until:
- invariant tests pass;
- decomposition benchmark exists;
- evidence-judgment benchmark exists;
- calibration curves are measured on held-out data;
- historical-cutoff end-to-end benchmark is run;
- source retrieval has freshness/provenance guarantees;
- provider failures/timeouts degrade to explicit partial/abstain states;
- secrets stay server-side;
- rate limiting, abuse controls, tracing, caching, and cost budgets exist;
- every assessment stores engine/model/calibrator versions for reproducibility.
