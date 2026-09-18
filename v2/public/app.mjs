const $ = (s, root = document) => root.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const pct = p => p > 0 && p < .001 ? '<0.1%' : p < 1 && p > .999 ? '>99.9%' : `${Math.round(p * 100)}%`;
const range = r => r ? r[0] === r[1] ? pct(r[0]) : `${pct(r[0])}–${pct(r[1])}` : 'Not assigned';
const date = s => s ? new Date(s).toLocaleString(undefined, {dateStyle: 'medium', timeStyle: 'short'}) : 'Not established';
const safeHref = s => { try { const u = new URL(s); return u.protocol === 'https:' ? esc(u.href) : ''; } catch { return ''; } };
let config = null, record = null, selected = null, activeTab = 'evidence', poll = null, noticeTimer = null, requestKey = null, lastQuestion = null;
async function api(path, body, extra = {}) {
  const r = await fetch(path, {method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', headers: {'Content-Type': 'application/json', ...extra}, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000)});
  const data = await r.json();
  if (!r.ok) { const e = new Error(data.error || 'The request failed'); e.code = data.code; throw e; }
  return data;
}
function notice(message) { const n = $('#notice'); n.textContent = message; n.hidden = false; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { n.hidden = true; }, 7000); }
function agentOptions(role) {
  const all=config?.agents?.agents||[], agents=role==='worker'?all.filter(a=>a.capabilities?.search===true):all;
  const preferred=config?.agents?.defaults?.[role], chosen=agents.find(a=>a.name===preferred&&a.configured)?.name||agents.find(a=>a.configured)?.name;
  return agents.map(a=>`<option value="${esc(a.name)}" ${a.name===chosen?'selected':''} ${a.configured?'':'disabled'}>${esc(a.name)} · ${esc(a.driver)}${a.model?' · '+esc(a.model):''}${a.configured?'':' · not configured'}</option>`).join('');
}
function goHome() { clearTimeout(poll); record = null; selected = null; history.replaceState(null, '', '/'); renderHome(); }
function renderHome() {
  $('#main').innerHTML = `<section class="landing"><div><div class="eyebrow">Evidence / assumptions / uncertainty</div><h1>A clearer answer starts with better questions.</h1><p class="lead">Take a claim apart. Examine the evidence. Find the assumption that could change the answer.</p><form id="ask-form"><div class="question-box"><label for="question">What are you trying to figure out?</label><textarea id="question" name="question" placeholder="Write the claim you want to investigate…" required minlength="8" maxlength="2000" rows="3"></textarea><div class="form-pair"><label>Orchestrator<select name="orchestratorAgent" required>${agentOptions('orchestrator')}</select><small>Deep decomposition, synthesis and adversarial review.</small></label><label>Grunt / research worker<select name="workerAgent" required>${agentOptions('worker')}</select><small>Source search and repetitive evidence preparation.</small></label></div><div class="question-bottom"><small>${config?.researchConfigured ? 'Choose any configured harness or API agent for each role.' : 'Configure at least one reasoning agent and one search-capable worker.'}</small><button class="primary" type="submit" ${config?.researchConfigured?'':'disabled'}>Investigate claim <span aria-hidden="true">↗</span></button></div></div><p id="ask-error" role="alert" class="error-text"></p></form><button class="demo-link" id="demo-button">Explore a worked example <span>FICTIONAL · NO API KEY</span><b aria-hidden="true">→</b></button></div><aside class="protocol"><div class="eyebrow">The research protocol</div><h2>Show what the answer rests on.</h2><ol><li><div><strong>Define the claim</strong><p>Separate the exact question from its stronger or weaker readings.</p></div></li><li><div><strong>Expose assumptions</strong><p>Break the argument down to measurable questions.</p></div></li><li><div><strong>Challenge the evidence</strong><p>Look for contrary findings and shared underlying sources.</p></div></li><li><div><strong>Test the answer</strong><p>Change an input. See what moves—and what does not.</p></div></li></ol><div class="principle">A number is only as useful as the assumptions you can inspect.</div></aside></section>`;
}
function setRecord(a, {focus = true} = {}) {
  clearTimeout(poll); record = a;
  if (!selected || !a.model?.nodes[selected]) selected = a.model?.rootId;
  history.replaceState(null, '', `/?audit=${encodeURIComponent(a.id)}`); renderRecord();
  if (focus) $('#main').focus({preventScroll: true});
  if (a.status === 'running') poll = setTimeout(async () => { try { if (record?.id === a.id) setRecord(await api(`/api/assessments/${a.id}`), {focus: false}); } catch (e) { notice(e.message); } }, 1200);
}
function renderProgress() {
  const active = record.status === 'running';
  $('#main').innerHTML = `<section class="progress-view"><button class="quiet" data-action="home">← New question</button><div class="eyebrow">${active ? 'Research in progress' : 'Saved research'}</div><h1>${esc(record.question)}</h1>${active ? '<progress aria-label="Research in progress"></progress>' : ''}<p class="progress-stage" role="status">${esc(record.stage)}</p>${record.error ? `<p class="error-text">${esc(record.error)}</p>` : ''}<p class="muted">${active ? 'Each stage below is a recorded event. No probability is shown before the evidence model is evaluated.' : 'No completed probability has been substituted for this unfinished assessment. Its saved data can be exported.'}</p><div class="panel">${(record.events || []).slice(-7).map(e => `<div class="event">${esc(e.stage)} <span class="meta">${esc(date(e.at))}</span></div>`).join('')}</div><div class="actions">${active ? '<button class="secondary" data-action="cancel">Cancel research</button>' : ''}<button class="secondary" data-action="export">Export saved data</button></div></section>`;
}
function tree(id, depth = 0, seen = new Set()) {
  if (depth > 8) return '';
  const n = record.model.nodes[id], result = record.analysis.nodes[id];
  if (!n) return '';
  if (seen.has(id)) return `<button class="quiet" data-node="${esc(id)}">↳ ${esc(id)} · shared assumption, shown above</button>`;
  seen.add(id);
  const children = n.relation?.children || n.children || [];
  const relation = n.relation?.kind === 'and' ? 'AND · all conditions required' : n.relation?.kind === 'or' ? 'OR · alternative conditions' : 'Context · not multiplied into the claim';
  return `<div class="tree-node"><button class="node ${id === selected ? 'selected' : ''}" data-node="${esc(id)}" aria-pressed="${id === selected}"><span class="node-top"><span>${esc(id)} / ${esc(n.type)}</span><span class="node-range">${esc(range(result?.range))}</span></span><span class="node-title">${esc(n.text)}</span></button>${children.length ? `<div class="relation">${esc(relation)}</div><div class="tree-children">${children.map(c => tree(c, depth + 1, seen)).join('')}</div>` : ''}</div>`;
}
function inspector() {
  const n = record.model.nodes[selected], result = record.analysis.nodes[selected];
  if (!n) return '';
  const prior = n.prior, canEdit = prior && !['and', 'or'].includes(n.relation?.kind) && record.model.contract.mode !== 'descriptive';
  return `<div class="eyebrow">${esc(selected)} / inspect this assumption</div><h3 id="inspector-title" tabindex="-1">${esc(n.text)}</h3><dl><dt>What would disconfirm it?</dt><dd>${esc(n.falsifier || 'This is a definition or value choice, not an empirical probability.')}</dd><dt>Assessment</dt><dd>${esc(range(result?.range))} · ${esc(result?.status || 'unscored')}${result?.reasons?.length ? `<br>${esc(result.reasons.join(' '))}` : ''}</dd>${n.atomicity ? `<dt>Decomposition boundary</dt><dd>${esc(n.atomicity.reason)}</dd>` : ''}${n.referenceClass ? `<dt>Prior reference class</dt><dd>${esc(n.referenceClass)}</dd>` : ''}${n.provenance ? `<dt>Where the prior comes from</dt><dd>${esc(n.provenance.kind)} · ${esc(n.provenance.rationale)}</dd>` : ''}${n.relation?.rationale ? `<dt>How the pieces combine</dt><dd>${esc(n.relation.rationale)}</dd>` : ''}${n.judgments?.length ? `<dt>Jev diagnostic</dt><dd>${esc(n.judgments[0].model)} · ${esc(pct(n.judgments[0].options[0].probability))} passage relevance. Not a truth probability or a likelihood ratio.</dd>` : ''}</dl>${canEdit ? `<form id="scenario-form" class="stack"><div class="eyebrow">What if your starting assumption differs?</div><div class="form-pair"><label>Prior · lower<input name="low" type="number" min="0" max="1" step="0.01" value="${prior[0]}" required></label><label>Prior · upper<input name="high" type="number" min="0" max="1" step="0.01" value="${prior[1]}" required></label></div><p class="muted">A value of 0.50 means 50%. This saves a separate scenario; your original evidence and assessment stay unchanged.</p><p id="scenario-error" class="error-text" role="alert"></p><button class="primary">Save what-if scenario <span aria-hidden="true">↗</span></button></form>` : ''}`;
}
function tabContent() {
  const a = record.analysis, model = record.model;
  if (activeTab === 'evidence') {
    const rows = Object.values(model.evidence || {});
    return rows.length ? rows.map(e => `<article class="evidence-row"><div class="evidence-tag">${esc(e.targetNodeIds.join(', '))}<br>LR ${esc(e.likelihood.lr.join('–'))}<br>${esc(e.likelihood.provenance.kind)}</div><div><h3>${esc(e.observation)}</h3>${e.references.map(r => { const s = model.sources[r.sourceId]; const href = safeHref(s?.url); return `<blockquote>“${esc(r.quote)}”</blockquote>${href ? `<a href="${href}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a>` : `<p>${esc(s?.title || r.sourceId)}</p>`}<div class="meta">${esc(s?.kind)} · ${s?.kind === 'fetched' ? `Fetched ${esc(date(s.fetchedAt))}; publication date ${esc(date(s.publishedAt))}` : 'Not independently retrieved'}<br>Source digest: ${esc(s?.sha256?.slice(0, 16) || 'none')}</div>`; }).join('')}<details><summary>Likelihood assumptions and source cluster</summary><p>${esc(e.likelihood.provenance.rationale)}</p><p>Underlying observation: ${esc(e.independenceCluster)}</p><p>This is a disclosed likelihood model, not evidence that the source is objectively correct.</p></details></div></article>`).join('') : `<p class="empty">No verified likelihood updates are available. Retrieved material below has not been converted into a fabricated probability.</p>${Object.values(model.sources || {}).map(s => `<article class="evidence-row"><div class="evidence-tag">SOURCE<br>${esc(s.kind)}</div><div><h3>${safeHref(s.url) ? `<a href="${safeHref(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a>` : esc(s.title)}</h3><div class="meta">Fetched ${esc(date(s.fetchedAt))}; publication date ${esc(date(s.publishedAt))}</div><details><summary>Inspect preserved source text</summary><pre>${esc(s.text)}</pre></details></div></article>`).join('')}`;
  }
  if (activeTab === 'cruxes') return a.cruxes.length ? `<p class="muted">Potential movement under one-at-a-time endpoint changes. This is not expected information gain or a calibrated robustness probability.</p>${a.cruxes.map(c => `<article class="crux-row"><div><div class="eyebrow">${esc(c.nodeId)} / ${esc(c.kind)}</div><h3>${esc(c.text)}</h3><p>${esc(c.nextInvestigation)}</p></div><div><div class="swing">${Math.round(c.span * 100)} pts</div><div class="meta">potential endpoint movement</div></div></article>`).join('')}` : '<p class="empty">A coherent root assessment is needed before ranking quantitative sensitivity. The graph still identifies missing inputs.</p>';
  if (activeTab === 'rivals') return (model.rivalRootIds || []).length ? `<p class="muted">Rival explanations can coexist. They are not forced into a distribution that sums to 100%.</p>${model.rivalRootIds.map(id => tree(id)).join('')}` : '<p class="empty">No separate rival explanation has been saved. This is a coverage gap, not evidence that alternatives are impossible.</p>';
  if (activeTab === 'history') return `<p class="muted">${record.parentId ? `This assessment branches from <button class="quiet" data-open="${esc(record.parentId)}">the original assessment ↗</button>.` : 'Every saved evidence update keeps a reproducible model snapshot.'}</p>${(record.snapshots || []).map((s, i) => `<div class="history-row"><div>${esc(s.reason)}<br><small>${esc(date(s.at))} · ${esc(s.modelHash.slice(0, 16))}</small></div><div>${esc(range(s.range))}<br><small>Version ${i + 1}</small></div></div>`).join('')}`;
  return `<p class="muted">${esc(a.interpretation)}. ${esc(a.stability.scope)}.</p><details open><summary>Warnings and remaining gaps</summary>${[...(record.warnings || []), ...(a.warnings || [])].map(w => `<p class="meta">${esc(w)}</p>`).join('') || '<p class="muted">No structural warnings were recorded. This is not a certification of real-world accuracy.</p>'}</details><details><summary>Claim contract</summary><pre>${esc(JSON.stringify(model.contract, null, 2))}</pre></details><details><summary>Provider usage and versions</summary><pre>${esc(JSON.stringify({usage: record.usage, versions: model.versions, engine: a.engineVersion, calibration: a.calibration}, null, 2))}</pre></details>`;
}
function renderRecord() {
  if (!record.analysis || record.status === 'running') return renderProgress();
  const a = record.analysis, root = a.root, model = record.model;
  selected ||= model.rootId;
  const next = a.nextInvestigations[0];
  $('#main').innerHTML = `<section class="report"><div class="breadcrumb"><button class="quiet" data-action="home">← New question</button><span class="badge">${esc(record.kind || record.status)} / ${esc(record.status)}</span></div><div class="eyebrow">An inspectable assessment</div><h1>${esc(record.question)}</h1><p class="reading">${esc(model.contract.reading)}</p>${model.demo ? '<div class="banner"><strong>Fictional worked example.</strong> These logs, priors, and likelihoods are synthetic. The probability is computed, but it is not a real-world forecast.</div>' : '<div class="banner">Research assessment, not an objective verdict. Model-elicited likelihoods are uncalibrated; inspect the sources, assumptions, and remaining gaps.</div>'}<section class="overview" aria-label="Assessment summary"><div><div class="eyebrow">${root.status === 'descriptive' ? 'Evidence map' : 'Conditional credence'}</div><div class="range ${root.range ? '' : 'missing'}">${esc(root.status === 'descriptive' ? 'Descriptive analysis' : range(root.range))}</div><p class="metric-note">${root.range ? esc(a.interpretation) : esc(root.reasons.join(' ') || 'No defensible numeric model is available yet.')}</p></div><div><div class="eyebrow">Evidence coverage</div><div class="metric-value">${a.grounding.backedInputs} of ${a.grounding.totalInputs}</div><p class="metric-note">Probability inputs with exact source passages. Inspectability is not a credibility score.</p></div><div><div class="eyebrow">Assumption sensitivity</div><div class="metric-value">${a.stability.maxEndpointSwing === null ? 'Not measured' : `${Math.round(a.stability.maxEndpointSwing * 100)} pts`}</div><p class="metric-note">Largest endpoint movement across ${a.stability.tested} tests. Not a probability of robustness.</p></div></section><div class="section-head"><div><h2>What the answer rests on</h2><p>Select a node to inspect its evidence, falsifier, and prior.</p></div><div class="actions"><button class="secondary" data-action="add-evidence" ${!a.probabilityInputIds.length ? 'disabled' : ''}>Add evidence +</button><button class="secondary" data-action="export">Export audit ↗</button></div></div><div class="workbench"><section class="graph" aria-label="Belief graph">${tree(model.rootId)}<p class="graph-hint">Opening a node changes only what you see—not the probability. Shared evidence and unknown dependence cannot be multiplied away.</p></section><aside class="inspector" aria-label="Selected assumption">${inspector()}</aside></div>${next ? `<section class="next-row"><div class="next-symbol" aria-hidden="true">↗</div><div><div class="eyebrow">A useful next investigation</div><h3>${esc(next.question)}</h3><p>${next.potentialSwing === undefined ? esc(next.reason || 'Resolve the missing input before assigning a probability.') : `Targets an assumption with up to ${Math.round(next.potentialSwing * 100)} points of endpoint movement. Expected information gain has not been estimated.`}</p></div><button class="secondary" data-investigate="${esc(next.nodeId)}" ${!config?.researchConfigured || model.demo ? 'disabled' : ''} title="${model.demo ? 'Focused research is for live assessments, not fictional examples' : 'Create a new, linked investigation without changing this assessment'}">Investigate ↗</button></section>` : ''}<nav class="tabs" role="tablist" aria-label="Audit details">${[['evidence','Evidence ledger'],['cruxes','Live cruxes'],['rivals','Rival explanations'],['history','Change history'],['method','Audit notes']].map(([id,label]) => `<button role="tab" id="tab-${id}" data-tab="${id}" aria-selected="${id === activeTab}" aria-controls="detail-panel" tabindex="${id === activeTab ? 0 : -1}">${label}</button>`).join('')}</nav><section class="panel" id="detail-panel" role="tabpanel" aria-labelledby="tab-${activeTab}">${tabContent()}</section></section>`;
}
async function openHistory() {
  try { const {assessments} = await api('/api/assessments'); $('#history-list').innerHTML = assessments.length ? assessments.map(a => `<div class="history-row"><button data-open="${esc(a.id)}">${esc(a.question)}<br><small>${esc(a.kind)} · ${esc(a.status)} · ${esc(date(a.updatedAt))}</small></button><span>${esc(range(a.range))}</span></div>`).join('') : '<p class="empty">Your saved investigations and what-if scenarios will appear here.</p>'; $('#history-dialog').showModal(); } catch (e) { notice(e.message); }
}
function exportAudit() {
  const url = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2)], {type: 'application/json'}));
  const a = document.createElement('a'); a.href = url; a.download = `veracity-${record.id}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
document.addEventListener('click', async event => {
  const b = event.target.closest('button'); if (!b || b.disabled) return;
  if (b.dataset.close) { $(`#${b.dataset.close}`).close(); return; }
  if (b.id === 'history-button') return openHistory();
  if (b.dataset.node) { selected = b.dataset.node; const scroll = window.scrollY; renderRecord(); window.scrollTo(0, scroll); $('#inspector-title')?.focus({preventScroll: true}); return; }
  if (b.dataset.tab) { activeTab = b.dataset.tab; const scroll = window.scrollY; renderRecord(); $(`#tab-${activeTab}`).focus({preventScroll: true}); window.scrollTo(0, scroll); return; }
  if (b.dataset.action === 'home') return goHome();
  if (b.dataset.action === 'export') return exportAudit();
  if (b.dataset.action === 'add-evidence') { $('#evidence-form').reset(); $('#evidence-error').textContent = ''; $('#evidence-node').innerHTML = record.analysis.probabilityInputIds.map(id => `<option value="${esc(id)}" ${id === selected ? 'selected' : ''}>${esc(id)} · ${esc(record.model.nodes[id].text)}</option>`).join(''); $('#evidence-dialog').showModal(); return; }
  b.disabled = true;
  try {
    if (b.dataset.open) { $('#history-dialog').close(); setRecord(await api(`/api/assessments/${b.dataset.open}`)); }
    else if (b.id === 'demo-button') { setRecord(await api('/api/demo', {})); }
    else if (b.dataset.action === 'cancel') { await api(`/api/assessments/${record.id}/cancel`, {}); notice('Cancellation requested. Saved evidence is retained.'); }
    else if (b.dataset.investigate) { const a = await api('/api/assessments', {question: record.question, parentId: record.id, expectedRevision: record.revision, targetNodeId: b.dataset.investigate}, {'Idempotency-Key': crypto.randomUUID()}); setRecord(a); }
  } catch (e) { notice(e.message); } finally { b.disabled = false; }
});
document.addEventListener('keydown', event => {
  if (event.target.getAttribute('role') === 'tab' && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
    event.preventDefault(); const tabs = [...document.querySelectorAll('[role=tab]')], index = tabs.indexOf(event.target);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].click();
  }
});
document.addEventListener('submit', async event => {
  const form = event.target; if (!['ask-form','scenario-form','evidence-form','login-form'].includes(form.id)) return;
  event.preventDefault(); const button = $('button[type=submit], button.primary', form), values = Object.fromEntries(new FormData(form));
  button.disabled = true;
  try {
    if (form.id === 'ask-form') {
      const question = values.question.trim(); if (lastQuestion !== question) { requestKey = crypto.randomUUID(); lastQuestion = question; }
      const a = await api('/api/assessments', {question, orchestratorAgent: values.orchestratorAgent, workerAgent: values.workerAgent}, {'Idempotency-Key': requestKey}); requestKey = null; lastQuestion = null; setRecord(a);
    } else if (form.id === 'scenario-form') {
      const overrides = {[selected]: [Number(values.low), Number(values.high)]};
      setRecord(await api(`/api/assessments/${record.id}/scenario`, {expectedRevision: record.revision, overrides})); notice('Saved as a separate scenario. The original is unchanged.');
    } else if (form.id === 'evidence-form') {
      const updated = await api(`/api/assessments/${record.id}/evidence`, {...values, lr: [Number(values.lrLow), Number(values.lrHigh)], expectedRevision: record.revision}); $('#evidence-dialog').close(); activeTab = 'evidence'; setRecord(updated); notice('Evidence saved and the model recomputed.');
    } else {
      await api('/api/login', {token: values.token}); form.reset(); $('#login-dialog').close(); await boot();
    }
  } catch (e) { const id = { 'ask-form': '#ask-error', 'scenario-form': '#scenario-error', 'evidence-form': '#evidence-error', 'login-form': '#login-error'}[form.id]; $(id).textContent = e.message; } finally { button.disabled = false; }
});
async function boot() {
  try {
    config = await api('/api/config'); $('#connection').textContent = config.researchConfigured ? 'Research agents configured' : 'Local workspace · demo available';
    const id = new URL(location.href).searchParams.get('audit');
    if (id) { try { setRecord(await api(`/api/assessments/${encodeURIComponent(id)}`)); } catch (e) { goHome(); notice(e.message); } } else renderHome();
  } catch (e) {
    if (e.code === 'UNAUTHORIZED') { renderHome(); if (!$('#login-dialog').open) $('#login-dialog').showModal(); }
    else { $('#connection').textContent = 'Server unavailable'; renderHome(); notice(e.message); }
  }
}
await boot();
