"""Real-service probability-lab checks. Optional bridge mode does not test native browser networking.
Start npm start, then run this script. VERACITY_QA_BRIDGE=1 uses actual HTML/CSS/JS
with fetch/history hooks forwarding to the real HTTP server and SQLite, not canned responses.
Requires Playwright and Chromium (development tools, not runtime dependencies).
"""
import json, os, re, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright
root = Path(__file__).resolve().parent.parent
base = os.environ.get('VERACITY_QA_URL', 'http://127.0.0.1:8787').rstrip('/')
bridge = os.environ.get('VERACITY_QA_BRIDGE') == '1'
out = Path(os.environ.get('VERACITY_QA_OUTPUT', '/mnt/data')); out.mkdir(parents=True, exist_ok=True)
checks, errors = [], []
def request(path, opts=None):
    opts = opts or {}
    if not path.startswith('/api/'): raise ValueError('Unexpected browser API path')
    headers = {'Origin': base, 'Content-Type': 'application/json', **opts.get('headers', {})}
    req = urllib.request.Request(base + path, data=opts.get('body', '').encode() if 'body' in opts else None, headers=headers, method=opts.get('method', 'GET'))
    try: response = urllib.request.urlopen(req, timeout=45)
    except urllib.error.HTTPError as e: response = e
    with response: return {'status': response.status, 'body': response.read().decode(), 'headers': dict(response.headers)}
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM', '/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
    def load(width, height, lab=True):
        page = browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1)
        page.on('pageerror', lambda e: errors.append(str(e)))
        if not bridge:
            page.goto(base + ('/scale' if lab else '/')); return page
        name = 'scale' if lab else 'index'
        html = (root / f'public/{name}.html').read_text()
        html = re.sub(r'<link rel="stylesheet"[^>]+>|<script type="module"[^>]+></script>', '', html)
        css = (root/'public/styles.css').read_text()
        if lab: css += (root/'public/scale.css').read_text()
        page.set_content(html.replace('</head>', '<style>'+css+'</style></head>'))
        page.expose_function('__http', request)
        page.evaluate('''() => {history.replaceState = (_a,_b,url) => {window.__shown=url;};
          window.fetch = async (path,opts={}) => {const r=await window.__http(path,{method:opts.method||'GET',headers:opts.headers||{},...(opts.body?{body:opts.body}:{})});return new Response(r.body,{status:r.status,headers:r.headers});};}''')
        script = (root/('public/scale.mjs' if lab else 'public/app.mjs')).read_text()
        page.add_script_tag(content='(async()=>{'+script+'})()');return page
    page=load(1440,1050);page.locator('#simulation-form').wait_for()
    assert page.locator('#prepare-form button').is_disabled()
    assert page.get_by_text('No-key scale test available',exact=True).count()
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path=str(out/'veracity-scale-desktop-home.png'),full_page=True)
    checks.append('No-key home disables live preparation and labels the synthetic test')
    page.locator('#simulation-form [name="count"]').select_option('1000');page.locator('#simulation-form button').click()
    page.locator('[data-start]').wait_for();run_id=(page.evaluate('window.__shown') if bridge else page.url).split('run=')[1]
    assert page.get_by_text('SYNTHETIC LOAD TEST',exact=False).count()
    page.locator('[data-start]').click()
    page.wait_for_function("document.querySelector('.breadcrumb .badge')?.textContent.includes('completed')",timeout=30000)
    page.wait_for_function("!document.querySelector('[data-pause]')",timeout=30000)
    assert page.locator('.lab-numbers b').first.inner_text()=='1,000'
    assert page.locator('.estimate-table tbody tr').count()==25
    assert page.locator('.lab-numbers b').nth(3).inner_text()=='0'
    checks.append('Real service/SQLite complete 1,000 synthetic estimates; UI renders 25 rows and zero reviews')
    first=page.locator('[data-inspect]').first.inner_text();page.locator('[data-next]').click()
    page.wait_for_function('(first) => document.querySelector("[data-inspect]")?.textContent !== first',arg=first)
    page.locator('[data-prev]').click()
    page.wait_for_function('(first) => document.querySelector("[data-inspect]")?.textContent === first',arg=first)
    checks.append('Forward/back pagination returns the same records without rendering every estimate')
    page.locator('[data-inspect]').first.click();page.locator('#trace-dialog').wait_for(state='visible')
    assert 'calibration not established' in page.locator('#trace-body').inner_text()
    assert 'synthetic' in page.locator('#trace-body').inner_text().lower()
    assert 'attempts' in page.locator('#trace-body pre').text_content()
    page.locator('#trace-dialog [data-close]').click()
    checks.append('Inspector renders stored packet, raw request/response and attempt ledger')
    page.locator('[data-review-plan]').click();page.locator('#trace-dialog').wait_for(state='visible')
    assert 'remain outside this review pass' in page.locator('#trace-body').inner_text()
    page.locator('#trace-dialog [data-close]').click();checks.append('Review queue discloses the unreviewed remainder')
    link=page.get_by_role('link',name='Export full probability ledger')
    if bridge: exported=request(link.get_attribute('href'))['body']
    else:
        with page.expect_download() as download: link.click()
        exported=Path(download.value.path()).read_text()
    rows=[json.loads(line) for line in exported.splitlines()]
    assert rows[0]['run']['id']==run_id
    assert sum(r['type']=='estimate' for r in rows)==1000
    assert sum(r['type']=='packet' for r in rows)>0
    assert sum(r['type']=='batch' for r in rows)>0
    checks.append('Export link targets a real stream of all estimates, packets and traces')
    page.evaluate('scrollTo(0,0)');assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path=str(out/'veracity-scale-desktop.png'))
    mobile=load(390,844);mobile.locator(f'[data-run="{run_id}"]').click();mobile.locator('[data-inspect]').first.wait_for()
    assert mobile.evaluate('document.documentElement.scrollWidth <= innerWidth');mobile.screenshot(path=str(out/'veracity-scale-mobile.png'))
    mobile.locator('[data-inspect]').first.click();mobile.locator('#trace-dialog').wait_for(state='visible')
    assert mobile.evaluate('document.documentElement.scrollWidth <= innerWidth');mobile.locator('#trace-dialog [data-close]').click()
    checks.append('390px mobile report and inspector have no horizontal document overflow')
    original=load(390,844,lab=False);original.get_by_role('link',name='Probability lab').wait_for()
    assert original.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert original.get_by_role('link',name='Probability lab').get_attribute('href')=='/scale'
    checks.append('Original research home preserves its mobile layout and lab link');browser.close()
assert not errors, errors
report={'passed':len(checks),'checks':checks,'pageErrors':errors,'liveProviderCalls':0,
 'transport':'Inline Chromium UI with fetch/history hooks → real Python HTTP requests → service/SQLite' if bridge else 'Native browser → real HTTP service/SQLite',
 'nativeBrowserTransportVerified':not bridge}
(out/'veracity-scale-browser-qa.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
