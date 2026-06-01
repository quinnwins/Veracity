# First Principles Veracity

Veracity is a v0.9 browser prototype for first-principles truth audits. It exposes authored credence, LR posterior, conjunctive-Bayes posterior, multi-hypothesis posterior, decomposition depth, and always-visible audit checks for three sample analyses.

## Run Locally

This prototype loads React, Babel, and JSX files in the browser. Open it through a local server, not by double-clicking the HTML file:

```sh
python3 -m http.server 8766
```

Then open:

```text
http://localhost:8766/First%20Principles%20Veracity.html
```

Direct `file://` loading is unsupported because browsers block Babel from fetching local JSX files.

## Verify

```sh
node scripts/validate-data.mjs
node --test scripts/test-math.mjs
node scripts/lint-tone.mjs   # warns on bias tell-words and motive-imputation phrasings
```

Expected validator output:

```text
Validated 3 analyses and 5 profiles.
```

## Publication Caveats

The app currently depends on CDN-hosted React, ReactDOM, Babel, and Google Fonts. For offline or archive-grade publication, bundle those assets locally.

The bundled analyses are scrutiny demos, not source-complete public reports. Before broad publication of any specific claim audit, dated source URLs should be captured for externally changing facts.
