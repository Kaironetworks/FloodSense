<div align="center">

# FloodSense

### City-adaptive flood intelligence. Safer decisions when every minute matters.

**See the risk. Share the evidence. Coordinate the response.**

<p>
  <img src="https://img.shields.io/badge/Urban%20Resilience-Flood%20Intelligence-176B5B?style=flat-square" alt="Urban resilience" />
  <img src="https://img.shields.io/badge/Risk-Explainable-315C8C?style=flat-square" alt="Explainable risk" />
  <img src="https://img.shields.io/badge/Language-English%20%2F%20Espa%C3%B1ol-7657A6?style=flat-square" alt="English and Spanish" />
  <img src="https://img.shields.io/badge/Stage-Working%20Prototype-B7791F?style=flat-square" alt="Working prototype" />
</p>

*A shared operational picture for people and response teams navigating urban flooding.*

</div>

---

## The idea

Flooding is not only a weather problem. It becomes a city-wide emergency when people cannot tell which roads may be blocked, whether a reported hazard is credible, where help is needed, or which essential services may still be reachable.

**FloodSense connects those decisions in one platform.** It combines location-based risk assessment, weather context, community observations, route exploration, essential-service discovery, SOS workflows, and responder operations. The aim is to help residents and response teams act on the best available evidence—while making uncertainty, missing data, and system limitations visible.

FloodSense is designed around three principles:

- **Evidence before certainty.** Show where information came from, when it was retrieved or observed, and whether it is stale, simulated, or unverified.
- **Resilience when sources fail.** A missing weather feed must not be mistaken for safe conditions or prevent unrelated workflows from functioning.
- **One connected workflow.** Public reports, verification, route decisions, SOS status, and response operations should inform a shared picture without exposing private information.

## At a glance

| Capability | What it does |
|---|---|
| **Live weather context** | Retrieves modelled current weather for Guayaquil through Open-Meteo, with source attribution, model time, retrieval time, and stale/unavailable states. |
| **Explainable risk assessment** | Combines configured warnings, susceptibility zones, recent verified reports, simulated sensor inputs, and available modelled rainfall into an estimated score with reasons and missing-data notes. |
| **Scenario Lab** | Runs a deterministic heavy-rain route scenario with explicitly simulated sensor readings and an illustrative road graph, separate from live weather values. |
| **Community evidence** | Accepts structured incident reports, checks nearby duplicates, tracks corroboration, and supports moderation, verification, and resolution. |
| **Hazard-aware route exploration** | Compares route alternatives against configured hazard zones, verified blocked-road reports, and clearly labelled simulated hazards. |
| **SOS workflow** | Creates private response records, returns an access code, supports status checks, and provides a local pending queue when the browser is offline. |
| **Essential-service discovery** | Displays configured hospitals, shelters, pharmacies, and fire stations with verification limitations made visible. |
| **Operations and oversight** | Provides demonstration roles, moderation and responder workflows, source-health visibility, and audit activity. |
| **Constrained-connectivity support** | Uses cached browser data with stale-state warnings, offers bilingual labels, and keeps key workflows usable when external map resources fail. |

## How the system fits together

```mermaid
flowchart TD
    A["Modelled weather source"] --> D["Evidence and freshness checks"]
    B["Warnings and configured hazard layers"] --> D
    C["Community reports and verification"] --> D
    E["Clearly labelled Scenario Lab inputs"] --> F["Isolated scenario workflow"]
    D --> G["Explainable risk assessment"]
    D --> H["Shared incident picture"]
    G --> H
    H --> I["Route comparison"]
    H --> J["Essential-service discovery"]
    H --> K["SOS and responder status"]
    H --> L["Moderation and operations"]
    F --> M["Scenario route demonstration"]
    I --> N["Resident and commuter interface"]
    J --> N
    K --> O["Restricted responder interface"]
    L --> P["Moderator and operator interface"]
```

The diagram represents the logical product architecture. It does not mean that every data source is live, every location has validated hazard coverage, or that FloodSense is connected to an official emergency-dispatch system.

## Two distinct modes: live context and Scenario Lab

FloodSense separates the available weather context from controlled demonstrations.

<details>
<summary><strong>Live Conditions — modelled weather</strong></summary>

The application requests current weather data from Open-Meteo for a configured point in Guayaquil. The interface distinguishes the provider's model time from the time FloodSense retrieved the response.

- Source and source type are identified.
- Modelled precipitation is not described as a direct rain-gauge measurement.
- A failed refresh can leave a cached value visible only with a stale warning.
- If no value is available, the interface says so instead of inventing a replacement.
- City-grid weather cannot establish street-level flood depth or prove a road is safe.

The current weather integration is a **modelled weather feed**, not a verified municipal sensor network or an official flood warning.
</details>

<details>
<summary><strong>Scenario Lab — controlled simulation</strong></summary>

The heavy-rain scenario uses deterministic sample sensors and an illustrative road graph to demonstrate how a simulated impassable segment can change the preferred path.

- Simulated rainfall, water depth, elevation, and road status are explicitly labelled.
- Scenario routing does not change the live weather feed.
- The guided scenario timeline uses browser-local demonstration steps rather than writing fake incident and SOS records into the shared incident database.
- Scenario results are not forecasts, observed incidents, or safe-navigation guarantees.
</details>

## One platform, multiple roles

<details>
<summary><strong>Residents and commuters</strong></summary>

- Review estimated local risk and available weather context.
- Report flooding, blocked roads, debris, drainage issues, and other hazards.
- Explore route alternatives and configured essential services.
- Create and track a prototype SOS request.
- See when information is cached, stale, simulated, or unavailable.
</details>

<details>
<summary><strong>Moderators and community verifiers</strong></summary>

- Review incoming reports.
- Verify, reject, or resolve reports.
- Review nearby duplicates and corroborating observations.
- Preserve the state and history of moderation actions.
</details>

<details>
<summary><strong>Responders</strong></summary>

- Review incidents through a restricted workflow.
- Acknowledge, assign, update, or resolve response records.
- Access SOS details through the responder workflow rather than public incident listings.
</details>

<details>
<summary><strong>Administrators and operators</strong></summary>

- Review operational summaries and source-health indicators.
- Manage selected operational content and demonstration workflows.
- Inspect audit activity and review reports that require attention.
</details>

These are demonstration roles, not verified institutional identities or production-grade access controls.

## Resilience is a data-quality problem

**Missing information is not evidence that conditions are safe.**

| Situation | FloodSense behaviour |
|---|---|
| Weather source returns a recent response | Display its model time, retrieval time, source, and modelled-data caveat. |
| Weather refresh fails but a cached response exists | Preserve the original timestamps and mark the value stale. |
| No weather value is available | Show unavailable state; do not fabricate a reading. |
| Location is outside configured Guayaquil coverage | Return an insufficient-coverage result instead of applying Guayaquil's sample hazards to arbitrary GPS coordinates. |
| A community report is unverified | Keep its verification state visible. |
| A route provider is unavailable | Do not present a failed or straight-line fallback as safe navigation. |
| Browser is offline | Label cached data and any locally queued SOS as not sent. |
| Scenario Lab is active | Identify its inputs as simulation and keep them separate from the live weather response. |

These are implemented behaviours where stated; they do not mean that every possible failure mode has been eliminated.

## SOS: separate from weather, honest about delivery

An SOS request must not depend on a successful weather API call. FloodSense keeps SOS submission separate from weather assessment and distinguishes three different states:

1. **Saved locally:** an offline request is stored in this browser only. It is labelled **NOT SENT — WAITING FOR CONNECTION**.
2. **Accepted by the FloodSense server:** the server has returned an incident reference and access code.
3. **Real-world help dispatched:** this is **not supported** by the current prototype; official emergency dispatch is not connected.

When connectivity returns while the page is open, the browser can retry locally queued requests. A request ID allows the server to recognize a retry and avoid creating a duplicate record. Local queuing is not a substitute for emergency communication, and browser storage is not a guaranteed delivery channel.

**If someone is in immediate danger, contact the relevant local emergency service directly.** For the current Guayaquil demonstration, the interface links to Ecuador's emergency number, 911.

## City-adaptive by design

FloodSense is intended to reuse the same workflows across cities while keeping local assumptions configurable.

- **Shared engine:** evidence handling, freshness checks, explainable assessment, report lifecycle, route comparison, SOS status, and role-aware operations.
- **City profile:** local coordinates and coverage, hazard layers, official sources, service directories, languages, thresholds, and emergency references.
- **Scenario profile:** controlled hazards used to exercise workflows without presenting simulated conditions as live alerts.

**Current coverage is Guayaquil, Ecuador.** Other cities are not automatically covered just because a user can select a GPS location. Until a city has its own configured and validated sources and hazard layers, the system should report insufficient coverage rather than reuse Guayaquil demo data.

Flood behaviour differs by terrain, drainage, rivers, coastlines, rainfall patterns, road networks, and local response procedures. City-specific models and data need local validation; one city's thresholds must not be treated as universal.

## Technology

| Layer | Current implementation |
|---|---|
| Server | Node.js built-in HTTP server (Node.js 18+) |
| Interface | HTML, CSS, browser-native JavaScript |
| Interactive map | Leaflet with OpenStreetMap tiles |
| Weather context | Open-Meteo forecast API, accessed server-side |
| Routing | OSRM public routing service for route alternatives; local deterministic graph for the isolated heavy-rain scenario |
| Evidence fusion | Deterministic rules in `evidence.js` for freshness, confidence, conflicts, hazard state, and consequences |
| Prototype persistence | Local JSON file (`data/db.json`) and local uploads |
| Browser resilience | Cached views, stale/offline indicators, and a local pending SOS queue |
| Validation | Node-based API regression tests and JavaScript syntax checks |

The lightweight stack keeps the prototype straightforward to run and inspect. It is not an assertion that JSON-file persistence or public demonstration services are suitable for mission-critical emergency operations.

## Quick start

Requirements: Node.js 18 or newer. No third-party npm packages are required by the current prototype.

```bash
npm start
```

Open `http://localhost:3000`. The interactive map, map tiles, address search, and public routing depend on external services and may be unavailable without internet access. Weather failure should produce an explicit unavailable/stale state rather than a fabricated value.

Run the included regression suite with `npm test`.

## API surface

The server exposes focused endpoints for:

- `/api/health` and `/api/sources/status` — application and integration health
- `/api/weather/current` — modelled weather, provenance, timestamps, and freshness
- `/api/flood/assessments` and `/api/flood/intelligence` — location assessment and evidence fusion
- `/api/flood/sensors` and `/api/flood/route` — labelled deterministic scenario inputs and route demonstration
- `/api/flood/replay` — isolated evidence-fusion evaluation
- `/api/incidents` and `/api/reports` — community incident workflow
- `/api/sos` and `/api/responder/incidents` — private SOS and responder workflow
- `/api/safe-locations`, `/api/shops`, and `/api/chat` — configured services and community information

Endpoint availability does not imply a live official integration. The source-health panel identifies integrations that are not configured.

## Trust boundaries and limitations

FloodSense is a **research and demonstration prototype**, not a certified flood-warning or emergency-dispatch system.

- **Risk model:** deterministic and explainable, but not a calibrated probability or validated machine-learning forecast.
- **Weather:** modelled city-grid weather is not a direct rain-gauge observation and does not establish street-level inundation.
- **Hazard layers and sensors:** configured susceptibility polygons, sensor values, elevation, drainage, and scenario roads may be samples or simulations.
- **Official data:** a complete verified municipal sensor network and official warning adapter are not currently connected.
- **Services:** sample facility locations may be incomplete or unverified; availability and accessibility are not guaranteed.
- **Routing:** depends on the external road network, routing service, hazard evidence, and report freshness. No route is guaranteed safe through floodwater.
- **Authentication:** demo roles are not production identity assurance. Privileged demo roles are intentionally restricted by local configuration.
- **Persistence:** JSON-file storage is not designed for high-concurrency writes, transactional recovery, or mission-critical operations.
- **SOS:** no official dispatch integration or guaranteed responder delivery.
- **Offline behaviour:** local storage and retry improve continuity but do not create a communication channel where none exists.

Never walk, drive, or wade through floodwater based solely on a map or score. Follow verified local authority instructions.

## Next engineering priorities

- [ ] Integrate official warnings and verified local hazard layers with provenance and freshness rules.
- [ ] Add source-specific quality checks and robust handling of conflicting observations.
- [ ] Replace sample service locations with maintained, verified city data.
- [ ] Improve route scoring with validated road closures and flood-depth evidence where available.
- [ ] Validate assessment logic against documented events and local expert review before making predictive claims.
- [ ] Move from JSON persistence to a transactional database before any real deployment.
- [ ] Implement production identity, access control, monitoring, backups, and security review.
- [ ] Add city profiles only alongside suitable local data, procedures, and validation.

---

<div align="center">

**FloodSense**  
*City-adaptive flood intelligence for safer decisions and coordinated urban response.*

</div>
