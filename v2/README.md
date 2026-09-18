# Veracity V2 — Belief Engine

V2 keeps the strongest parts of V1 — exact claim parsing, decomposition, rival explanations, uncertainty, provenance, Bayesian updates, sensitivity checks, and plain-English presentation — but changes the core product from a verdict page into a **living belief graph**.

## Product thesis

Most fact-checking products answer "What do we think?" V2 answers:

1. What exactly are we claiming?
2. What must be true for it to hold?
3. What evidence actually changes the odds?
4. Where does the uncertainty come from?
5. **What should we investigate next?**

That fifth question is the differentiator. V2 is an uncertainty-reduction engine.

## The V2 loop

claim → claim contract → belief graph → evidence ledger → posterior → crux ranking → value-of-information ranking → best next investigation → new evidence → update

## Keep from V1

- Loaded-term parsing and multiple readings.
- Claim → subclaim → premise → atomic decomposition.
- Credence ranges rather than fake precision.
- Rival hypotheses and symmetric effort.
- Source provenance and independence clusters.
- Likelihood-ratio evidence updates.
- Prior disclosure and sensitivity sweeps.
- "What would change this?" and truthful revision.
- Plain English first; math underneath.

## Replace from V1

- **Authored headline probability:** displayed claim probability is computed from one declared graph path. Authored/model estimates are inputs with provenance.
- **UI-dependent inference:** opening/hiding a node can never alter inference.
- **min/product ambiguity:** relations explicitly declare AND, OR, evidence, alternative-set, or informational semantics.
- **Overlapping alternatives:** normalized hypothesis distributions are only legal for exclusive + exhaustive sets.
- **One overloaded confidence number:** V2 separately shows credence, grounding, and stability.

## Jev's role

Jev is an **evidence judge**, not the Bayesian engine.

Good tasks: passage relevance to an atomic claim; support/contradict/mixed/unresolved classification; whether two sources share the same underlying observation; whether a measured outcome matches the claim; structured classification over shared evidence.

Every Jev judgment stores provider, pinned model version, exact question, probability distribution, source span, and timestamp.

A Jev probability is not automatically P(the world claim), a likelihood ratio, independent evidence, or calibrated for the target domain. Deterministic code owns arithmetic and probability identities.

## Core product surfaces

### Ask
One field: "What are you trying to figure out?" Before scoring, create a claim contract: exact wording, scope/population, horizon, outcome, loaded terms, alternative readings, and falsifier.

### Current view
Show current credence range, grounding, stability, 2–4 live cruxes, one-sentence reason, and **best next investigation**. No giant methodology dashboard.

### Belief graph
Click a node to inspect evidence, provenance, dependencies, and sensitivity. Changing an assumption creates a scenario rather than silently mutating the canonical assessment.

### Evidence ledger
Each observation records exact source/span, date, primary basis, independence cluster, target node, likelihood model/elicitation, evaluator/version, and observed/disputed/ungrounded status. Correlated evidence is collapsed before updating.

### Crux + next experiment
Rank assumptions by posterior swing. For each, show current uncertainty, possible observation, potential information gain, cost/latency, and recommended next investigation.

### History
Every material update creates a snapshot such as: "62–74% → 41–55% because source X weakened premise P3." The system becomes useful over time instead of producing disposable reports.

## Probability concepts

**Credence:** how likely is the claim under the declared model?

**Grounding:** how much of the load-bearing graph is tied to inspectable evidence?

**Stability:** how much do reasonable changes in priors, likelihoods, readings, and dependence assumptions move the answer?

Model agreement may be diagnostic telemetry, but is not a synonym for truth.

## Non-negotiable invariants

1. Same graph + same inputs = same posterior regardless of UI state.
2. No evidence is counted twice through citation chains or duplicated reports.
3. Every probability has provenance: measured, model-estimated, elicited, or derived.
4. No normalized multi-hypothesis posterior unless hypotheses are exclusive + exhaustive.
5. Unsupported graph semantics produce "cannot compute", not an invented number.
6. Models never perform arithmetic deterministic code can perform.
7. A displayed claim probability is derived from one declared model path.
8. Wide uncertainty and abstention are valid outputs.
9. The system identifies the assumptions doing the work.
10. The user can inspect why any update happened.

See `schema.md`, `engine-spec.md`, `jev-adapter.md`, and `evaluation.md`.
