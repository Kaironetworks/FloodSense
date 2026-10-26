
# FloodSense

### Turning flood uncertainty into clearer, explainable decisions.

**A map-first flood-resilience and community-response prototype for
Guayaquil, Ecuador**

[Problem](#the-problem) · [Solution](#the-floodsense-approach) ·
[Architecture](#system-architecture) · [Run locally](#run-locally) ·
[API](#api-overview) · [Limitations](#honest-scope-and-limitations)
:::

------------------------------------------------------------------------

> **DEMO ONLY --- NOT FOR REAL EMERGENCY USE.**\
> FloodSense is a hackathon prototype. Its sensor readings, sample
> alerts, susceptibility areas, reports, and facilities may be simulated
> or fictional. It is not an official warning service, does not verify
> real-time flood conditions, and does not dispatch emergency services.
> In a real emergency, contact the relevant local emergency service
> directly.

## At a glance

FloodSense explores how a city-facing digital tool could help residents
and response teams make better-informed decisions during heavy rain and
possible urban flooding. It brings map-based situational awareness,
transparent risk explanations, community reports, route alternatives,
service information, and a privacy-conscious SOS workflow into one web
interface.

  ----------------------------------- -----------------------------------
  **Challenge context**               Heavy-rain and flood resilience in
                                      Guayaquil, Ecuador

  **Product type**                    Web-based decision-support
                                      prototype

  **Frontend**                        HTML, CSS, vanilla JavaScript,
                                      Leaflet

  **Backend**                         Node.js built-in HTTP server

  **Persistence**                     Local JSON file (`data/db.json`)

  **Runtime**                         Node.js 18 or newer

  **Dependencies**                    No npm package installation
                                      required by the current prototype

  **Operating mode**                  Demonstration data; selected public
                                      map/search/routing services require
                                      internet access
  ----------------------------------- -----------------------------------

## The problem

Heavy rain can turn a routine journey into a safety decision. Water
accumulates unevenly, road conditions change, drainage and elevation
affect local vulnerability, and information can be fragmented across
official notices, local observations, and service directories.

For residents, several practical questions arise:

-   Which areas have reported hazards or known flood susceptibility?
-   What information supports the displayed risk assessment---and what
    information is missing?
-   Is there a route alternative that avoids a known, modeled hazard?
-   Can a resident submit a location-based observation for review?
-   How can a person request help while keeping sensitive incident
    details out of public feeds?
-   How can a prototype communicate uncertainty instead of presenting
    incomplete information as fact?

The underlying challenge is not simply to place markers on a map. It is
to organize imperfect information into an interface that is
understandable, transparent about uncertainty, and designed around safer
decisions.

## The FloodSense approach

FloodSense combines several connected workflows in a single map-centered
application.

### 1. Map-based situational awareness

The map is the main workspace. Users can inspect the demonstration
geography, view available layers, search for places, use GPS where
browser permissions and device support allow it, and select a point for
an assessment.

### 2. Explainable risk assessment

The prototype uses a rule-based assessment (`rules-0.2`) that considers
available signals such as:

-   Demonstration warning information.
-   Sample flood-susceptibility zones.
-   Community reports, including verification state.
-   The nearest simulated sensor reading.

The application presents reasons and missing-data information alongside
an **estimated risk score**. The score is not a calibrated probability.
When evidence is insufficient, the intended behavior is to say so rather
than invent certainty.

### 3. Sensor-informed route demonstration

Five deterministic Guayaquil sensor nodes provide repeatable test inputs
for a heavy-rain scenario. Their readings and derived states are
explicitly simulated and unverified.

The route API includes a reproducible demonstration in which the
sensor-marked `Av. 9 de Octubre` segment is impassable and an
alternative toward the `Av. Barcelona` axis remains available. This
makes it possible to demonstrate a route-planning concept under
controlled conditions.

The broader route planner can use public OSRM road geometry and score
alternatives against modeled susceptibility areas and verified hazards.
If the external routing service is unavailable, the application may use
a straight-line fallback that must be understood as **not a
risk-optimized road route**.

### 4. Community observations with moderation

Residents can submit location-based reports. The prototype includes
validation, rate limiting, duplicate/corroboration handling, moderation
actions, report history, and audit entries. New submissions are not
automatically equivalent to verified ground truth.

### 5. SOS workflow with privacy boundaries

The SOS workflow records a request, provides an access code for the
resident to check its status, and supports responder status updates
through role-restricted operations. Public incident listings are
designed not to expose private SOS references and sensitive incident
details.

**Important:** this is a software workflow demonstration only. It is not
connected to official emergency dispatch, and no responder is
automatically notified by a real emergency service.

### 6. Community and service information

The prototype includes a service directory, community chat,
community-reported shop status, a guide, and an operations area for
demonstration roles and workflows. Sample facilities and community
content are not verified live information.

### 7. Bilingual and degraded-connectivity cues

The interface includes English and Spanish labels and displays
offline/stale-data cues using cached copies with their original
timestamps where supported. Some core map, search, and routing
experiences still rely on external services and an internet connection.

## Design principles

FloodSense is organized around five principles:

1.  **Explain, do not just score.** Show the signals behind an
    assessment and disclose missing data.
2.  **Separate observation from verification.** A community report,
    sample polygon, simulated sensor, and verified incident are
    different evidence types.
3.  **Avoid false reassurance.** A route recommendation is not a
    guarantee of safety.
4.  **Protect sensitive incident information.** SOS details should not
    appear in public feeds.
5.  **Make limitations visible.** A prototype should identify simulated,
    unavailable, stale, and unverified information instead of implying
    operational readiness.

## System architecture

``` text
┌─────────────────────────────────────────────────────┐
│                   Browser UI                        │
│ HTML · CSS · Vanilla JavaScript · Leaflet            │
│ Map · Layers · Assessments · Reports · SOS · Routes  │
└─────────────────────────┬───────────────────────────┘
                          │ HTTP / JSON
                          ▼
┌─────────────────────────────────────────────────────┐
│                 Node.js HTTP server                 │
│ Routing · Validation · Demo sessions · Permissions  │
│ Risk rules · Sensor scenario · Route response       │
└─────────────────────────┬───────────────────────────┘
                          │ Read / write
                          ▼
┌─────────────────────────────────────────────────────┐
│                Local JSON persistence               │
│                   data/db.json                      │
└─────────────────────────────────────────────────────┘

External browser-side / public services (when reachable):
OpenStreetMap tiles · Leaflet CDN · Nominatim search · OSRM routing
```

### Component responsibilities

  -----------------------------------------------------------------------
  Component                           Responsibility
  ----------------------------------- -----------------------------------
  `public/index.html`                 Application shell, UI structure,
                                      styling, and Leaflet inclusion

  `public/app.js`                     Client-side interactions, map
                                      behavior, API calls, rendering,
                                      language labels, and UI state

  `server.js`                         HTTP server, API routing,
                                      validation, demo-role sessions,
                                      risk assessment, deterministic
                                      sensor and route scenarios, and
                                      persistence

  `data/db.json`                      Local prototype data such as
                                      reports, sample alerts, zones,
                                      facilities, shops, chat, and SOS
                                      records

  `data/uploads/`                     Uploaded report-image storage used
                                      by the prototype

  `test.js`                           API smoke tests for core
                                      assessment, sensor, routing,
                                      report, SOS, permission, shop,
                                      chat, and admin flows
  -----------------------------------------------------------------------

### Data and trust model

FloodSense deliberately distinguishes between information sources and
states:

-   **Simulated sensor data:** deterministic inputs for repeatable
    demonstrations; not physical sensor telemetry.
-   **Sample alerts and zones:** illustrative prototype records; not a
    live official feed or authoritative street-level boundary.
-   **Community reports:** user-submitted observations that may require
    corroboration or moderation.
-   **Verified reports:** reports that passed the prototype's moderation
    workflow; this label does not independently guarantee real-world
    accuracy.
-   **Unverified facilities and shop status:** directory/community
    information that may be outdated or fictional.
-   **External routing geometry:** provided by a public routing service
    when available; route geometry alone does not prove that a road is
    passable.

## Technology stack

  -----------------------------------------------------------------------
  Technology                          How it is used
  ----------------------------------- -----------------------------------
  **HTML5 / CSS**                     Semantic structure, responsive
                                      layout, status cues, and accessible
                                      controls

  **Vanilla JavaScript**              Frontend interactions and API
                                      integration without a frontend
                                      framework

  **Leaflet**                         Interactive map, layers, markers,
                                      and route visualization

  **Node.js built-in modules**        HTTP server, file access,
                                      cryptographic random values for
                                      demo tokens, and filesystem
                                      persistence

  **JSON**                            Local persistence and API
                                      request/response format

  **OpenStreetMap**                   Base-map tiles and geographic
                                      context, subject to service
                                      availability and attribution
                                      requirements

  **Nominatim**                       Place search where available;
                                      subject to public-service usage
                                      policies

  **OSRM public demo server**         Road geometry and route
                                      alternatives where available; no
                                      service-level guarantee
  -----------------------------------------------------------------------

The current repository does **not** implement a React/TypeScript
frontend, PostgreSQL/PostGIS database, Prisma, a production
authentication provider, a live IoT ingestion pipeline, or a trained
machine-learning model. The prototype's assessment is rule-based.

## Run locally

### Requirements

-   Node.js **18 or newer**
-   A modern browser
-   Internet access for external map tiles, Leaflet CDN assets, place
    search, and public routing. Some interface and local API behavior
    can still be explored without every external service being
    available.

### Start the application

Clone or download the repository, open a terminal in the project
directory, then run:

``` bash
node server.js
```

Open:

``` text
http://localhost:3000
```

Alternatively, use the existing npm script:

``` bash
npm start
```

No `npm install` is required for the current zero-dependency Node.js
server.

### Run the smoke tests

``` bash
node test.js
```

or:

``` bash
npm test
```

The test script starts a temporary server on port `3999` and exercises
multiple API workflows. **Run tests only with demo/test data and inspect
the script before running it against valuable local state:** the current
test script temporarily removes and restores `data/db.json`. Do not run
it against a live presentation session or data you cannot restore. If a
test is interrupted, verify that the original database file is intact.

### Troubleshooting

-   **Port 3000 is occupied:** stop only the process you know belongs to
    an older FloodSense instance, or start with a different port using
    the `PORT` environment variable. On PowerShell:

    ``` powershell
    $env:PORT=3001
    node server.js
    ```

    Then open `http://localhost:3001`.

-   **The map is blank:** check internet access, browser developer
    tools, and whether Leaflet or tile requests are blocked. The base
    map and Leaflet are loaded from external services.

-   **Search or routing does not respond:** Nominatim and the OSRM
    public demo server are external dependencies and can be unavailable
    or rate-limited.

-   **A route is shown as a straight line:** treat it as a fallback
    visualization, not as a road route optimized for flood risk.

-   **Data appears stale/offline:** review the displayed timestamp and
    source status. Do not interpret cached data as current conditions.

## Demonstration scenarios

### Scenario A --- Heavy rain and an alternative route

1.  Open the Guayaquil view.
2.  Enable or inspect the demo sensor layer.
3.  Select the heavy-rain sensor route demonstration.
4.  Explain that the `Av. 9 de Octubre` sensor node is marked impassable
    in this deterministic scenario.
5.  Show the alternative route and the explanation of the illustrative
    elevation-aware graph.
6.  State clearly that the graph and readings are simulated, and the
    route is not a guarantee of safety.

The API scenario is:

``` text
GET /api/flood/sensors?scenario=heavy
GET /api/flood/route?from=GYE-DOWNTOWN-9OCT&to=GYE-BARCELONA&scenario=heavy
```

An intentionally unreachable route scenario is also available for
testing honest failure handling:

``` text
GET /api/flood/route?from=GYE-DOWNTOWN-9OCT&to=GYE-SINAI-VULN&scenario=heavy
```

### Scenario B --- Community report to moderated information

1.  Submit a location-based report.
2.  Show that it begins in an awaiting-verification state.
3.  Sign in using the prototype's demo role selector as a moderator.
4.  Verify or reject the report.
5.  Explain that moderation records the workflow state; it does not
    independently establish ground truth.

### Scenario C --- SOS privacy and status workflow

1.  Explain the emergency disclaimer before interacting with the form.
2.  Create a demonstration SOS with non-sensitive test content.
3.  Show the resident access-code/status workflow.
4.  Switch to the responder demonstration role and show the permitted
    status update.
5.  Explain that public incident endpoints are designed to exclude
    private SOS details.
6.  Explicitly state that official emergency dispatch is not connected.

Do not use real personal or emergency information in a public demo.

## API overview

The API uses JSON. Protected endpoints use a bearer token returned by
the demo login endpoint. Exact response fields and validation rules
should be checked in `server.js` and `test.js`.

  ---------------------------------------------------------------------------------------------------------------------------
  Method                  Endpoint                                                                    Purpose
  ----------------------- --------------------------------------------------------------------------- -----------------------
  `GET`                   `/api/health`                                                               Health and
                                                                                                      operating-mode check

  `POST`                  `/api/login`                                                                Create a prototype role
                                                                                                      session

  `GET`                   `/api/sources/status`                                                       Report
                                                                                                      source/configuration
                                                                                                      status

  `GET`                   `/api/alerts`                                                               Read demonstration
                                                                                                      alerts

  `GET`                   `/api/flood/zones`                                                          Read illustrative
                                                                                                      susceptibility polygons

  `GET`                   `/api/flood/sensors?scenario=heavy`                                         Read deterministic
                                                                                                      simulated sensor nodes

  `GET`                   `/api/flood/assessments?lat=-2.25&lng=-79.9`                                Assess a geographic
                                                                                                      point

  `GET`                   `/api/flood/route?from=GYE-DOWNTOWN-9OCT&to=GYE-BARCELONA&scenario=heavy`   Run the deterministic
                                                                                                      heavy-rain route
                                                                                                      scenario

  `GET`                   `/api/incidents`                                                            Read public community
                                                                                                      incident reports

  `POST`                  `/api/reports`                                                              Submit a community
                                                                                                      report

  `POST`                  `/api/reports/:id/verify`                                                   Moderator/admin
                                                                                                      verification or
                                                                                                      rejection

  `POST`                  `/api/reports/:id/resolve`                                                  Resolve a report
                                                                                                      through the permitted
                                                                                                      role

  `GET`                   `/api/news`                                                                 Read official-link and
                                                                                                      video configuration

  `GET` / `POST`          `/api/chat`                                                                 Read or submit
                                                                                                      community messages

  `DELETE`                `/api/chat/:id`                                                             Delete a message with
                                                                                                      required permissions

  `GET`                   `/api/shops`                                                                Read community-reported
                                                                                                      shop status

  `POST`                  `/api/shops`                                                                Submit a shop entry

  `POST`                  `/api/shops/:id/status`                                                     Update a shop's
                                                                                                      reported status

  `GET`                   `/api/safe-locations`                                                       Read the prototype's
                                                                                                      facility directory

  `POST`                  `/api/sos`                                                                  Create an SOS workflow
                                                                                                      record

  `GET`                   `/api/sos/:id?code=...`                                                     Retrieve status using
                                                                                                      the resident access
                                                                                                      code or an authorized
                                                                                                      role

  `POST`                  `/api/sos/:id/cancel`                                                       Cancel an SOS using the
                                                                                                      required access code

  `GET`                   `/api/responder/incidents`                                                  Read responder-only
                                                                                                      incident listings

  `PATCH`                 `/api/responder/incidents/:id/status`                                       Update incident status
                                                                                                      as an authorized
                                                                                                      responder/admin

  `GET`                   `/api/admin/overview`                                                       Read operational
                                                                                                      overview with required
                                                                                                      role

  `GET`                   `/api/admin/audit-logs`                                                     Read audit logs as an
                                                                                                      admin

  `POST`                  `/api/admin/reset-demo`                                                     Reset demonstration
                                                                                                      data as an admin
  ---------------------------------------------------------------------------------------------------------------------------

The application also serves the frontend and uploaded report images.
This table is a practical overview, not a substitute for the
implementation's actual request validation and response contracts.

## Security and privacy considerations

The prototype demonstrates several useful boundaries, but it is not a
production security architecture.

### Present in the prototype

-   Role checks on selected moderation, responder, and administrative
    operations.
-   Short-lived-in-process demo session tokens.
-   Input validation and sanitization in several submission paths.
-   Rate limits on selected endpoints.
-   A resident access-code workflow for SOS status.
-   Separation of private SOS details from the public incident listing.
-   Audit entries for selected operations.

### Not production-ready

-   The role picker is a demonstration mechanism, not real identity
    verification.
-   Session tokens are held in memory; production-grade account
    security, durable sessions, and revocation are not implemented.
-   The JSON file is not a concurrent, transactional database.
-   Production-grade CSRF protection, 2FA, full security monitoring, and
    formal security review are not implemented.
-   The prototype has not been established as compliant with
    emergency-management, privacy, or government procurement
    requirements.
-   The public map/search/routing dependencies have their own
    availability, terms, and rate limits.

Do not store real emergency records or personal information in this
prototype.

## Research and data integration status

FloodSense's architecture is designed to keep data provenance visible,
but **the current implementation does not connect the following sources
as live operational feeds**:

  -----------------------------------------------------------------------
  Source / capability                 Current status
  ----------------------------------- -----------------------------------
  INAMHI official weather/flood data  Not connected

  Ecuador SGR flood-susceptibility    Not connected; sample polygons are
  MapServer                           used

  Google Flood Hub                    Not connected

  ATM / Segura traffic or             Not connected
  road-closure feeds                  

  Physical IoT sensors or telemetry   Not implemented
  ingestion                           

  Live emergency-service dispatch     Not connected

  Verified real-time facility         Not connected
  availability                        

  Official live alert stream          Not connected
  -----------------------------------------------------------------------

The sample alerts, zones, and facilities are illustrative. Their
presence in the interface does not mean that the corresponding official
service has been integrated.

### A credible path toward a research-backed deployment

A production-oriented next phase would require a source-by-source
integration and validation effort:

1.  **Official source discovery:** confirm data availability, access
    permissions, update cadence, spatial coverage, licensing, and terms
    for each intended source.
2.  **Provenance metadata:** store the source, observation time,
    retrieval time, geographic coverage, confidence/quality notes, and
    expiry for each observation.
3.  **Geospatial data pipeline:** validate and normalize geometries and
    coordinate systems; use a geospatial database such as
    PostgreSQL/PostGIS when operational requirements justify it.
4.  **Sensor ingestion:** define device identity, authenticated
    transport, measurement units, calibration, missing-data rules,
    outlier detection, and telemetry freshness.
5.  **Risk-model validation:** compare model outputs with documented
    historical events and field observations; evaluate false negatives,
    false positives, and geographic bias.
6.  **Routing validation:** combine road geometry with verified closures
    and current hazard evidence; test unreachable routes and stale-data
    behavior; never equate shortest path with safest path.
7.  **Operational readiness:** establish security review, access
    controls, backups, monitoring, incident response, uptime
    expectations, and human responsibility for decisions.
8.  **Field validation:** conduct supervised testing with local
    stakeholders before making any public safety claim.

These are proposed next steps, not capabilities currently implemented.

## Current limitations and roadmap

### Current prototype limitations

-   Deterministic simulated sensors rather than physical IoT telemetry.
-   Rule-based estimated risk rather than a trained or validated
    predictive model.
-   Sample flood zones, alerts, reports, and facilities.
-   Local JSON persistence rather than a production database.
-   Demo role selection rather than production authentication.
-   External map, geocoding, and routing dependencies.
-   No real emergency dispatch, push notification, SMS/email alert
    pipeline, or server-sent live update stream.
-   No guarantee that a displayed route is safe or passable.
-   Chennai is a secondary interface/location concept, not a live
    Chennai flood-monitoring integration. Do not treat Guayaquil demo
    records as Chennai data.

### Proposed roadmap

**Stage 1 --- Prototype reliability** - Strengthen automated tests for
risk assessment, route avoidance, data isolation, SOS privacy, and
permission boundaries. - Improve clear failure states for unavailable
external services and unreachable routes. - Preserve source labels and
timestamps throughout the UI.

**Stage 2 --- Trusted data** - Integrate approved official data sources
with attribution and freshness checks. - Replace sample polygons and
facilities with validated datasets. - Add robust geospatial storage and
import validation.

**Stage 3 --- Operational resilience** - Implement secure identity,
authorization, monitoring, backups, and recovery. - Add authenticated
sensor ingestion and a documented device/data protocol. - Validate
routing and risk logic against real historical and field evidence.

**Stage 4 --- Supervised pilots** - Work with local authorities,
emergency responders, accessibility experts, and community
organizations. - Evaluate usability, false alarms, missed hazards, and
the consequences of incorrect guidance. - Only consider operational use
after formal validation, governance, and safety review.

## Contributing

Contributions that improve reliability, clarity, accessibility, testing,
provenance, and safety are welcome.

Before submitting a change:

1.  Explain the user problem or technical defect.
2.  Keep changes focused and preserve existing workflows.
3.  Add or update tests for behavioral changes.
4.  Distinguish real data from simulated, stale, and unverified
    information.
5.  Never introduce a claim of live integration without a working,
    attributable source.
6.  Document limitations and how the change was verified.

For a prototype intended to support safety-related decisions, an honest
limitation is better than an unverified promise.

## Acknowledgements and attribution

-   **OpenStreetMap contributors** --- map data; attribution is required
    when displaying the map.
-   **Leaflet** --- open-source interactive mapping library.
-   **Nominatim** --- public geocoding/search service, where used.
-   **OSRM** --- routing engine; the public demo service is used where
    available and has no service-level guarantee.

Review each service's current usage policy and terms before deploying
beyond a demonstration.

## Project status

FloodSense is a **hackathon / research prototype** intended to
demonstrate a possible decision-support workflow. It is not an official
flood-warning system, emergency dispatch platform, or validated
public-safety product.

**The goal is not to make uncertainty disappear. The goal is to make
uncertainty visible, organize available evidence, and help people ask
better questions before making a decision.**
