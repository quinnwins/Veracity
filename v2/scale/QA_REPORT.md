# Probability Lab verification — September 18, 2026

Private beta, not production certification or a claim of calibrated model accuracy.

## Executed checks

- **223 automated Node tests pass** at the harness-agnostic revision. The earlier Probability Lab revision had 213; the added coverage validates the generic command/HTTP bridge protocol, strict returned-schema checks, Codex/Claude/Gemini wrapper adaptation with fake CLIs, and per-run orchestrator/grunt routing. No failures, skips or cancellations.
- All JavaScript modules parse; both browser entrypoints are checked for CDN dependencies.
- The full 223-test suite passes in the isolated Mac checkout on Node.js 24.14.1. An earlier 213-test rerun found and fixed a test synchronization race: a saved preparation may precede job cleanup, so the integration test now waits for the job to finish before asserting dispatch approval behavior. Simulation capacity is rechecked after reading its request body.
- Eight sandbox Chromium workflow checks passed with zero page errors. Actual application code used fetch/history test hooks forwarding to a real local HTTP service and SQLite, not canned API results. Desktop 1440×1050 and mobile 390×844 layouts had no horizontal document overflow.

The UI checks created/completed 1,000 fictional estimates, exercised cursor pagination, inspected stored packet/request/response/attempt traces, disclosed review coverage, verified complete ledger export, and checked the original research homepage's mobile lab link.

Native browser navigation in the sandbox returned ERR_BLOCKED_BY_ADMINISTRATOR. A later native-check launch on the connected Mac was blocked before execution. Native browser networking, CSP, cookies and native downloads are therefore not claimed as verified. Real HTTP authorization/Origin behavior was tested separately. The supplied browser script supports native testing in a normal permitted environment.

## Completed 100,000-question synthetic benchmark

A deterministic fictional client exercised the actual scheduler, SQLite and cache. No paid or real Jev call occurred. Every phase persisted exactly 100,000 completed estimates.

| Phase | Batches | Simulated requests | Cached batches |
|---|---:|---:|---:|
| Cold pass | 3,200 | 3,200 | 0 |
| Identical rerun | 3,200 | 0 | 3,200 |
| One of 100 evidence packets changed | 3,200 | 32 | 3,168 |

The final completed Linux benchmark used Node.js 22.16.0: all three phases plus import/review selection took 37.667 seconds, peak RSS 131,248 KiB (about 128 MiB), and the three-run database occupied 731,508,736 bytes before final checkpointing. These are synthetic execution measurements, not live model latency, billing, factual accuracy or an SLA.

Review allocation selected 40 estimates, identified 3,502 critical/weak-fit candidates and left 99,960 explicitly unreviewed. It did not claim that a small sample validated every estimate.

## Tested safeguards

Pinned Noul request/response contracts; exact answer-set and probability validation; source digests/publication cutoffs; UTF-8 request and JSONL limits; exact quotation and node-mapping validation; deduplication; changed-packet invalidation; synthetic/live cache separation; atomic rollback; rate gates/Retry-After; concurrent dispatch reservations; uncertain billing; pause/cancel/restart; corruption detection; random confident-answer review; explicit logical-equivalence and common-conditioning requirements; shared-source dependence bounds; prohibition on reusing direct-estimate evidence as a fresh update; authenticated HTTP routes, Origin checks, idempotency, preparation cancellation and ledger export.

## Not established

No credentialed live OpenAI/Codex/Claude/Gemini/Antigravity/Jev inference call, actual provider latency/cost measurement, held-out factual benchmark, fitted calibration model, equal-budget accuracy comparison, independent security audit or multi-tenant certification ran. The harness wrappers were contract-tested with fake CLI executables; that proves protocol adaptation, not vendor authentication or model quality. Synthetic throughput is not evidence of judgment quality.

Guided preparation remains bounded by saved evidence windows and worker budgets. Bulk capacity does not mean every topic automatically generates 100,000 grounded assumptions. Final composition needs an explicit reviewed graph and does not replace the canonical assessment automatically. Root-sensitive active research allocation, semantic dependence validation, disk/cache garbage collection, provider compatibility and production operations remain release gates.
