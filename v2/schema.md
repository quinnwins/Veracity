# Runtime data contract

The executable validators in `decomposition.mjs`, `engine.mjs`, and `evidence.mjs`, and the provider JSON schemas in `providers.mjs`, are authoritative. This document describes the persisted model, not a second implementation.

An assessment record has a generated UUID, revision, question, status, kind, timestamps, model, computed analysis, events, usage, warnings, optional parentId, and snapshots. Each snapshot stores the full model, its hash, engine version, range, reason, and timestamp.

## Model

- `contract`: exact `wording`, selected `reading`, `falsifier`, `scope`, alternate readings, `needsClarification`, and `mode` (`empirical` or `descriptive`). Historical imports may carry `asOf`; unknown publication dates fail historical evidence checks.
- `rootId`, `rivalRootIds`, and a `nodes` map. Rivals are separate roots for reachability, not automatically exclusive hypotheses.
- `sources`: IDs map to title, URL, preserved text, SHA-256, kind (`fetched`, `user-provided`, or explicitly demo-only `synthetic`), retrieval time, and publication time or null.
- `evidence`: IDs map to observation, targetNodeIds, explicit independenceCluster, exact source references, and likelihood `{lr:[low,high], provenance}`.
- `reviewStatus`: completed or incomplete for the automated pipeline. Incomplete blocks numerical recomputation.
- `versions`, retrieval records, warnings, and optional `demo: true`.

## Nodes

Each node has text, a type (claim/subclaim/premise/atomic/hypothesis/definition/value), a falsifier for empirical types, optional relation, and next-investigation guidance. Operational atomicity records a status and reason; a budget stop is unresolved, not proof that further decomposition is impossible.

A relation includes kind, child IDs, equivalence/rationale, and dependence or exclusivity semantics. AND/OR without genuine equivalence is unscored; informational links are not multiplied.

Probability inputs additionally require an ordered prior range, referenceClass, and provenance with kind/rationale. Optional plausiblePrior bounds drive scenarios. Multiple evidence clusters require independenceRationale. Model-elicited priors/LRs are labeled uncalibrated. Jev judgments are separate diagnostic envelopes with pinned versions and answer distributions.

## Computed analysis

`root` and `nodes` contain derived ranges or explicit unscored/descriptive states, reasons, applied rules, and dependency IDs. Diagnostics include probabilityInputIds, sensitivity cruxes, nextInvestigations, grounding counts, implemented sensitivity scope, engineVersion, and calibration status. No authored headline competes with the graph's declared computation.
