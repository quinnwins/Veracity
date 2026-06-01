// Mock veracity analyses
// Three claims; the minimum-wage one is the canonical full example.
// Node ids follow C0 / S{n} / P{n.m} / A{n.m.k} convention.
//
// Each veracity analysis carries an `evidenceBudget` array. Items may carry an
// optional `kind: "structural"` field. Structural items are excluded from
// posterior computations (both single-claim `lrPosteriorRange` and
// multi-hypothesis `computeHypothesisPosterior`) — they describe doctrinal /
// definitional anchors already encoded in a hypothesis label, not independent
// observations. They remain visible in the UI for the analyst.
//
// SENSORY TIER — Cromwell's-rule discipline at the leaves.
// Atomic nodes (kind: "atomic") MAY carry a `sensoryTier: 0 | 1 | 2 | 3` field
// classifying how directly a human can verify the fact. Only Tier 0 may carry
// a credence close to 1; deeper tiers must propagate honest uncertainty up
// the tree. The validator warns when an atomic's estimate upper bound exceeds
// the tier ceiling.
//   Tier 0 — Direct sensory. Physical site at named coordinates anyone can
//            visit; treaty / law text held simultaneously in many public
//            libraries. Ceiling ≈ 0.99; floor ≈ 0.90.
//   Tier 1 — Inspectable but mediated. Single archived document with chain of
//            custody, or single recording with verifiable provenance.
//            Ceiling ≈ 0.95.
//   Tier 2 — Named-source institutional aggregation. Database, survey, report
//            from a named institution. Ceiling ≈ 0.88.
//   Tier 3 — Reconstruction / synthesis. Estimate derived from multiple
//            inputs; intent inference; modeling. Ceiling ≈ 0.80.
//
// EvidenceBudget items MAY carry an optional `tier: 0 | 1 | 2 | 3` field
// referencing the sensory tier of the underlying atomic. The Bayesian engines
// (`lrPosteriorRange`, `computeHypothesisPosterior`) clamp |log(LR)| per tier
// so a Tier-2 named-source can't act with the strength of a Tier-0 sensory
// fact. Tier 0 / unspecified: no cap (backward compatible). Tier 1: LR ∈
// [0.1, 10]. Tier 2: LR ∈ [0.2, 5]. Tier 3: LR ∈ [1/3, 3]. This is Cromwell's
// rule applied to evidence: no aggregation should carry the certainty that
// only a directly sensible primitive earns.

window.ANALYSES = {
  "minwage": {
    id: "minwage",
    claim: "Increasing the minimum wage always increases unemployment.",
    claimType: "universal causal",
    estimate: [0.18, 0.42],
    confidence: "Low",
    bottomLine: "As stated this claim is unlikely to be true universally. A weaker version — that sufficiently large, binding wage floors can produce measurable disemployment in some labor markets — is reasonably supported. The word \"always\" carries most of the failure.",
    revision: "Increasing the minimum wage can raise unemployment among low-wage workers when the floor is set well above the prevailing market wage and firms have limited adjustment channels; in most observed U.S. settings effects on employment are small or near zero.",
    weakest: ["S5", "P5.1", "P3.1"],
    weakestWord: "always",
    loadedTerms: [
      {
        term: "always",
        meanings: ["100% of cases (universal)", "typically / on average", "in many cases", "in some narrow cases"],
        chosen: "100% of cases (universal quantifier)",
        reason: "Read at face value of the claim's wording. \"Always\" is a logical universal: one credible counterexample falsifies. Softer readings (\"usually\", \"often\") would rewrite the claim rather than test it."
      },
      {
        term: "increases",
        meanings: ["strictly raises (positive sign required)", "raises on average across markets", "fails to lower", "shifts the distribution upward"],
        chosen: "strictly raises (positive sign required, pointwise)",
        reason: "Paired with \"always\", \"increases\" must hold pointwise in every market and time. A near-zero or sign-ambiguous result in any single market falsifies."
      },
      {
        term: "unemployment",
        meanings: ["U-3 headcount unemployment rate", "U-6 (incl. discouraged / part-time)", "employment-to-population ratio drop", "hours worked", "any disemployment outcome"],
        chosen: "U-3 headcount unemployment (standard public usage)",
        reason: "\"Unemployment\" in public discourse maps to the BLS U-3 measure. Hours, labor-force exit, and non-wage benefits sit on adjacent outcome variables and are scored separately (see S4)."
      },
      {
        term: "minimum wage",
        meanings: ["any statutory wage floor", "a floor that binds (above prevailing market wage for some workers)", "a federal floor specifically", "an industry-specific or local floor"],
        chosen: "a statutory wage floor at the level proposed (binding for some workers)",
        reason: "Claim is silent on magnitude or jurisdiction. We require only that the floor bind for some workers in the affected market — see S1. Non-binding floors trivially satisfy the claim by doing nothing."
      }
    ],
    coverage: [
      { area: "Wage floor binds", status: "covered" },
      { area: "Labor demand response", status: "covered" },
      { area: "Adjustment channels", status: "partial", note: "Monopsony, price pass-through, productivity not jointly modelled" },
      { area: "Measurement", status: "covered" },
      { area: "Universality (\"always\")", status: "gap", note: "Counterexamples not addressed" },
      { area: "Welfare vs. employment trade-off", status: "out-of-scope" }
    ],
    // Each hypothesis carries its own decomposition tree to satisfy the
    // symmetric-effort gate. Without this, the asymmetric-effort alarm fires
    // because C0 is decomposed to 23 nodes while alternatives are 1 sentence
    // each. With decomposition, each alternative is steel-manned to a
    // comparable depth and the operator must commit to subclaim credences
    // for every position they want to consider.
    hypotheses: [
      { id: "H0", h: "Minimum wage hikes reliably raise unemployment", support: "Low", note: "Inconsistent with much of post-1994 U.S. evidence.",
        decomposition: [
          { text: "Labor demand is downward-sloping in wages for low-skill labor", estimate: [0.55, 0.85] },
          { text: "Most observed minimum wages bind enough to trigger this response", estimate: [0.30, 0.60] },
          { text: "Firms absorb the wage shock primarily by reducing headcount, not via hours/prices/turnover/productivity", estimate: [0.15, 0.40] },
          { text: "The disemployment shows up as measured unemployment rather than labor-force exit", estimate: [0.40, 0.65] }
        ] },
      { id: "H1", h: "Effects are near zero in modest increases, negative only at high bite", support: "Medium-High", note: "Consistent with Cengiz et al. (2019) bunching estimates.",
        decomposition: [
          { text: "Most legislated minimum-wage increases in modern US data are modest relative to median wage", estimate: [0.65, 0.90] },
          { text: "Modest increases produce statistically null or small aggregate employment effects", estimate: [0.55, 0.85] },
          { text: "High-bite increases (Seattle $15, Puerto Rico federalization) do produce measurable disemployment", estimate: [0.50, 0.80] }
        ] },
      { id: "H2", h: "Monopsony makes small effects positive on employment", support: "Medium", note: "Plausible in concentrated labor markets.",
        decomposition: [
          { text: "A non-trivial share of low-wage labor markets show monopsonistic concentration", estimate: [0.40, 0.70] },
          { text: "Under monopsony, a wage floor below the competitive equilibrium can raise employment", estimate: [0.65, 0.90] },
          { text: "Empirical estimates of employer wage-setting power are non-zero in observed US markets", estimate: [0.45, 0.75] }
        ] },
      { id: "H3", h: "Effects show up off the unemployment margin (hours, non-wage)", support: "Medium", note: "Mixed evidence; not captured by claim's framing.",
        decomposition: [
          { text: "Firms can adjust to wage shocks via hours reduction, schedule fragmentation, or benefit cuts", estimate: [0.60, 0.85] },
          { text: "These adjustments are documented in observed US minimum-wage responses", estimate: [0.45, 0.75] },
          { text: "Standard U-3 unemployment measurement misses these adjustments", estimate: [0.55, 0.80] }
        ] }
    ],
    stress: [
      { perturb: "Replace \"always\" with \"sometimes\"", effect: "Estimate rises to 0.70–0.85; claim becomes defensible." },
      { perturb: "Restrict to bite > 50% of median wage", effect: "Estimate rises to 0.55–0.75; literature support stronger." },
      { perturb: "Allow monopsony in 20% of markets", effect: "Estimate falls; sign of effect becomes ambiguous." },
      { perturb: "Outcome = hours worked, not headcount", effect: "Direction holds; magnitude smaller; redefines claim." }
    ],
    // LR fields: P(this observation | claim true) / P(this observation | claim false).
    // The claim is the strict universal "always increases unemployment" — so even one
    // credible null-effect study under "true" should be unlikely, giving LR << 1.
    // Demonstration values; analysts should refine with calibrated estimates.
    evidenceBudget: [
      { item: "Card & Krueger (1994) NJ/PA fast food", weight: "high", direction: "against", lrLow: 0.05, lrHigh: 0.15,
        lrPerH: { H0: 0.1, H1: 3, H2: 2, H3: 1 } },
      { item: "Neumark & Wascher meta-analyses", weight: "high", direction: "for", lrLow: 1.5, lrHigh: 3,
        lrPerH: { H0: 2, H1: 0.5, H2: 0.2, H3: 0.5 } },
      { item: "Cengiz, Dube, Lindner, Zipperer (2019)", weight: "high", direction: "against (small effects)", lrLow: 0.05, lrHigh: 0.2,
        lrPerH: { H0: 0.1, H1: 4, H2: 2, H3: 2 } },
      { item: "Seattle $15 study (Jardim et al.)", weight: "medium", direction: "for, contested", lrLow: 1.2, lrHigh: 2,
        lrPerH: { H0: 1.5, H1: 0.7, H2: 0.3, H3: 0.7 } },
      { item: "Cross-country OECD minimum-wage panels", weight: "medium", direction: "mixed", lrLow: 0.4, lrHigh: 0.8,
        lrPerH: { H0: 0.5, H1: 1, H2: 1, H3: 1 } }
    ],
    priorRange: [0.3, 0.45],
    verificationNotes: [
      "Specify the wage floor's bite (new minimum / median wage) — claim is silent on magnitude.",
      "Specify the population (teen, low-wage adult, all workers) — effects differ by segment.",
      "Distinguish stock vs. flow effects on employment.",
      "State the time horizon: short run vs. multi-year adjustment."
    ],
    subjectivity: [
      { item: "Treating headcount unemployment as the outcome of interest", kind: "definition", risk: "Excludes hours, benefits, future hires." },
      { item: "Implicit assumption that labor markets are competitive enough that supply/demand applies frictionlessly", kind: "interpretive", risk: "Ignores monopsony evidence." },
      { item: "Universal quantifier \"always\"", kind: "logic", risk: "Single counterexample falsifies." }
    ],
    stage0: {
      prior: "30-45% before decomposition; universal causal claims in heterogeneous labor markets usually fail.",
      referenceClass: "Universal economic-policy claims with mixed empirical literature.",
      pressure: "Political pressure exists on both sides: pro-market readers punish null effects, pro-labor readers punish disemployment effects.",
      uncomfortableVerdict: "Saying 'sometimes true under high bite' may disappoint readers who want a clean ideological win."
    },
    rangeAnchors: {
      lower: "Credible null or positive-employment studies make the strict word 'always' hard to sustain.",
      upper: "Competitive labor-demand theory and high-bite case studies keep a narrower disemployment claim alive."
    },
    readings: [
      { label: "Strict 'always'", range: [0.18, 0.42], note: "Requires every binding wage floor to raise unemployment. One credible counterexample breaks it." },
      { label: "Often, in high-bite markets", range: [0.55, 0.75], note: "More defensible when the floor is far above prevailing wages and firms cannot adjust elsewhere." },
      { label: "Can reduce labor demand", range: [0.70, 0.85], note: "The mechanism is real; the public claim overstates its universality and measured unemployment channel." }
    ],
    cruxes: [
      { crux: "What does 'always' mean?", current: "Read as a strict universal because the claim says always.", wouldMove: "Changing it to 'sometimes' or 'under high bite' raises the estimate sharply." },
      { crux: "How much of the cost moves into prices, turnover, productivity, or hours?", current: "Multiple adjustment channels are documented.", wouldMove: "Showing those channels are negligible would strengthen the claim." },
      { crux: "Is measured unemployment the right outcome?", current: "Headcount unemployment can miss hours cuts or labor-force exit.", wouldMove: "A broader outcome would make a narrower disemployment claim stronger." }
    ],
    fairnessAudit: [
      { status: "Pass", test: "Strongest pro-claim version preserved", note: "The analysis concedes the labor-demand channel and high-bite cases." },
      { status: "Pass", test: "Opposing evidence is not treated as dispositive by authority alone", note: "Null-effect studies are used to falsify the universal wording, not to prove wage floors never reduce jobs." },
      { status: "Caution", test: "Outcome symmetry", note: "Readers who care about hours or job quality need a separate claim, not a hidden rewrite." }
    ],
    sourceWalkdown: [
      { source: "Card & Krueger / NJ-PA fast food", basis: "Natural-experiment employment survey", independence: "study-design", supports: "A credible counterexample to a universal unemployment claim." },
      { source: "Neumark & Wascher meta-analytic work", basis: "Literature synthesis across minimum-wage studies", independence: "secondary", supports: "Evidence that disemployment effects appear in some settings." },
      { source: "Cengiz, Dube, Lindner, Zipperer", basis: "Wage-bin bunching design across US events", independence: "study-design", supports: "Small or null aggregate effects in many observed US increases." }
    ],
    nodes: {
      "C0": {
        id: "C0", level: 0, col: 2, row: 0,
        kind: "claim",
        text: "Increasing the minimum wage always increases unemployment.",
        type: "causal",
        role: "Main claim under test.",
        estimate: [0.18, 0.42],
        confidence: "Low",
        weak: true,
        verification: "Decompose universal causal claim; test each link and the universal quantifier.",
        evidence: "Mixed empirical literature; sensitive to specification.",
        depends: ["S1", "S2", "S3", "S4", "S5"],
        bias: "Confirmation bias on either side of the political debate.",
        changes: "Replace \"always\" with a magnitude-and-population qualifier."
      },
      "S1": {
        id: "S1", level: 1, col: 0, row: 0, parent: "C0",
        kind: "subclaim",
        text: "The new minimum is a binding wage floor.",
        type: "definition",
        role: "Necessary condition: if the floor doesn't bind, nothing else matters.",
        estimate: [0.7, 0.95],
        confidence: "High",
        verification: "Check share of workers earning below new minimum in the affected region.",
        evidence: "BLS / state wage distributions; well-measured.",
        depends: ["P1.1", "P1.2"],
        bias: "Low — descriptive.",
        changes: "If new minimum is below market wage for affected workers, claim is vacuous."
      },
      "S2": {
        id: "S2", level: 1, col: 1, row: 0, parent: "C0",
        kind: "subclaim",
        text: "Labor demand falls when wages rise, ceteris paribus.",
        type: "causal",
        role: "Standard textbook mechanism.",
        estimate: [0.55, 0.85],
        confidence: "Medium",
        verification: "Estimate own-wage elasticity of labor demand in affected segment.",
        evidence: "Theory clear; magnitude contested; Hamermesh surveys.",
        depends: ["P2.1", "P2.2"],
        bias: "Mechanism-first reasoning.",
        changes: "Demand elasticities near zero would void the channel."
      },
      "S3": {
        id: "S3", level: 1, col: 2, row: 0, parent: "C0",
        kind: "subclaim",
        text: "Firms have no offsetting adjustment channels.",
        type: "empirical",
        role: "Required for wage shock to flow into employment specifically.",
        estimate: [0.15, 0.45],
        confidence: "Low",
        weak: true,
        verification: "Audit each channel: price pass-through, hours, turnover, productivity, monopsony.",
        evidence: "Multiple channels documented; rarely all zero.",
        depends: ["P3.1", "P3.2", "P3.3", "P3.4"],
        bias: "Selective citation of channels.",
        changes: "Showing one channel reliably absorbs the shock weakens claim."
      },
      "S4": {
        id: "S4", level: 1, col: 3, row: 0, parent: "C0",
        kind: "subclaim",
        text: "Disemployment shows up in measured unemployment.",
        type: "definition",
        role: "Bridge from theoretical disemployment to the claim's outcome variable.",
        estimate: [0.45, 0.7],
        confidence: "Medium",
        verification: "Check whether displaced workers remain in labor force and are counted.",
        evidence: "CPS measurement well-studied; exits to non-participation common.",
        depends: ["P4.1", "P4.2"],
        bias: "Implicit identification of \"jobs\" with measured U-rate.",
        changes: "If workers exit labor force, unemployment may fall while employment also falls."
      },
      "S5": {
        id: "S5", level: 1, col: 4, row: 0, parent: "C0",
        kind: "subclaim",
        text: "The relationship holds in every labor market, every time.",
        type: "logic",
        role: "Carries the word \"always\" — universal quantifier.",
        estimate: [0.02, 0.15],
        confidence: "Low",
        weak: true,
        verification: "Search for credible counterexamples; one suffices to falsify.",
        evidence: "Multiple studies find null or positive effects; counterexamples plentiful.",
        depends: ["P5.1", "P5.2"],
        bias: "Universal claims are rhetorically tempting and almost always wrong.",
        changes: "Soften to \"sometimes\" or \"under conditions X, Y, Z\"."
      },

      "P1.1": { id: "P1.1", level: 2, col: 0, row: 0, parent: "S1", kind: "premise",
        text: "Some workers currently earn below the proposed minimum.",
        type: "empirical", role: "Establishes the floor binds for someone.",
        estimate: [0.85, 0.99], confidence: "High",
        verification: "Wage distribution from CPS-ORG.",
        evidence: "Routinely measured; high quality.",
        bias: "Low.", changes: "Only fails if floor set below the entire wage distribution.",
        depends: ["A1.1.1"]
      },
      "P1.2": { id: "P1.2", level: 2, col: 0, row: 1, parent: "S1", kind: "premise",
        text: "Employers cannot easily reclassify workers to evade the floor.",
        type: "empirical", role: "Closes evasion loophole.",
        estimate: [0.55, 0.85], confidence: "Medium",
        verification: "Studies on misclassification, tipped-wage carveouts, contractor conversion.",
        evidence: "Some evasion documented; bounded by enforcement.",
        bias: "Industry-specific.", changes: "Strong gig-economy reclassification would void.",
        depends: ["A1.2.1"]
      },
      "P2.1": { id: "P2.1", level: 2, col: 1, row: 0, parent: "S2", kind: "premise",
        text: "Labor demand curves slope downward in the affected wage range.",
        type: "empirical", role: "Standard own-wage elasticity assumption.",
        estimate: [0.7, 0.9], confidence: "Medium",
        verification: "Hamermesh meta-estimates; sector-specific elasticities.",
        evidence: "Generally supported; magnitude varies.",
        bias: "Textbook anchoring.", changes: "Very low elasticities would weaken the channel.",
        depends: ["A2.1.1"]
      },
      "P2.2": { id: "P2.2", level: 2, col: 1, row: 1, parent: "S2", kind: "premise",
        text: "Other factors (demand, technology) hold approximately constant during adjustment.",
        type: "interpretive", role: "Ceteris-paribus reasoning bridge.",
        estimate: [0.3, 0.6], confidence: "Low",
        verification: "Identify whether minimum-wage hikes co-occur with other shocks.",
        evidence: "Often violated; minimum-wage changes correlate with business cycle.",
        bias: "Treats causal isolation as default.", changes: "Acknowledging confounders weakens the mechanism's net effect."
      },
      "P3.1": { id: "P3.1", level: 2, col: 2, row: 0, parent: "S3", kind: "premise",
        text: "Monopsony power among low-wage employers is negligible.",
        type: "empirical", role: "Without monopsony, demand-curve story dominates.",
        estimate: [0.1, 0.4], confidence: "Low", weak: true,
        verification: "Labor market concentration indices; estimated firm-level labor-supply elasticities.",
        evidence: "Growing evidence of meaningful monopsony power (Azar, Marinescu, Steinbaum).",
        bias: "Older textbooks assume away monopsony.",
        changes: "Stronger monopsony makes employment effect ambiguous or positive.",
        depends: ["A3.1.1", "A3.1.2"]
      },
      "P3.2": { id: "P3.2", level: 2, col: 2, row: 1, parent: "S3", kind: "premise",
        text: "Firms cannot raise prices to absorb the wage cost.",
        type: "empirical", role: "Closes price pass-through channel.",
        estimate: [0.2, 0.5], confidence: "Low",
        tunable: true,
        prior: [0.2, 0.5],
        verification: "Studies on restaurant prices following min-wage hikes.",
        evidence: "Price pass-through is common, often 1–3% in food service.",
        bias: "Ignores demand-side absorption.", changes: "Documented pass-through reduces employment hit."
      },
      "P3.3": { id: "P3.3", level: 2, col: 2, row: 2, parent: "S3", kind: "premise",
        text: "Worker productivity does not rise enough to offset.",
        type: "empirical", role: "Closes efficiency-wage channel.",
        estimate: [0.4, 0.7], confidence: "Medium",
        verification: "Turnover, training, effort studies post-hike.",
        evidence: "Reduced turnover and training costs documented; magnitudes modest.",
        bias: "Static model assumption.", changes: "Larger productivity gains would offset."
      },
      "P3.4": { id: "P3.4", level: 2, col: 2, row: 3, parent: "S3", kind: "premise",
        text: "Hours and non-wage benefits do not absorb the cost.",
        type: "empirical", role: "Forces shock into headcount.",
        estimate: [0.25, 0.55], confidence: "Low",
        verification: "Hours, scheduling, benefits studies (Seattle, Jardim et al.).",
        evidence: "Hours adjustments observed; partially substitutes for headcount.",
        bias: "Outcome cherry-picking.", changes: "Hours absorption shifts the bite off headcount."
      },
      "P4.1": { id: "P4.1", level: 2, col: 3, row: 0, parent: "S4", kind: "premise",
        text: "Displaced workers remain in the labor force seeking work.",
        type: "empirical", role: "Required for headcount loss to count as unemployment.",
        estimate: [0.4, 0.7], confidence: "Medium",
        verification: "Labor force participation after job loss in affected groups.",
        evidence: "Many discouraged workers exit; rate effects ambiguous.",
        bias: "Treats U-rate as the canonical measure.", changes: "Exits to non-participation can mask employment loss."
      },
      "P4.2": { id: "P4.2", level: 2, col: 3, row: 1, parent: "S4", kind: "premise",
        text: "Standard measurement captures marginal workers accurately.",
        type: "source", role: "CPS / survey reliability.",
        estimate: [0.6, 0.85], confidence: "Medium",
        verification: "Validation studies of CPS unemployment for low-wage segments.",
        evidence: "Reasonable but noisy at small subgroups.",
        bias: "Source authority bias.", changes: "Mismeasurement of the marginally employed muddles the link."
      },
      "P5.1": { id: "P5.1", level: 2, col: 4, row: 0, parent: "S5", kind: "premise",
        text: "There is no labor market in which the effect is negligible.",
        type: "empirical", role: "Required for \"always\".",
        estimate: [0.02, 0.15], confidence: "Low", weak: true,
        verification: "Single credible counterexample falsifies.",
        evidence: "Multiple modern studies report null effects (e.g. Cengiz et al. 2019).",
        bias: "Universal generalization.",
        changes: "Any documented null undermines.",
        depends: ["A5.1.1"]
      },
      "P5.2": { id: "P5.2", level: 2, col: 4, row: 1, parent: "S5", kind: "premise",
        text: "Magnitude is non-zero in every regime, not just on average.",
        type: "logic", role: "Required for \"increases\" to hold pointwise.",
        estimate: [0.05, 0.2], confidence: "Low", weak: true,
        tunable: true,
        prior: [0.05, 0.2],
        verification: "Distribution of effect estimates across studies.",
        evidence: "Estimate distributions straddle zero.",
        bias: "Average-treatment-effect framing.",
        changes: "Heterogeneous effects routinely include zero."
      },

      "A1.1.1": { id: "A1.1.1", level: 3, col: 0, row: 0, parent: "P1.1", kind: "atomic",
        text: "The proposed floor exceeds the lowest decile of current wages.",
        type: "empirical", estimate: [0.9, 0.99], confidence: "High",
        verification: "Direct wage distribution comparison.",
        evidence: "Trivially checkable.", role: "Atomic prerequisite for binding.",
        bias: "Low.", changes: "Floor below market wage everywhere → claim vacuous."
      },
      "A1.2.1": { id: "A1.2.1", level: 3, col: 0, row: 1, parent: "P1.2", kind: "atomic",
        text: "Enforcement of wage and classification laws is non-trivial.",
        type: "empirical", estimate: [0.4, 0.75], confidence: "Medium",
        tunable: true,
        prior: [0.4, 0.75],
        verification: "DOL enforcement records by region.",
        evidence: "Uneven across states and sectors.", role: "Stops evasion from voiding the floor.",
        bias: "Regional variance ignored.", changes: "Weak enforcement → floor not binding in practice."
      },
      "A2.1.1": { id: "A2.1.1", level: 3, col: 1, row: 0, parent: "P2.1", kind: "atomic",
        text: "Own-wage elasticity of labor demand in low-wage sectors is meaningfully negative.",
        type: "empirical", estimate: [0.5, 0.8], confidence: "Medium",
        tunable: true,
        prior: [0.5, 0.8],
        verification: "Sector-specific elasticity estimates (food service, retail).",
        evidence: "Hamermesh: −0.1 to −0.5 typical.", role: "Quantifies the demand channel.",
        bias: "Meta-analytic averaging.", changes: "Inelastic demand → small or no channel."
      },
      "A3.1.1": { id: "A3.1.1", level: 3, col: 2, row: 0, parent: "P3.1", kind: "atomic",
        text: "Labor markets clear roughly as in competitive textbook models.",
        type: "interpretive", estimate: [0.2, 0.5], confidence: "Low", weak: true,
        verification: "Estimate firm-level labor-supply elasticities.",
        evidence: "Estimates routinely below the competitive benchmark.", role: "Sets which model applies.",
        bias: "Model-selection bias.", changes: "Adopting monopsony framework flips the sign."
      },
      "A3.1.2": { id: "A3.1.2", level: 3, col: 2, row: 1, parent: "P3.1", kind: "atomic",
        text: "Local labor market concentration is low.",
        type: "empirical", estimate: [0.25, 0.55], confidence: "Low",
        verification: "HHI of employer concentration by commuting zone.",
        evidence: "Many low-wage markets show high concentration.", role: "Empirical anchor for the previous atomic.",
        bias: "National-average framing.", changes: "Concentrated markets → monopsony plausible."
      },
      "A5.1.1": { id: "A5.1.1", level: 3, col: 4, row: 0, parent: "P5.1", kind: "atomic",
        text: "All credible studies finding null effects are methodologically flawed.",
        type: "interpretive", estimate: [0.05, 0.2], confidence: "Low", weak: true,
        tunable: true,
        prior: [0.05, 0.2],
        verification: "Replication and pre-registered meta-analysis.",
        evidence: "Mainstream studies pass standard quality checks.", role: "Last line of defense for \"always\".",
        bias: "Motivated reasoning.", changes: "Conceding any credible null falsifies universal claim."
      }
    }
  },

  "ai-engineers": {
    id: "ai-engineers",
    claim: "AI will make most software engineers obsolete within five years.",
    claimType: "empirical prediction (universal, time-bounded)",
    estimate: [0.05, 0.20],
    confidence: "Low",
    bottomLine: "The strong form is unlikely. Significant role change is plausible; full obsolescence of \"most\" engineers in five years is not supported by current rates of capability and adoption.",
    revision: "Within five years, AI tooling will substantially change the work of most software engineers and reduce demand for routine implementation tasks; full obsolescence of the role is unlikely on that horizon.",
    weakest: ["S2", "S4", "P2.1"],
    weakestWord: "obsolete",
    loadedTerms: [
      {
        term: "most",
        meanings: [">50% of engineers (bare majority)", ">80% (overwhelming majority)", "a substantial minority", "the median engineer's job"],
        chosen: ">50% of engineers in the role, by headcount",
        reason: "\"Most\" in unqualified English is a bare majority. Stronger readings (>80%) would set a much higher bar; treating the claim charitably means scoring it against the easiest defensible threshold."
      },
      {
        term: "obsolete",
        meanings: ["role eliminated entirely (no demand)", ">50% headcount reduction", "task profile substantially changed but role remains", "demoted to lower pay grade"],
        chosen: "role eliminated entirely — demand collapses to near-zero",
        reason: "\"Obsolete\" means rendered useless. Softer readings (\"transformed\", \"reduced\") describe a different and more defensible claim. Scoring the strong form per the claim's wording."
      },
      {
        term: "software engineers",
        meanings: ["all roles called \"engineer\" (incl. ML, systems, infra, security)", "application/feature developers only", "junior coders specifically", "any developer-titled role globally"],
        chosen: "all roles holding the title \"software engineer\" (full breadth of the labor market)",
        reason: "Claim does not narrow the population. The full role includes design, debugging, integration, on-call, and judgment work — not only routine implementation."
      },
      {
        term: "within five years",
        meanings: ["by exactly Y+5 (the strict deadline)", "the trend visible by Y+5", "majority displaced by Y+5", "starts by Y+5 and completes later"],
        chosen: "by Y+5 (i.e. the substitution is completed, rather than only started)",
        reason: "\"Will make obsolete within five years\" reads as a deadline, not a trend start. A weaker reading (\"trend visible by then\") rewrites the claim into a much easier one."
      }
    ],
    coverage: [
      { area: "Definition of \"engineer\" and \"obsolete\"", status: "gap" },
      { area: "Capability trajectory", status: "partial" },
      { area: "Adoption & integration cost", status: "partial" },
      { area: "Economic substitution vs. complementarity", status: "covered" },
      { area: "Regulatory & organizational frictions", status: "partial" }
    ],
    hypotheses: [
      { id: "H0", h: "Most engineering roles disappear within five years of the analysis date", support: "Low",
        decomposition: [
          { text: "AI reaches production-grade capability on most engineering tasks within five years", estimate: [0.20, 0.45] },
          { text: "Organizations trust autonomous systems enough to remove most human accountability roles", estimate: [0.08, 0.25] },
          { text: "The remaining design, debugging, integration, and incident work consolidates into a minority of roles", estimate: [0.08, 0.25] },
          { text: "Software demand does not expand enough to absorb the productivity gain", estimate: [0.15, 0.40] }
        ] },
      { id: "H1", h: "Role composition shifts; headcount roughly flat or grows", support: "Medium-High",
        decomposition: [
          { text: "AI absorbs a large share of routine implementation and boilerplate work", estimate: [0.65, 0.90] },
          { text: "Humans remain needed for product judgment, requirements, architecture, debugging, and accountability", estimate: [0.70, 0.90] },
          { text: "Productivity gains are spent on more software output rather than mostly on layoffs", estimate: [0.50, 0.75] }
        ] },
      { id: "H2", h: "Productivity gains expand software demand (Jevons)", support: "Medium",
        decomposition: [
          { text: "Lower software production cost expands the number of viable projects", estimate: [0.55, 0.80] },
          { text: "Organizations have large unmet software backlogs that become economical with AI help", estimate: [0.65, 0.90] },
          { text: "New AI-enabled products and internal automations create additional engineering demand", estimate: [0.45, 0.70] }
        ] },
      { id: "H3", h: "Junior pipeline contracts; senior demand rises", support: "Medium",
        decomposition: [
          { text: "Entry-level implementation tasks are among the most automatable engineering tasks", estimate: [0.60, 0.85] },
          { text: "Senior review, architecture, ownership, and incident response remain scarce", estimate: [0.70, 0.90] },
          { text: "Firms reduce junior hiring before they eliminate experienced engineering roles", estimate: [0.45, 0.70] }
        ] }
    ],
    stress: [
      { perturb: "Define \"obsolete\" as 50% headcount drop", effect: "Estimate falls; very few historical analogues." },
      { perturb: "Extend horizon to 15 years", effect: "Estimate rises modestly; still capability-bound." },
      { perturb: "Capability doubles every 6 months", effect: "Estimate rises; still bounded by integration." }
    ],
    evidenceBudget: [
      { item: "BLS Occupational Outlook Handbook, 2024-2034 projection for software developers/QA/testers", weight: "medium", direction: "against", lrLow: 0.1, lrHigh: 0.3,
        lrPerH: { H0: 0.2, H1: 2.5, H2: 2, H3: 1.2 } },
      { item: "Github Copilot / Devin productivity studies", weight: "medium", direction: "mixed", lrLow: 0.5, lrHigh: 2,
        lrPerH: { H0: 1.2, H1: 1.5, H2: 1.4, H3: 1.8 } },
      { item: "Historical automation displacement base rates", weight: "high", direction: "against", lrLow: 0.05, lrHigh: 0.15,
        lrPerH: { H0: 0.15, H1: 2, H2: 2.5, H3: 1.5 } }
    ],
    priorRange: [0.10, 0.25],
    verificationNotes: [
      "Define \"most\" and \"obsolete\" precisely.",
      "Anchor the forecast date: this analysis reads \"within five years\" as five years from the 2025 analysis frame, not a moving deadline.",
      "Specify population (US, global, by seniority).",
      "Distinguish task automation from role elimination."
    ],
    subjectivity: [
      { item: "Treating capability demos as deployment-ready", kind: "interpretive", risk: "Conflates lab and field performance." },
      { item: "\"Most\" left unquantified", kind: "definition", risk: "Allows post-hoc reinterpretation." }
    ],
    stage0: {
      prior: "10-25% before decomposition; short-horizon labor displacement predictions usually overstate adoption speed. Analysis frame: 2025, so the five-year horizon means roughly 2030.",
      referenceClass: "Technology-substitution forecasts with five-year deadlines.",
      pressure: "AI hype rewards bold displacement claims; professional identity pressure rewards dismissing them.",
      uncomfortableVerdict: "The uncomfortable middle is that major disruption is likely while the literal obsolescence claim is still weak."
    },
    rangeAnchors: {
      lower: "Enterprise adoption, accountability, integration, and maintenance work make full role obsolescence by five years unlikely.",
      upper: "Fast benchmark progress, agentic coding demos, and productivity gains prevent dismissing sharp disruption outright."
    },
    readings: [
      { label: "Literal obsolescence", range: [0.05, 0.20], note: "Most engineers no longer useful or demanded within five years." },
      { label: "Major task displacement", range: [0.45, 0.70], note: "Routine coding work shrinks while the role remains." },
      { label: "Role transformation", range: [0.70, 0.88], note: "Most engineers use AI heavily and the work mix changes substantially." }
    ],
    cruxes: [
      { crux: "Capability versus deployment", current: "Demos and benchmarks are ahead of audited production replacement.", wouldMove: "Large verified production case studies would raise the estimate." },
      { crux: "Substitution versus complementarity", current: "Cheaper software can expand demand for software work.", wouldMove: "Evidence of demand saturation would strengthen obsolescence." },
      { crux: "Five-year deadline", current: "Organizational change is usually slower than tool capability gains.", wouldMove: "Rapid restructuring data from large firms would move the claim upward." }
    ],
    fairnessAudit: [
      { status: "Pass", test: "Hype version steelmanned", note: "The analysis preserves rapid capability growth and agentic workflows as real evidence." },
      { status: "Pass", test: "Skeptical version steelmanned", note: "Integration cost, accountability, and non-coding work are treated as load-bearing, not excuses." },
      { status: "Caution", test: "Time horizon clarity", note: "Changing five years to fifteen years would require a fresh score." }
    ],
    sourceWalkdown: [
      { source: "BLS occupational projections", basis: "Labor-market projection model", independence: "official-data", supports: "Baseline against immediate broad occupational collapse." },
      { source: "Copilot / coding-assistant studies", basis: "Measured productivity effects in bounded tasks", independence: "vendor-mixed", supports: "Task acceleration, not full role elimination." },
      { source: "Historical automation base rates", basis: "Cross-industry adoption and displacement history", independence: "reference-class", supports: "Five-year obsolescence claims usually overshoot." }
    ],
    nodes: {
      "C0": { id: "C0", level: 0, col: 1, row: 0, kind: "claim",
        text: "AI will make most software engineers obsolete within five years.",
        type: "causal", role: "Prediction under test.",
        estimate: [0.05, 0.20], confidence: "Low", weak: true,
        verification: "Decompose into capability, substitutability, adoption, and labor-demand response.",
        evidence: "Speculative; relies on extrapolation.",
        depends: ["S1", "S2", "S3", "S4"],
        bias: "Recency bias on AI demos.",
        changes: "Operationalize \"most\" and \"obsolete\"; specify horizon."
      },
      "S1": { id: "S1", level: 1, col: 0, row: 0, parent: "C0", kind: "subclaim",
        text: "AI systems will reach engineer-level capability on most engineering tasks.",
        type: "empirical", role: "Capability premise.",
        estimate: [0.2, 0.5], confidence: "Low",
        verification: "Benchmarks on real-world software tasks, not just coding contests.",
        evidence: "Strong on isolated coding; weak on systems work, debugging, requirements.",
        depends: ["P1.1", "P1.2"],
        bias: "Benchmark-fits-the-tool.",
        changes: "Slow benchmark progress on integrative tasks weakens."
      },
      "S2": { id: "S2", level: 1, col: 1, row: 0, parent: "C0", kind: "subclaim",
        text: "Capability translates into deployed substitution within five years.",
        type: "empirical", role: "Adoption-and-integration premise.",
        estimate: [0.05, 0.2], confidence: "Low", weak: true,
        verification: "Historical adoption curves for comparable tooling.",
        evidence: "Enterprise software adoption typically 7–15 years.",
        depends: ["P2.1", "P2.2"],
        bias: "Underweighting integration cost.",
        changes: "Faster adoption ramps would strengthen."
      },
      "S3": { id: "S3", level: 1, col: 2, row: 0, parent: "C0", kind: "subclaim",
        text: "Demand for software does not expand to absorb productivity gains.",
        type: "empirical", role: "Counters Jevons-style absorption.",
        estimate: [0.15, 0.4], confidence: "Low",
        verification: "Software demand elasticity to engineering productivity.",
        evidence: "Historically, productivity gains have expanded software output.",
        depends: ["P3.1"],
        bias: "Static labor demand assumption.",
        changes: "If demand is highly elastic, headcount may rise."
      },
      "S4": { id: "S4", level: 1, col: 3, row: 0, parent: "C0", kind: "subclaim",
        text: "\"Most\" engineers' work is the kind AI substitutes for, not complements.",
        type: "definition", role: "Substitutability premise.",
        estimate: [0.15, 0.4], confidence: "Low", weak: true,
        verification: "Task-level decomposition of engineering work.",
        evidence: "Engineering work is heterogeneous; substitutable share unclear.",
        depends: ["P4.1"],
        bias: "Treating engineering as monolithic.",
        changes: "Highlighting non-substitutable tasks weakens."
      },
      "P1.1": { id: "P1.1", level: 2, col: 0, row: 0, parent: "S1", kind: "premise",
        text: "Benchmark progress generalizes to real codebases.",
        type: "empirical", role: "Bridge from demos to practice.",
        estimate: [0.2, 0.5], confidence: "Low",
        tunable: true,
        prior: [0.2, 0.5],
        verification: "Field studies in production codebases.",
        evidence: "Mixed; productivity gains real but bounded.",
        bias: "Demo-to-deployment gap.", changes: "Strong real-world deployment studies would help."
      },
      "P1.2": { id: "P1.2", level: 2, col: 0, row: 1, parent: "S1", kind: "premise",
        text: "Current scaling trends continue.",
        type: "interpretive", role: "Extrapolation premise.",
        estimate: [0.3, 0.55], confidence: "Low",
        tunable: true,
        prior: [0.3, 0.55],
        verification: "Compute, data, and algorithmic progress trends.",
        evidence: "Scaling laws hold but with diminishing returns.",
        bias: "Trend extrapolation.", changes: "Plateau in benchmarks would weaken."
      },
      "P2.1": { id: "P2.1", level: 2, col: 1, row: 0, parent: "S2", kind: "premise",
        text: "Enterprise adoption of AI tooling reaches majority of teams in <5 years.",
        type: "empirical", role: "Adoption velocity.",
        estimate: [0.15, 0.4], confidence: "Low", weak: true,
        tunable: true,
        prior: [0.15, 0.4],
        verification: "Adoption surveys; integration timelines.",
        evidence: "Code assistants adopted quickly; full agents slower.",
        bias: "Confusing seat licenses with workflow change.", changes: "Faster enterprise uptake would tighten."
      },
      "P2.2": { id: "P2.2", level: 2, col: 1, row: 1, parent: "S2", kind: "premise",
        text: "Organizations restructure roles to realize substitution within 5 years.",
        type: "empirical", role: "Organizational latency.",
        estimate: [0.1, 0.3], confidence: "Low",
        tunable: true,
        prior: [0.1, 0.3],
        verification: "Historical role-restructuring base rates.",
        evidence: "Restructuring is slow even with the technology.",
        bias: "Underweighting org inertia.", changes: "Aggressive restructuring case studies would help."
      },
      "P3.1": { id: "P3.1", level: 2, col: 2, row: 0, parent: "S3", kind: "premise",
        text: "Software backlog and demand are inelastic to productivity gains.",
        type: "empirical", role: "Closes Jevons channel.",
        estimate: [0.15, 0.35], confidence: "Low",
        tunable: true,
        prior: [0.15, 0.35],
        verification: "Historical productivity vs. employment in software.",
        evidence: "Software employment has grown with productivity historically.",
        bias: "Treats demand as fixed pool.", changes: "Evidence of demand saturation would strengthen."
      },
      "P4.1": { id: "P4.1", level: 2, col: 3, row: 0, parent: "S4", kind: "premise",
        text: "Most engineering tasks are well-specified and substitutable.",
        type: "interpretive", role: "Substitutability claim.",
        estimate: [0.2, 0.45], confidence: "Low", weak: true,
        tunable: true,
        prior: [0.2, 0.45],
        verification: "Task taxonomy across engineering roles.",
        evidence: "Specification and integration work remain hard.",
        bias: "Treating coding as the whole job.", changes: "Documenting the spec/judgment share weakens claim."
      }
    }
  },

  "confidence": {
    id: "confidence",
    claim: "People who sound confident are usually competent.",
    claimType: "statistical generalization",
    estimate: [0.35, 0.55],
    confidence: "Low",
    bottomLine: "Weakly true within experts in low-stakes settings; routinely false across populations because confidence is partly a personality and performance variable, not a competence signal.",
    revision: "Among people who are competent, confident delivery is more common; the inverse — using confidence as a screen for competence — is unreliable because confidence is also produced by personality, status, and practice.",
    weakest: ["S2", "P2.1"],
    weakestWord: "usually",
    loadedTerms: [
      {
        term: "sound confident",
        meanings: ["paralinguistic markers (tone, pace, volume)", "verbal markers (assertive phrasing, lack of hedging)", "both verbal + paralinguistic together", "self-rated confidence in surveys"],
        chosen: "perceived confidence — verbal + paralinguistic markers as judged by listeners",
        reason: "The claim is about social perception, not introspection. We score whether listeners' assessment of \"sounds confident\" tracks competence, not whether the speaker's self-rated certainty does."
      },
      {
        term: "usually",
        meanings: [">50% of cases", ">70%", ">90%", "more often than chance"],
        chosen: ">50% of cases (bare majority)",
        reason: "Lowest defensible threshold. Stronger readings (>70%) would set a higher bar against the same evidence. The claim is being scored at the threshold most favorable to itself."
      },
      {
        term: "competent",
        meanings: ["calibrated accuracy in the domain", "credentialed / certified expertise", "perceived competence by others", "outperforms median in the same role"],
        chosen: "calibrated accuracy in the domain under discussion (ground-truthable performance)",
        reason: "Competence as observable performance against ground truth — the only operationalization that lets the claim be tested rather than circular. \"Perceived competence\" would make the claim trivially true by definition."
      },
      {
        term: "people",
        meanings: ["adult populations in general", "domain experts only", "public figures / pundits", "any speaker in any context"],
        chosen: "adult populations broadly, across mixed-feedback domains",
        reason: "Claim is unqualified. Restricting to \"experts in well-calibrated feedback domains\" would dramatically improve the claim's score but rewrite it; we score the broad reading."
      }
    ],
    coverage: [
      { area: "Definition of \"sound confident\"", status: "partial" },
      { area: "Population scope", status: "gap" },
      { area: "Direction of inference (P(comp|conf) vs P(conf|comp))", status: "covered" },
      { area: "Domain dependence", status: "partial" }
    ],
    hypotheses: [
      { id: "H0", h: "Confidence reliably predicts competence", support: "Low",
        decomposition: [
          { text: "Listeners reliably distinguish genuine confidence from performed confidence", estimate: [0.35, 0.60] },
          { text: "Internal certainty usually tracks actual domain competence", estimate: [0.25, 0.50] },
          { text: "Status, personality, and rehearsal are modest enough confounds not to swamp the signal", estimate: [0.15, 0.40] }
        ] },
      { id: "H1", h: "Competence predicts confidence, not the reverse", support: "Medium",
        decomposition: [
          { text: "Competent people gain justified confidence from repeated feedback", estimate: [0.60, 0.85] },
          { text: "Confidence is more often an effect of competence than a reliable screening signal for it", estimate: [0.55, 0.80] },
          { text: "The reverse inference fails across mixed populations and feedback-poor domains", estimate: [0.55, 0.80] }
        ] },
      { id: "H2", h: "Confidence reflects personality and practice independent of skill", support: "Medium-High",
        decomposition: [
          { text: "Extraversion, status, and rehearsal can produce confident delivery without accuracy", estimate: [0.65, 0.90] },
          { text: "Audiences reward projected confidence as a status signal", estimate: [0.55, 0.80] },
          { text: "Those social-signal variables are only weakly coupled to ground-truth performance", estimate: [0.55, 0.80] }
        ] },
      { id: "H3", h: "Dunning-Kruger-style miscalibration is common in low-skill range", support: "Medium",
        decomposition: [
          { text: "Lower-skill performers overestimate their ability in many studied contexts", estimate: [0.45, 0.75] },
          { text: "Feedback-poor domains allow miscalibration to persist", estimate: [0.55, 0.80] },
          { text: "Experts can sound less confident because they track uncertainty and caveats", estimate: [0.45, 0.70] }
        ] }
    ],
    stress: [
      { perturb: "Restrict to a single expert domain with feedback", effect: "Estimate rises; calibration improves with feedback." },
      { perturb: "Use \"usually\" = >70%", effect: "Estimate falls; threshold too strong." },
      { perturb: "Population = pundits / commentators", effect: "Estimate falls sharply." }
    ],
    evidenceBudget: [
      { item: "Tetlock superforecasting work", weight: "high", direction: "against (calibration weakly tied to confidence)", lrLow: 0.4, lrHigh: 0.7,
        lrPerH: { H0: 0.5, H1: 2, H2: 1.5, H3: 1.2 } },
      { item: "Kruger & Dunning (1999)", weight: "medium", direction: "against", lrLow: 0.4, lrHigh: 0.7,
        lrPerH: { H0: 0.4, H1: 1, H2: 1.4, H3: 2.5 } },
      { item: "Anderson et al. on confidence and status", weight: "medium", direction: "against", lrLow: 0.6, lrHigh: 1.0,
        lrPerH: { H0: 0.6, H1: 1, H2: 2.5, H3: 0.8 } }
    ],
    priorRange: [0.30, 0.50],
    verificationNotes: [
      "Specify what counts as \"sounding confident\" (verbal, paralinguistic, both).",
      "Specify domain and feedback environment.",
      "State which conditional probability is meant."
    ],
    subjectivity: [
      { item: "Equating perceived confidence with calibrated probability", kind: "definition", risk: "Conflates delivery with epistemic state." },
      { item: "Treating \"usually\" as a vague quantifier", kind: "logic", risk: "Allows the claim to slide." }
    ],
    stage0: {
      prior: "40-60% before decomposition; confidence carries some signal but is heavily confounded.",
      referenceClass: "Social-signal claims where a visible trait is used as a proxy for competence.",
      pressure: "People want a simple interpersonal heuristic; skeptics want to punish confidence because overconfidence is salient.",
      uncomfortableVerdict: "The claim is not simply false: in feedback-rich expert domains confidence can contain useful signal."
    },
    rangeAnchors: {
      lower: "Calibration failures, status effects, and personality confounds weaken confidence as a broad competence screen.",
      upper: "In domains with repeated feedback, competence can increase justified confidence and make delivery informative."
    },
    readings: [
      { label: "Broad population", range: [0.35, 0.55], note: "Across domains, confidence is too confounded to be a reliable screen." },
      { label: "Expert feedback domain", range: [0.60, 0.75], note: "Calibration improves when people receive repeated, objective feedback." },
      { label: "Public punditry", range: [0.20, 0.40], note: "Confidence is often optimized for persuasion and status, not accuracy." }
    ],
    cruxes: [
      { crux: "Which conditional probability is meant?", current: "P(competent | sounds confident) is weaker than P(sounds confident | competent).", wouldMove: "If the claim meant only competent people often sound confident, the score rises." },
      { crux: "Does the domain provide fast feedback?", current: "Mixed public domains often lack corrective feedback.", wouldMove: "Restricting to chess, weather, surgery, or similar domains raises the estimate." },
      { crux: "How strong are personality and status confounds?", current: "Extraversion and practiced delivery can mimic competence.", wouldMove: "Evidence that listeners can filter those confounds would strengthen the claim." }
    ],
    fairnessAudit: [
      { status: "Pass", test: "Useful heuristic preserved", note: "The analysis allows confidence to be informative in expert feedback domains." },
      { status: "Pass", test: "Overconfidence evidence preserved", note: "The analysis does not let delivery style stand in for calibrated accuracy." },
      { status: "Caution", test: "Population scope", note: "The credence changes if 'people' means credentialed experts rather than broad adult populations." }
    ],
    sourceWalkdown: [
      { source: "Tetlock forecasting work", basis: "Forecast calibration against later outcomes", independence: "performance-data", supports: "Confidence and accuracy are separable." },
      { source: "Kruger & Dunning", basis: "Experimental self-assessment versus performance", independence: "lab-study", supports: "Low performers can be miscalibrated." },
      { source: "Status-confidence studies", basis: "Social perception and status assignment experiments", independence: "lab-study", supports: "Confidence can drive perceived competence without matching actual competence." }
    ],
    nodes: {
      "C0": { id: "C0", level: 0, col: 1, row: 0, kind: "claim",
        text: "People who sound confident are usually competent.",
        type: "statistical", role: "Generalization under test.",
        estimate: [0.35, 0.55], confidence: "Low", weak: true,
        verification: "Test P(competent | sounds confident) across populations and domains.",
        evidence: "Several confounds; effect is domain-specific.",
        depends: ["S1", "S2", "S3"],
        bias: "Halo effect from delivery.",
        changes: "Specify population, domain, and direction of inference."
      },
      "S1": { id: "S1", level: 1, col: 0, row: 0, parent: "C0", kind: "subclaim",
        text: "Confidence is a reliable signal of internal certainty.",
        type: "empirical", role: "Signal-fidelity premise.",
        estimate: [0.4, 0.65], confidence: "Medium",
        verification: "Compare expressed and self-rated confidence.",
        evidence: "Reasonable in experts; weaker in novices.",
        depends: ["P1.1"],
        bias: "Treats delivery as window onto belief.",
        changes: "Acting and rehearsal weaken the link."
      },
      "S2": { id: "S2", level: 1, col: 1, row: 0, parent: "C0", kind: "subclaim",
        text: "Internal certainty is well-calibrated to actual competence.",
        type: "empirical", role: "Calibration premise.",
        estimate: [0.2, 0.45], confidence: "Low", weak: true,
        verification: "Measure calibration of self-rated certainty against ground truth.",
        evidence: "Dunning-Kruger and base-rate miscalibration are pervasive.",
        depends: ["P2.1", "P2.2"],
        bias: "Assumes introspection is accurate.",
        changes: "Calibration training narrows this gap."
      },
      "S3": { id: "S3", level: 1, col: 2, row: 0, parent: "C0", kind: "subclaim",
        text: "Confounders (status, personality, practice) do not explain the appearance of confidence.",
        type: "empirical", role: "Confound-control premise.",
        estimate: [0.15, 0.4], confidence: "Low", weak: true,
        verification: "Partial out personality and status in regression.",
        evidence: "Confidence correlates strongly with extraversion and status.",
        depends: ["P3.1"],
        bias: "Single-cause reasoning.",
        changes: "Larger confound effects would weaken claim further."
      },
      "P1.1": { id: "P1.1", level: 2, col: 0, row: 0, parent: "S1", kind: "premise",
        text: "Observers can distinguish expressed from performed confidence.",
        type: "empirical", role: "Listener-side reliability.",
        estimate: [0.35, 0.6], confidence: "Low",
        tunable: true,
        prior: [0.35, 0.6],
        verification: "Lie-detection and confidence-judgment studies.",
        evidence: "Listeners are mediocre at distinguishing the two.",
        bias: "Trusts observer intuition.", changes: "Trained raters do better."
      },
      "P2.1": { id: "P2.1", level: 2, col: 1, row: 0, parent: "S2", kind: "premise",
        text: "Self-rated certainty tracks accuracy across the competence range.",
        type: "empirical", role: "Calibration core.",
        estimate: [0.2, 0.4], confidence: "Low", weak: true,
        tunable: true,
        prior: [0.2, 0.4],
        verification: "Calibration curves by skill quartile.",
        evidence: "Many studies find lower-quartile overestimation; upper-quartile patterns vary by task and feedback setting.",
        bias: "Aggregate calibration masks miscalibration at edges.",
        changes: "Calibrated populations (e.g. forecasters) behave differently."
      },
      "P2.2": { id: "P2.2", level: 2, col: 1, row: 1, parent: "S2", kind: "premise",
        text: "Feedback environment supports calibration in the relevant domain.",
        type: "empirical", role: "Domain condition.",
        estimate: [0.2, 0.5], confidence: "Low",
        tunable: true,
        prior: [0.2, 0.5],
        verification: "Classify domain by feedback quality.",
        evidence: "Most public-discourse domains have weak feedback.",
        bias: "Imports lab calibration to field settings.", changes: "Domains with rapid feedback (chess, weather) calibrate better."
      },
      "P3.1": { id: "P3.1", level: 2, col: 2, row: 0, parent: "S3", kind: "premise",
        text: "Personality and status contribute only modestly to projected confidence.",
        type: "empirical", role: "Confound bound.",
        estimate: [0.1, 0.3], confidence: "Low", weak: true,
        tunable: true,
        prior: [0.1, 0.3],
        verification: "Personality (Big Five) effects on perceived confidence.",
        evidence: "Effects are not modest; extraversion is a strong predictor.",
        bias: "Underweighting personality variance.",
        changes: "Acknowledging confound size collapses the inference."
      }
    }
  }
};

// ───────────────────────────────────────────────────────────────────────────
// Epistemic profiles — coherent worldview presets that override tunable priors.
// Shape: { [analysisId]: { [nodeId]: [lo, hi] } } — only nodes marked tunable
// in window.ANALYSES are honored by computeLiveEstimates; adjustments to
// non-tunable nodes are silently ignored. The bundled analyses expose
// tunable leaves, so every
// non-balanced profile moves every analysis's verdict in a coherent direction.
//
// Shift magnitudes are deliberately moderate: a profile is a *credible*
// alternative worldview, not an extreme one. Each non-balanced profile
// targets 3–5 priors per analysis in a coherent direction.
// ───────────────────────────────────────────────────────────────────────────
window.PROFILES = [
  {
    id: "balanced",
    name: "Balanced default",
    desc: "No adjustments — neutral starting point.",
    adjustments: {}
  },
  {
    id: "evidence_strict",
    name: "Evidence-strict",
    desc: "High evidence standard; low weight to anecdote and motive inference. Prefers direct counts over modeled estimates and discounts the precision of round-number summaries.",
    adjustments: {
      "minwage": {
        // "Always" demands universal truth — any credible null falsifies, and
        // documented nulls (Cengiz et al.) make the universal flatly unsupported.
        "A5.1.1": [0.02, 0.10],
        // Distribution of effect estimates straddles zero per published meta-evidence.
        "P5.2":   [0.02, 0.10],
        // Price pass-through to consumers is empirically documented (1-3% in food service).
        "P3.2":   [0.10, 0.35],
        // Hamermesh meta-elasticity is well-established; the demand channel itself is real.
        "A2.1.1": [0.55, 0.85]
      },
      "ai-engineers": {
        // Demo-to-deployment gap is well-documented; benchmarks don't generalize cleanly.
        "P1.1":   [0.10, 0.30],
        // Scaling-law diminishing returns visible in published benchmark progress.
        "P1.2":   [0.15, 0.35],
        // Adoption surveys show seat licenses, not full workflow substitution.
        "P2.1":   [0.10, 0.25],
        // Historical org-restructuring base rates are slow; firm-level evidence supports inertia.
        "P2.2":   [0.05, 0.20],
        // Task taxonomies consistently show specification/judgment work hard to automate.
        "P4.1":   [0.10, 0.30]
      },
      "confidence": {
        // Listener-confidence-judgment studies show poor discrimination.
        "P1.1":   [0.20, 0.45],
        // Dunning-Kruger and Tetlock document widespread calibration failure.
        "P2.1":   [0.10, 0.25],
        // Big Five extraversion is a strong, replicated confidence predictor.
        "P3.1":   [0.05, 0.20]
      }
    }
  },
  {
    id: "institution_skeptical",
    name: "Institution-skeptical",
    desc: "Lower trust in official sources and expert consensus. Treats curated databases, official records, and institutional summaries as biased rather than neutral.",
    adjustments: {
      "minwage": {
        // BLS/Hamermesh meta-averages obscure regional bite; institutional aggregation hides cases.
        "A2.1.1": [0.35, 0.65],
        // DOL enforcement is uneven and captured; "non-trivial" overstates real practice.
        "A1.2.1": [0.25, 0.55],
        // The academic mainstream's dismissal of disemployment is itself an institutional position;
        // skeptical readers raise the chance that null-finding studies are methodologically slanted.
        "A5.1.1": [0.15, 0.40],
        // Same logic: aggregate "small effect" claims may understate point effects.
        "P5.2":   [0.10, 0.30]
      },
      "ai-engineers": {
        // Lab-published benchmarks are vendor-aligned; demo claims overstate field performance.
        "P1.1":   [0.10, 0.30],
        // Adoption surveys come from the firms selling the tools.
        "P2.1":   [0.10, 0.25],
        // Corporate restructuring claims are PR; organizations rarely move fast in practice.
        "P2.2":   [0.05, 0.20],
        // Scaling-law extrapolations are lab claims; outside replication is sparse.
        "P1.2":   [0.15, 0.35],
        // Task-substitutability narratives from McKinsey/labs are institutional marketing.
        "P4.1":   [0.10, 0.30]
      },
      "confidence": {
        // Academic calibration studies are WEIRD-population biased; raises chance self-report tracks.
        "P2.1":   [0.30, 0.55],
        // Personality-trait literature uses noisy academic constructs; effect sizes overstated.
        "P3.1":   [0.15, 0.40],
        // Listener-discrimination studies use artificial lab paradigms.
        "P1.1":   [0.45, 0.70]
      }
    }
  },
  {
    id: "institution_trusting",
    name: "Institution-trusting",
    desc: "Higher trust in peer review, official records, and expert consensus. Treats convergence across reputable institutions as strong corroboration.",
    adjustments: {
      "minwage": {
        // Hamermesh meta-elasticity is well-established peer-reviewed economics.
        "A2.1.1": [0.60, 0.88],
        // DOL enforcement is a real institutional fact recorded in administrative data.
        "A1.2.1": [0.55, 0.80],
        // Modern academic consensus (Cengiz et al.) finds nulls credible; trusting readers accept this.
        "A5.1.1": [0.03, 0.10],
        // Same consensus: aggregate effect is near zero in most observed settings.
        "P5.2":   [0.02, 0.10]
      },
      "ai-engineers": {
        // Peer-reviewed benchmark-progress studies show real generalization.
        "P1.1":   [0.35, 0.65],
        // Scaling laws hold per multiple published studies from independent labs.
        "P1.2":   [0.45, 0.70],
        // Enterprise adoption surveys (Gartner, McKinsey) trusted as institutional data.
        "P2.1":   [0.30, 0.55],
        // Major firms publish restructuring plans; institutional commitments treated as real.
        "P2.2":   [0.25, 0.50],
        // Task-decomposition analyses from established consultancies trusted.
        "P4.1":   [0.35, 0.60]
      },
      "confidence": {
        // Anderson et al. on status-confidence link is mainstream peer-reviewed work.
        "P1.1":   [0.20, 0.45],
        // Tetlock superforecasting work is rigorous; calibration is the binding finding.
        "P2.1":   [0.10, 0.25],
        // Big Five literature on extraversion-confidence link is robust and replicated.
        "P3.1":   [0.05, 0.18],
        // Domain-feedback literature converges: most public-discourse domains lack feedback.
        "P2.2":   [0.10, 0.30]
      }
    }
  },
  {
    id: "anecdote_permissive",
    name: "Anecdote-permissive",
    desc: "Treats individual cases as stronger evidence than aggregate models. Weights firsthand reports and concrete case details higher than broad statistical summaries.",
    adjustments: {
      "minwage": {
        // Any single case of documented disemployment counts; "all nulls are flawed"
        // becomes plausible once you weight local layoff stories over meta-averages.
        "A5.1.1": [0.20, 0.45],
        // At least some market has a non-zero effect — confirmed by individual cases.
        "P5.2":   [0.20, 0.45],
        // Small-business owners report they can't pass costs to customers in lived practice.
        "P3.2":   [0.35, 0.65],
        // Individual sector-specific elasticity stories support the demand channel.
        "A2.1.1": [0.55, 0.85]
      },
      "ai-engineers": {
        // Demo videos and individual cases of AI replacing engineers count as strong evidence.
        "P1.1":   [0.35, 0.65],
        // AI-first startup anecdotes show enterprise adoption IS happening fast in some cases.
        "P2.1":   [0.30, 0.55],
        // Stories of teams restructured around AI tools show org change IS feasible quickly.
        "P2.2":   [0.25, 0.55],
        // Specific cases of tasks being substituted by agents support substitutability claim.
        "P4.1":   [0.35, 0.60],
        // Visible scaling-curve demos generalize from individual capability jumps.
        "P1.2":   [0.40, 0.65]
      },
      "confidence": {
        // Personal experience: "I can usually tell when someone confident knows their stuff."
        "P1.1":   [0.50, 0.75],
        // Anecdotal cases where confident people turned out competent.
        "P2.1":   [0.35, 0.60],
        // "In my domain, feedback is good enough" — lived experience trumps aggregate stats.
        "P2.2":   [0.35, 0.65],
        // Confounds overplayed; in real life, competent people just sound like it.
        "P3.1":   [0.20, 0.45]
      }
    }
  }
];
