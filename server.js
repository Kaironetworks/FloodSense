// FloodSense prototype backend. Zero dependencies (Node >= 18). Data persisted to data/db.json.
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { fuseEvidence } = require('./evidence');
const PORT = process.env.PORT || 3000, HOST = process.env.HOST || '0.0.0.0', DB = path.resolve(process.env.FLOODSENSE_DB || path.join(__dirname, 'data', 'db.json')), UP = path.resolve(process.env.FLOODSENSE_UPLOADS || path.join(__dirname, 'data', 'uploads'));
const DEMO_SECRET = process.env.FLOODSENSE_DEMO_SECRET || '';
const localHost = ['127.0.0.1', 'localhost', '::1'].includes(HOST);
const demoRolesEnabled = localHost && DEMO_SECRET.length >= 16;
const now = () => new Date().toISOString(), ago = m => new Date(Date.now() - m * 60000).toISOString();
const uid = p => p + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();

// These five local readings are deterministic demo inputs, not verified telemetry.
const SENSOR_NODES = [
  { id: 'GYE-URDESA', name: 'Urdesa Corridor', lat: -2.1709, lng: -79.9078, elevation: 2, drainage: 0.4, normalDepth: 0.35, heavyDepth: 0.8 },
  { id: 'GYE-HOSP-IESS', name: 'Hospital IESS', lat: -2.2342, lng: -79.9011, elevation: 4, drainage: 0.8, normalDepth: 0.12, heavyDepth: 0.35 },
  { id: 'GYE-DOWNTOWN-9OCT', name: 'Av. 9 de Octubre', lat: -2.1944, lng: -79.8883, elevation: 1.5, drainage: 0.3, normalDepth: 0.62, heavyDepth: 1.1 },
  { id: 'GYE-SINAI-VULN', name: 'Monte Sinai', lat: -2.2534, lng: -79.9321, elevation: 1, drainage: 0.1, normalDepth: 1.25, heavyDepth: 1.65 },
  { id: 'GYE-BARCELONA', name: 'Av. Barcelona Axis', lat: -2.2011, lng: -79.9234, elevation: 3, drainage: 0.5, normalDepth: 0.28, heavyDepth: 0.65 }
];
const BLOCKING_CATEGORIES = ['flooded_road', 'closure', 'dangerous_level', 'blocked_evac'];

function seed() { // ALL FICTIONAL / DEMO. Coordinates approximate, for illustration only.
  return {
    v: 2, mode: 'demo', news: { videoId: '' },
    shops: [
      { id: 'S1', name: 'Farmacia (sample) Alborada', lat: -2.1330, lng: -79.9010, status: 'open', updated: ago(25), by: 'demo' },
      { id: 'S2', name: 'Supermercado (sample) Centro', lat: -2.1960, lng: -79.8860, status: 'closed', updated: ago(55), by: 'demo' },
      { id: 'S3', name: 'Tienda (sample) Guasmo', lat: -2.2600, lng: -79.8920, status: 'closed', updated: ago(70), by: 'demo' },
      { id: 'S4', name: 'Panadería (sample) Urdesa', lat: -2.1740, lng: -79.9100, status: 'open', updated: ago(10), by: 'demo' }],
    chat: [
      { id: 'M1', name: 'Ana (sample)', text: 'Farmacia in Alborada is open, short line.', at: ago(25), role: 'guest' },
      { id: 'M2', name: 'Luis (sample)', text: 'Av. in Guasmo is under water, shops there are closed.', at: ago(52), role: 'guest' },
      { id: 'M3', name: 'Moderator (sample)', text: 'Reminder: shop status is community-reported, not confirmed by the shop.', at: ago(45), role: 'moderator' }],
    alerts: [{ id: 'A1', title: 'DEMO: Heavy-rain warning, Guayaquil', severity: 'high', source: 'DEMO (INAMHI adapter not connected)', published: ago(40), validUntil: new Date(Date.now() + 6 * 3600e3).toISOString(), rainMmH: 38, official: false, demo: true }],
    zones: [ // coarse sample polygons [lat,lng]; real data = SGR "Susceptibilidad de Inundaciones" MapServer
      { id: 'Z1', name: 'Guasmo (demo zone)', level: 'high', poly: [[-2.235, -79.915], [-2.235, -79.875], [-2.275, -79.875], [-2.275, -79.915]] },
      { id: 'Z2', name: 'Suburbio Oeste (demo zone)', level: 'high', poly: [[-2.195, -79.955], [-2.195, -79.915], [-2.235, -79.915], [-2.235, -79.955]] },
      { id: 'Z3', name: 'Pascuales (demo zone)', level: 'moderate', poly: [[-2.06, -79.97], [-2.06, -79.92], [-2.10, -79.92], [-2.10, -79.97]] }],
    facilities: [
      { id: 'F1', name: 'Hospital (sample) Guasmo Sur', type: 'hospital', lat: -2.2551, lng: -79.9000, phone: '', verified: false, source: 'Demo sample' },
      { id: 'F2', name: 'Hospital (sample) Centro', type: 'hospital', lat: -2.2036, lng: -79.8855, phone: '', verified: false, source: 'Demo sample' },
      { id: 'F3', name: 'Shelter (sample) Coliseo Norte', type: 'shelter', lat: -2.1400, lng: -79.9000, phone: '', verified: false, source: 'Demo sample' },
      { id: 'F4', name: 'Pharmacy (sample) Alborada', type: 'pharmacy', lat: -2.1330, lng: -79.9010, phone: '', verified: false, source: 'Demo sample' },
      { id: 'F5', name: 'Fire station (sample) Sur', type: 'fire', lat: -2.2200, lng: -79.8950, phone: '', verified: false, source: 'Demo sample' }],
    reports: [
      { id: 'R-SEED1', category: 'flooded_road', title: 'DEMO: Water over road near Guasmo', description: 'Fictional seeded report.', lat: -2.2500, lng: -79.8950, status: 'verified', severity: 'high', corroborations: 2, created: ago(90), updated: ago(60), by: 'demo', locationSource: 'demo_sample', photos: ['/samples/flood1.svg'], history: [{ at: ago(60), by: 'moderator', to: 'verified' }] },
      { id: 'R-SEED3', category: 'closure', title: 'DEMO: Road closed, underpass flooded (Guasmo)', description: 'Fictional seeded report with sample photo.', lat: -2.2400, lng: -79.9000, status: 'verified', severity: 'high', corroborations: 1, created: ago(80), updated: ago(50), by: 'demo', locationSource: 'demo_sample', photos: ['/samples/flood2.svg'], history: [{ at: ago(50), by: 'moderator', to: 'verified' }] },
      { id: 'R-SEED2', category: 'debris', title: 'DEMO: Fallen tree, Av. Domingo Comín', description: 'Fictional seeded report.', lat: -2.2100, lng: -79.9300, status: 'awaiting', severity: 'moderate', corroborations: 0, created: ago(20), updated: ago(20), by: 'demo', locationSource: 'demo_sample', photos: ['/samples/tree.svg'], history: [] }],
    sos: [], audit: [], rl: {}
  };
}
let db; try { db = JSON.parse(fs.readFileSync(DB)); if (db.v !== 2) throw 0; } catch { db = seed(); save(); }
function save() { fs.mkdirSync(path.dirname(DB), { recursive: true }); fs.writeFileSync(DB, JSON.stringify(db, null, 1)); }
const sessions = {}; // token -> {role,name}
const audit = (who, action, target) => { db.audit.unshift({ at: now(), who, action, target }); db.audit = db.audit.slice(0, 200); };

// ---- explainable rules-based risk (v0.1). Output is an ESTIMATED SCORE, not a probability. ----
const inPoly = (lat, lng, p) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [yi, xi] = p[i], [yj, xj] = p[j]; if ((xi > lng) !== (xj > lng) && lat < (yj - yi) * (lng - xi) / (xj - xi) + yi) c = !c; } return c; };
const km = (a, b, c, d) => { const r = x => x * Math.PI / 180, h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };
const nearestSensor = (lat, lng) => SENSOR_NODES.map(n => ({ ...n, distanceKm: km(lat, lng, n.lat, n.lng) })).sort((a, b) => a.distanceKm - b.distanceKm)[0];
const SENSOR_GRAPH = {
  'GYE-DOWNTOWN-9OCT': [
    { to: 'GYE-BARCELONA', name: '9 de Octubre Floodway', distanceKm: 2.1, elevationM: 1.2, sensor: 'GYE-DOWNTOWN-9OCT' },
    { to: 'GYE-URDESA', name: 'Downtown-Urdesa Connector', distanceKm: 2.8, elevationM: 2.1 }
  ],
  'GYE-URDESA': [
    { to: 'GYE-DOWNTOWN-9OCT', name: 'Downtown-Urdesa Connector', distanceKm: 2.8, elevationM: 2.1 },
    { to: 'GYE-BARCELONA', name: 'Urdesa-Barcelona Link', distanceKm: 3, elevationM: 2.6 },
    { to: 'GYE-HOSP-IESS', name: 'Urdesa-IESS Connector', distanceKm: 4.3, elevationM: 3 }
  ],
  'GYE-BARCELONA': [
    { to: 'GYE-DOWNTOWN-9OCT', name: '9 de Octubre Floodway', distanceKm: 2.1, elevationM: 1.2, sensor: 'GYE-DOWNTOWN-9OCT' },
    { to: 'GYE-URDESA', name: 'Urdesa-Barcelona Link', distanceKm: 3, elevationM: 2.6 },
    { to: 'GYE-HOSP-IESS', name: 'Barcelona-IESS Connector', distanceKm: 3.7, elevationM: 3.4 }
  ],
  'GYE-HOSP-IESS': [
    { to: 'GYE-URDESA', name: 'Urdesa-IESS Connector', distanceKm: 4.3, elevationM: 3 },
    { to: 'GYE-BARCELONA', name: 'Barcelona-IESS Connector', distanceKm: 3.7, elevationM: 3.4 },
    { to: 'GYE-SINAI-VULN', name: 'IESS-Monte Sinai Route', distanceKm: 5.2, elevationM: 2.1, sensor: 'GYE-SINAI-VULN' }
  ],
  'GYE-SINAI-VULN': [
    { to: 'GYE-HOSP-IESS', name: 'IESS-Monte Sinai Route', distanceKm: 5.2, elevationM: 2.1, sensor: 'GYE-SINAI-VULN' }
  ]
};
function sensorRoute(from, to, heavy) {
  const nodes = Object.keys(SENSOR_GRAPH);
  if (!SENSOR_GRAPH[from] || !SENSOR_GRAPH[to]) return { found: false, error: 'unknown sensor node' };
  const distances = new Map(nodes.map(n => [n, Infinity])), previous = new Map(), pending = new Set(nodes);
  const avoidedSegments = [];
  const sensorById = id => SENSOR_NODES.find(n => n.id === id);
  const edgeCost = (edge, source) => {
    const sensor = edge.sensor && sensorById(edge.sensor);
    const impassable = heavy && sensor && sensor.heavyDepth >= 1;
    if (impassable) {
      avoidedSegments.push({ from: source, to: edge.to, road: edge.name, reason: 'SIMULATED_SENSOR_IMPASSABLE', sensor: sensor.id });
      return Infinity;
    }
    const depth = heavy && sensor ? sensor.heavyDepth : sensor ? sensor.normalDepth : 0;
    const risk = Math.min(1, depth / 1.5) * 3 + Math.max(0, 3 - edge.elevationM) * 0.2;
    return edge.distanceKm * (1 + risk);
  };
  distances.set(from, 0);
  while (pending.size) {
    let current = null;
    pending.forEach(n => { if (current === null || distances.get(n) < distances.get(current)) current = n; });
    if (current === null || distances.get(current) === Infinity) break;
    pending.delete(current);
    if (current === to) break;
    SENSOR_GRAPH[current].forEach(edge => {
      if (!pending.has(edge.to)) return;
      const cost = edgeCost(edge, current);
      if (cost === Infinity) return;
      const next = distances.get(current) + cost;
      if (next < distances.get(edge.to)) {
        distances.set(edge.to, next);
        previous.set(edge.to, { node: current, edge, cost });
      }
    });
  }
  if (distances.get(to) === Infinity) return { found: false, avoidedSegments, dataMode: heavy ? 'SIMULATED_HEAVY_RAIN' : 'SIMULATED_BASELINE' };
  const path = [];
  for (let cursor = to; cursor !== from;) {
    const step = previous.get(cursor);
    path.unshift({ from: step.node, to: cursor, road: step.edge.name, distanceKm: step.edge.distanceKm, elevationM: step.edge.elevationM, cost: +step.cost.toFixed(2) });
    cursor = step.node;
  }
  return { found: true, from, to, path, totalDistanceKm: +path.reduce((sum, e) => sum + e.distanceKm, 0).toFixed(2), totalCost: +distances.get(to).toFixed(2), avoidedSegments, dataMode: heavy ? 'SIMULATED_HEAVY_RAIN' : 'SIMULATED_BASELINE', graphNote: 'Illustrative elevation-aware graph, not a verified Guayaquil road network.' };
}
function assess(lat, lng, weather = null) {
  // Current demo coverage is limited to the configured Guayaquil urban envelope.
  // Never apply its seeded polygons/sensors to arbitrary GPS coordinates.
  const inConfiguredArea = lat >= -2.36 && lat <= -2.04 && lng >= -80.06 && lng <= -79.72;
  if (!inConfiguredArea) return {
    version: 'rules-0.3', label: 'Estimated risk score (not a probability)', score: 0, level: 'insufficient',
    reasons: [], missing: ['No city profile or validated hazard layers are configured for this location. Guayaquil demo data was not applied.'],
    computedAt: now(), dataMode: 'NO_CONFIGURED_CITY_COVERAGE', demo: true, coverage: false,
    intelligence: { state: 'no_signal', hazardSeverity: 'insufficient', evidenceConfidence: 0, hazardIndex: 0, explanation: 'FloodSense has no configured local hazard evidence for this location. No safety conclusion can be drawn.', actions: [], missing: ['City profile unavailable', 'No local hazard sources configured'], consequences: { level: 'unknown', affectedRoads: [], affectedFacilities: [] } }
  };
  const reasons = [], missing = []; let score = 0, signals = 0;
  const active = db.alerts.filter(a => new Date(a.validUntil) > new Date());
  const official = active.filter(a => a.official === true && a.demo !== true && !String(a.source || '').toUpperCase().startsWith('DEMO'));
  const simulated = active.filter(a => !official.includes(a));
  if (official.length) { const a = official[0], w = { low: 10, moderate: 20, high: 35, critical: 45 }[a.severity] || 0; score += w; signals++; reasons.push({ f: 'Authoritative warning (' + a.severity + ')', pts: w, src: a.source }); }
  else missing.push('No active authoritative warning in database');
  if (simulated.length) reasons.push({ f: 'Simulated warning (' + simulated[0].severity + ')', pts: 0, src: simulated[0].source || 'Demo data; excluded from risk weighting' });
  const z = db.zones.find(z => inPoly(lat, lng, z.poly));
  if (z) { const w = z.level === 'high' ? 30 : 15; score += w; signals++; reasons.push({ f: 'Inside susceptibility zone: ' + z.name, pts: w, src: 'Historical susceptibility, not current flooding' }); } else missing.push('Not inside any loaded susceptibility polygon (coverage is coarse and partial)');
  const near = db.reports.filter(r => r.status === 'verified' && km(lat, lng, r.lat, r.lng) < 1.5 && Date.now() - new Date(r.updated) < 24 * 3600e3);
  if (near.length) { const w = Math.min(25, 12 * near.length); score += w; signals++; reasons.push({ f: near.length + ' verified report(s) within 1.5 km, last 24 h', pts: w, src: 'Community, moderator-verified' }); } else missing.push('No verified reports nearby (absence is not proof of safety)');
  if (weather && weather.status === 'available' && !weather.stale && Number.isFinite(weather.hourlyPrecipitationMm)) {
    const rain = weather.hourlyPrecipitationMm;
    const w = rain >= 10 ? 15 : rain >= 2.5 ? 8 : rain > 0 ? 3 : 0;
    score += w;
    signals++;
    reasons.push({ f: `Modelled hourly precipitation: ${rain.toFixed(1)} mm`, pts: w, src: 'Open-Meteo forecast model; Guayaquil city-grid estimate, not a rain-gauge observation' });
  } else {
    missing.push('No fresh modelled weather value available (weather source may be unavailable or stale)');
  }
  const sensor = nearestSensor(lat, lng);
  if (sensor.distanceKm <= 2.5) {
    const depth = sensor.normalDepth;
    const w = Math.min(20, Math.round(depth / 1.5 * 20));
    score += w;
    signals++;
    reasons.push({ f: `Simulated sensor ${sensor.id}: ${depth.toFixed(2)} m water depth`, pts: w, src: 'Deterministic demo reading; unverified local telemetry' });
  } else {
    missing.push('No simulated sensor node within 2.5 km');
  }
  missing.push('Google Flood Hub: not connected', 'Satellite SAR: not integrated');
  const level = signals === 0 ? 'insufficient' : score >= 70 ? 'critical' : score >= 45 ? 'high' : score >= 20 ? 'moderate' : 'low';
  return { version: 'rules-0.3', label: 'Estimated risk score (not a probability)', score: Math.min(100, score), level, reasons, missing, computedAt: now(), dataMode: weather && weather.status === 'available' && !weather.stale ? 'MODELLED_WEATHER_PLUS_SIMULATED_LOCAL_INPUTS' : 'SIMULATED_LOCAL_INPUTS_WEATHER_UNAVAILABLE', demo: true, coverage: true, intelligence: buildIntelligence(lat, lng, weather) };
}

function buildIntelligence(lat, lng, weather = null) {
  const evidence = [], active = db.alerts.filter(a => new Date(a.validUntil) > new Date());
  active.forEach(a => evidence.push({ id: a.id, type: 'rainfall', valueMmH: a.rainMmH, observedAt: a.published, sourceId: a.source || a.id, reliability: a.official && !a.demo ? 0.8 : 0.25, lat, lng }));
  const sensor = nearestSensor(lat, lng);
  if (sensor.distanceKm <= 2.5) evidence.push({ id: sensor.id, type: 'water_level', valueM: sensor.normalDepth, thresholdM: 1, observedAt: now(), sourceId: sensor.id, reliability: 0.45, lat: sensor.lat, lng: sensor.lng });
  const zone = db.zones.find(z => inPoly(lat, lng, z.poly));
  if (zone) evidence.push({ id: zone.id, type: 'terrain', level: zone.level, observedAt: now(), sourceId: zone.id, reliability: 0.7, lat, lng });
  if (weather && weather.status === 'available' && !weather.stale && Number.isFinite(weather.hourlyPrecipitationMm) && weather.modelTime) {
    evidence.push({ id: 'OPEN_METEO_GYE_CURRENT', type: 'rainfall', valueMmH: weather.hourlyPrecipitationMm, observedAt: weather.modelTime, sourceId: 'Open-Meteo modelled hourly precipitation', reliability: 0.4, lat: weather.latitude, lng: weather.longitude, dataClass: 'modelled_weather' });
  }
  const roads = [];
  db.reports.filter(r => r.status !== 'rejected').forEach(r => {
    evidence.push({ id: r.id, type: 'citizen_report', category: r.category, severity: r.severity, observedAt: r.updated || r.created, sourceId: r.by || r.id, reliability: r.status === 'verified' ? 0.65 : 0.25, lat: r.lat, lng: r.lng });
    if (r.status === 'verified' && BLOCKING_CATEGORIES.includes(r.category)) roads.push({ id: r.id, name: r.title, status: 'closed', distanceKm: +km(lat, lng, r.lat, r.lng).toFixed(2) });
  });
  db.sos.filter(s => km(lat, lng, s.lat, s.lng) <= 2 && Date.now() - new Date(s.created).getTime() < 30 * 60000).forEach(s => evidence.push({ id: s.id, type: 'sos', observedAt: s.created, sourceId: s.owner || s.id, lat: s.lat, lng: s.lng }));
  return fuseEvidence({ lat, lng, evidence, roads, facilities: db.facilities, now: now() });
}

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const send = (res, code, obj) => { if (res.headersSent) return; res.writeHead(code, { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(obj)); };
const body = req => new Promise((resolve, reject) => {
  const max = 2.5e6; const chunks = []; let bytes = 0, settled = false;
  const finish = (fn, value) => { if (!settled) { settled = true; fn(value); } };
  if (+req.headers['content-length'] > max) { req.resume(); return finish(reject, new HttpError(413, 'request body too large')); }
  req.on('data', c => { bytes += c.length; if (bytes > max) { req.resume(); finish(reject, new HttpError(413, 'request body too large')); return; } chunks.push(c); });
  req.on('aborted', () => finish(reject, new HttpError(400, 'request aborted')));
  req.on('error', () => finish(reject, new HttpError(400, 'request body unreadable')));
  req.on('end', () => { try { finish(resolve, JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { finish(reject, new HttpError(400, 'invalid JSON body')); } });
});
const limit = (ip, key, n, win) => { const k = ip + key, t = Date.now(); db.rl[k] = (db.rl[k] || []).filter(x => t - x < win); if (db.rl[k].length >= n) return false; db.rl[k].push(t); return true; };
const sameSecret = (a, b) => { if (typeof a !== 'string' || typeof b !== 'string') return false; const aa = Buffer.from(a), bb = Buffer.from(b); return aa.length === bb.length && crypto.timingSafeEqual(aa, bb); };
const coordinates = q => {
  const hasLat = q.has('lat'), hasLng = q.has('lng');
  if (!hasLat && !hasLng) return null;
  const latRaw = q.get('lat'), lngRaw = q.get('lng'), lat = Number(latRaw), lng = Number(lngRaw);
  if (!hasLat || !hasLng || !latRaw.trim() || !lngRaw.trim() || !Number.isFinite(lat) || !Number.isFinite(lng) || !num(lat, -90, 90) || !num(lng, -180, 180)) throw new HttpError(400, 'invalid coordinates');
  return { lat, lng };
};
const ytId = s => { const m = /(?:v=|youtu\.be\/|embed\/|live\/)([\w-]{11})/.exec(s || '') || /^([\w-]{11})$/.exec(String(s || '').trim()); return m ? m[1] : ''; };
function savePhoto(id, d) { const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(d || ''); if (!m) return null; const buf = Buffer.from(m[1], 'base64'); if (buf.length > 1.5e6 || buf[0] !== 0xFF || buf[1] !== 0xD8 || buf[2] !== 0xFF) return null; fs.mkdirSync(UP, { recursive: true }); fs.writeFileSync(path.join(UP, id + '.jpg'), buf); return '/uploads/' + id + '.jpg'; }
const NEWS_LINKS = [['INAMHI alerts', 'https://servicios.inamhi.gob.ec/alertas/'], ['SGR (Gestión de Riesgos)', 'https://sgrportal.gestionderiesgos.gob.ec'], ['ECU 911', 'https://www.ecu911.gob.ec'], ['Alcaldía de Guayaquil', 'https://www.guayaquil.gob.ec']];
const num = (v, lo, hi) => typeof v === 'number' && v >= lo && v <= hi;
const clean = (s, n) => String(s || '').replace(/[<>]/g, '').slice(0, n);
let osrmCache = { at: 0, ok: null };
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast?latitude=-2.19&longitude=-79.90&current=temperature_2m,relative_humidity_2m,precipitation,rain,showers,weather_code,wind_speed_10m&hourly=precipitation,precipitation_probability&forecast_days=1&timezone=GMT';
let weatherCache = { fetchedAt: null, data: null, error: null, attemptAt: null };
async function getWeather(force = false) {
  const age = weatherCache.fetchedAt ? Date.now() - new Date(weatherCache.fetchedAt).getTime() : Infinity;
  if (!force && !weatherCache.data && weatherCache.attemptAt && Date.now() - weatherCache.attemptAt < 30000) return { status: 'unavailable', stale: true, source: 'Open-Meteo', sourceType: 'modelled_weather', location: 'Guayaquil, Ecuador', retrievedAt: null, modelTime: null, data: null, error: weatherCache.error || 'provider_unavailable', note: 'Weather source was recently unavailable. No value has been invented; retry after the short backoff period.' };
  weatherCache.attemptAt = Date.now();
  if (!force && weatherCache.data && age < 10 * 60000) {
    const stale = !!weatherCache.error || age > 60 * 60000;
    return { ...weatherCache.data, cacheAgeSeconds: Math.round(age / 1000), stale, status: stale ? 'stale' : 'available', ...(stale ? { refreshError: weatherCache.error || 'cache_expired' } : {}) };
  }
  try {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 5000);
    let response;
    try { response = await fetch(WEATHER_URL, { signal: controller.signal, headers: { 'Accept': 'application/json' } }); }
    finally { clearTimeout(timer); }
    if (!response.ok) throw new Error('weather provider HTTP ' + response.status);
    const payload = await response.json(), current = payload.current || {}, hourly = payload.hourly || {};
    if (!current.time || !Number.isFinite(current.temperature_2m) || !Number.isFinite(current.precipitation)) throw new Error('weather provider response incomplete');
    const hourKey = String(current.time).slice(0, 13);
    const modelTime = new Date(/[zZ]|[+-]\d{2}:\d{2}$/.test(String(current.time)) ? String(current.time) : String(current.time) + 'Z').toISOString();
    const hi = Array.isArray(hourly.time) ? hourly.time.findIndex(t => String(t).slice(0, 13) === hourKey) : -1;
    const hourlyPrecip = hi >= 0 && Array.isArray(hourly.precipitation) && Number.isFinite(hourly.precipitation[hi]) ? hourly.precipitation[hi] : null;
    const probability = hi >= 0 && Array.isArray(hourly.precipitation_probability) && Number.isFinite(hourly.precipitation_probability[hi]) ? hourly.precipitation_probability[hi] : null;
    const fetchedAt = now();
    const data = {
      status: 'available', stale: false, source: 'Open-Meteo', sourceType: 'modelled_weather',
      sourceUrl: 'https://open-meteo.com/', location: 'Guayaquil, Ecuador (city-grid estimate)',
      latitude: Number.isFinite(payload.latitude) ? payload.latitude : -2.19,
      longitude: Number.isFinite(payload.longitude) ? payload.longitude : -79.90,
      timezone: 'UTC', modelTime, retrievedAt: fetchedAt,
      temperatureC: current.temperature_2m, relativeHumidityPct: current.relative_humidity_2m,
      precipitationMm: current.precipitation, rainMm: Number.isFinite(current.rain) ? current.rain : null,
      showersMm: Number.isFinite(current.showers) ? current.showers : null,
      hourlyPrecipitationMm: hourlyPrecip, precipitationProbabilityPct: probability,
      windSpeedKmh: current.wind_speed_10m, weatherCode: current.weather_code,
      units: payload.current_units || {}, note: 'Forecast-model output for a city grid point; not a direct rain-gauge observation and not street-level flood measurement.'
    };
    weatherCache = { fetchedAt, data, error: null, attemptAt: Date.now() };
    return { ...data, cacheAgeSeconds: 0, status: 'available', stale: false };
  } catch (e) {
    weatherCache.error = e.name === 'AbortError' ? 'provider_timeout' : 'provider_unavailable'; weatherCache.attemptAt = Date.now();
    if (weatherCache.data) {
      const oldAge = Date.now() - new Date(weatherCache.fetchedAt).getTime();
      return { ...weatherCache.data, status: 'stale', stale: true, cacheAgeSeconds: Math.round(oldAge / 1000), note: weatherCache.data.note + ' Latest refresh failed; this cached value may be outdated.', refreshError: weatherCache.error };
    }
    return { status: 'unavailable', stale: true, source: 'Open-Meteo', sourceType: 'modelled_weather', location: 'Guayaquil, Ecuador', retrievedAt: null, modelTime: null, data: null, error: weatherCache.error, note: 'No live modelled weather value is available. Retry when connectivity returns; no value has been invented.' };
  }
}
async function sources() {
  if (Date.now() - osrmCache.at > 60000) { try { const c = new AbortController(); setTimeout(() => c.abort(), 4000); const r = await fetch('https://router.project-osrm.org/route/v1/driving/-79.89,-2.19;-79.90,-2.20', { signal: c.signal }); osrmCache = { at: Date.now(), ok: r.ok, ts: now() }; } catch (e) { osrmCache = { at: Date.now(), ok: false }; } }
  const nc = (name, type, url, why) => ({ name, type, url, status: 'not_configured', lastSuccess: null, note: why });
  return [
    { name: 'OSRM public routing (demo server)', type: 'routing', url: 'https://router.project-osrm.org', status: osrmCache.ok ? 'connected' : 'unavailable', lastSuccess: osrmCache.ok ? osrmCache.ts : null, note: 'Public demo server, no SLA. Not for production.' },
    { name: 'Seeded demo database', type: 'demo', url: '-', status: 'demo', lastSuccess: null, note: 'Fictional data, clearly labeled.' },
    { name: 'Open-Meteo modelled weather', type: 'weather', url: 'https://open-meteo.com/', status: weatherCache.data ? (weatherCache.error ? 'stale' : 'connected') : (weatherCache.error ? 'unavailable' : 'not_checked'), lastSuccess: weatherCache.fetchedAt, note: 'City-grid model output; not a direct rain-gauge observation. Request /api/weather/current to refresh.' },
    nc('INAMHI alerts', 'weather', 'https://servicios.inamhi.gob.ec/alertas/', 'Adapter stub: no documented machine-readable feed verified yet. Use manual import.'),
    nc('SGR flood susceptibility (ArcGIS MapServer)', 'gis', 'https://sgrportal.gestionderiesgos.gob.ec/server/rest/services/Susceptibilidad_de_Inundaciones/MapServer', 'Next step: query layer with ?f=json, store polygons in PostGIS.'),
    nc('Google Flood Forecasting API', 'river', 'https://developers.google.com/flood-forecasting', 'Requires approved access + API key (GOOGLE_FLOOD_API_KEY).'),
    nc('Guayaquil ATM/Segura risk data', 'gis', '-', 'Not integrated.')];
}

const routes = [];
const R = (m, p, fn) => routes.push([m, new RegExp('^' + p.replace(/:\w+/g, '([^/]+)') + '$'), fn]);
const need = (ctx, ...roles) => { if (!ctx.user || (roles.length && !roles.includes(ctx.user.role))) { ctx.res && send(ctx.res, ctx.user ? 403 : 401, { error: ctx.user ? 'forbidden' : 'sign in required' }); return false; } return true; };
const pubReport = r => ({ photos: r.photos || [], gps: false, locationSource: r.locationSource || (r.gps ? 'legacy_client_claim' : 'map_pick'), id: r.id, category: r.category, title: r.title, description: r.description, lat: r.lat, lng: r.lng, status: r.status, severity: r.severity, corroborations: r.corroborations, created: r.created, updated: r.updated });

R('GET', '/api/health', async c => send(c.res, 200, { ok: true, mode: db.mode, time: now(), demoRoles: demoRolesEnabled }));
R('POST', '/api/login', async c => { const b = await body(c.req), requested = ['resident', 'moderator', 'responder', 'admin'].includes(b.role) ? b.role : 'resident'; if (requested !== 'resident' && (!demoRolesEnabled || !sameSecret(b.demoKey, DEMO_SECRET))) return send(c.res, 403, { error: 'privileged demo roles are disabled; use a local demo configuration' }); const t = crypto.randomBytes(16).toString('hex'); sessions[t] = { role: requested, name: clean(b.name || requested, 30) + ' (demo)', id: t.slice(0, 6) }; audit(sessions[t].name, 'login', requested); save(); send(c.res, 200, { token: t, user: sessions[t] }); });
R('GET', '/api/sources/status', async c => send(c.res, 200, { fetchedAt: now(), sources: await sources() }));
R('GET', '/api/weather/current', async c => { const w = await getWeather(c.q.get('refresh') === '1'); send(c.res, w.status === 'unavailable' ? 503 : 200, w); });
R('GET', '/api/alerts', async c => send(c.res, 200, { demo: true, alerts: db.alerts.map(a => ({ ...a, fresh: new Date(a.validUntil) > new Date() })) }));
R('GET', '/api/flood/zones', async c => send(c.res, 200, { demo: true, note: 'Coarse sample polygons, not street-level flood boundaries.', zones: db.zones }));
R('GET', '/api/flood/sensors', async c => {
  const heavy = c.q.get('scenario') === 'heavy';
  send(c.res, 200, {
    dataMode: heavy ? 'SIMULATED_HEAVY_RAIN' : 'SIMULATED_BASELINE',
    note: 'All sensor readings, elevation, drainage, and tide values are simulated and unverified.',
    tideHeightM: heavy ? 2.9 : 1.4,
    rainfall: { value: heavy ? 42 : 0, unit: 'mm', measurement: 'scenario precipitation, not a live gauge' },
    sensors: SENSOR_NODES.map(n => ({
      id: n.id, name: n.name, lat: n.lat, lng: n.lng,
      elevationM: n.elevation, drainage: n.drainage,
      waterDepthM: heavy ? n.heavyDepth : n.normalDepth,
      roadStatus: heavy && n.id === 'GYE-SINAI-VULN' ? 'IMPASSABLE' : heavy && n.heavyDepth >= 1 ? 'CAUTION' : 'OPEN',
      dataStatus: 'SIMULATED_UNVERIFIED', observedAt: now()
    }))
  });
});
R('GET', '/api/flood/route', async c => {
  const from = c.q.get('from'), to = c.q.get('to'), scenario = c.q.get('scenario');
  if (!from || !to || (scenario && scenario !== 'heavy')) return send(c.res, 400, { error: 'from, to and optional scenario=heavy are required' });
  const result = sensorRoute(from, to, scenario === 'heavy');
  if (result.error) return send(c.res, 400, { error: result.error });
  send(c.res, result.found ? 200 : 409, result);
});
R('GET', '/api/flood/assessments', async c => { const p = coordinates(c.q); if (!p) throw new HttpError(400, 'lat and lng are required'); const weather = await getWeather(); send(c.res, 200, assess(p.lat, p.lng, weather)); });
R('GET', '/api/flood/intelligence', async c => { const p = coordinates(c.q); if (!p) throw new HttpError(400, 'lat and lng are required'); if (p.lat < -2.36 || p.lat > -2.04 || p.lng < -80.06 || p.lng > -79.72) return send(c.res, 200, { state: 'no_signal', hazardSeverity: 'insufficient', evidenceConfidence: 0, hazardIndex: 0, explanation: 'No city profile or validated hazard evidence is configured for this location. Guayaquil demo data was not applied.', actions: [], missing: ['City profile unavailable', 'No local hazard sources configured'], consequences: { level: 'unknown', affectedRoads: [], affectedFacilities: [] } }); const weather = await getWeather(); send(c.res, 200, buildIntelligence(p.lat, p.lng, weather)); });
R('POST', '/api/flood/replay', async c => {
  if (!limit(c.ip, 'replay', 20, 60000)) return send(c.res, 429, { error: 'Too many replay requests.' });
  const b = await body(c.req);
  if (!num(b.lat, -90, 90) || !num(b.lng, -180, 180) || !Array.isArray(b.evidence) || b.evidence.length > 200) return send(c.res, 400, { error: 'lat, lng and evidence array (maximum 200) are required' });
  const roads = Array.isArray(b.roads) ? b.roads.slice(0, 100).map(r => ({ id: clean(r.id, 80), name: clean(r.name, 120), status: clean(r.status, 30), distanceKm: Number(r.distanceKm), importance: clean(r.importance, 30), facilityIds: Array.isArray(r.facilityIds) ? r.facilityIds.slice(0, 20).map(id => clean(id, 80)) : [] })) : [];
  send(c.res, 200, fuseEvidence({ lat: b.lat, lng: b.lng, evidence: b.evidence, roads, facilities: db.facilities, now: b.now || now() }));
});
R('GET', '/api/incidents', async c => { const st = c.q.get('status'), cat = c.q.get('category'); let l = db.reports.filter(r => r.status !== 'rejected'); if (st) l = l.filter(r => r.status === st); if (cat) l = l.filter(r => r.category === cat); send(c.res, 200, { demo: true, incidents: l.sort((a, b) => b.created.localeCompare(a.created)).slice(0, 100).map(pubReport) }); });
R('POST', '/api/reports', async c => {
  if (!limit(c.ip, 'rep', 5, 600000)) return send(c.res, 429, { error: 'Too many reports. Try again in a few minutes.' });
  const b = await body(c.req), cats = ['flooded_road', 'water', 'closure', 'debris', 'drainage', 'dangerous_level', 'blocked_evac', 'needs_help', 'other'];
  const id0 = uid('R'); let photo = null; if (b.photo) { photo = savePhoto(id0, b.photo); if (!photo) return send(c.res, 400, { error: 'photo must be a JPEG under 1.5 MB', fields: ['photo'] }); }
  const errs = []; if (!cats.includes(b.category)) errs.push('category'); if (!num(b.lat, -90, 90) || !num(b.lng, -180, 180)) errs.push('location'); if (clean(b.title, 80).length < 4) errs.push('title (min 4 chars)');
  if (errs.length) return send(c.res, 400, { error: 'validation failed', fields: errs });
  const dup = db.reports.find(r => r.category === b.category && km(r.lat, r.lng, b.lat, b.lng) < 0.15 && Date.now() - new Date(r.created) < 3 * 3600e3 && r.status !== 'rejected');
  if (dup) { if (photo) dup.photos = (dup.photos || []).concat(photo); dup.corroborations++; if (dup.status === 'awaiting' && dup.corroborations >= 1) dup.status = 'corroborated'; dup.updated = now(); dup.history.push({ at: now(), by: 'system', to: dup.status + ' (duplicate nearby counted as corroboration)' }); save(); return send(c.res, 200, { corroboratedExisting: true, report: pubReport(dup), message: 'A similar report exists nearby. Your report counted as corroboration.' }); }
  const r = { id: id0, photos: photo ? [photo] : [], gps: false, locationSource: b.locationSource === 'gps_requested' ? 'client_requested_gps' : 'map_pick', category: b.category, title: clean(b.title, 80), description: clean(b.description, 500), lat: b.lat, lng: b.lng, status: 'awaiting', severity: ['low', 'moderate', 'high'].includes(b.severity) ? b.severity : 'moderate', corroborations: 0, created: now(), updated: now(), by: c.user ? c.user.id : 'anon', history: [] };
  db.reports.push(r); save(); send(c.res, 201, { report: pubReport(r) });
});
R('POST', '/api/reports/:id/verify', async c => { if (!need(c, 'moderator', 'admin')) return; const b = await body(c.req), r = db.reports.find(x => x.id === c.p[0]); if (!r) return send(c.res, 404, { error: 'not found' }); if (!['verified', 'rejected', 'corroborated'].includes(b.status)) return send(c.res, 400, { error: 'invalid status' }); r.status = b.status; r.updated = now(); r.history.push({ at: now(), by: c.user.name, to: b.status }); audit(c.user.name, 'report.' + b.status, r.id); save(); send(c.res, 200, { report: pubReport(r) }); });
R('POST', '/api/reports/:id/resolve', async c => { if (!need(c, 'moderator', 'admin')) return; const r = db.reports.find(x => x.id === c.p[0]); if (!r) return send(c.res, 404, { error: 'not found' }); r.status = 'resolved'; r.updated = now(); r.history.push({ at: now(), by: c.user.name, to: 'resolved' }); audit(c.user.name, 'report.resolved', r.id); save(); send(c.res, 200, { report: pubReport(r) }); });
R('GET', '/api/news', async c => send(c.res, 200, { videoId: db.news.videoId, links: NEWS_LINKS, note: 'No live official stream is connected automatically. An admin can publish an official YouTube video/live link.' }));
R('PUT', '/api/admin/news', async c => { if (!need(c, 'admin')) return; const b = await body(c.req); const id = b.video ? ytId(b.video) : ''; if (b.video && !id) return send(c.res, 400, { error: 'not a YouTube link' }); db.news.videoId = id; audit(c.user.name, 'news.video', id || 'cleared'); save(); send(c.res, 200, { videoId: id }); });
R('GET', '/api/chat', async c => send(c.res, 200, { demo: true, messages: db.chat.slice(-60) }));
R('POST', '/api/chat', async c => { if (!limit(c.ip, 'chat', 8, 60000)) return send(c.res, 429, { error: 'Too many messages. Wait a minute.' }); const b = await body(c.req), text = clean(b.text, 300).trim(); if (text.length < 2) return send(c.res, 400, { error: 'message too short' }); const m = { id: uid('M'), name: clean(b.name || 'Guest', 24).trim() || 'Guest', text, at: now(), role: c.user ? c.user.role : 'guest' }; db.chat.push(m); db.chat = db.chat.slice(-200); save(); send(c.res, 201, { message: m }); });
R('DELETE', '/api/chat/:id', async c => { if (!need(c, 'moderator', 'admin')) return; db.chat = db.chat.filter(m => m.id !== c.p[0]); audit(c.user.name, 'chat.delete', c.p[0]); save(); send(c.res, 200, { ok: true }); });
R('GET', '/api/shops', async c => send(c.res, 200, { demo: true, note: 'Open/closed is community-reported and not confirmed by the shops.', shops: db.shops }));
R('POST', '/api/shops', async c => { if (!limit(c.ip, 'shop', 5, 600000)) return send(c.res, 429, { error: 'Too many shops added.' }); const b = await body(c.req); if (clean(b.name, 60).length < 3 || !num(b.lat, -90, 90) || !num(b.lng, -180, 180) || !['open', 'closed'].includes(b.status)) return send(c.res, 400, { error: 'name, location and status required' }); const s = { id: uid('S'), name: clean(b.name, 60), lat: b.lat, lng: b.lng, status: b.status, updated: now(), by: 'community' }; db.shops.push(s); save(); send(c.res, 201, { shop: s }); });
R('POST', '/api/shops/:id/status', async c => { if (!limit(c.ip, 'shopst', 10, 60000)) return send(c.res, 429, { error: 'Too many updates.' }); const b = await body(c.req), s = db.shops.find(x => x.id === c.p[0]); if (!s || !['open', 'closed', 'unknown'].includes(b.status)) return send(c.res, 400, { error: 'invalid' }); s.status = b.status; s.updated = now(); s.by = 'community'; db.chat.push({ id: uid('M'), name: 'Shop board', text: s.name + ': reported ' + b.status, at: now(), role: 'system' }); save(); send(c.res, 200, { shop: s }); });
R('GET', '/api/safe-locations', async c => { const p = coordinates(c.q), t = c.q.get('type'); if (p && (p.lat < -2.36 || p.lat > -2.04 || p.lng < -80.06 || p.lng > -79.72)) return send(c.res, 200, { demo: true, coverage: false, note: 'No configured service directory covers this location. Guayaquil sample facilities were not returned.', facilities: [] }); let l = db.facilities.filter(f => !t || f.type === t); if (p) l = l.map(f => ({ ...f, distanceKm: +km(p.lat, p.lng, f.lat, f.lng).toFixed(2) })).sort((a, b) => a.distanceKm - b.distanceKm); send(c.res, 200, { demo: true, coverage: true, note: 'Availability/open status not provided: no trusted source connected.', facilities: l }); });
R('POST', '/api/sos', async c => {
  const b = await body(c.req);
  const clientRequestId = typeof b.clientRequestId === 'string' && /^[A-Za-z0-9-]{8,80}$/.test(b.clientRequestId) ? b.clientRequestId : null;
  if (clientRequestId) {
    const existing = db.sos.find(x => x.clientRequestId === clientRequestId);
    if (existing) return send(c.res, 200, { ref: existing.id, accessCode: existing.secret, status: existing.status, deduplicated: true, message: 'This request was already accepted by the FloodSense server. Official emergency dispatch is not connected.' });
  }
  if (!limit(c.ip, 'sos', 3, 600000)) return send(c.res, 429, { error: 'SOS rate limit reached. If in danger, call 911 now.' });
  if (!num(b.lat, -90, 90) || !num(b.lng, -180, 180)) return send(c.res, 400, { error: 'location required (tap the map or use GPS)' });
  const types = ['flooding', 'trapped', 'medical', 'evacuation', 'other']; if (!types.includes(b.type)) return send(c.res, 400, { error: 'invalid type' });
  const s = { id: uid('SOS'), secret: crypto.randomBytes(4).toString('hex'), clientRequestId, type: b.type, description: clean(b.description, 400), lat: b.lat, lng: b.lng, status: 'received', created: now(), history: [{ at: now(), status: 'received', by: 'system' }], notes: [], assignee: null, owner: c.user ? c.user.id : 'anon' };
  db.sos.push(s); audit('system', 'sos.created', s.id); save();
  send(c.res, 201, { ref: s.id, accessCode: s.secret, status: s.status, message: 'Your request was submitted to the FloodSense response dashboard. Official emergency dispatch is not connected. Call 911 if you are in danger.' });
});
const sosStatus = async c => { const s = db.sos.find(x => x.id === c.p[0]); if (!s) return send(c.res, 404, { error: 'not found' }); const b = await body(c.req); if (!limit(c.ip, 'sos-status-' + c.p[0], 5, 600000)) return send(c.res, 429, { error: 'Too many status attempts. Try again later.' }); const ok = (c.user && ['responder', 'admin'].includes(c.user.role)) || sameSecret(b.code, s.secret); if (!ok) return send(c.res, 403, { error: 'access code required' }); send(c.res, 200, { ref: s.id, status: s.status, history: s.history.map(h => ({ at: h.at, status: h.status })), dispatchConnected: false }); };
R('POST', '/api/sos/:id/status', sosStatus);
R('GET', '/api/sos/:id', async c => send(c.res, 405, { error: 'use POST /api/sos/:id/status with the access code in the body' }));
R('POST', '/api/sos/:id/cancel', async c => { const s = db.sos.find(x => x.id === c.p[0]); const b = await body(c.req); if (!s) return send(c.res, 404, { error: 'not found' }); if (!limit(c.ip, 'sos-cancel-' + c.p[0], 5, 600000) || !sameSecret(b.code, s.secret)) return send(c.res, 403, { error: 'access code required' }); s.status = 'cancelled_false_alarm'; s.history.push({ at: now(), status: s.status, by: 'resident' }); save(); send(c.res, 200, { status: s.status }); });
R('GET', '/api/responder/incidents', async c => { if (!need(c, 'responder', 'admin')) return; send(c.res, 200, { incidents: db.sos.map(({ secret, ...s }) => s).reverse() }); });
R('PATCH', '/api/responder/incidents/:id/status', async c => { if (!need(c, 'responder', 'admin')) return; const b = await body(c.req), s = db.sos.find(x => x.id === c.p[0]); if (!s) return send(c.res, 404, { error: 'not found' }); if (!['acknowledged', 'assigned', 'en_route', 'resolved', 'unable_to_respond'].includes(b.status)) return send(c.res, 400, { error: 'invalid status' }); s.status = b.status; if (b.status === 'assigned') s.assignee = c.user.name; if (b.note) s.notes.push({ at: now(), by: c.user.name, text: clean(b.note, 300) }); s.history.push({ at: now(), status: b.status, by: c.user.name }); audit(c.user.name, 'sos.' + b.status, s.id); save(); send(c.res, 200, { status: s.status }); });
R('GET', '/api/admin/overview', async c => { if (!need(c, 'admin', 'moderator', 'responder')) return; send(c.res, 200, { reports: db.reports.length, awaiting: db.reports.filter(r => r.status === 'awaiting').length, sos: db.sos.length, sosOpen: db.sos.filter(s => !['resolved', 'cancelled_false_alarm', 'unable_to_respond'].includes(s.status)).length }); });
R('GET', '/api/admin/audit-logs', async c => { if (!need(c, 'admin')) return; send(c.res, 200, { logs: db.audit }); });
R('POST', '/api/admin/reset-demo', async c => { if (!need(c, 'admin')) return; db = seed(); audit(c.user.name, 'reset-demo', '-'); save(); send(c.res, 200, { ok: true }); });

const mime = { '.svg': 'image/svg+xml', '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'); const tok = (req.headers.authorization || '').replace('Bearer ', '');
  const ctx = { req, res, q: u.searchParams, user: sessions[tok], ip: req.socket.remoteAddress };
  if (u.pathname.startsWith('/api/')) {
    for (const [m, re, fn] of routes) { const x = re.exec(u.pathname); if (m === req.method && x) { ctx.p = x.slice(1); try { return await fn(ctx); } catch (e) { console.error(e.message); return send(res, e.status || 500, { error: e.status ? e.message : 'internal error' }); } } }
    return send(res, 404, { error: 'not found' });
  }
  if (u.pathname.startsWith('/uploads/')) { const fn = path.basename(u.pathname); return fs.readFile(path.join(UP, fn), (e, d) => { if (e || !/\.jpg$/.test(fn)) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': 'image/jpeg', 'X-Content-Type-Options': 'nosniff' }); res.end(d); }); }
  const f = path.join(__dirname, 'public', u.pathname === '/' ? 'index.html' : path.normalize(u.pathname).replace(/^(\.\.[/\\])+/, ''));
  if (!f.startsWith(path.join(__dirname, 'public'))) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end('Not found'); } res.writeHead(200, { 'Content-Type': mime[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT, HOST, function () { const address = this.address(); console.log(`FloodSense prototype listening on http://${HOST}:${address.port} (LAN access enabled)`); });
