# Executable inference rules

`engine.mjs` owns arithmetic; `graph.mjs` owns traversal, gating, and diagnostics. Inputs are strict finite ordered intervals, not silently clamped/reordered values. UI state is not an input.

## Binary evidence

For each declared conditionally independent evidence cluster, update log odds by log LR. LR means P(E|H)/P(E|not H). Exact prior endpoints 0 and 1 are preserved under finite positive likelihoods. Intermediate updates use stable log-space arithmetic.

`validateEvidence` checks source text, quotes, digests, provenance, and optional historical cutoffs. `collapseEvidence` collapses an exact repeated observation in a cluster and rejects conflicting updates. Automated research supplies a single joint LR for each target's entire source packet; it does not assume articles are independent.

## Composition

AND/OR composition additionally requires `equivalent: true` and a rationale establishing that the parent event is logically equivalent to that composition. Merely necessary conditions, mechanisms, or supporting premises cannot substitute for this. Informational/causal maps do not generate root probabilities by multiplying their leaves.

Independent AND: multiply probabilities. Unknown-dependence AND: lower bound max(0, sum lower endpoints − (n−1)); upper bound min upper endpoints. Independent OR uses complements. Exclusive OR sums, rejecting infeasible lower sums. Unknown-overlap OR uses max lower endpoint and min(1, sum upper endpoints).

Independence needs an explicit rationale. Reused primitive inputs, source IDs, or observation clusters across branches force dependence bounds. These are deterministic ID checks, not proof that all hidden real-world dependence has been discovered.

Normalized multi-hypothesis updates require explicit exclusive/exhaustive flags, disclosed priors summing to one, and likelihoods relative to a common reference. Arbitrary H-versus-rest odds for different hypotheses cannot be normalized as a coherent likelihood vector. This function is tested; the default research interface leaves potentially overlapping rivals unnormalized.

## Abstention and mandatory review

Unresolved atomicity, missing priors/reference classes, missing required children, unsupported semantics, invalid citations, and unfinished mandatory adversarial review withhold numerical results. An incomplete review is stored on the model, so a later scenario or recomputation cannot bypass it.

## Diagnostics

Credence is an envelope under declared assumptions, not a calibrated confidence interval. Grounding is the transparent count of root-relevant probability inputs with inspectable source passages. Stability reports implemented one-at-a-time prior/LR endpoint movement, not a separate probability or comprehensive structural robustness.

EIG is computed only for point posteriors and a predictive outcome distribution satisfying both normalization and the law of total probability. Interval midpoints do not invent a predictive distribution. The interface otherwise reports potential movement.
