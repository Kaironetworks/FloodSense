// API regression tests: node test.js (isolated temporary DB and uploads).
const { spawn } = require('child_process'), assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const DEMO_KEY = 'test-only-demo-key-1234';
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'floodsense-test-'));
const db = path.join(temp, 'db.json'), uploads = path.join(temp, 'uploads');
let srv, base;
const stopServer = () => new Promise(resolve => {
  if (!srv || srv.exitCode !== null) return resolve();
  const timer = setTimeout(() => { if (srv.exitCode === null) srv.kill(); resolve(); }, 2000);
  srv.once('exit', () => { clearTimeout(timer); resolve(); });
  srv.kill();
});

const waitForServer = () => new Promise((resolve, reject) => {
  let output = '';
  const timer = setTimeout(() => reject(new Error('server startup timeout')), 5000);
  srv.stdout.on('data', chunk => { output += chunk; const m = /listening on http:\/\/[^:]+:(\d+)/.exec(output); if (m) { clearTimeout(timer); base = `http://127.0.0.1:${m[1]}/api`; resolve(); } });
  srv.stderr.on('data', chunk => { output += chunk; });
  srv.once('error', reject);
  srv.once('exit', code => { if (!base) reject(new Error(`server exited during startup (${code})`)); });
});
const j = async (p, o = {}, tok) => {
  const r = await fetch(base + p, { method: o.method || 'GET', headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: o.body !== undefined ? JSON.stringify(o.body) : undefined });
  return { s: r.status, b: await r.json().catch(() => ({})) };
};
const ok = (name, f) => { f(); console.log('✔', name); };

(async () => {
  srv = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: '0', HOST: '127.0.0.1', FLOODSENSE_DB: db, FLOODSENSE_UPLOADS: uploads, FLOODSENSE_DEMO_SECRET: DEMO_KEY }, stdio: ['ignore', 'pipe', 'pipe'] });
  await waitForServer();
  const health = await j('/health');
  ok('isolated test server uses demo authorization configuration', () => { assert.equal(health.s, 200); assert.equal(health.b.demoRoles, true); });

  const deniedAdmin = await j('/login', { method: 'POST', body: { role: 'admin' } });
  ok('public login cannot self-select admin', () => assert.equal(deniedAdmin.s, 403));
  const deniedModerator = await j('/login', { method: 'POST', body: { role: 'moderator' } });
  ok('public login cannot self-select moderator', () => assert.equal(deniedModerator.s, 403));
  const mod = (await j('/login', { method: 'POST', body: { role: 'moderator', demoKey: DEMO_KEY } })).b.token;
  const rsp = (await j('/login', { method: 'POST', body: { role: 'responder', demoKey: DEMO_KEY } })).b.token;
  const adm = (await j('/login', { method: 'POST', body: { role: 'admin', demoKey: DEMO_KEY } })).b.token;

  const a = await j('/flood/assessments?lat=-2.25&lng=-79.9');
  ok('assessment is explainable and simulated warnings are non-authoritative', () => { assert(a.b.reasons.some(x => /Simulated warning/.test(x.f) && x.pts === 0)); assert(!a.b.reasons.some(x => /Official warning/.test(x.f))); assert(/not a probability/.test(a.b.label)); });
  const sensors = await j('/flood/sensors?scenario=heavy');
  ok('five simulated sensors are available', () => { assert.equal(sensors.b.sensors.length, 5); assert.equal(sensors.b.dataMode, 'SIMULATED_HEAVY_RAIN'); assert.equal(sensors.b.sensors.find(x => x.id === 'GYE-SINAI-VULN').dataStatus, 'SIMULATED_UNVERIFIED'); });
  const baseline = await j('/flood/route?from=GYE-DOWNTOWN-9OCT&to=GYE-BARCELONA');
  ok('baseline routing uses baseline data', () => { assert.equal(baseline.s, 200); assert.equal(baseline.b.dataMode, 'SIMULATED_BASELINE'); assert(baseline.b.path.some(x => x.road === '9 de Octubre Floodway')); });
  const route = await j('/flood/route?from=GYE-DOWNTOWN-9OCT&to=GYE-BARCELONA&scenario=heavy');
  ok('heavy rain avoids impassable sensor segment', () => { assert.equal(route.s, 200); assert(route.b.avoidedSegments.some(x => x.sensor === 'GYE-DOWNTOWN-9OCT')); assert(!route.b.path.some(x => x.road === '9 de Octubre Floodway')); });
  const noRoute = await j('/flood/route?from=GYE-DOWNTOWN-9OCT&to=GYE-SINAI-VULN&scenario=heavy');
  ok('unreachable heavy-rain destination is explicit', () => assert.equal(noRoute.s, 409));
  const replayNow = '2026-01-02T12:00:00.000Z';
  const replay = await j('/flood/replay', { method: 'POST', body: { lat: -2.2, lng: -79.9, now: replayNow, roads: [{ id: 'R1', name: 'Demo closure', status: 'closed', distanceKm: 0.4, importance: 'only-hospital-link', facilityIds: ['F1'] }], evidence: [
    { id: 'rain', type: 'rainfall', valueMmH: 35, observedAt: '2026-01-02T11:50:00.000Z', sourceId: 'rain-gauge', reliability: 0.8, lat: -2.2, lng: -79.9 },
    { id: 'water', type: 'water_level', valueM: 0.8, thresholdM: 1, rateMPerHour: 0.2, observedAt: '2026-01-02T11:55:00.000Z', sourceId: 'gauge-1', reliability: 0.8, lat: -2.2, lng: -79.9 },
    { id: 'report-a', type: 'citizen_report', category: 'flooded_road', observedAt: '2026-01-02T11:40:00.000Z', sourceId: 'resident-a', reliability: 0.6, lat: -2.2, lng: -79.9 },
    { id: 'report-b', type: 'citizen_report', category: 'flooded_road', observedAt: '2026-01-02T11:45:00.000Z', sourceId: 'resident-b', reliability: 0.6, lat: -2.2, lng: -79.9 },
    { id: 'sos-1', type: 'sos', observedAt: '2026-01-02T11:59:00.000Z', sourceId: 'resident-c', lat: -2.2, lng: -79.9 },
    { id: 'terrain', type: 'terrain', level: 'high', observedAt: '2025-12-20T00:00:00.000Z', sourceId: 'terrain', reliability: 0.9, lat: -2.2, lng: -79.9 },
    { id: 'road-open', type: 'road_status', status: 'open', observedAt: '2026-01-02T11:58:00.000Z', sourceId: 'traffic-a', reliability: 0.5, lat: -2.2, lng: -79.9 },
    { id: 'road-closed', type: 'road_status', status: 'closed', observedAt: '2026-01-02T11:59:00.000Z', sourceId: 'traffic-b', reliability: 0.5, lat: -2.2, lng: -79.9 },
    { id: 'old', type: 'water_level', valueM: 2, observedAt: '2025-12-01T00:00:00.000Z', sourceId: 'old-gauge', reliability: 1, lat: -2.2, lng: -79.9 },
    { id: 'future', type: 'rainfall', valueMmH: 100, observedAt: '2026-01-02T13:00:00.000Z', sourceId: 'future-source', reliability: 1, lat: -2.2, lng: -79.9 },
    { id: 'invalid-rain', type: 'rainfall', valueMmH: -5, observedAt: '2026-01-02T11:59:00.000Z', sourceId: 'bad-gauge', reliability: 1, lat: -2.2, lng: -79.9 },
    { id: 'unlocated-water', type: 'water_level', valueM: 0.8, observedAt: '2026-01-02T11:59:00.000Z', sourceId: 'unknown-gauge', reliability: 1 }
  ] } });
  ok('replay returns separate state, severity, confidence, and consequences', () => { assert.equal(replay.s, 200); assert(['escalating', 'severe'].includes(replay.b.state)); assert(replay.b.hazardSeverity === 'moderate' || replay.b.hazardSeverity === 'high'); assert(replay.b.evidenceConfidence > 0 && replay.b.evidenceConfidence <= 1); assert(replay.b.hazardIndex >= 0 && replay.b.hazardIndex <= 1); assert.equal(replay.b.consequences.level, 'critical_access'); assert.equal(replay.b.consequences.affectedRoads.length, 1); assert.equal(replay.b.consequences.affectedRoads[0].importance, 'only-hospital-link'); assert.equal(replay.b.consequences.affectedFacilities[0].id, 'F1'); assert.equal(replay.b.consequences.affectedFacilities[0].criticality, 'critical'); });
  ok('SOS evidence is excluded from flood confirmation', () => assert(replay.b.rejectedEvidence.some(x => x.id === 'sos-1' && /sos_is_help_request/.test(x.reason))));
  ok('stale evidence is rejected', () => assert(replay.b.rejectedEvidence.some(x => x.id === 'old' && x.reason === 'stale_observation')));
  ok('future, invalid, and unlocated evidence are rejected', () => { assert(replay.b.rejectedEvidence.some(x => x.id === 'future' && x.reason === 'future_observation')); assert(replay.b.rejectedEvidence.some(x => x.id === 'invalid-rain' && x.reason === 'invalid_measurement')); assert(replay.b.rejectedEvidence.some(x => x.id === 'unlocated-water' && x.reason === 'missing_location')); });
  ok('conflicting road observations are disclosed', () => assert(replay.b.conflicts.some(x => /conflict/.test(x))));
  ok('water and open-road disagreement is preserved', () => assert(replay.b.conflicts.some(x => /Water-level evidence and an open-road/.test(x))));
  ok('actions include rules and supporting evidence', () => { assert(replay.b.actions.every(x => x.rule && Array.isArray(x.evidenceIds))); assert(replay.b.actions.some(x => x.action === 'protect_critical_access')); });
  const duplicateReplay = await j('/flood/replay', { method: 'POST', body: { lat: -2.2, lng: -79.9, now: replayNow, evidence: Array.from({ length: 10 }, (_, i) => ({ id: `dup-${i}`, type: 'citizen_report', category: 'water', observedAt: '2026-01-02T11:55:00.000Z', sourceId: 'same-account', reliability: 0.6, lat: -2.2, lng: -79.9 })) } });
  ok('duplicate reports remain one evidence group', () => { assert.equal(duplicateReplay.s, 200); assert.equal(duplicateReplay.b.reportGroups.length, 1); assert.equal(duplicateReplay.b.reportGroups[0].reportCount, 10); assert.equal(duplicateReplay.b.reportGroups[0].independentSources, 1); });
  const independentReplay = await j('/flood/replay', { method: 'POST', body: { lat: -2.2, lng: -79.9, now: replayNow, evidence: Array.from({ length: 10 }, (_, i) => ({ id: `ind-${i}`, type: 'citizen_report', category: 'water', observedAt: '2026-01-02T11:55:00.000Z', sourceId: `account-${i}`, reliability: 0.6, lat: -2.2, lng: -79.9 })) } });
  ok('independent reports increase confidence without multiplying groups', () => { assert.equal(independentReplay.b.reportGroups.length, 1); assert.equal(independentReplay.b.reportGroups[0].independentSources, 10); assert(independentReplay.b.evidenceConfidence > duplicateReplay.b.evidenceConfidence); });
  const coordinatedReplay = await j('/flood/replay', { method: 'POST', body: { lat: -2.2, lng: -79.9, now: replayNow, evidence: Array.from({ length: 10 }, (_, i) => ({ id: `coord-${i}`, type: 'citizen_report', category: `category-${i}`, observedAt: '2026-01-02T11:55:00.000Z', sourceId: 'coordinated-account', reliability: 0.6, lat: -2.2, lng: -79.9 })) } });
  ok('one coordinated source cannot trigger independent escalation', () => { assert.equal(coordinatedReplay.b.independentSources, 1); assert.notEqual(coordinatedReplay.b.state, 'escalating'); assert(coordinatedReplay.b.evidenceConfidence < independentReplay.b.evidenceConfidence); });
  const watchReplay = await j('/flood/replay', { method: 'POST', body: { lat: -2.2, lng: -79.9, now: replayNow, evidence: [{ id: 'moderate-water', type: 'water_level', valueM: 0.8, thresholdM: 1, observedAt: '2026-01-02T11:55:00.000Z', sourceId: 'gauge', reliability: 0.8, lat: -2.2, lng: -79.9 }] } });
  ok('moderate non-escalating evidence enters watch state', () => assert.equal(watchReplay.b.state, 'watch'));
  const missingReplay = await j('/flood/replay', { method: 'POST', body: { lat: -2.2, lng: -79.9, now: replayNow, evidence: [{ id: 'terrain-only', type: 'terrain', level: 'moderate', observedAt: replayNow, sourceId: 'terrain', reliability: 0.8, lat: -2.2, lng: -79.9 }] } });
  ok('missing feeds are reported explicitly', () => { assert.equal(missingReplay.s, 200); assert(missingReplay.b.missing.some(x => /rainfall/.test(x))); assert(missingReplay.b.missing.some(x => /water-level/.test(x))); });
  const noFeeds = await j('/flood/replay', { method: 'POST', body: { lat: -2.2, lng: -79.9, now: replayNow, evidence: [] } });
  ok('no feeds never become a safe conclusion', () => { assert.equal(noFeeds.b.state, 'no_signal'); assert(noFeeds.b.missing.some(x => /No fresh/.test(x))); });
  const tideRain = await j('/flood/replay', { method: 'POST', body: { lat: -2.2, lng: -79.9, now: replayNow, evidence: [{ id: 'rain-context', type: 'rainfall', valueMmH: 45, observedAt: replayNow, sourceId: 'rain', reliability: 0.7, lat: -2.2, lng: -79.9 }, { id: 'tide-context', type: 'tide', tideHeightM: 2.4, thresholdM: 2, observedAt: replayNow, sourceId: 'tide', reliability: 0.7, lat: -2.2, lng: -79.9 }] } });
  ok('rainfall and tide remain separate combined context', () => { assert.equal(tideRain.s, 200); assert.equal(tideRain.b.conditions.rainfallMmH, 45); assert.equal(tideRain.b.conditions.tideHeightM, 2.4); assert(!/caus/.test(tideRain.b.explanation)); });
  const assessed = await j('/flood/assessments?lat=-2.2&lng=-79.9');
  ok('existing assessment exposes fused intelligence without removing score', () => { assert.equal(assessed.s, 200); assert(typeof assessed.b.score === 'number'); assert(assessed.b.intelligence && assessed.b.intelligence.evidenceConfidence !== undefined); });
  assert.equal((await j('/flood/assessments?lat=999&lng=0')).s, 400);
  assert.equal((await j('/flood/assessments?lat=&lng=0')).s, 400);
  assert.equal((await j('/safe-locations?lat=0')).s, 400);
  assert.equal((await j('/safe-locations?lat=999&lng=0')).s, 400);
  console.log('✔ invalid and partial coordinates are rejected');

  const bad = await j('/reports', { method: 'POST', body: { category: 'x' } });
  ok('report validation', () => assert.equal(bad.s, 400));
  const r = await j('/reports', { method: 'POST', body: { category: 'water', title: 'Test water', lat: -2.1, lng: -79.95, gps: true } });
  ok('client gps claim is not trusted', () => { assert.equal(r.s, 201); assert.equal(r.b.report.gps, false); assert.equal(r.b.report.locationSource, 'map_pick'); });
  const gpsRequested = await j('/reports', { method: 'POST', body: { category: 'other', title: 'GPS requested', lat: -2.11, lng: -79.94, locationSource: 'gps_requested' } });
  ok('GPS-requested provenance remains explicitly unverified', () => { assert.equal(gpsRequested.s, 201); assert.equal(gpsRequested.b.report.locationSource, 'client_requested_gps'); assert.equal(gpsRequested.b.report.gps, false); });
  const resident = (await j('/login', { method: 'POST', body: { role: 'resident' } })).b.token;
  const v1 = await j(`/reports/${r.b.report.id}/verify`, { method: 'POST', body: { status: 'verified' } }, resident);
  ok('resident cannot verify', () => assert.equal(v1.s, 403));
  const v2 = await j(`/reports/${r.b.report.id}/verify`, { method: 'POST', body: { status: 'verified' } }, mod);
  ok('moderator verifies', () => assert.equal(v2.b.report.status, 'verified'));
  const jpg = 'data:image/jpeg;base64,' + Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0, 1, 2, 3]).toString('base64');
  const rp = await j('/reports', { method: 'POST', body: { category: 'debris', title: 'Photo test', lat: -2.15, lng: -79.85, photo: jpg } });
  const photoStatus = await fetch(base.replace('/api', '') + rp.b.report.photos[0]);
  ok('JPEG photo upload remains supported', () => { assert.equal(rp.s, 201); assert(rp.b.report.photos[0].startsWith('/uploads/')); assert.equal(photoStatus.status, 200); });
  const bp = await j('/reports', { method: 'POST', body: { category: 'water', title: 'Bad photo', lat: -2.3, lng: -79.7, photo: 'data:image/png;base64,AAAA' } });
  ok('non-JPEG photo rejected', () => assert.equal(bp.s, 400));

  const s = await j('/sos', { method: 'POST', body: { type: 'flooding', lat: -2.2, lng: -79.9, description: 'test' } });
  ok('SOS created without dispatch claim', () => assert(/dispatch is not connected/i.test(s.b.message)));
  const inc = await j('/incidents');
  ok('public incidents exclude private SOS', () => assert(!JSON.stringify(inc.b).includes(s.b.ref)));
  assert.equal((await j(`/sos/${s.b.ref}?code=${s.b.accessCode}`)).s, 405);
  assert.equal((await j(`/sos/${s.b.ref}/status`, { method: 'POST', body: { code: 'wrong' } })).s, 403);
  const st = await j(`/sos/${s.b.ref}/status`, { method: 'POST', body: { code: s.b.accessCode } });
  ok('SOS status uses body code and preserves privacy', () => { assert.equal(st.s, 200); assert.equal(st.b.ref, s.b.ref); });
  const ack = await j(`/responder/incidents/${s.b.ref}/status`, { method: 'PATCH', body: { status: 'acknowledged' } }, rsp);
  ok('responder acknowledges', () => assert.equal(ack.b.status, 'acknowledged'));

  const small = await j('/chat', { method: 'POST', body: { text: 'below limit' } });
  ok('below-limit request remains supported', () => assert.equal(small.s, 201));
  const huge = await j('/chat', { method: 'POST', body: 'x'.repeat(2.6e6) });
  ok('oversized ASCII request receives controlled 413', () => assert.equal(huge.s, 413));
  const multibyte = await new Promise(resolve => {
    const u = new URL(base + '/chat'), payload = JSON.stringify({ text: '水'.repeat(900000) });
    const req = require('http').request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers: { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' } }, res => { let out = ''; res.on('data', c => { out += c; }); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', () => resolve(599));
    const buf = Buffer.from(payload); for (let i = 0; i < buf.length; i += 65536) req.write(buf.subarray(i, i + 65536)); req.end();
  });
  ok('oversized multibyte chunked request receives controlled 413', () => assert.equal(multibyte, 413));
  const sh = await j('/shops'); ok('shops list', () => assert(sh.b.shops.length >= 4));
  const ss = await j(`/shops/${sh.b.shops[0].id}/status`, { method: 'POST', body: { status: 'closed' } }); ok('shop status update', () => assert.equal(ss.b.shop.status, 'closed'));
  const cm = await j('/chat', { method: 'POST', body: { name: 'T', text: '<b>hi</b> there' } }); ok('chat strips tags', () => assert(!/[<>]/.test(cm.b.message.text)));
  assert.equal((await j(`/chat/${cm.b.message.id}`, { method: 'DELETE' }, resident)).s, 403);
  assert.equal((await j('/admin/news', { method: 'PUT', body: { video: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } }, adm)).b.videoId, 'dQw4w9WgXcQ');
  console.log('✔ permission and admin workflow');
  const appSource = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
  ok('Leaflet fallback exposes invalidateSize', () => assert(appSource.includes('const map = mapUnavailable') && appSource.includes('invalidateSize() {}')));
  ok('hospital routing discloses partial failures', () => assert(/const failed = res\.filter\(r => !r\.ok\)/.test(appSource) && /only successful routes are shown/.test(appSource)));
  ok('report errors use a defensive formatter', () => assert(/reportErrorText\(er\)/.test(appSource) && /er && er\.data/.test(appSource)));
  console.log('\nAll checks passed');
})().catch(e => { console.error('FAIL', e.message); process.exitCode = 1; })
  .finally(async () => { await stopServer(); fs.rmSync(temp, { recursive: true, force: true }); });
