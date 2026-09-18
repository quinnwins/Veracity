# Jev adapter boundary

Jev should make **small semantic judgments over shared evidence**, quickly. It does not own the world model.

## Tasks

**Relevance:** Does passage S bear directly on atomic claim A?

**Direction:** Conditional on S being accurate, is its relationship to A: supports / contradicts / mixed / unresolved?

**Measurement fit:** Does the source measure the outcome named in the claim contract?

**Duplicate/correlation candidate:** Are sources A and B reporting the same underlying observation, dataset, study, witness, or event? This proposes a cluster; deterministic code performs the collapse.

## Stored envelope

Store provider, pinned model version, adapter version, exact question, answer distribution, source IDs + exact spans, and timestamp.

## Do not do

- Do not ask Jev for the final probability of an entire controversy and call it the posterior.
- Do not treat raw Jev confidence as an LR.
- Do not ask arithmetic/complement questions code can derive.
- Do not paraphrase the same evidence ten ways and count the answers as independent.

## Judgment → likelihood

V2 starts conservatively:

1. Jev classifies relevance and qualitative direction.
2. A mapping from judgment features to LR is learned only after a benchmark exists.
3. Until then, LR values remain explicit elicited ranges with provenance.
4. The UI distinguishes model-classified evidence from empirically calibrated likelihoods.

Never use a moving model alias for reproducibility-critical assessments. Pin the evaluated version and rerun calibration before upgrading.
