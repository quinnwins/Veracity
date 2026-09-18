# V2 canonical data contract

```ts
type ProbabilityRange = [number, number];

type Provenance =
  | { kind: "measured"; sourceId: string; method?: string }
  | { kind: "model"; provider: string; model: string; questionId: string }
  | { kind: "elicited"; actor: "user" | "analyst"; rationale: string }
  | { kind: "derived"; rule: string; inputIds: string[] };

type Relation =
  | { kind: "and"; children: string[]; dependence: "independent" | "bounded" | "modeled" }
  | { kind: "or"; children: string[]; exclusivity: "exclusive" | "overlapping" }
  | { kind: "evidence"; evidenceIds: string[] }
  | { kind: "alternative_set"; children: string[]; exclusive: boolean; exhaustive: boolean }
  | { kind: "informational"; children: string[] };

interface ClaimContract {
  id: string;
  wording: string;
  reading: string;
  population?: string;
  geography?: string;
  horizon?: string;
  outcome?: string;
  loadedTerms: Array<{ term: string; meaning: string; alternatives: string[] }>;
  falsifier: string;
}

interface BeliefNode {
  id: string;
  text: string;
  type: "claim" | "subclaim" | "premise" | "atomic" | "hypothesis";
  prior?: ProbabilityRange;
  posterior?: ProbabilityRange;
  provenance?: Provenance;
  relation?: Relation;
  tunable?: boolean;
  status: "scored" | "unscored" | "abstain";
}

interface EvidenceItem {
  id: string;
  observation: string;
  sourceId: string;
  sourceSpan?: string;
  targetNodeIds: string[];
  independenceCluster: string;
  status: "observed" | "disputed" | "ungrounded";
  likelihood?: {
    lr?: ProbabilityRange;
    provenance: Provenance;
  };
  judgments?: ModelJudgment[];
}

interface ModelJudgment {
  id: string;
  task: "relevance" | "direction" | "dedupe" | "measurement_fit" | "classification";
  provider: string;
  model: string;
  question: string;
  options: Array<{ label: string; probability: number }>;
  sourceIds: string[];
  createdAt: string;
}

interface Assessment {
  contract: ClaimContract;
  nodes: Record<string, BeliefNode>;
  evidence: Record<string, EvidenceItem>;
  rootId: string;
  credence?: ProbabilityRange;
  grounding: number;
  stability: number;
  cruxes: Crux[];
  nextInvestigations: Investigation[];
  snapshots: Snapshot[];
}

interface Crux {
  nodeId: string;
  baseline: ProbabilityRange;
  lowScenario: ProbabilityRange;
  highScenario: ProbabilityRange;
  maxSwing: number;
}

interface Investigation {
  targetNodeId: string;
  question: string;
  possibleObservation: string;
  expectedInformationGain?: number;
  expectedPosteriorSwing?: number;
  costClass: "instant" | "search" | "deep-research" | "external";
  rationale: string;
}

interface Snapshot {
  at: string;
  credence: ProbabilityRange;
  changedInputs: string[];
  explanation: string;
}
```

Credence, grounding, and stability are deliberately separate. A polished 80% must not disguise weak grounding or extreme prior sensitivity.
