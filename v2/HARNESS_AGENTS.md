# Harness-agnostic agents

Veracity does not require the orchestrator or grunt/worker to be an OpenAI API model.

The two reasoning roles are named:

- **orchestrator** — decomposition, hidden-assumption review, probability-model elicitation, adversarial review, Probability Lab planning/review.
- **worker** — repetitive source search and source-linked atomic-question extraction.

The probability tier can be Jev **or another configured harness/API agent**. Jev is optional.

## Select agents

Copy the example and point Veracity at it:

```sh
cp agents.example.json agents.json
export VERACITY_AGENT_CONFIG="$PWD/agents.json"
export VERACITY_ORCHESTRATOR_AGENT=codex-high
export VERACITY_WORKER_AGENT=claude-worker
npm start
```

The browser exposes the configured named agents and lets the user choose an orchestrator and worker for each new investigation / Probability Lab preparation. The selected names are saved with the run.

`OPENAI_*` configuration remains the backwards-compatible default when there is no `agents.json`.

## Built-in harness bridges

The included command bridges speak the same internal contract and use the harness's own authentication/session:

- `scripts/harness/codex-cli.mjs` → `codex exec` in ephemeral, read-only mode with an output schema. Search tasks enable Codex web search.
- `scripts/harness/claude-code.mjs` → `claude -p` with JSON Schema structured output. Non-search tasks disable tools; search tasks allow WebSearch/WebFetch.
- `scripts/harness/gemini-cli.mjs` → `gemini --prompt ... --output-format json --approval-mode plan`.
- HTTP bridge → useful for Antigravity, IDE agents, remote runners, or another process that cannot be directly spawned.

These bridges are intentionally read-only research workers. They are never granted repository write permissions by Veracity.

Harness subscription/auth rules are owned by the harness vendor. Veracity does not impersonate an API key or bypass product limits.

## Universal bridge protocol

Any executable can be an agent. Configure:

```json
{
  "driver": "command",
  "command": ["/path/to/my-agent-adapter"],
  "model": "my-model",
  "capabilities": {"search": true}
}
```

Veracity writes one JSON object to stdin:

```json
{
  "protocol": "veracity-agent/v1",
  "requestId": "uuid",
  "role": "orchestrator",
  "task": "decomposition",
  "model": "my-model",
  "instructions": "...",
  "input": {},
  "schema": {}
}
```

The bridge must write exactly one JSON response to stdout:

```json
{
  "protocol": "veracity-agent/v1",
  "requestId": "same uuid",
  "model": "actual model/version used",
  "output": {},
  "usage": null
}
```

`output` is validated again inside Veracity against the supplied schema. Extra or malformed fields are rejected.

For task `search`, output must be:

```json
{"sources":[{"url":"https://...","title":"..."}]}
```

A command bridge is launched with `shell:false`; source text is passed as data inside the JSON envelope, not interpolated into a shell command.

## HTTP bridge

For GUI harnesses such as an Antigravity workspace, an adapter can expose the exact same protocol over HTTP. Configure:

```json
{
  "driver": "http",
  "endpoint": "http://127.0.0.1:9911/veracity-agent",
  "tokenEnv": "MY_AGENT_BRIDGE_TOKEN",
  "model": "agent-name",
  "capabilities": {"search": true}
}
```

Plain HTTP is accepted only on loopback. Remote bridges require HTTPS. `tokenEnv` names an environment variable; its value is never returned by Veracity configuration endpoints.

This is the escape hatch for **any harness**: if it can receive a JSON task and return schema-valid JSON, it can fill either role.

## Direct API models can be mixed with harness models

Examples:

- Codex subscription orchestrator + Gemini CLI worker + **Gemini probability estimator** (no Jev).
- Claude Code orchestrator + cheap OpenAI API worker + **Claude/worker probability estimator** (no Jev).
- Direct OpenAI orchestrator + Claude Code worker + Jev.
- Antigravity bridge orchestrator + Gemini CLI worker + Jev.
- Custom local model bridge for grunt work + Codex orchestrator + Jev.

The roles are independent. Veracity records the named agent, driver/model identity returned by the bridge, and usage metadata when the harness reports it.

## Security boundary

Agent outputs are untrusted.

Veracity still performs its own graph validation, quote checking, probability validation, source fetching, dependence checks and deterministic math after a harness returns.

A harness is therefore an interchangeable reasoning component, not a trusted database or probability engine.

## No Jev access required

Probability Lab exposes a separate probability-estimator selector. Choose `agent:<name>` to reuse any configured grunt/harness agent for batched structured JSON probabilities. The agent may abstain when the saved evidence does not support a defensible estimate; abstentions are stored explicitly and never coerced to 50%. Jev can be added later without changing the campaign/ledger architecture.
