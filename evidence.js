'use strict';

// Deterministic evidence fusion for the FloodSense prototype.
// This module deliberately separates hazard severity, evidence confidence,
// consequences, and recommended actions. It is not a calibrated probability.
const WINDOWS = {
  rainfall: 60 * 60e3,
  tide: 3 * 3600e3,
  water_level: 30 * 60e3,
  citizen_report: 24 * 3600e3,
  road_status: 3 * 3600e3,
  terrain: 30 * 24 * 3600e3,
  sos: 30 * 60e3
};
const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const finite = n => typeof n === 'number' && Number.isFinite(n);
const radians = n => n * Math.PI / 180;
const distanceKm = (a, b, c, d) => {
  const h = Math.sin(radians(c - a) / 2) ** 2 + Math.cos(radians(a)) * Math.cos(radians(c)) * Math.sin(radians(d - b) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};
const timeMs = value => { const t = new Date(value).getTime(); return Number.isFinite(t) ? t : NaN; };
const defaultReliability = type => ({ rainfall: 0.45, tide: 0.45, water_level: 0.5, citizen_report: 0.25, road_status: 0.3, terrain: 0.7, sos: 0.1 }[type] || 0.2);
const label = (type, value) => ({ rainfall: 'rainfall observation', tide: 'tide observation', water_level: 'water-level observation', citizen_report: 'citizen report', road_status: 'road-status observation', terrain: 'terrain context', sos: 'SOS request' }[type] || String(type || 'unknown evidence'));

function normalize(item, nowMs, index) {
  const type = String(item && item.type || '');
  const observedAt = timeMs(item && (item.observedAt || item.created || item.updated));
  const ageMs = Number.isFinite(observedAt) ? Math.max(0, nowMs - observedAt) : Infinity;
  const maxAge = WINDOWS[type] || 24 * 3600e3;
  const freshness = Number.isFinite(ageMs) ? clamp(1 - ageMs / maxAge) : 0;
  const reliability = clamp(finite(item && item.reliability) ? item.reliability : defaultReliability(type));
  const lat = finite(item && item.lat) ? item.lat : null, lng = finite(item && item.lng) ? item.lng : null;
  const id = item && item.id || `${type}-${index}`;
  const sourceId = item && item.sourceId ? String(item.sourceId) : type === 'citizen_report' ? 'unknown-source' : id;
  return { ...item, type, observedAt: Number.isFinite(observedAt) ? new Date(observedAt).toISOString() : null, ageMs, freshness, reliability, lat, lng, id, sourceId, future: Number.isFinite(observedAt) && observedAt > nowMs + 60e3 };
}

function fuseEvidence({ lat, lng, evidence = [], roads = [], facilities = [], now = new Date().toISOString() }) {
  const nowMs = timeMs(now), targetLat = finite(lat) ? lat : null, targetLng = finite(lng) ? lng : null;
  const accepted = [], rejected = [], missing = [], conflicts = [];
  const normalized = Array.isArray(evidence) ? evidence.slice(0, 250).map((e, i) => normalize(e, nowMs, i)) : [];
  normalized.forEach(e => {
    if (!WINDOWS[e.type]) { rejected.push({ id: e.id, reason: 'unsupported_evidence_type' }); return; }
    if (e.type === 'sos') { rejected.push({ id: e.id, reason: 'sos_is_help_request_not_flood_confirmation' }); return; }
    if (!e.observedAt) { rejected.push({ id: e.id, reason: 'missing_observation_time' }); return; }
    if (e.future) { rejected.push({ id: e.id, reason: 'future_observation' }); return; }
    if (e.freshness <= 0) { rejected.push({ id: e.id, reason: 'stale_observation' }); return; }
    const invalidMeasurement = e.type === 'rainfall' && (!finite(e.valueMmH) || e.valueMmH < 0) || e.type === 'tide' && (!finite(e.tideHeightM) || e.tideHeightM < 0) || e.type === 'water_level' && (!finite(e.valueM) || e.valueM < 0) || e.type === 'road_status' && !['open', 'closed', 'impassable', 'unknown'].includes(String(e.status).toLowerCase());
    if (invalidMeasurement) { rejected.push({ id: e.id, reason: 'invalid_measurement' }); return; }
    if (targetLat !== null && targetLng !== null && ['water_level', 'citizen_report', 'road_status', 'terrain'].includes(e.type) && (e.lat === null || e.lng === null)) { rejected.push({ id: e.id, reason: 'missing_location' }); return; }
    if (targetLat !== null && targetLng !== null && e.lat !== null && e.lng !== null) {
      const radius = e.type === 'terrain' ? 5 : 2;
      e.distanceKm = distanceKm(targetLat, targetLng, e.lat, e.lng);
      if (e.distanceKm > radius) { rejected.push({ id: e.id, reason: 'outside_spatial_window', distanceKm: +e.distanceKm.toFixed(2) }); return; }
    }
    e.weight = +clamp(e.reliability * e.freshness).toFixed(3);
    accepted.push(e);
  });

  const reportGroups = [];
  accepted.filter(e => e.type === 'citizen_report').forEach(report => {
    let group = reportGroups.find(g => g.category === report.category && g.lat !== null && report.lat !== null && distanceKm(g.lat, g.lng, report.lat, report.lng) <= 0.15 && Math.abs(timeMs(g.observedAt) - timeMs(report.observedAt)) <= 3 * 3600e3);
    if (!group) { group = { category: report.category || 'other', lat: report.lat, lng: report.lng, observedAt: report.observedAt, reports: [], sources: new Set() }; reportGroups.push(group); }
    group.reports.push(report); group.sources.add(report.sourceId);
  });
  reportGroups.forEach((group, i) => {
    const strongest = Math.max(...group.reports.map(r => r.weight));
    const independentBonus = Math.min(0.25, Math.max(0, group.sources.size - 1) * 0.08);
    group.weight = +clamp(strongest + independentBonus).toFixed(3);
    group.id = `report-group-${i + 1}`;
    group.reports.forEach(r => { r.duplicateGroup = group.id; });
  });
  const reportSourceWeights = new Map();
  reportGroups.forEach(group => group.reports.forEach(report => { reportSourceWeights.set(report.sourceId, Math.max(reportSourceWeights.get(report.sourceId) || 0, group.weight)); }));
  const independentSources = reportSourceWeights.size;
  const independentGroups = Math.min(reportGroups.length, independentSources);
  const physicalWeights = accepted.filter(e => e.type !== 'citizen_report').map(e => e.weight);
  const confidence = +((1 - [...reportSourceWeights.values(), ...physicalWeights].reduce((remaining, weight) => remaining * (1 - weight), 1))).toFixed(3);
  const water = accepted.filter(e => e.type === 'water_level' && finite(e.valueM));
  const rainfall = accepted.filter(e => e.type === 'rainfall' && finite(e.valueMmH));
  const tide = accepted.filter(e => e.type === 'tide' && finite(e.tideHeightM));
  const roadsNear = accepted.filter(e => e.type === 'road_status');
  const maxWaterRatio = water.length ? Math.max(...water.map(e => e.valueM / (finite(e.thresholdM) && e.thresholdM > 0 ? e.thresholdM : 1))) : 0;
  const maxRise = water.length ? Math.max(...water.map(e => finite(e.rateMPerHour) ? e.rateMPerHour : 0)) : 0;
  const maxRainRatio = rainfall.length ? Math.max(...rainfall.map(e => e.valueMmH / 50)) : 0;
  const maxTideRatio = tide.length ? Math.max(...tide.map(e => e.tideHeightM / (finite(e.thresholdM) && e.thresholdM > 0 ? e.thresholdM : 2))) : 0;
  const blocked = roadsNear.some(e => ['closed', 'impassable'].includes(String(e.status).toLowerCase()));
  const terrainHigh = accepted.some(e => e.type === 'terrain' && ['high', 'critical'].includes(String(e.level).toLowerCase()));
  const reportSignal = clamp(independentSources / 3) * 0.35;
  const hazardIndex = +clamp(maxWaterRatio * 0.45 + clamp(maxRise / 0.3) * 0.2 + clamp(maxRainRatio) * 0.15 + clamp(maxTideRatio) * 0.1 + (blocked ? 0.3 : 0) + reportSignal + (terrainHigh ? 0.1 : 0)).toFixed(3);
  const hazardSeverity = hazardIndex >= 0.7 ? 'high' : hazardIndex >= 0.35 ? 'moderate' : hazardIndex > 0 ? 'low' : 'insufficient';
  const observed = accepted.length > 0;
  const state = hazardSeverity === 'high' ? 'severe' : (maxRise > 0.15 || independentSources >= 2) ? 'escalating' : hazardSeverity === 'moderate' ? 'watch' : observed ? 'observed' : 'no_signal';
  if (water.length && roadsNear.some(e => String(e.status).toLowerCase() === 'open') && blocked) conflicts.push('Road observations conflict: both open and blocked statuses are present.');
  if (water.length && roadsNear.some(e => String(e.status).toLowerCase() === 'open')) conflicts.push('Water-level evidence and an open-road observation disagree; verify location and observation times.');
  if (water.length && !water.some(e => finite(e.rateMPerHour))) missing.push('Water-level trend is unavailable for at least one observation.');
  if (!rainfall.length) missing.push('No rainfall observation in the evidence window.');
  if (!tide.length) missing.push('No tide observation in the evidence window.');
  if (!water.length) missing.push('No water-level observation in the evidence window.');
  if (!independentGroups) missing.push('No citizen report group in the evidence window.');
  if (!accepted.length) missing.push('No fresh, spatially relevant hazard evidence was accepted.');

  const affectedRoads = roads.filter(r => ['closed', 'impassable'].includes(String(r.status).toLowerCase()) && (!finite(r.distanceKm) || r.distanceKm <= 1.5)).map(r => ({ ...r, importance: r.importance || 'unknown' }));
  const affectedFacilities = facilities.filter(f => affectedRoads.some(r => Array.isArray(r.facilityIds) && r.facilityIds.includes(f.id))).map(f => ({ id: f.id, name: f.name, type: f.type, criticality: f.criticality || (f.type === 'hospital' ? 'critical' : 'unknown'), access: 'declared-road-relationship' }));
  const criticalFacilities = affectedFacilities.filter(f => f.criticality === 'critical');
  const consequenceLevel = criticalFacilities.length ? 'critical_access' : affectedRoads.length ? 'road_disruption' : 'none';
  const actions = [];
  const freshEvidenceIds = accepted.map(e => e.id);
  if (state === 'severe' || state === 'escalating') actions.push({ action: 'request_field_verification', rule: 'state_is_severe_or_escalating', evidenceIds: freshEvidenceIds, reason: 'Changing or corroborated evidence needs human confirmation.' });
  if (affectedRoads.length) actions.push({ action: 'avoid_affected_roads', rule: 'nearby_road_status_is_closed_or_impassable', evidenceIds: affectedRoads.map(r => r.id), reason: 'A reported road closure or impassable status is nearby.' });
  if (criticalFacilities.length) actions.push({ action: 'protect_critical_access', rule: 'closed_road_has_declared_critical_facility_relationship', evidenceIds: affectedRoads.map(r => r.id), reason: 'A declared road relationship may disrupt access to a critical facility.' });
  if (state === 'watch' || state === 'observed') actions.push({ action: 'monitor_and_refresh', rule: 'fresh_evidence_exists_without_severe_state', evidenceIds: freshEvidenceIds, reason: 'Evidence supports attention but not a confirmed severe event.' });
  if (!actions.length) actions.push({ action: 'collect_more_evidence', rule: 'no_action_rule_matched', evidenceIds: [], reason: 'Current evidence is insufficient for a stronger action.' });
  return {
    version: 'fusion-0.1', target: { lat: targetLat, lng: targetLng }, state, hazardSeverity,
    hazardIndex, evidenceConfidence: confidence, independentSources, observedEvidence: observed,
    trend: { waterRiseMPerHour: maxRise || null, direction: maxRise > 0 ? 'rising' : 'unknown' },
    conditions: { rainfallMmH: rainfall.length ? Math.max(...rainfall.map(e => e.valueMmH)) : null, tideHeightM: tide.length ? Math.max(...tide.map(e => e.tideHeightM)) : null },
    evidence: accepted.map(e => ({ id: e.id, type: e.type, sourceId: e.sourceId, observedAt: e.observedAt, freshness: +e.freshness.toFixed(3), reliability: e.reliability, weight: e.weight, duplicateGroup: e.duplicateGroup || null })),
    rejectedEvidence: rejected, reportGroups: reportGroups.map(g => ({ id: g.id, category: g.category, reportCount: g.reports.length, independentSources: g.sources.size, weight: g.weight })),
    consequences: { level: consequenceLevel, affectedRoads: affectedRoads.map(r => ({ id: r.id, name: r.name, status: r.status, distanceKm: r.distanceKm, importance: r.importance })), affectedFacilities },
    actions, conflicts, missing, explanation: `State ${state}; hazard severity ${hazardSeverity}; evidence confidence ${confidence}. Confidence reflects fresh, spatially relevant, reliability-weighted evidence and clustered reports, not a probability.`
  };
}

module.exports = { fuseEvidence, distanceKm };
