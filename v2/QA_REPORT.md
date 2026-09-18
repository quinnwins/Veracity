# Verification report — V2 beta implementation

## Executed

- The original private-beta engine passed **147 automated tests** on Node.js 22.16.0. The current harness-agnostic revision passes **225 automated tests** with zero failures/skips/cancellations on the connected Mac (Node 24.14.1).
- `npm run check` parsed all JavaScript modules and checked the browser entrypoint for CDN dependencies.
- **Seven offline Chromium workflow checks passed**, zero JavaScript page errors, at desktop 1440×1000 and mobile 390×844.
- Desktop and mobile screenshots were rendered and visually inspected. Neither tested layout had document-level horizontal overflow.

## Automated coverage

Strict probabilities and likelihoods; numerical stability; complements; conjunction/disjunction bounds; common-reference hypothesis updates; coherent expected information gain; 300 seeded probability checks; graph cycles/depth/reachability; exact quotes and source hashes; duplicate/conflicting evidence; shared-source dependence; incomplete-review withholding; scenarios; source publication cutoffs; unsupported PDFs; DNS pinning; private redirects; source size limits; cancellation during DNS; provider request schemas/refusals/version drift/errors; actual pipeline orchestration with injected providers; call budgets; outcome scoring/calibration bins; local HTTP routes, credentials, Unicode token handling, same-origin/Host checks, unavailable-provider behavior, idempotency, capacity and cancellation; persistent revisions, integrity, single-writer locks, and interrupted jobs.

## Offline interface checks

The UI loaded server-generated demonstration, scenario, and evidence-update records. Browser transport was a test double; no model APIs were called. Checked honest provider status, computed demonstration result, scenario request/rendering, saved history, keyboard tab navigation, correct JSON export, evidence form payload/rendering, and responsive graph/inspector.

## Explicitly not verified

The environment returned `ERR_BLOCKED_BY_ADMINISTRATOR` for browser navigation to the local server. Full live browser/server navigation therefore did not pass and is not represented as tested. `scripts/browser_qa.py` is supplied for a normal environment; `scripts/offline_browser_qa.py` reproduces the checks that ran here.

No external model API was called with live credentials. No live latency, cost, factual accuracy, broad-topic calibration, production load, security audit, or comparative “best judge” benchmark was measured. Fictional fixtures are not evidence of those properties.

## Probability Lab extension

The completed Probability Lab extension originally passed 213 automated tests. The current harness-agnostic/no-Jev extension passes 225, adding bridge/schema, per-run agent routing, and a no-TypeSafe grunt-probability backend with explicit abstention coverage. Eight sandbox browser checks and a three-pass 100k synthetic load test are recorded in `scale/QA_REPORT.md`. Native browser transport and live credentialed OpenAI/Codex/Claude/Gemini/Antigravity/Jev inference remain unverified.
