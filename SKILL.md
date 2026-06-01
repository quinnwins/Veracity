---
name: veracity-claim-audit
description: Produce the most honest possible answer to "is this claim actually true?" — for political, scientific, historical, medical, financial, or otherwise contested questions. Outputs a calibrated credence band (not a verdict), the live cruxes, the observations that would move the band, and the strongest narrower formulation that survives scrutiny. Use whenever the cost of getting a contested question wrong is higher than the cost of running the procedure. The skill scales: a 90-second triage for most claims, a structured audit for serious ones, and a full Veracity-schema deep audit for claims worth publishing.
---

# Veracity Claim Audit

The job is one sentence: given a claim someone is asking about, return the most honest possible answer about what's actually true. Honest means **calibrated**, not balanced; **decomposed**, not vibes; **falsifiable**, not motte-and-bailey; **anchored in primary evidence**, not in who's saying it.

This skill plugs into the Veracity framework: prior → likelihood-ratio updates → posterior credence band, with mandatory steel-manning of rival hypotheses and a sensitivity check on every load-bearing assumption. The math lives in `verdict.jsx`, the schema in `data.js`, and the validators in `scripts/`. This file is the operator procedure.

## When to use, when to skip

Use when:
- The claim is contested, politically loaded, identity-loaded, or has financial / medical / legal / safety stakes.
- Someone has presented a study, statistic, or expert quote as decisive and the question is whether it actually is.
- The user asks "is X true?", "should I believe Y?", "what's the deal with Z?", or wants a fair audit of a controversy.
- A claim is going to be published, archived, or quoted — in which case go to Mode 2.

Skip — answer directly without the machinery — when:
- The claim is settled to the point that running the procedure would be theater (e.g., "is the earth round"). Answer plainly, name the strongest single primary that settles it, stop.
- The question is purely definitional ("is a hot dog a sandwich"). No fact-of-the-matter exists beyond the definition chosen. Pick a definition, run the consequences.
- The question is purely a value judgment ("should we tax X"). Separate the empirical premises (audit those) from the values (state plainly, don't audit values).
- The user wants a quick lookup, not an audit. If unsure, ask before running the procedure.

A skill that runs every time is a skill that's useless when it matters. Triage first.

## Rules (these never bend)

1. **No source class gets a credibility bonus.** Experts, consensus, institutions, primary documents, and random people on the internet all enter as evidence with their own truthfulness rate `P(source says X | X true)` and fabrication rate `P(source says X | X false)`. The ratio is the source's likelihood ratio. "An expert said it" is not the evidence — it is a source claim whose weight is a number you have to estimate.

2. **Consensus is downstream.** 100 papers citing 5 primary studies is 5 independent supports, not 100. Walk citation chains to root primaries before counting. Apparent consensus that traces to a single research group with shared methods is one update, not many.

3. **Credence, not verdict.** Output a posterior probability band (e.g., 18–42%), never "true" or "false." The label describes the credence the operator should hold, not a finding about the world.

4. **Falsifiability is mandatory.** Every claim node names an observation that would disconfirm it. Claims that can't name one have their effective LR compressed toward 1 and cannot drive the posterior. Unfalsifiable does not mean false — it means "this isn't doing work for either side."

5. **Symmetric effort.** Steel-man every rival hypothesis to the same depth as the main claim. A one-sentence dismissal of an alternative is anchoring, not analysis. If you can't decompose the rival, you can't claim it's weaker.

6. **Sensitivity-check every prior.** For every authored number, ask: if I drag it to its plausible extreme, does the posterior band move ≥15 points? If yes, the prior is *load-bearing* — flag it and disclose. A posterior that hinges on one authored prior is the prior restated.

7. **Audit your own search.** If the evidence you found points one direction, check: did you look for counter-evidence, or did absence get smuggled in as evidence? One-sided search is not the same as one-sided evidence. Flag asymmetric search even when the conclusion is robust.

8. **Provenance or stamp.** Every factual claim traces to a primary source or is stamped `ungrounded`. "Everyone knows" is not evidence; mark it and move on.

These are non-negotiable. An audit that violates any of them fails regardless of how confident it sounds.

## The procedure — pick the smallest mode that fits

Don't run deeper machinery than the question needs. Over-machinery is the pretentiousness failure.

**Before any mode, for time-sensitive claims:** if the claim is about current events, live legal / medical / financial / regulatory state, ongoing scientific debate, or anything whose ground truth has plausibly moved since training data was cut, verify the key facts against current primary sources (filings, journals, datasets, official statements, dated reporting) before scoring. A confident audit on stale facts is worse than abstention.

### Mode 0 — Triage (default, ~90 seconds)

For most questions this is enough.

1. **Restate the claim.** Exact wording, plus a loaded-term split: which words, if redefined, would change the answer? Name the reading you're scoring.
2. **Strongest crux.** The one fact, definition, or assumption that would most move the credence if it flipped.
3. **Credence band.** A range like 30–55% with a one-line label (see bands below). Use ≥15-point bands; tighter bands require Mode 1 work.
4. **What would move me.** The fastest observation — real, not hypothetical — that would shift the band materially.
5. **Truthful revision.** The narrower version of the claim that survives scrutiny. This is usually the most useful output for the user.

If the user wants more, escalate.

### Mode 1 — Standard audit (~10 minutes)

Add to Mode 0:

6. **Prior disclosure.** Your starting range and the reference class. Name the pressure (which verdict would punish you with which audience). Name the credence band you'd be uncomfortable issuing — that's the band you should examine hardest.
7. **Hypothesis space.** List the competing hypotheses (≥2, usually 3–4). Decompose each to comparable depth. Score each subclaim with an estimate range.
8. **Evidence walkdown.** For each major source: basis (study design / dataset / interview / theory), independence cluster (which other sources are correlated), what it directly supports, and an LR range. Collapse correlated sources before counting.
9. **Sensitivity table.** For each load-bearing prior, list what its extreme does to the band. Flag any prior that alone flips the band.
10. **Coverage map.** What the audit covered, what's partial, what's a gap, what's out-of-scope. Gaps are stamped honestly; they are not evidence.

### Mode 2 — Deep audit (full Veracity schema)

When the audit will be published or referenced by others. Output should drop into `data.js` and pass `scripts/validate-data.mjs`. Produce:

- Full node tree (C0 main claim → S subclaims → P premises → A atomic), each node with `text`, `type`, `role`, `estimate` range, `confidence`, `verification` method, `evidence` summary, `bias` risk, `depends`, `changes` (what would void the node).
- Per-hypothesis decomposition trees (the symmetric-effort gate's actual implementation — every rival is decomposed, not labeled).
- `evidenceBudget` with `lrLow`/`lrHigh` and a `lrPerH` vector across the hypothesis space, so the multi-hypothesis posterior in `verdict.jsx` resolves it without operator hand-labels.
- `stress` perturbations: each is a one-sentence "if you change X, the band moves to Y."
- `priorRange`, `stage0` (prior, referenceClass, pressure, uncomfortableVerdict), `rangeAnchors` (lower / upper), and `readings` (per-interpretation credence bands).
- `sourceWalkdown` collapsed to primary basis and independence cluster.
- `cruxes`, `fairnessAudit`, `verificationNotes`, `subjectivity`, `loadedTerms`, `coverage`.

Run `node scripts/validate-data.mjs` and `node --test scripts/test-math.mjs` after authoring. Do not claim a deep audit is done until both pass.

## The math (small enough to memorize)

**Single-claim posterior from independent evidence:**

```
log_odds(posterior) = log_odds(prior) + Σ log(LR_i)
posterior            = exp(log_odds) / (1 + exp(log_odds))
```

Each evidence item contributes `LR_i = P(observation | claim true) / P(observation | claim false)`. LR > 1 supports, LR < 1 opposes, LR ≈ 1 is uninformative. For an LR *range* (preferred, because LRs are themselves uncertain), update the lower and upper log-odds separately and report the band.

**Multi-hypothesis posterior** (use this when ≥2 rivals must coexist — it is the right truth-seeking computation):

```
log_post_i  = log(prior_i) + Σ log(LR_{i, evidence})
posterior_i = softmax(log_post_i)
```

This forces every piece of evidence to take a position on every hypothesis. "Support: Medium" labels on rivals are a substitute for this math; when stakes are high, do the math, not the label.

**Independence collapse.** Before summing log LRs, group correlated evidence into independence clusters and count each cluster once. Two studies from the same research group on overlapping data are one update. Five op-eds citing the same paper are zero updates beyond the paper itself.

### LR calibration rail (sanity-check values, not authority)

| Evidence type | Plausible LR |
|---|---|
| Single eyewitness, no incentive to lie | 2–4 |
| Single eyewitness who benefits from the claim being true | 1.2–1.5 |
| Well-powered, pre-registered, replicated study, no COI | 5–20 |
| Small, unreplicated, observational study | 1.5–3 |
| Headline summary of a study (paper unread) | 1.1–1.5 |
| "An expert said so" with no methodology cited | 1.2–2 |
| Meta-analysis of ≥10 independent primaries | 5–30 |
| Meta-analysis whose 5 primaries share a research group | 2–4 (collapse) |
| Absence of evidence when evidence *would* be expected if true | 0.1–0.5 |
| Absence of evidence when evidence would *not* be expected | ≈1 |
| Confession against interest (eyewitness whose admission costs them) | 5–20 |
| Strongly motivated witness, claim aligns with motive | 0.8–1.5 |
| Convergent independent reconstruction from disjoint methods | 10–100 |

These are *defaults to argue against*. State your chosen LR and the reason. If you can't articulate why your LR isn't the table default, you haven't audited the source.

## Failure modes (do not do these)

- **Don't launder authority into evidence.** "Top scientists agree" is a source claim, not the evidence. If you can't name the primary studies, you don't know what the evidence is.
- **Don't false-balance.** If the LRs pile up in one direction, the credence band reflects that. Symmetric *effort* is mandatory; symmetric *output* is not.
- **Don't fake-balance the other way.** If you only looked in one direction, the absence isn't evidence. Flag asymmetric search even when the conclusion is robust.
- **Don't motte-and-bailey yourself.** When a claim has multiple readings, score each separately. Do not average them into one number that defends the weak reading with the strong reading's evidence.
- **Don't over-precise.** A credence of 47.3% is fake precision. Use bands. If the prior is wide and the evidence thin, ABSTAIN (`insufficiently anchored`) is the honest answer.
- **Don't infer motives.** Unless motive is part of the claim and independently supported, ignore it. Bad people can say true things; sympathetic people can be wrong.
- **Don't let one piece of evidence carry the posterior alone** unless you've disclosed it as load-bearing and survived the sensitivity check.
- **Don't run the machinery on settled questions.** It's pretentious, costly, and signals that you can't tell which questions need it.
- **Don't audit values as if they were facts.** Disentangle them, audit the facts only, state the values plainly.
- **Don't update on your own prior.** If your "evidence" is "this fits my model," that's prior, not evidence. LR ≈ 1.
- **Don't accept your own first decomposition as the symmetric one.** Audit whether you steel-manned the rival or just labeled it. If you can't restate the rival's case in a form its strongest defender would accept, you didn't.

## Output templates

Choose the smallest template that fits.

### Triage template

```
**Claim (restated):** [exact wording, with loaded terms parsed and reading chosen]
**Strongest crux:** [the fact / definition / assumption that would move the band most]
**Credence:** [band like 30–55%] — [label] ([confidence: Low / Med / High])
**Would move me:** [fastest concrete observation that would change the band]
**Truthful revision:** [narrower formulation that survives scrutiny]
```

### Standard template

```
**Claim (restated):** [...]
**Prior:** [range; reference class; pressure; uncomfortable verdict you'd avoid]
**Term Split:** [loaded term → chosen reading → why]
**Hypotheses:** H0 / H1 / H2 [/ H3], each with a one-line description and an estimate band; each decomposed to comparable depth
**Evidence Walkdown:** [grouped by primary basis and independence cluster; LR range per cluster]
**Cruxes (≥15-point):** [the 3–6 load-bearing items]
**Sensitivity:** [each load-bearing prior, drag-to-extreme effect on the band]
**Coverage / Gaps:** [covered / partial / gap / out-of-scope]
**Posterior:** [band] — [label] — [confidence]
**Weakest link:** [the premise whose failure would tank the band]
**Truthful revision:** [the version that survives]
**Self-audit:** [would a reasonable opponent accept this method, or would they call anchoring?]
```

### Deep template

Match the schema in `data.js`. Required fields: `claim`, `claimType`, `estimate`, `confidence`, `bottomLine`, `revision`, `weakest`, `weakestWord`, `loadedTerms`, `coverage`, `hypotheses` (with per-H `decomposition`), `stress`, `evidenceBudget` (with `lrLow`, `lrHigh`, `lrPerH`), `priorRange`, `verificationNotes`, `subjectivity`, `stage0`, `rangeAnchors`, `readings`, `cruxes`, `fairnessAudit`, `sourceWalkdown`, `nodes` (C0/S/P/A tree). Validate before declaring complete.

## Credence bands

| Band | Range | Use when |
|---|---|---|
| Very low | <20% | Strong evidence against; defenders rely on weak / contested primaries |
| Low | 20–35% | More against than for, but a narrow steel-man survives |
| Below-even | 35–50% | The mechanism is real but the strong wording overshoots |
| Near-even | 50–65% | The reasonable reading is roughly as likely as not; cruxes unresolved |
| Substantial | 65–80% | Multiple independent primaries; rivals require special conditions |
| High | >80% | Multiple independent primaries; rivals are implausible under stated readings |
| Abstain | n/a | Prior too wide, evidence too thin, or claim too underspecified to score; report `insufficiently anchored` |

Multiple readings → multiple bands. Do not average across readings.

## Worked mini-example (Mode 0, ~90 seconds)

**User asks:** "Does spaced repetition improve vocabulary retention?"

**Output:**

**Claim (restated):** Learners who use spaced repetition retain new vocabulary better after several weeks than learners who review the same words in one massed session. (Loaded: *improve* — by how much, over what delay; *vocabulary retention* — recognition, recall, or use in context.)

**Strongest crux:** Whether the comparison controls total study time and retrieval practice. If spaced review gets more practice minutes or more quizzes, the effect may not be spacing itself.

**Credence:** 70–85% for delayed recognition/recall after matched study time; 50–70% for transfer to fluent use in conversation or writing. Confidence: Medium.

**Would move me:** A preregistered classroom study that matches total time, retrieval prompts, and word difficulty, then tests both recall and use-in-context after one month.

**Truthful revision:** "Spaced repetition usually improves delayed vocabulary recall compared with massed review when total practice is held constant; transfer to fluent use depends on richer practice."

That's a complete triage. If the user escalates, walk the classroom studies by independence cluster, separate recognition from free recall and production, and run sensitivity on total-practice-time assumptions.

## Connection to the Veracity app

Mode 2 outputs drop into `data.js` as a new analysis keyed by claim slug. Then:

```sh
node scripts/validate-data.mjs   # confirms schema + LR / decomposition / priorRange invariants
node --test scripts/test-math.mjs # confirms the math
python3 -m http.server 8766       # then open the prototype URL from README.md
```

The app renders the authored credence, the LR-based posterior, the conjunctive-Bayes posterior, the multi-hypothesis posterior, decomposition depth, and the audit checks for each analysis. If the multi-hypothesis posterior diverges materially from the authored credence, treat that gap as a flag, not noise — it usually means the operator's labels on rival hypotheses don't match the LR vectors they assigned.

## Self-check (run before publishing)

- [ ] Could a reasonable opponent accept that I steel-manned their case fairly?
- [ ] Did I name what would change my mind, and is it a real observation, not a moving goalpost?
- [ ] Is any single prior load-bearing? If so, did I disclose it and run sensitivity?
- [ ] Did I check whether the evidence cited collapses to fewer independent primaries than the count suggests?
- [ ] Did I avoid laundering values into facts?
- [ ] Did I write a credence band, not a verdict?
- [ ] Did I check that the LRs I used match the calibration rail, or that I justified deviating?
- [ ] If I were the operator I most distrust running this method, would I reach a stable answer?

Any No → the audit isn't done.
