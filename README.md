# FloodSense — Prototype (Guayaquil)
Flood-safety decision-support prototype for Guayaquil. **DEMO DATA — NOT FOR REAL EMERGENCY USE.**

## Run (Node 18+, no npm install needed)
    node server.js          # http://localhost:3000
    node test.js            # API checks (auth, validation, SOS privacy, simulated sensors)
Internet is needed in the browser for map tiles (OpenStreetMap), Leaflet (unpkg), search (Nominatim) and routing (OSRM public demo).

## What works
- GIS map (Leaflet): toggle layers, legend, search, GPS, click-to-assess any point.
- Five deterministic Guayaquil sensor nodes are available at `/api/flood/sensors?scenario=heavy`; their water depth, elevation, drainage, tide and rainfall scenario values are explicitly simulated and unverified.
- Explainable risk score (rules-0.2): official warning + susceptibility zone + verified reports + nearest simulated sensor. Labeled "estimated risk score", never a probability; "Insufficient data" when no signals.
- Community reports: validation, rate limit, duplicate = corroboration, moderator verify/reject, history, audit log.
- SOS: private storage, access code for the resident, responder status updates, false-alarm cancel, honest "dispatch not connected" message, 911 link. SOS coordinates never appear in public endpoints.
- Route planner: OSRM alternatives, scored against susceptibility zones and verified hazards; falls back to a clearly-labeled straight line if routing is down.
- Services directory (distance sort, directions, unverified labeling), guide, ES/EN, offline/stale banner using cached copies with original timestamp.
- Ops tab: demo role sign-in, source-health, moderation queue, responder queue, audit log, reset demo, and a guided 6-step scenario (report → corroborate → verify → route → SOS → responder ack) using the real API.

## Honest status (prototype limits)
| Item | Status |
|---|---|
| INAMHI, SGR flood-susceptibility MapServer, Google Flood Hub, ATM/Segura | **Not connected.** Shown as "not_configured". Zones/alerts/facilities are fictional samples. |
| Database | JSON file (`data/db.json`), not PostgreSQL/PostGIS. |
| Auth | Demo role picker, in-memory tokens. No passwords/CSRF/2FA. |
| Photos, EXIF stripping, push/email/SMS, SSE live updates | Not implemented. |
| React/TS/Prisma stack, Playwright tests | Not implemented (vanilla JS prototype). |

## Next steps to production
1. Query `.../Susceptibilidad_de_Inundaciones/MapServer/<layer>/query?f=geojson` and load polygons into PostGIS.
2. Add INAMHI adapter (or manual attributed import), Flood Hub adapter (needs approved key in server env only).
3. Replace demo auth with Supabase Auth; move to Postgres; add uploads and SSE.

Attribution: © OpenStreetMap contributors; routing by OSRM public demo server (no SLA).
