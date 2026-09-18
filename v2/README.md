# Veracity V2 — an inspectable research workspace

**Working, tested private beta. Not a certified production release or a claim of calibrated accuracy.** V1 at the repository root is unchanged. V2 is an independent Node application, not the earlier static mockup.

## Run it

Node.js 22.16 or later. The Probability Lab uses built-in SQLite (experimental in the tested Node versions). No runtime packages, API keys, or CDN dependencies are needed for the worked example.

```sh
cd v2
npm test
npm run check
npm start
```

Open `http://127.0.0.1:8787`. Select **Explore a worked example**. Its logs and numerical inputs are clearly labeled fictional. The displayed probability is actually computed. Click an assumption, save a separate what-if scenario, add a quoted observation, inspect version history, and export the complete record.

For live research you can use direct API models **or agent harnesses**:

```sh
cp .env.example .env
# Direct API mode: configure OPENAI_API_KEY + model variables.
# Harness mode: cp agents.example.json agents.json and select named agents.
npm start
```

The orchestrator and grunt/worker are first-class, independently selectable roles. A run may use Codex for orchestration, Claude Code or Gemini CLI for grunt work, a direct API model for either role, or any custom command/HTTP bridge implementing `veracity-agent/v1`. The browser saves the chosen agent names with each run. See `HARNESS_AGENTS.md`. Harnesses use their own authentication/session rules; Veracity does not impersonate API credentials or bypass product limits. A missing provider returns a clear error; arbitrary questions never receive the demo's static numbers.

## What works

**Ask → research → assessment.** A server-side job preserves the exact question, constructs a claim contract, decomposes the graph, checks leaves for hidden assumptions, searches for supporting and contrary evidence, fetches readable source text, validates exact quotations, elicits a disclosed evidence model, challenges it, and runs deterministic inference. Stage events, failures, usage, requested/returned provider versions, sources, and results are saved.

**An operational stopping rule.** A leaf stops at a specified measurement or definition boundary. Unresolved leaves remain unresolved when depth, node, time, or call budgets are reached. The system does not claim philosophical irreducibility.

**One coherent computation.** AND/OR composition requires an explicitly justified logical equivalence, not merely necessary conditions or plausible causes. An explanation map is not multiplied into a truth probability. Unknown dependence uses bounds. Shared input/source/cluster IDs prevent an independent-product shortcut. Invalid numerical inputs are rejected rather than repaired silently.

**Evidence you can inspect.** Exact quotations are checked against stored text and SHA-256 digests. Repeated observations in the same cluster cannot compound the update. Conflicting cluster estimates require a joint likelihood. Automated research elicits one joint likelihood for its whole packet rather than pretending that several articles are independent experiments. Model priors and likelihoods remain explicitly uncalibrated judgments.

**Useful next work.** One-at-a-time prior and likelihood endpoint sweeps identify assumptions capable of moving the root. Focused follow-up research creates a linked assessment, retains its original pre-evidence prior, and replaces its joint evidence update rather than updating on its own previous posterior.

**Stateful exploration.** What-if scenarios leave the original untouched. Evidence changes create version snapshots, with optimistic concurrency checks and JSON export. Failed, cancelled, and interrupted jobs retain the evidence already saved. The browser shows no finished answer for an unfinished run.

**Private service controls.** Same-origin write checks, Host validation, server-side credentials, HttpOnly sessions, request limits, bounded concurrency, idempotency, response-size caps, abort signals, strict source URL checks, DNS address pinning, and redirect revalidation are implemented. This is a single-user, single-process workspace, not a multi-tenant SaaS platform.

## How to interpret the display

- **Conditional credence** is an envelope under disclosed prior, likelihood, and dependence assumptions. It is not a measured confidence interval or universal truth score.
- **Evidence coverage** counts numerical inputs with inspectable passages. It is not source quality, correctness, or a percentage chance of truth.
- **Assumption sensitivity** measures endpoint movement in the implemented sweeps. It does not measure all structural uncertainties.
- **Expected information gain** is available as a tested arithmetic function only when a coherent predictive distribution is supplied. The UI otherwise says potential movement; it never fabricates EIG from arbitrary interval midpoints.

In the original research pipeline, Jev provides a pinned-version **passage relevance diagnostic**. The new Probability Lab separately provides batched local probability estimates; see `scale/README.md`. It is stored separately from the likelihood model. Relevance probability is never treated as a likelihood ratio or world-claim probability. Direction, measurement-fit, and semantic duplicate classifiers are future benchmark-gated extensions, not shipped capabilities.

Definitions and value choices are separated from empirical claims. Political/electoral requests are directed to descriptive evidence maps, without political rankings, endorsements, or election-outcome probabilities.

## Evaluation and verification

```sh
npm test                  # 225 automated tests at the no-Jev-capable revision
npm run check             # Parse every JS module; check no CDN entrypoint dependency
node evaluate.mjs reviewed-predictions.jsonl
```

The evaluator accepts one task/model population per run. Each JSONL row needs `id`, `task`, `model`, `probability`, binary `outcome`, `predictedAt`, and later `resolvedAt`; an optional `evidenceCutoff` cannot be after prediction. It reports Brier score, log loss, reliability bins, and calibration error. **No real held-out benchmark or fitted calibrator is included.** Synthetic test fixtures verify the implementation, not model accuracy.

See `QA_REPORT.md` for exact checks and limitations. HTTP integration tests use a real local server and temporary storage. Provider tests use injected responses following documented contracts. Offline Chromium checks use server-generated records and a browser transport test double. Live browser navigation was blocked by the execution environment; the full browser/server script is supplied for a normal development machine.

## Deployment boundary

The default binds only to `127.0.0.1`. For access through a reverse proxy, set a random `VERACITY_ACCESS_TOKEN` of at least 24 characters and a bare HTTPS `PUBLIC_ORIGIN`, and restrict direct access to the backend port. Terminate TLS at the proxy. Never expose the local unauthenticated mode to a network. Sessions expire after eight hours; keys are not returned by `/api/config`.

Storage defaults to `.data`, with private directory/file modes, a single-writer lock, atomic replacement, integrity hashes, and persisted revisions. Use a persistent disk with backups and a quota. Hashes detect accidental corruption; they are not signatures proving truth or resisting an administrator rewriting the store. This storage design targets POSIX systems and is not a horizontally scalable database.

After a hard crash, inspect `.data/.writer.lock` and verify its recorded process has stopped before removing the stale lock. Do not run two writers against one directory. Interrupted runs are marked on restart. There is no automatic resumption of paid provider work.

Default limits: 24 provider requests (retries count), 24 source fetches, 180,000 reported model tokens, 40 graph nodes, two atomicity review rounds, six researched targets, ten-minute run deadline, two concurrent jobs, 200 assessments, and 30 evidence snapshots per assessment. A token limit is checked between calls and can be exceeded by the final response; it is not a guaranteed billing cap. No 15-hour background scheduler is installed.

Sources currently support public HTTPS IPv4 text/HTML/JSON. PDFs, login-protected pages, compressed content, and IPv6-only hosts fail explicitly. Publication dates are not guessed from retrieval time. Long sources have bounded model reading windows; truncation is recorded. These limitations can materially reduce research coverage.

See `PRODUCTION_READINESS.md` before deployment beyond a private evaluation workspace.

## Main modules

`engine.mjs` — probability rules and validation. `decomposition.mjs` — graph validation and stage prompts. `evidence.mjs` — provenance, deduplication, and safe retrieval. `graph.mjs` — inference, abstention, and sensitivity. `providers.mjs` — real provider adapters and budgets. `pipeline.mjs` — bounded research orchestration. `store.mjs` — durable audit records. `server.mjs` — HTTP service. `public/` — functional responsive interface. `evaluate.mjs` — outcome-based evaluation.

Provider contracts checked against official documentation:

- https://developers.openai.com/api/docs/guides/structured-outputs
- https://developers.openai.com/api/docs/guides/tools-web-search
- https://docs.typesafe.ai/api
- https://docs.typesafe.ai/models

## Probability Lab: strong orchestration, cheaper workers, probability breadth

Open `/scale` from the new Probability lab header link. The durable ledger supports up to 100,000 validated local questions, exact-context batching/cache reuse, persistent attempts/budgets, pause/resume, selective stronger-model review and an explicit reviewed-estimate composition API. Guided source expansion is bounded; it does not manufacture 100,000 assumptions from each topic.

Select an orchestrator and grunt agent through `agents.json` / the browser (direct OpenAI API models remain the backwards-compatible default), then choose a probability estimator. Jev is optional: with no TypeSafe key, any configured grunt/harness agent can produce structured JSON probabilities. No-key synthetic simulations exercise the real queue/store. `npm run scale:bench -- --count 100000` reproduces the synthetic cold/cache/changed-packet load test. Read `HARNESS_AGENTS.md`, `scale/README.md`, and `scale/QA_REPORT.md` for contracts, executed verification, and remaining gates. No real factual calibration is claimed.
