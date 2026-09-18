# V2 evaluation

The benchmark separates **document interpretation** from **world prediction**.

## Evidence-judgment benchmark

Build 500–1,000 reviewed examples for passage↔claim relevance, support/contradict/mixed/unresolved, measurement fit, and duplicate/shared-root detection.

Measure accuracy/F1 where appropriate, Brier score, log loss, calibration, selective accuracy at abstention thresholds, latency, and cost.

Compare pinned Jev, a capable reasoning model, and a simple baseline where meaningful.

## End-to-end historical benchmark

Use questions whose outcomes were unknown at a historical cutoff but are known now. Freeze evidence to the cutoff date. Measure Brier/log score, calibration, sharpness, abstention quality, update direction after new evidence, and duplicate-evidence robustness. Never leak post-cutoff evidence.

## Invariant tests

1. Duplicate the same source ten times → posterior unchanged.
2. Quote one primary through five articles → one independence cluster.
3. Hide/open every UI node → posterior unchanged.
4. P(not H) displayed as exact code-derived complement of P(H).
5. AND relation changed from independent to bounded → output widens.
6. Overlapping hypotheses → no forced normalization.
7. Remove provenance from a crux → grounding drops.
8. Widen a load-bearing prior → stability drops or posterior widens.
9. Contradictory evidence remains visible.
10. Missing relation semantics → abstain.

## Jev success gate

Jev becomes default for a local judgment only if it clears a predefined held-out quality floor and materially improves latency/cost. Optimize against reviewed labels or resolved outcomes, not agreement with the larger model.

## Calibration

A 0.8 prediction should be correct roughly 80% of the time on the appropriate evaluation population. If not, fit a held-out calibrator and version it. Calibration is task/domain-specific.
