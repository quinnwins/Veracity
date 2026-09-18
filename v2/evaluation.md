# Evaluation: implemented harness and outstanding benchmark

`evaluate.mjs` computes Brier score, log loss, reliability bins, and empirical calibration error from supplied resolved binary predictions. It rejects duplicate IDs, invalid probabilities, predictions dated after resolution, evidence cutoffs after prediction, and mixed task/model populations. Certain wrong predictions retain infinite log loss rather than being silently clipped.

```sh
node evaluate.mjs reviewed-predictions.jsonl
```

Each row: id, task, model, probability, outcome (0 or 1), predictedAt, resolvedAt, and optionally evidenceCutoff. Run one task/model population at a time. Labels must come from reviewed annotations or independently resolved events, not agreement with another language model. Timestamp checks cannot establish that a model's training data did not leak a result.

## Still required

Construct a reviewed corpus for atomic decomposition quality, passage relevance, support/contradiction, outcome measurement fit, source-root duplication, and graph semantics. Reserve a genuinely held-out set. Separately evaluate world predictions under historical evidence cutoffs or prospective outcomes. Document label provenance and uncertainty.

Compare the complete workflow against simple baselines and direct larger-model assessment. Measure accuracy, calibration, selective accuracy/abstention, latency, retrieval coverage, and actual provider cost. Do not optimize for agreement with a larger model as if it were ground truth.

No such corpus, measured real-model accuracy, trained calibration mapping, or world-class ranking is included in this revision. Synthetic engine tests establish arithmetic/software properties only. Refer to `QA_REPORT.md` for what ran.
