"""Browser smoke/regression checks. Requires Python playwright + Chromium; no live API keys."""
import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright

base = os.environ.get('VERACITY_QA_URL', 'http://127.0.0.1:8787')
out = Path(os.environ.get('VERACITY_QA_OUTPUT', '/mnt/data'))
out.mkdir(parents=True, exist_ok=True)
errors = []
results = []
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM', '/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width':1440, 'height':1000}, device_scale_factor=1)
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.goto(base)
    page.get_by_role('heading', name='A clearer answer starts with better questions.').wait_for()
    assert page.locator('#connection').inner_text() == 'Local workspace · demo available'
    page.screenshot(path=str(out/'veracity-v2-desktop-home.png'), full_page=True)
    results.append('Home renders without API keys, labels live configuration truthfully')
    page.locator('#demo-button').click()
    page.get_by_text('Will the next release meet both reliability targets?', exact=True).first.wait_for()
    original = page.url.split('audit=')[1]
    assert page.locator('.overview').count()
    page.screenshot(path=str(out/'veracity-v2-desktop.png'), full_page=True)
    results.append('Fictional demo loads computed model and graph')
    page.locator('[data-node="A1"]').click()
    page.locator('#scenario-form').wait_for()
    page.locator('#scenario-form [name="low"]').fill('0.1')
    page.locator('#scenario-form [name="high"]').fill('0.2')
    page.locator('#scenario-form button').click()
    page.wait_for_function('(old) => location.search !== "?audit=" + old', arg=original)
    scenario = page.url.split('audit=')[1]
    assert scenario != original
    data = page.evaluate('async (id) => (await fetch("/api/assessments/"+id)).json()', original)
    assert data['model']['nodes']['A1']['prior'] == [.6,.8]
    scenario_data = page.evaluate('async (id) => (await fetch("/api/assessments/"+id)).json()', scenario)
    assert scenario_data['analysis']['root']['range'] != data['analysis']['root']['range']
    results.append('What-if saves a separate scenario, recomputes root, leaves original unchanged')
    page.locator('#history-button').click()
    page.locator('#history-dialog').wait_for(state='visible')
    assert page.locator('#history-list').inner_text()
    page.locator('[data-close="history-dialog"]').click()
    # Verify keyboard-operable tabs and real saved history.
    page.get_by_role('tab', name='Change history').click()
    page.get_by_role('tab', name='Change history').press('ArrowRight')
    assert page.get_by_role('tab', name='Audit notes').get_attribute('aria-selected') == 'true'
    results.append('Saved research dialog and keyboard tab navigation work')
    with page.expect_download() as download:
        page.locator('[data-action="export"]').click()
    exported = Path(download.value.path()).read_text()
    assert json.loads(exported)['id'] == scenario
    results.append('JSON export contains the exact selected assessment')
    # Evidence form updates the existing cluster, rather than appending a second independent observation.
    page.locator('[data-action="add-evidence"]').click()
    page.locator('#evidence-dialog').wait_for(state='visible')
    page.locator('#evidence-node').select_option('A1')
    form = page.locator('#evidence-form')
    form.locator('[name="title"]').fill('Browser QA source')
    form.locator('[name="text"]').fill('The synthetic follow-up reported a failure under the same controlled test conditions.')
    form.locator('[name="quote"]').fill('The synthetic follow-up reported a failure')
    old_cluster = next(e['independenceCluster'] for e in scenario_data['model']['evidence'].values() if 'A1' in e['targetNodeIds'])
    form.locator('[name="cluster"]').fill(old_cluster)
    form.locator('[name="lrLow"]').fill('0.2')
    form.locator('[name="lrHigh"]').fill('0.4')
    form.locator('[name="rationale"]').fill('A fictional browser-test likelihood range for a contrary observation; not empirical calibration.')
    form.locator('button[type="submit"]').click()
    page.locator('#evidence-dialog').wait_for(state='hidden')
    updated = page.evaluate('async (id) => (await fetch("/api/assessments/"+id)).json()', scenario)
    assert updated['revision'] == scenario_data['revision']+1
    assert len(updated['model']['evidence']) == len(scenario_data['model']['evidence'])
    assert updated['analysis']['root']['range'] != scenario_data['analysis']['root']['range']
    results.append('Evidence form replaces a cluster, records a revision, recomputes without double counting')
    page.goto(base+'/?audit='+original)
    page.locator('[data-node="A1"]').wait_for()
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    mobile = browser.new_page(viewport={'width':390,'height':844}, device_scale_factor=1, is_mobile=True, has_touch=True)
    mobile.on('pageerror', lambda e: errors.append(str(e)))
    mobile.goto(base+'/?audit='+original)
    mobile.locator('[data-node="A1"]').wait_for()
    assert mobile.evaluate('document.documentElement.scrollWidth <= innerWidth')
    mobile.locator('[data-node="A1"]').click()
    mobile.locator('#scenario-form').wait_for()
    mobile.screenshot(path=str(out/'veracity-v2-mobile.png'), full_page=True)
    results.append('390px mobile layout has no horizontal overflow; graph inspector works')
    browser.close()
assert not errors, errors
report = {'passed':len(results),'checks':results,'browserErrors':errors,'liveProviderCalls':0}
(out/'veracity-browser-qa.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
