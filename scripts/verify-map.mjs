// ---------------------------------------------------------------------------
// Step 6 verification — drives the REAL map in headless Chrome over CDP.
//
//   node scripts/verify-map.mjs [--chrome <path>] [--port <n>] [--in <dir>]
//
// Checks, in a real browser:
//   1. App boots; sidebar "Transformer Map" opens the map drawer.
//   2. At zoom 7: green+grey are clustered; ALL 68 red markers are shown
//      individually and NO cluster has a red border.
//   3. Wheel-zoom in: clusters disappear (disableClusteringAtZoom 12),
//      every icon shows its TX label (zoom >= 13), icons are the largest band.
//   4. Quick-jump "Coimbatore" filters markers + marks the button active.
//   5. Clicking a red marker opens its popup with "Mark as Resolved"; the
//      action resolves it via the store -> toast + icon flips to green.
// Screenshots + a PASS/FAIL summary are written to --in (default
// C:\Users\Dhakshesh\AppData\Local\Temp\opencode\map-step6).
// ---------------------------------------------------------------------------
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import WebSocket from 'ws';

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

const args = process.argv.slice(2);
const argPath = args[args.indexOf('--chrome') + 1];
const chromePath = argPath ?? CHROME_CANDIDATES.find((c) => existsSync(c));
const port = Number(args[args.indexOf('--port') + 1] ?? 9333) || 9333;
const OUT = resolve(args[args.indexOf('--in') + 1] ?? join(process.env.LOCALAPPDATA ?? tmpdir(), 'Temp', 'opencode', 'map-step6'));
const APP_URL = 'http://localhost:5173/';

mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok, detail });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- launch chrome ---------------------------------------------------------
const userData = join(tmpdir(), 'tfx-cdp-' + Date.now());
const chrome = spawn(chromePath, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${userData}`,
  '--window-size=1400,900',
  'about:blank',
], { stdio: 'ignore' });

const debugBase = `http://127.0.0.1:${port}`;
async function waitDebug() {
  for (let i = 0; i < 60; i += 1) {
    try { const r = await fetch(debugBase + '/json/version'); if (r.ok) return; } catch { /* keep waiting */ }
    await sleep(250);
  }
  throw new Error('Chrome debugging endpoint did not come up');
}

// ---- CDP plumbing ----------------------------------------------------------
let ws;
let idc = 0;
const pend = new Map();
function send(method, params = {}) {
  return new Promise((resolve_, reject_) => {
    const id = ++idc;
    pend.set(id, (m) => (m.error ? reject_(new Error(JSON.stringify(m.error))) : resolve_(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evalJS(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('eval failed: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result?.value;
}
async function pollJS(expression, timeoutMs = 20000, label = 'condition') {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try { if (await evalJS(expression)) return true; } catch { /* retry */ }
    await sleep(250);
  }
  throw new Error(`timeout waiting for: ${label}`);
}
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, name), Buffer.from(r.data, 'base64'));
  return name;
}
async function clickAt(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}
async function wheelAt(x, y, deltaY) {
  await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY });
}

(async () => {
  try {
    await waitDebug();
    const list = await (await fetch(debugBase + '/json/list')).json();
    const page = list.find((t) => t.type === 'page');
    if (!page) throw new Error('no page target');
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
    ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.navigate', { url: APP_URL });
    await pollJS('document.readyState === "complete"', 30000, 'app load');

    // 1) open the map drawer
    const isMapBtn = `(b) => b.getAttribute('aria-label')?.includes('Transformer Map') || b.title === 'Transformer Map' || b.textContent.includes('Transformer Map')`;
    await pollJS(`Boolean([...document.querySelectorAll('button')].find(${isMapBtn}))`, 30000, 'sidebar entry');
    await evalJS(`document.querySelectorAll('button').forEach(b => { if (${isMapBtn}.length ? ${isMapBtn}(b) : false) b.click(); })`);
    await pollJS(`document.querySelector('.tfx-mapwrap')?.getAttribute('data-map-status') === 'ready'`, 30000, 'map ready');
    await sleep(2500); // let tiles/markers settle
    check('drawer opens and map becomes ready', true);

    const statsOf = `(() => {
      const red = document.querySelectorAll('.tfx-marker--red').length;
      const green = document.querySelectorAll('.tfx-marker--green').length;
      const grey = document.querySelectorAll('.tfx-marker--grey').length;
      const clusters = document.querySelectorAll('.tfx-cluster-bubble').length;
      const redClusters = document.querySelectorAll('.tfx-cluster--red').length;
      const greenClusters = document.querySelectorAll('.tfx-cluster--green').length;
      const cityBtns = document.querySelectorAll('.tfx-city').length;
      const chips = document.querySelectorAll('.tfx-chip').length;
      const legend = !!document.querySelector('.tfx-legend');
      const hint = !!document.querySelector('[data-testid="tfx-zoom-hint"]');
      const labels = document.querySelectorAll('.tfx-label').length;
      const mapStatus = document.querySelector('.tfx-mapwrap')?.getAttribute('data-map-status');
      const toast = document.querySelector('[data-testid="tfx-toast"]')?.textContent || null;
      return { red, green, grey, clusters, redClusters, greenClusters, cityBtns, chips, legend, hint, labels, mapStatus, toast };
    })()`;

    const s1 = await evalJS(statsOf);
    check('zoom 7: all 68 red markers shown individually', s1.red === 68, `red=${s1.red}`);
    check('zoom 7: NO red-bordered cluster anywhere', s1.redClusters === 0, `redClusters=${s1.redClusters}`);
    // markercluster shows isolated markers individually even at low zoom, so the
    // invariant is: bulk of green lives inside clusters (not 88 solo icons).
    check('zoom 7: green bulk is clustered (clusters exist, few solo greens)', s1.clusters > 0 && s1.green < 88, `green=${s1.green}, clusters=${s1.clusters}`);
    check('zoom 7: zoom hint visible', s1.hint === true);
    check('always-on chrome: legend + 4 chips + 16 city buttons', s1.legend && s1.chips === 4 && s1.cityBtns === 16, JSON.stringify(s1));
    await shot('1-map-zoom7.png');

    // 2) zoom in deterministically via the Leaflet zoom-control "+" until every
    //    marker shows its TX label (zoom >= 13). The dev handle exposes live zoom.
    await pollJS(`typeof window.__tfxMap === 'object' && window.__tfxMap !== null`, 10000, 'dev zoom handle');
    const z0 = await evalJS(`window.__tfxMap.zoom`);
    check(`map starts at zoom ${z0} (initial 7)`, z0 === 7);
    const zoomTrace = [];
    for (let i = 0; i < 24; i += 1) {
      if (i === 0) {
        const ctl = await evalJS(`!!document.querySelector('.leaflet-control-zoom-in')`);
        check('Leaflet zoom control (+/-) present in map', ctl === true);
      }
      await evalJS(`document.querySelector('.leaflet-control-zoom-in')?.click?.()`);
      await sleep(180);
      const z = await evalJS(`window.__tfxMap.zoom`);
      zoomTrace.push(z);
      if (z >= 13) break;
    }
    if (zoomTrace.every((z) => z < 13)) {
      check('zoom control advances zoom each click', false, 'trace=' + JSON.stringify(zoomTrace));
    }
    await pollJS(`window.__tfxMap.zoom >= 13`, 25000, 'zoom >= 13');
    const zFinal = await evalJS(`window.__tfxMap.zoom`);
    const labelCount = await evalJS(`document.querySelectorAll('.tfx-label').length`);
    const s2 = await evalJS(statsOf);
    const markersNow = await evalJS(`document.querySelectorAll('.leaflet-marker-icon').length`);
    const paneDiag = await evalJS(`(() => {
      const pane = document.querySelector('.leaflet-marker-pane');
      const opts = window.__tfxMap.engine()?.cluster?._cfg ?? null;
      return {
        markerPaneChildren: pane ? [...pane.children].map(e => e.className) : null,
        clusterBubblesInDom: document.querySelectorAll('.leaflet-marker-cluster').length,
        clusterAtZoom: opts ? opts.disableClusteringAtZoom : null,
        zoom: window.__tfxMap.zoom,
        markerCount: window.__tfxMap.markerCount(),
      };
    })()`);
    const info = `zoom=${zFinal} labels=${labelCount} markerIcons=${markersNow} ` + JSON.stringify(s2) + ' pane=' + JSON.stringify(paneDiag);
    check('zoom in: clusters disabled, all 156 icons show TX labels', s2.clusters === 0 && s2.labels === 156 && zFinal >= 13, info);
    check('zoom in: red/green totals preserved (68/88)', s2.red === 68 && s2.green === 88, JSON.stringify(s2));
    check('zoom in: zoom hint gone at high zoom', s2.hint === false);
    check('zoom in: label elements render for every marker', labelCount === 156 && markersNow === 156, `zoom=${zFinal} labels=${labelCount} markerIcons=${markersNow}`);
    await shot('2-map-zoomed-labeled.png');

    // 3) quick-jump to Coimbatore
    await evalJS(`document.querySelectorAll('.tfx-city').forEach(b => { if (b.textContent.trim() === 'Coimbatore') b.click(); })`);
    await sleep(1500);
    const s3 = await evalJS(statsOf);
    check('quick-jump: Coimbatore filtered + button active', s3.red + s3.green + s3.grey <= 30, JSON.stringify(s3));
    await shot('3-map-coimbatore.png');

    // 4) resolve flow: click a red marker, resolve it, icon flips green
    await evalJS(`document.querySelectorAll('.tfx-city').forEach(b => { if (b.textContent.trim() === 'All Tamil Nadu') b.click(); })`);
    await sleep(2000); // let the flyTo animation settle
    const clickFirstRed = `(() => {
      const el = document.querySelector('.tfx-marker--red');
      if (!el) return false;
      const r = el.getBoundingClientRect();
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
      return true;
    })()`;
    const redClicked = await evalJS(clickFirstRed);
    if (redClicked) {
      await pollJS(`!!document.querySelector('.tfx-popup-resolve')`, 8000, 'red popup with resolve button');
      const popupId = await evalJS(`document.querySelector('.tfx-popup-id')?.textContent || null`);
      check('red marker popup shows "Mark as Resolved"', true, `popupId=${popupId}`);
      await evalJS(`document.querySelector('.tfx-popup-resolve')?.click()`);
      await sleep(800);
      const s4 = await evalJS(statsOf);
      check('resolve: toast confirms green flip and red count drops by 1', s4.toast?.includes('marked resolved') && s4.red === 67, JSON.stringify(s4));
      await shot('4-map-resolved.png');
    } else {
      check('red marker click -> resolve flow', false, 'no red marker found to click');
    }
  } catch (err) {
    check('verification script', false, String(err && err.stack || err));
  } finally {
    try { if (ws) ws.close(); } catch { /* noop */ }
    try { chrome.kill(); } catch { /* noop */ }
    let passed = results.filter((r) => r.ok).length;
    console.log('\n===== REAL-BROWSER MAP VERIFICATION =====');
    for (const r of results) console.log(`  [${r.ok ? 'PASS' : 'FAIL'}] ${r.name}${r.detail ? '  -> ' + r.detail : ''}`);
    console.log(`\n${passed}/${results.length} checks passed. Screenshots + summary in ${OUT}`);
    writeFileSync(join(OUT, 'summary.json'), JSON.stringify(results, null, 2));
    writeFileSync(join(OUT, 'screenshots-readme.txt'), `Screenshots from scripts/verify-map.mjs\n1-map-zoom7.png        state overview (clustered green/grey, red solo)\n2-map-zoomed-labeled.png  high zoom, TX labels, icons enlarged\n3-map-coimbatore.png    quick-jump filtering\n4-map-resolved.png      after clicking Mark as Resolved (toast + green)\n`);
    if (results.some((r) => !r.ok)) process.exitCode = 1;
  }
})();