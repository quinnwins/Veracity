# Jev integration — implemented boundary

`JevProvider` in `providers.mjs` uses the documented POST `https://api.typesafe.ai/v1/systemone` contract with pinned `jev-1.13.0` by default. The request contains a state packet and a `noul` relevance question. The response's model version and answer distribution are validated. Keys stay server-side.

The implemented task asks whether the packet directly measures/documents the specified proposition. Its probability is stored with model version, exact question, source IDs, timestamp, and calibration status. It is **not** the truth probability, a likelihood ratio, independent corroboration, or proof of source accuracy. A Jev failure is visible and does not silently invent a result.

Support/contradiction classification, measurement-fit rubrics, semantic duplicate proposals, and learned judgment-to-likelihood mappings remain benchmark-gated work. Do not represent these as implemented just because they appeared in the original design document.

The main research model currently elicits disclosed priors and joint likelihood ranges. They are not empirically calibrated. The evaluation harness in `evaluate.mjs` can measure supplied reviewed predictions; it does not train a calibrator or create ground truth.

Official references checked during implementation:
- https://docs.typesafe.ai/api
- https://docs.typesafe.ai/models
