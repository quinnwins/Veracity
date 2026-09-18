# Probability Lab — three-tier inference

A runnable Veracity V2 extension for strong orchestration, cheaper research workers and batched Jev probability estimates. V1 is unchanged. This is a private beta, not a calibrated truth service.

## Implemented workflow

1. A configured strong model plans assumption families and rival explanations, tied to a saved assessment's graph.
2. An explicitly configured cheaper model extracts scoped empirical questions from stored source windows. Every question needs a falsifier, yes/no criteria and a brief exact source quotation. Fabricated quotations and invalid parent mappings are rejected.
3. Pinned Jev Noul calls estimate `P(proposition | supplied evidence, model)` in shared-context batches. These are direct local estimates, not independent observations, likelihood ratios or a final root probability.
4. A bounded strong-model review queue selects consequential, weak-fit and uncertain inputs plus a seeded random sample of confident estimates. Acceptance remains a model review, not empirical calibration.
5. An explicit API/CLI composition graph can combine accepted estimates under disclosed logical and dependence assumptions. It does not silently overwrite the original research assessment.

## Run

Node.js 22.16 or later. Built-in SQLite is experimental in the tested Node versions; no new runtime npm dependencies are needed.

```sh
cd v2
npm test
npm run check
npm start
```

Open `http://127.0.0.1:8787/scale`. No-key simulations exercise real storage, batching and caching with 1,000, 10,000 or 100,000 explicitly fictional questions. They make no external calls.

For live work configure server-side `OPENAI_API_KEY`, `OPENAI_ORCHESTRATOR_MODEL`, explicit `OPENAI_WORKER_MODEL`, `TYPESAFE_API_KEY` and pinned `JEV_MODEL=jev-1.13.0`. `OPENAI_MODEL` remains an orchestrator fallback. Use account-supported Responses/structured-output models; source-search workers also need web search. No paid model is silently chosen.

Research an empirical question first, then expand its saved evidence in the lab. Preparation spends bounded orchestrator/worker calls. Jev scoring starts only after approving the saved plan and its estimate. Strong-model review needs separate approval. Stopping dispatch does not guarantee in-flight requests are unbilled.

## Scale and evidence limits

The durable ledger accepts up to 100,000 validated local questions per campaign through a streaming JSONL manifest. Guided preparation is narrower: at most 64 saved source windows, 32 candidate questions per extraction and a bounded worker-call allowance. It may generate far fewer than the requested ceiling. It never pads the graph to manufacture 100,000 assumptions.

Questions sharing evidence are batched. Cache keys include the pinned model, exact questions, evidence state, prompt/adapter version and live-versus-synthetic namespace. Identical reruns avoid fresh inference; a changed packet invalidates only its associated batches. Exact duplicates are consolidated with the highest review priority retained. Semantic duplicates and hidden dependence still require scrutiny.

SQLite stores immutable packets, question fingerprints, batches, attempts, raw responses, reviews and cache records. Successful batches commit atomically. Invalid versions, partial answer sets or malformed probabilities are withheld. Source/task/score/cache hashes detect accidental corruption, not an administrator rewriting both data and hashes.

Defaults are 32 questions per batch, four workers, 120 requests/minute, 60,000 input reservation units/second, two retries, a 30-second Jev timeout, 12,000 attempted requests, 100 million reserved input units and a $5 Jev-only reservation ceiling. UTF-8 byte accounting is conservative packing, not a verified tokenizer or guaranteed invoice cap. The price assumption is configurable: $0.042/million input tokens, verified in TypeSafe documentation on September 18, 2026. Planning, research, review, web tools and hosting are separate costs.

Every dispatch/retry reserves capacity first. Unknown billing stays reserved; reported usage can increase the reservation. Retry-After and transient 429/529/502/503/504 responses are handled. Protocol/auth/budget failures stop new dispatch. Pause/resume and crash recovery preserve completed work and spent reservations; paid work never resumes automatically.

The service is private, single-user and single-writer. There is one scale operation at a time, stable streamed exports and a 30-campaign retention ceiling. There is no disk quota, cache garbage collector, multi-tenant isolation or distributed scheduler. A full 100k trace can occupy hundreds of megabytes. Use private persistent storage, backups and disk monitoring. Follow the main README's authentication/TLS boundary.

## CLI

```sh
npm run scale:bench -- --count 100000 --report /tmp/scale-benchmark.json
npm run scale -- prepare assessment.json --limit 500
npm run scale -- plan manifest.jsonl
npm run scale -- show <campaign-id>
npm run scale -- run <campaign-id> --approve <plan-hash>
npm run scale -- review <campaign-id> --approve <plan-hash>
npm run scale -- export <campaign-id> > estimates.jsonl
npm run scale -- compose <campaign-id> --graph graph.json
```

CLI storage defaults to `.scale-data`; `--db DIRECTORY` chooses a separate private store. Do not run a CLI writer against the active service database. CLI export includes campaign/estimates; HTTP full-ledger export also contains exact source packets and batch request/response/attempt traces.

The manifest's first JSONL object contains `contract`, `packets`, optional `limits`, and `model`. Each later line is a question. Contracts need empirical mode, exact wording, scope and evidence cutoff. Packets need IDs and source passages with exact SHA-256, origin, and optional URL/publication/underlying observation ID. Questions need packetId, proposition, falsifier, scope, yes/no criteria, family, priority and sourceFit. See `contracts.mjs` and `synthetic.mjs` for complete executable contracts; synthetic origin is rejected in live manifests.

## Review and composition

Review allocation combines priority, source fit, entropy and a seeded random audit. It is not measured expected information gain or root sensitivity. Unreviewed counts stay visible; review never silently changes probabilities or marks the entire campaign validated.

`POST /api/scale/runs/:id/compose` accepts `{graph}`. Up to 1,000 explicit nodes and depth 20 are supported. Estimate leaves refer to accepted task IDs. AND/OR nodes require a declared logical equivalence and rationale. Shared source/observation/input hashes disable an independence shortcut. Unknown dependence uses bounds. Cycles and disconnected nodes are rejected.

A model mixing evidence packets must declare `commonConditioningRationale`: why those marginals remain applicable under combined evidence. This is an explicit assumption, not something the validator proves true. Direct estimates already incorporate their evidence; applying that same evidence again as likelihood updates is forbidden. The result retains the graph, assumptions, source links and provenance hash. It is not a calibrated interval or an automatic product of every candidate.

Guided political/electoral or value-choice requests remain descriptive evidence maps rather than numeric verdicts or rankings.

## Verification boundary

The scale implementation passed 213 automated tests and a three-pass 100,000-question synthetic benchmark; see `QA_REPORT.md`. Eight sandbox Chromium workflow checks used actual application code and real local HTTP/SQLite through transport hooks. Native browser/network verification remains incomplete. No credentialed live model call or held-out factual calibration benchmark ran.

The next scientific test is equal-budget strong-only research versus strong orchestration, cheap extraction, Jev breadth and selective review. Measure missed decisive evidence, calibration, latency and total cost—not merely agreement with another model. Existing `evaluate.mjs` can score properly dated resolved predictions; no fabricated factual benchmark or calibrator is bundled.

Official integration references: https://docs.typesafe.ai/models ; https://docs.typesafe.ai/api ; https://docs.typesafe.ai/primitives/noul ; https://developers.openai.com/api/docs/guides/structured-outputs . Recheck current provider limits and prices before deployment.
