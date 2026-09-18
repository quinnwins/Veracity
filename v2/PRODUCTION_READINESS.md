# Release gates — private beta, not production-certified

## Implemented and exercised

- Deterministic, strict numerical inference, dependence bounds, graph validation, quotation/digest validation, duplicate-cluster checks, mandatory-review gating, and disclosed sensitivity calculations.
- Recursive decomposition orchestration, bounded research, actual HTTP provider adapters, cancellation, partial results, and targeted investigations.
- Private HTTP service, authentication/session controls, source URL/DNS protections, request/concurrency limits, idempotency, optimistic revisions, and persistence integrity checks.
- Working browser interface, scenarios, evidence editor, history, JSON export, keyboard tabs, and mobile layout.
- Outcome-based evaluation CLI. See the QA report for the tests that actually ran.

## Not demonstrated / must be completed before a production launch

1. **Live provider integration:** real credentialed requests against the selected OpenAI model and pinned Jev version have not run in this environment. Current provider tests are contract tests with injected responses. Verify account/model compatibility, latency, usage accounting, cancellation, refusals, and error behavior.
2. **Accuracy and calibration:** no reviewed 500–1,000-item corpus, held-out historical benchmark, fitted calibrator, or externally evaluated performance exists in this patch. No claim of superior objectivity or accuracy is warranted from unit tests. The model eliciting priors, likelihoods, and its own audit can share biases; a second pass is not independent evidence.
3. **Research completeness:** budgets can leave graph branches unresearched. One search request for both sides is not proof of balanced coverage. Source retrieval is limited to readable text, with bounded excerpt windows and no PDF extraction. Dates, citation-chain independence, external validity, and hidden shared datasets still need stronger verified representations.
4. **Logical validity:** graph validators check structural rules, not semantic truth of a model's equivalence assertion, reference class, or likelihood rationale. These need benchmarked scrutiny and high-stakes review.
5. **Security deployment review:** no independent penetration test, multi-tenant authorization, managed secret rotation, hosted identity provider, encrypted storage service, or centralized abuse monitoring is included. Default mode is for a trusted local machine. Remote deployment needs TLS, firewall controls, private credentials, backup/restore exercises, and disk quotas.
6. **Durability and operations:** local single-writer JSON storage is not a distributed job queue/database. Crash recovery does not resume jobs. Retention limits require an operator archive workflow. Load/soak testing, service-level objectives, full observability, and managed migrations remain open.
7. **End-to-end browser verification:** HTTP and offline browser tests ran separately because browser network navigation was blocked here. Run `scripts/browser_qa.py` against the real local server in an unrestricted development environment before declaring browser/server E2E verified.

## Publication behavior

Label machine-elicited numbers as uncalibrated, state the assessed reading, disclose evidence and dependence assumptions, preserve contrary evidence, and withhold a numerical answer on unresolved mandatory gates. Do not market a probability as an objective finding. The defensible product claim at this revision is an inspectable research workflow under explicit assumptions.

## Three-tier Probability Lab

Implemented: strong/cheap model roles, source-grounded question extraction, pinned Jev Noul batching, durable SQLite attempts/caching, explicit spending approval, cancellation/resumption, selective review and reviewed-estimate composition. See `scale/QA_REPORT.md`.

Remaining gates include live provider compatibility, held-out factual calibration and equal-budget quality comparison, native browser networking verification, disk/cache quotas and garbage collection, independent security review and production operations. The private single-writer 100k ledger is not a multi-tenant distributed service.
