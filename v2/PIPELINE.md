# Implemented research pipeline

The executable orchestration is `pipeline.mjs`. This supersedes the original design-only flow.

1. Preserve the exact question; create a claim contract and separate materially different readings. Ask for clarification rather than score an unresolved reading.
2. Generate a bounded graph and rival roots. Validate relationships, reachability, cycles, node count, and depth.
3. Review leaves for hidden assumptions. Split where justified, stop at measurement/definition boundaries, and mark budget-limited leaves unresolved. AND/OR requires logical equivalence; explanatory premises use informational links.
4. Research eligible inputs up to the target budget, prioritizing a root that needs its own evidence model. The provider is instructed to find evidence for and against the exact proposition and its falsifier. The current implementation does not certify balanced source coverage.
5. Retrieve public readable source text with SSRF-resistant DNS pinning and redirect checks. Store raw normalized text and digests; unsupported/unavailable sources become warnings.
6. Optionally run pinned Jev passage-relevance diagnostics. Never turn these probabilities into LRs or posterior probabilities.
7. Elicit a pre-evidence prior, reference class, and one joint LR range for the supplied packet. Verify exact quoted passages, prior/evidence separation metadata, and numerical/provenance validity. Record reading-window truncation. Abstain on undefended inputs.
8. Run an adversarial review of the graph and evidence model. Blocking findings mark affected nodes unresolved. Review failure is a persisted model-level gate, not just a hidden headline.
9. Compute deterministic graph results and one-at-a-time sensitivity. Report partial coverage, not a fake completed audit. Potential movement is not expected information gain.
10. Save model, sources, versions, usage, warnings, events, and a reproducible snapshot. The client displays actual progress and can cancel. Focused investigations branch from an existing model and replace the relevant joint update without using the previous posterior as a new prior.

Each model pass may share biases with the previous pass. Structural validation is not semantic truth verification. Live integration, source completeness, calibration, and production operational gates remain in `PRODUCTION_READINESS.md`.
