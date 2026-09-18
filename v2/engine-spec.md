# V2 inference engine

Language models propose structure and make local semantic judgments. Deterministic code enforces probability relationships.

## Evidence update

For binary H:

```
logit(P(H|E)) = logit(P(H)) + sum(log(LR_cluster))
```

Evidence is grouped by independence cluster before updating. A cluster contributes one effective update.

## AND relationships

Never blindly multiply.

Independent children:
`P(A and B) = P(A)P(B)`

Unknown dependence uses Frechet bounds:
`max(0, P(A)+P(B)-1) <= P(A and B) <= min(P(A),P(B))`

For N events:
`max(0, sum(P(Ai))-(N-1)) <= P(all) <= min(P(Ai))`

If dependence is modeled, use the declared model.

## OR relationships

Exclusive: `P(A or B)=P(A)+P(B)`

Independent: `P(A or B)=1-(1-P(A))(1-P(B))`

Unknown overlap returns bounds or abstains.

## Alternative sets

Normalized Bayesian hypothesis updating is allowed only when the set is explicitly exclusive and exhaustive. Otherwise each hypothesis keeps an independent credence.

## UI isolation

Inference cannot receive expanded nodes, selected tabs, hidden-depth state, scroll state, or visual mode. A regression test must prove presentation toggles cannot alter the posterior.

## Provenance

Every non-derived probability requires provenance. Every derived probability stores the rule, input IDs, and engine version.

## Grounding

Initial metric: sensitivity-weighted fraction of posterior-sensitive nodes backed by inspectable evidence. An unsupported decorative leaf barely matters; an unsupported crux sharply lowers grounding.

## Stability

Perturb plausible prior ranges, LR ranges, ambiguous readings, and dependence assumptions. Stability summarizes expected posterior displacement. It is not itself a probability.

## Crux ranking

For each tunable node: hold other inputs constant, sweep the node across its plausible range, recompute root, and rank by root posterior displacement.

## Value of information

For candidate observation outcomes O:

```
EIG = H(current posterior) - sum_o P(o) H(posterior | o)
```

If outcome probabilities are unavailable, show **potential posterior swing** instead of fabricating EIG. A product priority can divide information value by estimated cost, but the components remain visible.

## Abstain

Return `abstain` when a load-bearing claim is underspecified, relation semantics are missing, duplicate/correlation structure is unresolved, a required LR has no defensible elicitation, or a requested normalized hypothesis set is not exclusive/exhaustive.

The abstention output must identify the missing information needed to continue.
