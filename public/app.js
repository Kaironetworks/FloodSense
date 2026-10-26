// FloodSense prototype frontend (vanilla JS + Leaflet). All data comes from /api (demo mode).
const I18N = {
  es: { map: 'Mapa', feed: 'Alertas', report: 'Reportar', sos: 'SOS', route: 'Ruta', services: 'Servicios', chat: 'Comunidad', ops: 'Operaciones', guide: 'Guía', sensors: 'Sensores demo',
    click: 'Toca el mapa para evaluar un punto.', risk: 'Riesgo estimado', reasons: 'Motivos', missing: 'Datos faltantes', layers: 'Capas',
    zones: 'Susceptibilidad (histórica, demo)', inc: 'Reportes comunitarios', fac: 'Servicios', send: 'Enviar reporte', call: 'Llamar al 911',
    insufficient: 'Datos insuficientes', low: 'Riesgo bajo estimado', moderate: 'Riesgo moderado estimado', high: 'Riesgo alto estimado', critical: 'Riesgo crítico estimado',
    awaiting: 'Pendiente de verificación', corroborated: 'Corroborado', verified: 'Verificado', rejected: 'Rechazado', resolved: 'Resuelto' },
  en: { map: 'Map', feed: 'Alerts', report: 'Report', sos: 'SOS', route: 'Route', services: 'Services', chat: 'Community', ops: 'Ops', guide: 'Guide', sensors: 'Demo sensors',
    click: 'Tap the map to assess a point.', risk: 'Estimated risk', reasons: 'Reasons', missing: 'Missing data', layers: 'Layers',
    zones: 'Susceptibility (historical, demo)', inc: 'Community reports', fac: 'Facilities', send: 'Submit report', call: 'Call 911',
    insufficient: 'Insufficient data', low: 'Low estimated risk', moderate: 'Moderate estimated risk', high: 'High estimated risk', critical: 'Critical estimated risk',
    awaiting: 'Awaiting verification', corroborated: 'Corroborated', verified: 'Verified', rejected: 'Rejected', resolved: 'Resolved' } };
const CITY = { label: 'Guayaquil', fullLabel: 'Guayaquil, Ecuador', center: [-2.19, -79.9], zoom: 12, timezone: 'America/Guayaquil', data: 'backend' };
const S = { lang: localStorage.lang || 'es', token: null, user: null, demoKey: '', pick: null, tab: 'map', layers: { zones: true, inc: true, fac: true, sensors: true }, org: null, dst: null, sensorScenario: 'baseline', hazardStale: false, alertsStale: false, weatherStale: false };
const t = k => (I18N[S.lang][k] || k);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = s => document.querySelector(s), panel = $('#panel');
const fmt = iso => iso ? new Date(iso).toLocaleString(S.lang === 'es' ? 'es-EC' : 'en-US', { timeZone: CITY.timezone, dateStyle: 'short', timeStyle: 'short' }) : '—';
const city = () => CITY;
async function api(p, o = {}) {
  const r = await fetch('/api' + p, { method: o.method || 'GET', headers: { 'Content-Type': 'application/json', ...(S.token ? { Authorization: 'Bearer ' + S.token } : {}) }, body: o.body ? JSON.stringify(o.body) : undefined });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.error || r.status), { data: j, status: r.status }); return j;
}
// cache for stale/offline display: keeps original timestamp visible
async function cached(key, p) {
  try { const d = await api(p); localStorage[key] = JSON.stringify({ at: new Date().toISOString(), d }); $('#net').textContent = 'online'; $('#net').className = 'tag t-low'; return { d, stale: null }; }
  catch (e) { $('#net').textContent = 'offline'; $('#net').className = 'tag t-high'; const c = localStorage[key]; if (c) { const o = JSON.parse(c); return { d: o.d, stale: o.at }; } throw e; }
}
const staleNote = s => s ? `<div class="stale">⚠ Offline/stale: cached copy from ${fmt(s)}. Do not treat as current.</div>` : '';
const tag = (v, label) => `<span class="tag t-${esc(v)}">${esc(label || t(v))}</span>`;
const COL = { verified: '#34d399', corroborated: '#fbbf24', awaiting: '#fbbf24', resolved: '#9fb3c8' };

const photoHtml = (r, h) => (r.photos || []).map(p => `<a href="${esc(p)}" target="_blank" rel="noopener"><img src="${esc(p)}" alt="Report photo" style="width:100%;max-height:${h}px;object-fit:cover;border-radius:8px;margin-top:6px"></a>`).join('');
const locationLabel = source => source === 'client_requested_gps' ? '📍 GPS requested — unverified' : source === 'map_pick' ? '🗺 map-selected' : '🗺 map-selected (legacy record)';
const reportErrorText = er => { const fields = er && er.data && Array.isArray(er.data.fields) ? er.data.fields.join(', ') : ''; return `${er && er.message ? er.message : 'Unable to submit report. Check your connection and try again.'}${fields ? ` (${fields})` : ''}`; };
const BLOCK = ['flooded_road', 'closure', 'dangerous_level', 'blocked_evac'];
// ---------- map ----------
const mapStatus = msg => { const e = $('#map-status'); if (e) { e.textContent = msg; e.hidden = !msg; } };
const mapUnavailable = typeof L === 'undefined';
const emptyLayer = () => ({ clearLayers() {}, addTo() { return this; } });
const map = mapUnavailable ? { setView() { return this; }, on() {}, addLayer() {}, removeLayer() {}, fitBounds() {}, invalidateSize() {} } : L.map('map', { zoomControl: true }).setView(city().center, city().zoom);
const tiles = mapUnavailable ? null : L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(map);
if (mapUnavailable) mapStatus('Interactive map unavailable. Use the panels for reports, risk, services, and SOS.');
if (tiles) tiles.on('tileerror', () => mapStatus('Map tiles are unavailable. Data panels remain usable; map positions may be blank.'));
const G = mapUnavailable ? { zones: emptyLayer(), inc: emptyLayer(), fac: emptyLayer(), sensors: emptyLayer(), route: emptyLayer(), pick: emptyLayer() } : { zones: L.layerGroup().addTo(map), inc: L.layerGroup().addTo(map), fac: L.layerGroup().addTo(map), sensors: L.layerGroup().addTo(map), route: L.layerGroup().addTo(map), pick: L.layerGroup().addTo(map) };
let ZONES = [], INC = [], FAC = [], SENSORS = [];
function drawLayers() {
  if (mapUnavailable) return;
  G.zones.clearLayers(); G.inc.clearLayers(); G.fac.clearLayers(); G.sensors.clearLayers();
  ZONES.forEach(z => L.polygon(z.poly, { color: z.level === 'high' ? '#f43f5e' : '#fbbf24', weight: 2, dashArray: '6 6', fillOpacity: .15 }).bindPopup(`<b>${esc(z.name)}</b><br>Historical susceptibility (${esc(z.level)}). NOT an observed flood. Source: DEMO sample.`).addTo(G.zones));
  INC.forEach(r => { const v = r.status === 'verified'; L.marker([r.lat, r.lng], { icon: L.divIcon({ className: '', html: `<div class="pin" style="background:${v ? COL.verified : 'transparent'};border-color:${v ? '#fff' : COL[r.status] || '#fbbf24'};border-style:${v ? 'solid' : 'dashed'}"></div>`, iconSize: [16, 16] }) })
    .bindPopup(`<b>${esc(r.title)}</b><br>${t(r.status)} · ${esc(r.severity)}<br>Reported ${fmt(r.created)} · updated ${fmt(r.updated)}<br>Source: community${v ? ', moderator-verified' : ', UNVERIFIED'} (demo)<br>${locationLabel(r.locationSource)}${photoHtml(r, 150)}`).addTo(G.inc); if (v && BLOCK.includes(r.category)) L.circle([r.lat, r.lng], { radius: 120, color: '#ff2d55', weight: 2, fillOpacity: .2 }).addTo(G.inc); });
  FAC.forEach(f => L.marker([f.lat, f.lng], { icon: L.divIcon({ className: '', html: `<div class="fac" title="${esc(f.type)}">${{ hospital: 'H', shelter: 'S', pharmacy: 'P', fire: 'F' }[f.type] || '?'}</div>`, iconSize: [18, 18] }) })
    .bindPopup(`<b>${esc(f.name)}</b><br>${esc(f.type)} · ${f.verified ? 'verified' : 'NOT officially verified'}<br>Availability: unknown (no trusted source)<br><a target=_blank rel=noopener href="https://www.google.com/maps/dir/?api=1&destination=${f.lat},${f.lng}">Directions</a>`).addTo(G.fac));
  SENSORS.forEach(s => L.circleMarker([s.lat, s.lng], { radius: 7, color: s.roadStatus === 'IMPASSABLE' ? '#f43f5e' : s.roadStatus === 'CAUTION' ? '#fbbf24' : '#38bdf8', fillOpacity: .75 })
    .bindPopup(`<b>${esc(s.name)}</b><br>Simulated water depth: ${s.waterDepthM} m<br>Road status: ${esc(s.roadStatus)}<br><span class="mut">Unverified demo sensor reading</span>`).addTo(G.sensors));
  Object.keys(S.layers).forEach(k => S.layers[k] ? map.addLayer(G[k]) : map.removeLayer(G[k]));
  if (S.layers.sensors) map.addLayer(G.sensors); else map.removeLayer(G.sensors);
}
async function loadData(scenario = S.sensorScenario) {
  const [z, i, f, s] = await Promise.all([cached('c_zones', '/flood/zones'), cached('c_inc', '/incidents'), cached('c_fac', '/safe-locations'), cached('c_sensors_' + scenario, '/flood/sensors' + (scenario === 'heavy' ? '?scenario=heavy' : ''))]);
  ZONES = z.d.zones; INC = i.d.incidents; FAC = f.d.facilities; SENSORS = s.d.sensors; S.hazardStale = !!(z.stale || i.stale || s.stale); S.stale = z.stale || i.stale || f.stale || s.stale; S.sensorScenario = scenario; drawLayers();
}
if (!mapUnavailable) map.on('click', e => { setPick(e.latlng.lat, e.latlng.lng, false); });
function setPick(lat, lng, gps) {
  S.pick = { lat, lng }; S.pickGps = gps === true; const inGye = lat >= -2.36 && lat <= -2.04 && lng >= -80.06 && lng <= -79.72; mapStatus(inGye ? '' : 'This point is outside configured coverage (Guayaquil). FloodSense will not apply Guayaquil sample hazards or service locations here.'); G.pick.clearLayers(); if (!mapUnavailable) L.circleMarker([lat, lng], { radius: 8, color: '#38bdf8', fillOpacity: .5 }).addTo(G.pick);
  if (S.tab === 'map') showAssessment(); else render();
}
async function showAssessment() {
  const box = $('#assess'); if (!box || !S.pick) return; box.innerHTML = 'Loading…';
  try { const a = await api(`/flood/assessments?lat=${S.pick.lat}&lng=${S.pick.lng}`);
     const colr = { low: '#38bdf8', moderate: '#fbbf24', high: '#f43f5e', critical: '#f43f5e', insufficient: '#9fb3c8' }[a.level];
    const intel = a.intelligence || {}, actions = (intel.actions || []).map(x => `<li>${esc(x.action)} — ${esc(x.reason)}</li>`).join('');
    const intelHtml = `<div class="card"><div class="row"><b>Hazard state: ${esc(intel.state || 'unavailable')}</b>${tag(intel.hazardSeverity || 'insufficient', intel.hazardSeverity || 'insufficient')}<span class="mut">Evidence confidence: ${Math.round((intel.evidenceConfidence || 0) * 100)}%</span></div><div class="mut">${esc(intel.explanation || 'Evidence fusion unavailable.')}</div>${intel.trend && intel.trend.direction === 'rising' ? `<div class="stale">Trend: water level rising at ${esc(intel.trend.waterRiseMPerHour)} m/hour.</div>` : ''}${intel.consequences && intel.consequences.affectedRoads && intel.consequences.affectedRoads.length ? `<div class="mut">Affected roads: ${intel.consequences.affectedRoads.map(r => esc(r.name)).join(', ')}</div>` : ''}${actions ? `<b>Recommended next actions</b><ul>${actions}</ul>` : ''}${intel.missing && intel.missing.length ? `<div class="mut">Unknown: ${intel.missing.map(x => esc(x)).join(' · ')}</div>` : ''}</div>`;
    box.innerHTML = `${a.coverage === false ? '<div class="stale">No configured city coverage for this location. Guayaquil sample hazards were not applied; this is not a low-risk result.</div>' : ''}${S.hazardStale || S.alertsStale || S.weatherStale ? '<div class="stale">⚠ One or more current inputs are unavailable or stale. This assessment is informational only.</div>' : ''}${intelHtml}<div class="card"><div class="mut">${t('risk')} · ${esc(a.label)} · ${esc(a.version)}</div><div class="row"><span class="score">${a.level === 'insufficient' ? '—' : a.score}</span>${tag(a.level)}</div>
    <div class="bar"><i style="width:${a.score}%;background:${colr}"></i></div>
    <h3>${t('reasons')}</h3>${a.reasons.map(r => `<div>+${r.pts} ${esc(r.f)}<div class="mut">${esc(r.src)}</div></div>`).join('') || '<div class="mut">—</div>'}
    <h3>${t('missing')}</h3>${a.missing.map(m => `<div class="mut">• ${esc(m)}</div>`).join('')}
    <p class="mut">Computed ${fmt(a.computedAt)}. Demo rules; not a flood probability and not a safety guarantee.</p></div>`; } catch (e) { box.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
}
async function search(q) {
  try { const r = await (await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ec&q=' + encodeURIComponent(q + ' Guayaquil Ecuador'))).json();
    if (!r[0]) return alert('No result'); map.setView([+r[0].lat, +r[0].lon], 15); setPick(+r[0].lat, +r[0].lon); } catch { alert('Search unavailable (needs internet).'); }
}
function locate(cb) { if (!navigator.geolocation) return alert('Geolocation not supported'); navigator.geolocation.getCurrentPosition(p => { map.setView([p.coords.latitude, p.coords.longitude], 15); cb(p.coords.latitude, p.coords.longitude, true); }, () => alert('Location permission denied. Tap the map instead.')); }

// ---------- views ----------
const TABS = ['map', 'feed', 'report', 'sos', 'route', 'services', 'chat', 'ops', 'guide'];
function nav() { $('#nav').innerHTML = TABS.map(k => `<button role="tab" aria-selected="${S.tab === k}" class="${k === 'sos' ? 's' : ''}" data-t="${k}">${t(k)}</button>`).join(''); $('#nav').querySelectorAll('button').forEach(b => b.onclick = () => { S.tab = b.dataset.t; render(); }); }
const V = {};
V.map = async () => {
  const [a, weatherResult] = await Promise.all([
    cached('c_alerts', '/alerts'),
    api('/weather/current').catch(e => e.data || { status: 'unavailable', stale: true, note: 'Weather provider is unreachable. No live value is available.' })
  ]);
  const w = weatherResult;
  S.alertsStale = !!a.stale; S.weatherStale = w.status !== 'available' || !!w.stale;
  const weatherCard = w.status === 'available' || w.status === 'stale'
    ? `<div class="card"><div class="row"><b>Current weather context · Guayaquil</b>${tag(w.stale ? 'moderate' : 'low', w.stale ? 'STALE MODEL DATA' : 'MODEL DATA')}</div>
      <div class="row"><span><b>${Number.isFinite(w.temperatureC) ? w.temperatureC + ' °C' : '—'}</b><div class="mut">Temperature</div></span><span><b>${Number.isFinite(w.relativeHumidityPct) ? w.relativeHumidityPct + '%' : '—'}</b><div class="mut">Humidity</div></span><span><b>${Number.isFinite(w.hourlyPrecipitationMm) ? w.hourlyPrecipitationMm + ' mm' : '—'}</b><div class="mut">Modelled hourly rain</div></span><span><b>${Number.isFinite(w.windSpeedKmh) ? w.windSpeedKmh + ' km/h' : '—'}</b><div class="mut">Wind</div></span></div>
      <div class="mut">Source: ${esc(w.source)} · model time ${fmt(w.modelTime)} · retrieved ${fmt(w.retrievedAt)}${w.stale ? ' · refresh failed or data is old' : ''}</div>
      <div class="mut">${esc(w.note || 'Modelled weather, not a direct station observation.')}</div>
      <button class="btn" id="weatherRefresh">Refresh weather</button></div>`
    : `<div class="card"><div class="row"><b>Current weather context · Guayaquil</b>${tag('rejected', 'UNAVAILABLE')}</div><div class="stale">${esc(w.note || 'No live weather value available. No value has been invented.')}</div><button class="btn" id="weatherRefresh">Retry weather source</button></div>`;
  panel.innerHTML = `${staleNote(a.stale || S.stale)}
  <div class="row"><input id="q" placeholder="Search address / barrio…" aria-label="Search"><button class="btn" id="qb">🔍</button><button class="btn" id="gps">📍</button></div>
  ${weatherCard}
  ${a.d.alerts.map(x => `<div class="card"><div class="row">${tag(x.severity)}<b>${esc(x.title)}</b></div><div class="mut">${x.official ? 'Official-type' : ''} · ${esc(x.source)}<br>Published ${fmt(x.published)} · valid until ${fmt(x.validUntil)} · ${x.fresh ? 'current' : 'EXPIRED'} · ${x.rainMmH} mm/h (demo)</div></div>`).join('')}
  <h3>${t('layers')}</h3><div class="row">${[['zones', 'zones'], ['inc', 'inc'], ['fac', 'fac'], ['sensors', 'sensors']].map(([k, l]) => `<label style="display:flex;gap:6px;margin:0"><input type="checkbox" style="width:auto" data-l="${k}" ${S.layers[k] ? 'checked' : ''}>${t(l)}</label>`).join('')}</div>
  <div class="legend card"><span><i style="background:#f43f5e55;border:1px dashed #f43f5e"></i>Susceptibility zone (historical)</span><span><i style="background:#34d399;border-radius:50%"></i>Verified incident</span><span><i style="border:2px dashed #fbbf24;border-radius:50%"></i>Unverified report</span><span><i style="background:#38bdf8"></i>Facility (H/S/P/F)</span></div>
  <div id="assess" class="mut">${t('click')}</div>`;
  $('#qb').onclick = () => search($('#q').value); $('#q').onkeydown = e => { if (e.key === 'Enter') search(e.target.value); }; $('#gps').onclick = () => locate(setPick);
  $('#weatherRefresh').onclick = async () => { $('#weatherRefresh').disabled = true; $('#weatherRefresh').textContent = 'Refreshing…'; try { await api('/weather/current?refresh=1'); } catch {} await V.map(); };
  panel.querySelectorAll('[data-l]').forEach(c => c.onchange = () => { S.layers[c.dataset.l] = c.checked; drawLayers(); }); if (S.pick) showAssessment();
};
V.feed = async () => {
  const [a, i] = await Promise.all([cached('c_alerts', '/alerts'), cached('c_inc', '/incidents')]);
  S.alertsStale = !!a.stale;
  panel.innerHTML = `${staleNote(a.stale || i.stale)}<h2>Official notices (demo)</h2>${a.d.alerts.map(x => `<div class="card">${tag(x.severity)} <b>${esc(x.title)}</b><div class="mut">${esc(x.source)} · ${fmt(x.published)}</div></div>`).join('')}
  <h2>Community reports</h2><div class="mut">User-generated. Only “Verified” has moderator confirmation.</div>
  ${i.d.incidents.map(r => `<div class="card"><div class="row">${tag(r.status)}${tag(r.severity, r.severity)}<b>${esc(r.title)}</b></div><div class="mut">${esc(r.category)} · ${fmt(r.created)} · ${r.corroborations} corroboration(s) · ${locationLabel(r.locationSource)}${(r.photos || []).length ? ' · 📷 photo' : ''}</div>${photoHtml(r, 160)}<button class="btn" data-z="${r.lat},${r.lng}">Show on map</button></div>`).join('')}`;
  panel.querySelectorAll('[data-z]').forEach(b => b.onclick = () => { const [la, ln] = b.dataset.z.split(',').map(Number); map.setView([la, ln], 16); });
};
const compress = f => new Promise((ok, no) => { if (!f) return no(new Error('No file')); const u = URL.createObjectURL(f), im = new Image(); im.onload = () => { const k = Math.min(1, 900 / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = im.width * k; c.height = im.height * k; c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u); ok(c.toDataURL('image/jpeg', .75)); }; im.onerror = () => no(new Error('Not a readable image')); im.src = u; });
V.report = () => {
  panel.innerHTML = `<h2>${t('report')}</h2><form id="f"><label>Category</label><select name="category"><option value="flooded_road">Flooded road</option><option value="water">Water accumulation</option><option value="closure">Road closure</option><option value="debris">Fallen tree / debris</option><option value="drainage">Drainage problem</option><option value="dangerous_level">Dangerous water level</option><option value="blocked_evac">Blocked evacuation path</option><option value="other">Other</option></select>
  <label>Title</label><input name="title" maxlength="80" required><label>Description</label><textarea name="description" rows="3" maxlength="500"></textarea>
  <label>Severity (optional)</label><select name="severity"><option value="moderate">Moderate</option><option value="low">Low</option><option value="high">High</option></select>
  <label>Location</label><div class="card">${S.pick ? `📍 ${S.pick.lat.toFixed(5)}, ${S.pick.lng.toFixed(5)}` : 'Tap the map to choose the location.'} <button type="button" class="btn" id="gps">Use GPS</button></div>
  <label>Photo (optional): shows what you see</label><input type="file" id="ph" accept="image/*" capture="environment"><img id="prev" alt="Preview" ${S.photo ? `src="${S.photo}"` : 'hidden'} style="max-width:100%;border-radius:8px;margin-top:6px">
  <p class="mut">The photo is resized and re-encoded in your browser, which removes EXIF/GPS metadata. Location source is recorded as map-selected or GPS-requested, but the server cannot independently verify the device location. A photo does not prove a flood by itself; moderators review every report.</p>
  <button class="btn pri" ${S.pick ? '' : 'disabled'}>${t('send')}</button></form><div id="out"></div>`;
  $('#gps').onclick = () => locate(setPick);
  $('#ph').onchange = async e => { try { S.photo = await compress(e.target.files[0]); $('#prev').src = S.photo; $('#prev').hidden = false; } catch (er) { alert(er.message); } };
  $('#f').onsubmit = async e => { e.preventDefault(); const d = Object.fromEntries(new FormData(e.target)); delete d.photo; if (!S.pick) return; try { const r = await api('/reports', { method: 'POST', body: { ...d, ...S.pick, locationSource: S.pickGps ? 'gps_requested' : 'map_pick', photo: S.photo || undefined } }); S.photo = null;
    $('#out').innerHTML = `<div class="card good">✔ ${esc(r.message || 'Saved')} Ref ${esc(r.report.id)} — ${t(r.report.status)}</div>`; await loadData(); } catch (er) { $('#out').innerHTML = `<div class="card err">${esc(reportErrorText(er))}</div>`; } };
};
V.sos = () => {
  const saved = JSON.parse(localStorage.sos || 'null');
  const pending = JSON.parse(localStorage.pendingSos || '[]');
  panel.innerHTML = `<div class="card" style="border-color:#f43f5e"><b>In danger? Call 911 first.</b><div class="sos-warning-action"><a class="btn sos" href="tel:911">${t('call')}</a></div></div>
  <h2>SOS</h2><p class="mut">When online, a submitted request is sent to the FloodSense server response dashboard. <b>Official emergency dispatch is not connected.</b> If offline, you may explicitly save a request on this device; it is NOT SENT until the server accepts it.</p>
  ${pending.map((x,i) => `<div class="stale"><b>NOT SENT — WAITING FOR CONNECTION</b><br>Local request ${i+1} · saved ${fmt(x.queuedAt)}. It has not reached responders. Keep this page open for automatic retry when connection returns.${x.lastError ? `<div class="err">${esc(x.lastError)}</div>` : ''}<br><button class="btn" data-pending-remove="${esc(x.clientRequestId)}">Discard local request</button></div>`).join('')}
  <form id="f"><label>Type</label><select name="type"><option value="flooding">Flooding</option><option value="trapped">Trapped person</option><option value="medical">Medical emergency</option><option value="evacuation">Evacuation assistance</option><option value="other">Other</option></select>
  <label>Short description</label><textarea name="description" rows="2" maxlength="400"></textarea>
  <label>Location</label><div class="card">${S.pick ? `📍 ${S.pick.lat.toFixed(5)}, ${S.pick.lng.toFixed(5)}` : 'Tap the map or use GPS.'} <button type="button" class="btn" id="gps">Use GPS</button></div>
  <button class="btn sos" ${S.pick ? '' : 'disabled'}>Send SOS request</button></form><div id="out"></div>
  ${saved ? `<h3>Your last request</h3><div class="card">Ref ${esc(saved.ref)} · code ${esc(saved.code)}<div id="st" class="mut"></div><div class="row"><button class="btn" id="chk">Check status</button><button class="btn" id="can">Cancel (false alarm)</button></div></div>` : ''}`;
  $('#gps').onclick = () => locate(setPick);
  $('#f').onsubmit = async e => {
    e.preventDefault();
    if (!confirm('Submit an SOS request to the FloodSense server? This does NOT contact official dispatch. Call 911 if in danger.')) return;
    const d = Object.fromEntries(new FormData(e.target));
    const request = { ...d, ...S.pick, clientRequestId: (crypto.randomUUID ? crypto.randomUUID() : 'fs-' + Date.now() + '-' + Math.random().toString(16).slice(2)) };
    if (!navigator.onLine) {
      if (!confirm('You are offline. Save this request on this device for retry? It will NOT alert anyone until the server accepts it. The location and description will be stored in this browser.')) return;
      const q = JSON.parse(localStorage.pendingSos || '[]'); q.push({ ...request, queuedAt: new Date().toISOString() }); localStorage.pendingSos = JSON.stringify(q);
      $('#out').innerHTML = '<div class="stale"><b>NOT SENT — WAITING FOR CONNECTION.</b> This request is stored only in this browser. No responder has received it. Keep this page open and use official emergency channels.</div>';
      V.sos(); return;
    }
    try {
      const r = await api('/sos', { method: 'POST', body: request });
      localStorage.sos = JSON.stringify({ ref: r.ref, code: r.accessCode });
      $('#out').innerHTML = `<div class="card good"><b>Accepted by FloodSense server: ${esc(r.ref)}</b> · access code <b>${esc(r.accessCode)}</b><br>Status: ${esc(r.status)}<br>${esc(r.message)}</div>`;
    } catch (er) {
      const message = er.status ? `Server did not accept the request (HTTP ${er.status}): ${er.message}` : 'Submission outcome could not be confirmed. Do not assume it was sent; check your connection and contact official emergency services.';
      $('#out').innerHTML = `<div class="card err">${esc(message)}</div>`;
    }
  };
  panel.querySelectorAll('[data-pending-remove]').forEach(b => b.onclick = () => { const q = JSON.parse(localStorage.pendingSos || '[]').filter(x => x.clientRequestId !== b.dataset.pendingRemove); localStorage.pendingSos = JSON.stringify(q); V.sos(); });
  if (saved) { $('#chk').onclick = async () => { try { const r = await api(`/sos/${saved.ref}/status`, { method: 'POST', body: { code: saved.code } }); $('#st').innerHTML = `Recorded status: <b>${esc(r.status)}</b> (${fmt(r.history.at(-1).at)}). Dispatch connected: no.`; } catch (er) { $('#st').textContent = er.message; } };
    $('#can').onclick = async () => { try { await api(`/sos/${saved.ref}/cancel`, { method: 'POST', body: { code: saved.code } }); $('#st').textContent = 'Cancelled as false alarm.'; } catch (er) { $('#st').textContent = er.message; } }; }
};
// ----- routing: OSRM alternatives, scored; blocked streets drawn in red -----
const pip = (lat, lng, p) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [yi, xi] = p[i], [yj, xj] = p[j]; if ((xi > lng) !== (xj > lng) && lat < (yj - yi) * (lng - xi) / (xj - xi) + yi) c = !c; } return c; };
const dist = (a, b, c, d) => { const r = x => x * Math.PI / 180, h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };
const blockers = () => INC.filter(r => r.status === 'verified' && BLOCK.includes(r.category));
const svUrl = (la, ln) => `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${la},${ln}`;
const svEmbed = (la, ln) => `https://maps.google.com/maps?layer=c&cbll=${la},${ln}&cbp=12,0,0,0,0&output=svembed`;
const stCache = {};
async function streetName(la, ln, el) { const k = la + ',' + ln; stCache[k] = stCache[k] || fetch(`https://nominatim.openstreetmap.org/reverse?format=json&zoom=17&lat=${la}&lon=${ln}`).then(r => r.json()).then(j => (j.address && (j.address.road || j.address.suburb)) || 'Unnamed street').catch(() => 'Street name unavailable'); el.textContent = '· ' + await stCache[k]; }
function scoreRoute(coords) {
  const B = blockers(); let hi = 0, md = 0; const hz = new Set(), sensorHazards = new Set();
  coords.forEach(([lng, lat]) => {
    const z = ZONES.find(z => pip(lat, lng, z.poly)); if (z) z.level === 'high' ? hi++ : md++;
    B.forEach(h => { if (dist(lat, lng, h.lat, h.lng) < .12) hz.add(h.id); });
    SENSORS.filter(s => s.roadStatus === 'IMPASSABLE' && dist(lat, lng, s.lat, s.lng) < .12).forEach(s => sensorHazards.add(s.id));
  });
  const n = coords.length || 1, closed = [...hz].filter(id => B.find(h => h.id === id).category === 'closure').length;
  return { exposure: Math.round(100 * (hi + md) / n), hazards: [...hz], sensorHazards: [...sensorHazards], score: Math.round(100 * (hi * 2 + md) / n + hz.size * 40 + sensorHazards.size * 100 + closed * 100) };
}
function drawRoute(r, best, ok) { // red where within 120 m of a verified blocked street
  if (mapUnavailable) return;
  const B = blockers(), near = ([x, y]) => B.some(h => dist(y, x, h.lat, h.lng) < .12) || SENSORS.some(s => s.roadStatus === 'IMPASSABLE' && dist(y, x, s.lat, s.lng) < .12); let run = [], flag = null;
  const flush = () => { if (run.length > 1) L.polyline(run.map(([x, y]) => [y, x]), { color: flag ? '#ff2d55' : best ? '#34d399' : '#38bdf8', weight: flag ? 8 : best ? 6 : 4, opacity: flag || best ? .95 : .6, dashArray: ok ? null : '4 8' }).addTo(G.route); };
  r.coords.forEach(c => { const f = near(c); if (flag === null) flag = f; if (f !== flag) { run.push(c); flush(); run = [c]; flag = f; } else run.push(c); }); flush();
}
function blockedPanel(ids) {
  const B = blockers().filter(h => !ids || ids.includes(h.id)); if (!B.length) return '<div class="mut">No verified blocked streets in the data.</div>';
  return B.map(h => `<div class="card" style="border-color:#ff2d55"><b>🚧 ${esc(h.title)}</b> <span class="mut" data-st="${h.lat},${h.lng}"></span><div class="mut">${esc(h.category)} · verified ${fmt(h.updated)} · ${h.gps ? '📍 GPS-tagged' : '🗺 map-picked'}</div>${photoHtml({ photos: (h.photos || []).slice(0, 1) }, 120)}<div class="row" style="margin-top:6px"><button class="btn" data-sv="${h.lat},${h.lng}">Street view</button><a class="btn" target="_blank" rel="noopener" href="${svUrl(h.lat, h.lng)}">Open in Google Maps</a></div></div>`).join('') + '<div id="sv"></div>';
}
function bindBlocked() {
  panel.querySelectorAll('[data-st]').forEach(e => { const [la, ln] = e.dataset.st.split(',').map(Number); streetName(la, ln, e); });
  panel.querySelectorAll('[data-sv]').forEach(b => b.onclick = () => { const [la, ln] = b.dataset.sv.split(','); $('#sv').innerHTML = `<div class="card"><iframe title="Street view" loading="lazy" style="width:100%;height:260px;border:0;border-radius:8px" src="${svEmbed(la, ln)}"></iframe><div class="mut">If blank, Google has no coverage or blocked the embed: use “Open in Google Maps”.</div></div>`; map.setView([+la, +ln], 17); });
}
async function getRoutes(o, d, mode) {
  try { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 7000); const response = await fetch(`https://router.project-osrm.org/route/v1/${mode}/${o.lng},${o.lat};${d.lng},${d.lat}?alternatives=true&overview=full&geometries=geojson`, { signal: controller.signal }); clearTimeout(timer); const r = await response.json(); if (r.code !== 'Ok') throw 0; return { ok: true, routes: r.routes.map(x => ({ coords: x.geometry.coordinates, km: x.distance / 1000, min: x.duration / 60 })) }; }
  catch { return { ok: false, routes: [] }; }
}
function showResults(items, ok, head, notice = '') {
  G.route.clearLayers(); items.forEach(i => Object.assign(i.r, scoreRoute(i.r.coords)));
  const best = items.reduce((a, b) => (b.r.score < a.r.score || (b.r.score === a.r.score && b.r.km < a.r.km)) ? b : a); if (best.h) S.dst = { lat: best.h.lat, lng: best.h.lng };
  items.filter(i => i !== best).forEach(i => drawRoute(i.r, false, ok)); drawRoute(best.r, true, ok);
  if (!mapUnavailable) { blockers().forEach(h => L.circle([h.lat, h.lng], { radius: 120, color: '#ff2d55', weight: 2, fillOpacity: .25 }).bindPopup(`<b>🚧 ${esc(h.title)}</b>`).addTo(G.route)); const bd = L.latLngBounds([S.org.lat, S.org.lng], [S.dst.lat, S.dst.lng]); items.forEach(i => i.r.coords.forEach(([x, y]) => bd.extend([y, x]))); map.fitBounds(bd.pad(.1)); }
  const sorted = [...items].sort((a, b) => a.r.score - b.r.score || a.r.km - b.r.km), allBlocked = items.every(i => i.r.hazards.length || i.r.sensorHazards.length);
  $('#out').innerHTML = `<h3>${head}</h3>${notice || (ok ? '' : '<div class="stale">Routing service returned an unavailable result. No navigable route is being presented.</div>')}
  <div class="legend"><span><i style="background:#34d399"></i>Best path</span><span><i style="background:#38bdf8"></i>Alternative</span><span><i style="background:#ff2d55"></i>Passes a verified blocked street</span></div>
  ${allBlocked ? '<div class="stale">Every available path passes a reported blocked street. Call 911 if this is an emergency.</div>' : ''}
  ${sorted.map((i, n) => `<div class="card"><div class="row"><b>${esc(i.h ? i.h.name : 'Route ' + (n + 1))}</b>${i === best ? tag('verified', 'Best path') : ''}${i.r.hazards.length ? tag('high', i.r.hazards.length + ' blocked street(s)') : ''}${i.r.sensorHazards.length ? tag('high', i.r.sensorHazards.length + ' impassable sensor zone(s)') : ''}</div>${i.r.km.toFixed(1)} km${i.r.min ? ' · ' + Math.round(i.r.min) + ' min' : ''} · risk score ${i.r.score} (lower is better) · ${i.r.exposure}% inside susceptibility zones</div>`).join('')}
  <a class="btn pri" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&origin=${S.org.lat},${S.org.lng}&destination=${S.dst.lat},${S.dst.lng}&travelmode=driving">Open directions externally</a>
  <h3>${best.r.hazards.length ? 'Blocked streets on the best path' : 'Best path avoids known blocked streets. All known blocked streets:'}</h3>${blockedPanel(best.r.hazards.length ? best.r.hazards : null)}
  <p class="mut">Score = 2×high-zone + 1×moderate-zone share + 40 per verified hazard + 100 per impassable simulated sensor zone + 100 per verified closure. Sensor readings are simulated and unverified. Hazards as of ${fmt(new Date().toISOString())}. No report ≠ road clear. No route is guaranteed safe.</p>`;
  bindBlocked();
}
V.route = () => {
  const p = x => x ? `${x.lat.toFixed(4)}, ${x.lng.toFixed(4)}` : '—';
  panel.innerHTML = `<h2>${t('route')}</h2><button class="btn pri" id="sensorDemo" style="width:100%">🧪 Scenario Lab · simulate heavy rain</button><button class="btn pri" id="hos" style="width:100%;margin-top:8px">🏥 Nearest hospital: show best path</button><div class="stale"><b>SCENARIO LAB — SIMULATION ONLY.</b> This controlled heavy-rain scenario uses deterministic sample sensors and an illustrative road graph. It does not change the live weather feed or create real reports/SOS records.</div><p class="mut">Other routes use OSRM road geometry and compare it with configured sample hazard zones and verified incident reports. A route score is not a safety guarantee.</p>
  <div class="card">Origin: <b>${p(S.org)}</b> <button class="btn" id="so">Use picked</button> <button class="btn" id="go">GPS</button><br>Destination: <b>${p(S.dst)}</b> <button class="btn" id="sd">Use picked</button></div>
  <div class="row"><select id="mode" style="width:auto"><option value="driving">Driving</option><option value="foot">Walking</option></select><button class="btn" id="calc">Compare routes</button></div><div id="out"></div><h3>Verified blocked streets</h3>${blockedPanel(null)}`;
  $('#so').onclick = () => { if (S.pick) { S.org = S.pick; V.route(); } }; $('#sd').onclick = () => { if (S.pick) { S.dst = S.pick; V.route(); } }; $('#go').onclick = () => locate((la, ln) => { S.org = { lat: la, lng: ln }; V.route(); });
  $('#calc').onclick = () => calcRoute($('#mode').value); $('#hos').onclick = nearestHospital; $('#sensorDemo').onclick = demoSensorRoute; bindBlocked();
};
async function demoSensorRoute() {
  $('#out').textContent = 'Calculating deterministic heavy-rain sensor route…';
  try {
    await loadData('heavy');
    const r = await api('/flood/route?from=GYE-DOWNTOWN-9OCT&to=GYE-BARCELONA&scenario=heavy');
    $('#out').innerHTML = `<h3>Scenario Lab result · heavy rain</h3><div class="card"><b>${r.totalDistanceKm} km alternate path</b> · weighted cost ${r.totalCost}<br>${r.path.map(x => `${esc(x.road)} (${x.distanceKm} km, elevation ${x.elevationM} m)`).join(' → ')}<div class="stale">Avoided: ${r.avoidedSegments.map(x => `${esc(x.road)} (${esc(x.sensor)} sensor)`).join(', ') || 'none'}<br>SIMULATED ONLY. Sensor readings and road graph are illustrative and unverified. Live weather was not modified.</div></div>`;
  } catch (e) { $('#out').innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
  finally { try { await loadData('baseline'); } catch {} }
}
async function calcRoute(mode) {
  if (S.hazardStale) return $('#out').innerHTML = '<div class="stale">Current hazard data is unavailable or stale. Route comparison is disabled until it can be refreshed.</div>';
  if (!S.org || !S.dst) return $('#out').innerHTML = '<div class="err">Set origin and destination.</div>'; $('#out').textContent = 'Requesting routes…';
  try { await loadData('baseline'); if (S.hazardStale) return $('#out').innerHTML = '<div class="stale">Current hazard data became stale during refresh. No route was calculated.</div>'; const r = await getRoutes(S.org, S.dst, mode); if (!r.ok || !r.routes.length) return $('#out').innerHTML = '<div class="stale">Routing service is unavailable. No route was calculated; try again when OSRM is reachable.</div>'; showResults(r.routes.map(x => ({ r: x })), true, 'Route comparison'); } catch (e) { $('#out').innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
}
async function nearestHospital() {
  if (S.hazardStale) return $('#out').innerHTML = '<div class="stale">Current hazard data is unavailable or stale. Hospital route comparison is disabled.</div>';
  if (!S.org && S.pick) S.org = S.pick;
  if (!S.org) return locate((la, ln) => { S.org = { lat: la, lng: ln }; nearestHospital(); });
  const hs = FAC.filter(f => f.type === 'hospital').sort((a, b) => dist(S.org.lat, S.org.lng, a.lat, a.lng) - dist(S.org.lat, S.org.lng, b.lat, b.lng)).slice(0, 2);
  if (!hs.length) return $('#out').innerHTML = '<div class="err">No hospitals in data.</div>'; $('#out').textContent = 'Finding best path to the nearest hospitals…';
  try { await loadData('baseline'); } catch (e) { return $('#out').innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
  if (S.hazardStale) return $('#out').innerHTML = '<div class="stale">Current hazard data became stale during refresh. No hospital route was calculated.</div>';
  const res = await Promise.all(hs.map(h => getRoutes(S.org, h, 'driving'))); const items = []; res.forEach((r, i) => r.routes.forEach(x => items.push({ r: x, h: hs[i] })));
  if (!items.length) return $('#out').innerHTML = '<div class="stale">Routing service is unavailable. No hospital route was calculated.</div>';
  const failed = res.filter(r => !r.ok).length;
  showResults(items, true, 'Best path to the nearest hospital', failed ? `<div class="stale">Routing service was unavailable for ${failed} hospital option${failed === 1 ? '' : 's'}; only successful routes are shown.</div>` : '');
}
V.services = async () => {
  const q = S.pick ? `?lat=${S.pick.lat}&lng=${S.pick.lng}` : ''; const r = await cached('c_fac', '/safe-locations' + q);
  panel.innerHTML = `${staleNote(r.stale)}<h2>${t('services')}</h2><div class="mut">${S.pick ? 'Sorted by distance from your picked point.' : 'Tap the map to sort by distance.'} ${esc(r.d.note)}</div>
  ${r.d.facilities.map(f => `<div class="card"><b>${esc(f.name)}</b> ${tag(f.verified ? 'verified' : 'awaiting', f.verified ? 'verified' : 'unverified')}<div class="mut">${esc(f.type)}${f.distanceKm != null ? ' · ' + f.distanceKm + ' km' : ''} · ${esc(f.source)}</div>
  <div class="row"><button class="btn" data-z="${f.lat},${f.lng}">Map</button>${f.type === 'hospital' ? `<button class="btn pri" data-h="${f.lat},${f.lng},${esc(f.name)}">Best path (shows blocked streets)</button>` : ''}<a class="btn" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${f.lat},${f.lng}">Directions</a>${f.phone ? `<a class="btn" href="tel:${esc(f.phone)}">Call</a>` : ''}</div></div>`).join('')}`;
  panel.querySelectorAll('[data-z]').forEach(b => b.onclick = () => { const [la, ln] = b.dataset.z.split(',').map(Number); map.setView([la, ln], 16); });
  panel.querySelectorAll('[data-h]').forEach(b => b.onclick = () => { const [la, ln] = b.dataset.h.split(','); S.dst = { lat: +la, lng: +ln }; if (!S.org && S.pick) S.org = S.pick; S.tab = 'route'; render().then(() => S.org ? calcRoute('driving') : locate((a, o) => { S.org = { lat: a, lng: o }; calcRoute('driving'); })); });
};
V.guide = () => panel.innerHTML = `<h2>${t('guide')}</h2><div class="card"><b>Before / during</b><ul><li>Never drive or walk through moving or unknown-depth water.</li><li>Move to higher ground early; do not wait for official confirmation if water is rising.</li><li>Stay away from power lines and open drains.</li><li>Keep documents, medicine and a charged phone in a bag.</li><li>Emergency: <a href="tel:911">911</a> (Ecuador).</li></ul></div><p class="mut">Guidance is general and cached for offline reading. FloodSense is a prototype and does not replace official authorities.</p>`;
const ytId = u => { const m = /(?:v=|youtu\.be\/|embed\/|live\/)([\w-]{11})/.exec(u || '') || /^([\w-]{11})$/.exec((u || '').trim()); return m ? m[1] : ''; };
const SH = { open: ['low', 'Open'], closed: ['rejected', 'Closed'], unknown: ['moderate', 'Unknown'] };
V.chat = async () => {
  const [n, sh, ch] = await Promise.all([api('/news'), api('/shops'), api('/chat')]); const vid = localStorage.vid || n.videoId, adm = S.user && S.user.role === 'admin', mod = S.user && ['moderator', 'admin'].includes(S.user.role);
  const msgs = list => list.map(m => `<div class="card"><b>${esc(m.name)}</b> ${m.role === 'moderator' || m.role === 'admin' ? tag('low', m.role) : ''}<span class="mut"> · ${fmt(m.at)}</span>${mod ? ` <button class="btn" data-d="${m.id}">Delete</button>` : ''}<div>${esc(m.text)}</div></div>`).join('');
  panel.innerHTML = `<h2>Official news and live video</h2>${vid ? `<div style="aspect-ratio:16/9"><iframe style="width:100%;height:100%;border:0;border-radius:8px" src="https://www.youtube-nocookie.com/embed/${esc(vid)}" title="Official video" allow="encrypted-media; picture-in-picture" allowfullscreen></iframe></div><div class="mut">Video chosen by ${localStorage.vid ? 'you (this device only)' : 'an administrator'}. Check that the channel is official.</div>` : `<div class="card mut">${esc(n.note)}</div>`}
  <div class="row"><input id="vu" placeholder="Paste an official YouTube video/live link" aria-label="YouTube link"><button class="btn" id="vgo">Play</button>${adm ? '<button class="btn" id="vpub">Publish to all</button>' : ''}${localStorage.vid ? '<button class="btn" id="vclr">Clear</button>' : ''}</div>
  <div class="card"><b>Official sources</b> (open in a new tab)<br>${n.links.map(([l, u]) => `<a target="_blank" rel="noopener" style="color:var(--info)" href="${esc(u)}">${esc(l)}</a>`).join(' · ')}</div>
  <h2>Shops: open or closed?</h2><div class="mut">${esc(sh.note)}</div>
  ${sh.shops.map(x => `<div class="card"><div class="row"><b>${esc(x.name)}</b>${tag(SH[x.status][0], SH[x.status][1])}</div><div class="mut">Reported ${fmt(x.updated)}</div><div class="row"><button class="btn" data-ss="${x.id}:open">Open</button><button class="btn" data-ss="${x.id}:closed">Closed</button><button class="btn" data-z="${x.lat},${x.lng}">Map</button></div></div>`).join('')}
  <div class="card"><b>Add a shop at the picked map point</b><input id="sn" placeholder="Shop name"><div class="row" style="margin-top:6px"><button class="btn" id="sa1">Add as open</button><button class="btn" id="sa2">Add as closed</button></div></div>
  <h2>Public chat</h2><div class="mut">Unmoderated user messages. Not official information.</div><div id="msgs">${msgs(ch.messages)}</div>
  <form id="cf"><label>Name</label><input id="cn" maxlength="24" value="${esc(localStorage.cn || '')}" placeholder="Guest"><label>Message</label><input id="ct" maxlength="300" required><button class="btn pri" style="margin-top:8px">Send</button></form><div id="cerr" class="err"></div>`;
  const play = id => { localStorage.vid = id; V.chat(); };
  $('#vgo').onclick = () => { const id = ytId($('#vu').value); id ? play(id) : alert('Not a valid YouTube link'); }; if ($('#vclr')) $('#vclr').onclick = () => { delete localStorage.vid; V.chat(); };
  if (adm) $('#vpub').onclick = async () => { try { await api('/admin/news', { method: 'PUT', body: { video: $('#vu').value } }); delete localStorage.vid; V.chat(); } catch (e) { alert(e.message); } };
  panel.querySelectorAll('[data-ss]').forEach(b => b.onclick = async () => { const [id, st] = b.dataset.ss.split(':'); try { await api(`/shops/${id}/status`, { method: 'POST', body: { status: st } }); V.chat(); } catch (e) { alert(e.message); } });
  panel.querySelectorAll('[data-z]').forEach(b => b.onclick = () => { const [la, ln] = b.dataset.z.split(',').map(Number); map.setView([la, ln], 17); });
  const add = st => async () => { if (!S.pick) return alert('Tap the map to choose the shop location first.'); try { await api('/shops', { method: 'POST', body: { name: $('#sn').value, status: st, ...S.pick } }); V.chat(); } catch (e) { alert(e.message); } };
  $('#sa1').onclick = add('open'); $('#sa2').onclick = add('closed');
  const bindDel = () => panel.querySelectorAll('[data-d]').forEach(b => b.onclick = async () => { await api('/chat/' + b.dataset.d, { method: 'DELETE' }); V.chat(); }); bindDel();
  $('#cf').onsubmit = async e => { e.preventDefault(); localStorage.cn = $('#cn').value; try { await api('/chat', { method: 'POST', body: { name: $('#cn').value, text: $('#ct').value } }); $('#ct').value = ''; const c = await api('/chat'); $('#msgs').innerHTML = msgs(c.messages); bindDel(); } catch (er) { $('#cerr').textContent = er.message; } };
  chatTimer = setInterval(async () => { if (S.tab !== 'chat' || document.activeElement === $('#ct') && $('#ct').value) return; try { const c = await api('/chat'); $('#msgs').innerHTML = msgs(c.messages); bindDel(); } catch {} }, 5000);
};
V.ops = async () => {
  const src = await api('/sources/status');
  const login = S.user ? `<div class="card">Signed in: <b>${esc(S.user.name)}</b> (${S.user.role}) <button class="btn" id="out">Sign out</button></div>` : `<div class="card"><b>Demo sign-in</b> (real auth is out of prototype scope)<label for="demoKey">Local demo key (privileged roles only)</label><input id="demoKey" type="password" autocomplete="off" placeholder="Configured by the operator"><div class="mut">Privileged demo roles work only on a local server configured with a matching key; never use a production credential here.</div><div class="row" style="margin-top:6px">${['resident', 'moderator', 'responder', 'admin'].map(r => `<button class="btn" data-r="${r}">${r}</button>`).join('')}</div></div>`;
  let h = login + `<h3>Data-source health</h3>${src.sources.map(s => `<div class="card"><div class="row"><b>${esc(s.name)}</b>${tag(s.status === 'connected' ? 'verified' : s.status === 'demo' ? 'demo' : 'rejected', s.status)}</div><div class="mut">${esc(s.type)} · last success ${fmt(s.lastSuccess)}<br>${esc(s.note)}</div></div>`).join('')}`;
  if (S.user && ['moderator', 'admin'].includes(S.user.role)) { const i = await api('/incidents'); h += `<h3>Moderation queue</h3>${i.incidents.filter(r => ['awaiting', 'corroborated'].includes(r.status)).map(r => `<div class="card"><b>${esc(r.title)}</b> ${tag(r.status)}<div class="row"><button class="btn ok" data-v="${r.id}:verified">Verify</button><button class="btn" data-v="${r.id}:rejected">Reject</button></div></div>`).join('') || '<div class="mut">Queue empty.</div>'}`; }
  if (S.user && ['responder', 'admin'].includes(S.user.role)) { const s = await api('/responder/incidents'); h += `<h3>SOS incidents (private)</h3>${s.incidents.map(x => `<div class="card"><b>${esc(x.id)}</b> ${tag('high', x.status)} ${esc(x.type)}<div class="mut">${esc(x.description)}<br>📍 ${x.lat.toFixed(4)}, ${x.lng.toFixed(4)} · ${fmt(x.created)}</div><div class="row">${['acknowledged', 'assigned', 'en_route', 'resolved', 'unable_to_respond'].map(st => `<button class="btn" data-s="${x.id}:${st}">${st}</button>`).join('')}</div></div>`).join('') || '<div class="mut">No SOS requests.</div>'}`; }
  if (S.user && S.user.role === 'admin') { const a = await api('/admin/audit-logs'); h += `<h3>Audit log</h3><div class="card mut">${a.logs.slice(0, 12).map(l => `${fmt(l.at)} · ${esc(l.who)} · ${esc(l.action)} ${esc(l.target)}`).join('<br>')}</div><button class="btn" id="reset">Reset demo data</button>`; }
  h += `<h3>Guided demo scenario</h3><div class="card"><div id="demoSt" class="mut">Runs a browser-local scenario timeline. It does not write demo reports or SOS records into the shared incident database.</div><button class="btn pri" id="scn">Run next step</button></div>`;
  panel.innerHTML = h;
  panel.querySelectorAll('[data-r]').forEach(b => b.onclick = () => signIn(b.dataset.r)); if ($('#out')) $('#out').onclick = () => { S.token = S.user = null; whoami(); render(); };
  panel.querySelectorAll('[data-v]').forEach(b => b.onclick = async () => { const [id, st] = b.dataset.v.split(':'); await api(`/reports/${id}/verify`, { method: 'POST', body: { status: st } }); await loadData(); render(); });
  panel.querySelectorAll('[data-s]').forEach(b => b.onclick = async () => { const [id, st] = b.dataset.s.split(':'); await api(`/responder/incidents/${id}/status`, { method: 'PATCH', body: { status: st } }); render(); });
  if ($('#reset')) $('#reset').onclick = async () => { await api('/admin/reset-demo', { method: 'POST' }); await loadData(); render(); };
  $('#scn').onclick = nextStep;
};
async function signIn(role) { S.demoKey = $('#demoKey') ? $('#demoKey').value : S.demoKey; const r = await api('/login', { method: 'POST', body: { role, demoKey: S.demoKey } }); S.token = r.token; S.user = r.user; whoami(); render(); }
const whoami = () => $('#who').textContent = S.user ? S.user.name : '';
let step = 0;
function say(m) { let e = $('#toast'); if (!e) { e = document.createElement('div'); e.id = 'toast'; document.body.append(e); } e.innerHTML = `<span>${esc(m)}</span> <button class="btn pri" id="tn">Next step</button>`; $('#tn').onclick = nextStep; const d = $('#demoSt'); if (d) d.textContent = m; }
async function nextStep() {
  const messages = [
    '1/6 Scenario active: simulated heavy rainfall is introduced. Live weather and production records remain unchanged.',
    '2/6 Scenario report: SIM-REPORT-01 is created in the scenario timeline only (not in the incident database).',
    '3/6 Independent simulated witness: the scenario report becomes corroborated; this does not verify a real road condition.',
    '4/6 Scenario moderator action: SIM-REPORT-01 is marked verified inside the scenario timeline only.',
    '5/6 Scenario routing: request the deterministic heavy-rain route and inspect the avoided simulated segment.',
    '6/6 Scenario SOS: SIM-SOS-01 moves from received to acknowledged in the scenario timeline only. No real SOS record or dispatch was created.'
  ];
  try {
    if (step === 0) {
      S.sensorScenario = 'baseline';
      $('#demoSt').textContent = messages[step];
    } else if (step === 4) {
      S.org = { lat: -2.1944, lng: -79.8883 }; S.dst = { lat: -2.2011, lng: -79.9234 }; S.tab = 'route';
      await render(); await demoSensorRoute();
      say(messages[step]); step++; return;
    } else {
      $('#demoSt').textContent = messages[step];
    }
    const msg = messages[step];
    if (step === 5) step = -1;
    step++;
    const d = $('#demoSt'); if (d) d.textContent = msg;
    say(msg);
  } catch (e) {
    const d = $('#demoSt'); if (d) d.textContent = 'Scenario step failed: ' + e.message;
  }
}
async function signIn0(role) { const r = await api('/login', { method: 'POST', body: { role, demoKey: S.demoKey } }); S.token = r.token; S.user = r.user; }
let chatTimer;
async function render() { clearInterval(chatTimer); nav(); try { await V[S.tab](); } catch (e) { panel.innerHTML = `<div class="card err">Could not load: ${esc(e.message)}</div>`; } if (S.tab !== 'route') G.route.clearLayers(); }
function applyCity() {
  $('#city').textContent = city().label;
  document.title = `FloodSense — ${city().label}`;
  $('#demo').textContent = 'MIXED MODE: MODELLED WEATHER + DEMO HAZARDS · NOT FOR REAL EMERGENCY USE / MODO MIXTO: CLIMA MODELADO + RIESGOS DE DEMOSTRACIÓN · NO USAR EN EMERGENCIAS REALES';
  map.setView(city().center, city().zoom);
  G.route.clearLayers(); G.pick.clearLayers();
  S.pick = S.org = S.dst = null;
  drawLayers();
  setTimeout(() => map.invalidateSize(), 0);
}
$('#lang').onclick = () => { S.lang = S.lang === 'es' ? 'en' : 'es'; localStorage.lang = S.lang; $('#lang').textContent = S.lang === 'es' ? 'EN' : 'ES'; render(); };
$('#lang').textContent = S.lang === 'es' ? 'EN' : 'ES';
applyCity();
setInterval(() => $('#clock').textContent = new Date().toLocaleTimeString(S.lang === 'es' ? 'es-EC' : 'en-US', { timeZone: city().timezone }) + ' GYE', 1000);
async function syncPendingSos() {
  if (!navigator.onLine) return;
  const queue = JSON.parse(localStorage.pendingSos || '[]');
  if (!queue.length) return;
  const remaining = [];
  for (const item of queue) {
    try {
      const r = await api('/sos', { method: 'POST', body: item });
      localStorage.sos = JSON.stringify({ ref: r.ref, code: r.accessCode });
      if (S.tab === 'sos') {
        const msg = document.createElement('div'); msg.className = 'card good';
        msg.textContent = `Queued SOS accepted by FloodSense server: ${r.ref}. Official dispatch is not connected.`;
        panel.prepend(msg);
      }
    } catch (e) {
      remaining.push(item);
      if (e.status) {
        // Server explicitly rejected it; keep it visible for the user to decide what to do.
        item.lastError = `Server rejected request (HTTP ${e.status}): ${e.message}`;
      }
    }
  }
  localStorage.pendingSos = JSON.stringify(remaining);
  if (S.tab === 'sos') V.sos();
}
addEventListener('online', () => { loadData(); syncPendingSos(); });
addEventListener('offline', () => { $('#net').textContent = 'offline'; $('#net').className = 'tag t-high'; });

loadData().then(render).catch(() => render());
if (navigator.onLine) syncPendingSos();
