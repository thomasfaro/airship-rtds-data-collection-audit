---
title: RTDS Data Collection Audit — Risk Assessment
feature: rtds-data-collection-audit
generated: 2026-08-25
status: Draft — Pending Compliance Review
template: Airship Standard Risk Assessment (fallback)
source_prd: none — this is an internal tool, not a platform feature (see Provenance)
source_compliance_brief: docs/compliance/2026-08-25-data-protection-and-security-brief.md
version_assessed: 1.6.2
---

# RTDS Data Collection Audit — Risk Assessment

> **Status:** Draft · **Generated:** 2026-08-25 · **Version assessed:** 1.6.2
> **Template:** Airship Standard Risk Assessment
>
> This document must be reviewed and signed off by the compliance team before the tool is used more
> widely. Sections map 1:1 onto the Google Doc template for copying.

## Provenance, and what this is not

This assessment was generated from the code and from
[the data protection and security brief](../compliance/2026-08-25-data-protection-and-security-brief.md),
not from a PRD or a tech plan — neither exists, because this is an internal tool rather than a
platform feature. There is no feature manifest to record it in.

**This tool contains no AI.** No model, no inference, no LLM or ML provider, no prompt construction.
It is therefore outside the scope of the EU AI Act, ISO/IEC 42001 and Airship's BEES AI Compliance
Assessment. That matters for filing: an `ISO42K` label or a page under the AI space would
miscategorise it. What it *is* in scope for is data protection, because it streams a client's mobile
analytics through an employee's laptop and produces a deliverable from them.

Ratings below use High / Medium / Low as the template requires. Platform-level controls that Airship
verifies centrally — managed-endpoint full-disk encryption, MDM, corporate network controls — are
treated as present and are not re-flagged as gaps; where a rating depends on one, it says so.

## Section 1: Feature Overview

**Feature name:** RTDS Data Collection Audit
**Feature owner (PM):** _to be filled_
**Engineering lead:** _to be filled_
**Target launch date:** _to be filled_ — already in internal use, assessed at v1.6.2
**Availability:** Internal only. Not a customer-facing capability, not part of the platform, not
sold. It runs on an Airship employee's own machine, bound to loopback, and has no hosted component.

**Feature summary:**

The tool connects to a client's Airship Real-Time Data Streaming feed, captures the tracking events
it carries, and produces a tagging plan — an `.xlsx` and `.json` inventory of every custom event,
attribute, tag, screen and subscription list the client's apps actually send, with coverage figures
per platform and flags for anything obsolete. It answers a question that otherwise takes a client
weeks of internal archaeology: *what are we really tracking today?* A second surface, Live stream,
shows events arriving as they happen so an implementation can be checked in the moment. The problem
it solves is that data-collection audits were previously manual, inconsistent between consultants,
and slow enough that they were often skipped.

## Section 2: Data Classification

| Data type | Collected? | Stored? | Transmitted? | Retention period |
|---|---|---|---|---|
| **PII** (name, email, phone) | **Incidentally — yes.** Not requested as such, but arrives inside attribute values, custom event properties and tag values whenever the client put it there | **Yes** — value histograms, up to 200 distinct values per key, in `.stored-files/` | **Inbound** from RTDS; **outbound in the deliverable** — the export's value sheets | **30 days**, then deleted automatically; `RTDS_DCA_RETENTION_DAYS` to change or disable |
| **Device identifiers** | Yes — channel ID, named user ID, device type, app and SDK version | Yes — in the event-samples sidecar. The saved report keeps only counts, not the IDs | Inbound only. Not in the deliverable | **30 days**, then deleted automatically; `RTDS_DCA_RETENTION_DAYS` to change or disable |
| **Location data** | **No** — the `LOCATION` and `REGION` RTDS types are excluded from capture in code | No | No | n/a |
| **Behavioural / usage data** | Yes — this is the tool's purpose: custom events, screen views, tag changes, subscription lists, attribute operations | Yes — the analysis report | Inbound; taxonomy and values leave in the deliverable | **30 days**, then deleted automatically; `RTDS_DCA_RETENTION_DAYS` to change or disable |
| **Authentication credentials** | Yes — an RTDS bearer token and app key per project, entered by the user | Yes — AES-256-GCM in `config/rtds-profiles.json`, key in `config/.profiles-key` | Outbound to Airship in the `Authorization` header | Until the user deletes the project |
| **Third-party data** | No | No | No | n/a |
| **Other — raw event stream** | Opt-in only, on Live stream, via **Store raw data file** | Only when ticked: `live-{profile}-{uuid}.ndjson`. Audit captures never write raw events at all | No | **30 days**, then deleted automatically; `RTDS_DCA_RETENTION_DAYS` to change or disable |

**Data residency requirements.** The RTDS endpoint follows the project's region — US via
`connect.urbanairship.com`, EU via `connect.asnapieu.com` — so the read respects where the data is
held. **What the tool cannot control is where it lands:** the machine running it is wherever the
employee is. An EU client's event values can therefore come to rest on a laptop outside the EU. This
is a practice question, not a code defect, and it is carried as **R6** below.

**Third-party data sharing:** none. No client data is sent to any party other than back from Airship.
The only other outbound calls are read-only: GitHub for public SDK release dates and for the update
check. Fonts are bundled as of 1.6.1, so page loads contact nobody.

## Section 3: Risk Identification

| # | Risk description | Likelihood | Impact | Overall rating |
|---|---|---|---|---|
| **R1** | Personal data reaches a deliverable that then circulates. The export's value sheets carry values actually seen in the stream, so a client's email address or customer reference in an attribute lands in a file that travels by email | High | Medium | **Medium** |
| **R2** | Client data accumulates on an employee laptop without limit. **Mitigated in 1.6.2:** stored captures now expire after 30 days, so accumulation requires someone to have deliberately set `RTDS_DCA_RETENTION_DAYS=0` | Low | Medium | **Low** |
| **R3** | RTDS credentials become portable. `config/` holds both the encrypted tokens and the key that reads them, and the documented ZIP update step instructs copying that folder | Low | High | **Medium** |
| **R4** | Another process on the same machine reaches the local API. `GET /api/bootstrap` returns the local API key to any loopback caller, so the key defends against cross-origin browser access, not against local processes | Low | Medium | **Low** |
| **R5** | The updater replaces the application's own code. Both routes can rewrite the folder the tool runs from, which is code execution with the user's privileges | Low | High | **Medium** |
| **R6** | Client data crosses a jurisdiction. An EU project's event values can come to rest on a laptop outside the EU, since the tool controls the read region but not the machine | Medium | Medium | **Medium** |
| **R7** | Diagnostic logging writes identifiers to disk. With `RTDS_DEBUG_LOG=1` the RTDS request body, which carries audience filters such as named users and channel IDs, is written to a log in `/tmp` | Low | Low | **Low** |
| **R8** | A dependency vulnerability ships unnoticed. **Mitigated in 1.6.2:** CI now fails on high and critical advisories and Dependabot opens the fixing pull request. One moderate advisory is knowingly accepted below the threshold | Low | Low | **Low** |

**Overall risk rating for this feature: Medium.**

The rating is driven by **R1 and R6**, and both are about *practice* around a tool that works as
designed rather than defects in it — which is also why neither is resolved by writing more code. R2
belonged in that group when this assessment was first written; it has since been answered with code
instead, and now sits at Low. Nothing here is a stop-ship.

## Section 4: Risk Mitigations

| Risk # | Mitigation | Status | Owner |
|---|---|---|---|
| R1 | Both guides now state that exports carry real values and tell the reader to check the value sheets before forwarding a plan | **Implemented** (v1.6.1) | Tool author |
| R1 | A "taxonomy only, no values" export variant, for plans that will circulate widely | **Not addressed** — open decision | Author + Privacy |
| R2 | Deletion from the History screen removes the report and all three sidecar types together; live raw files are unlinked | **Implemented** | Tool author |
| R2 | Live sessions not marked "store raw" delete their temp file on disconnect; audit captures never write raw events | **Implemented** | Tool author |
| R2 | Stored captures expire automatically after 30 days, configurable through `RTDS_DCA_RETENTION_DAYS` and disableable with `0`. Runs at startup, announced in all three guides, and deletes every file sharing a capture's stem so no `.scope-{id}` sidecar of client values is left behind | **Implemented** (v1.6.2) | Tool author |
| R2 | The window itself — whether 30 days is right for a client deliverable's working copy | **Open** — a policy call, one line in `server/.env`; the mechanism no longer waits on it | Privacy |
| R3 | Tokens encrypted at rest with AES-256-GCM; secrets written `0600`, directories `0700`, both gitignored | **Implemented** | Tool author |
| R3 | Documentation now says the `config/` copy is a copy of credentials, and lists `.profiles-key` among the files never to share | **Implemented** (v1.6.1) | Tool author |
| R3 | Installing by clone rather than ZIP removes the copy step entirely, and is the documented recommendation | **Implemented** | Tool author |
| R3 | The tool makes exactly one kind of call to Airship — opening an event stream at `/api/events` — and never writes to the platform, so a leaked token exposes reading a client's stream, not modifying anything | **Implemented** | Tool author |
| R4 | Server binds `127.0.0.1` by default; every `/api` route except `/health` requires a loopback source and a 32-byte local key | **Implemented** | Tool author |
| R4 | The one route serving a file from disk validates the name and re-checks the resolved path is inside the storage directory, with a test asserting traversal returns 400 | **Implemented** | Tool author |
| R4 | Machine-level access control — OS session, managed endpoint | **Implemented** (platform) | — |
| R5 | On a git checkout the update is `--ff-only`, which proves the new history contains the old one; a dirty folder or detached HEAD refuses outright | **Implemented** | Tool author |
| R5 | The archive route is switched off at a single named constant while the repository is private, and its guards remain tested: strictly-forward versions, protected paths, traversal and symlink rejection, size cap, pinned hosts, per-hop redirect checks | **Implemented** | Tool author |
| R6 | The RTDS read follows the project's region, so data is fetched from the correct endpoint | **Implemented, partial** — governs the read, not the destination | Tool author |
| R6 | A practice rule on where EU client captures may be run and held | **Not addressed** — open decision | Privacy + Legal |
| R7 | Verbose logging is opt-in and off by default; even with it on, event summaries deliberately omit channel and named user | **Implemented** | Tool author |
| R8 | A `Dependency audit` CI job reads both lockfiles and fails on high and critical advisories; Dependabot opens the pull request that fixes what the job reports, weekly, for both workspaces and the workflow's own actions | **Implemented** (v1.6.2) | Tool author |
| R8 | Its first run cleared four live high-severity advisories, including a CSRF bypass in `react-router` (`GHSA-qwww-vcr4-c8h2`), within the existing semver ranges | **Implemented** (v1.6.2) | Tool author |
| R8 | One moderate advisory in `uuid`, reached through `exceljs`, is accepted below the threshold: the only fix is a breaking downgrade of the workbook writer the tool exists to produce | **Accepted, tracked** | Author + InfoSec |

**Residual risk after mitigations: Medium.**

Residual risk now sits almost entirely in the two questions code cannot answer: **R1**, disclosed in
the guides but not structurally removed, and **R6**, which waits on a practice rule rather than a
commit. R2 and R8 were in this paragraph when the assessment was written and have since been
mitigated; what remains of R2 is the choice of window, not the absence of one. R3, R4, R5 and R7 are
adequately controlled.

## Section 5: Regulatory and Compliance Considerations

Legal to confirm each characterisation — the notes below state the facts the code establishes, not a
legal conclusion.

- [x] **GDPR** — Applies. The tool processes personal data of clients' end users. Two points deserve
  attention. First, it creates **copies of client personal data outside the platform**, on employee
  endpoints, which is relevant to Article 17 deletion requests: a deletion honoured in the platform
  does not reach a value histogram sitting in someone's `.stored-files/`. Second, transfers: see R6.
  Data minimisation is genuinely strong — only five event types are requested, location types are
  excluded in code, and audit captures never persist raw events.
- [x] **CCPA / CPRA** — Applies on the same basis for US clients. Same deletion-reach point.
- [x] **PIPEDA** (Canada) — Likely applies where a client is Canadian; same basis.
- [x] **SOC 2 Type II** — Relevant to confidentiality and access control, since this is an internal
  tool holding client data on endpoints. The access control facts are in Section 6.
- [ ] **CAN-SPAM / TCPA** — Not applicable. The tool sends nothing; it only reads a stream.
- [ ] **HIPAA** — Not applicable. The tool has no health-data pathway of its own, though it cannot
  prevent a client writing such data into its own attributes.
- **Other:** **EU AI Act and ISO/IEC 42001 do not apply** — there is no AI in this tool. ISO/IEC
  27001 is likely relevant if Airship's certification covers internal tooling on endpoints; Legal
  and InfoSec to confirm scope.

**Notes.** The single most useful thing a reviewer can take from this section is that the tool's
compliance profile is that of *a copy of client data on a laptop*, not that of a platform service.
Every question worth asking follows from that.

## Section 6: Security Controls

- **Authentication.** The tool itself has no login: whoever holds the machine's session has the
  tool. Access to the API is gated by a 32-byte local key generated on first run, sent on every
  `/api` request. Authentication to Airship is the RTDS bearer token plus app key. Stated precisely
  so it is not over-read: the local key stops a page on another origin from driving the API through
  the browser; it does not isolate the tool from other processes on the machine, because
  `/api/bootstrap` will hand the key to any loopback caller.
- **Authorization.** No roles and no permission model — by design, for a single-user local tool. What
  bounds the blast radius is the RTDS token's own scope: read-only streaming for the projects the
  user added.
- **Encryption at rest.** Tokens: yes, AES-256-GCM with a locally generated 32-byte key, files
  `0600`. **Captured data: no** — saved reports, value sidecars, event samples and any kept raw
  NDJSON are written as plain JSON and NDJSON. They rely entirely on the endpoint's full-disk
  encryption, which is the platform control this assessment assumes is present. Worth stating
  explicitly because it is the assumption R2's Medium impact rating rests on.
- **Encryption in transit.** TLS to the Airship RTDS endpoint and to GitHub. Traffic between the
  browser and the local API is plain HTTP over loopback, which is appropriate — it never leaves the
  machine, and terminating TLS locally would add a certificate to manage without adding protection.
- **Audit logging.** Deliberately minimal, and deliberately free of personal data: verbose logging
  is opt-in, and even then event summaries omit channel and named user. The saved files are their own
  informal record — each carries its project and timestamp in the filename, and the History screen
  lists them. What does not exist is an **access log**: nothing records that a capture was run or a
  deliverable exported, and the informal record disappears with the files when they are deleted. For
  a tool holding client data on an endpoint, that is a reasonable thing for a reviewer to ask about.
- **Vulnerability assessment.** No formal review has been performed. What *has* been checked, in the
  brief and re-verified for this assessment: path traversal on the only file-serving route is guarded
  and covered by a test; every `child_process` call passes an argv array, with no shell interpolation
  anywhere, so there is no command-injection surface; the archive updater's guards each have tests.
  **Dependency scanning now exists** (**R8**): a CI job fails the build on high and critical
  advisories in either lockfile, and Dependabot opens the fixing pull request weekly. Its first run
  was not a formality — it failed, on four live high-severity advisories including a CSRF bypass in
  `react-router`, all since patched. Still not checked, and still recommended: an OWASP-style review
  of the local API surface by someone other than the author.

## Section 7: Compliance Sign-Off

| Role | Name | Sign-off date | Notes |
|---|---|---|---|
| Legal | | | |
| Information Security | | | |
| Privacy | | | |
| Compliance | | | |

**Final disposition:** Approved / Approved with conditions / Rejected

**Conditions (if any):** Two open decisions are the natural candidates — a practice rule for EU
client captures (**R6**) and a position on whether the values-bearing export should remain the
default (**R1**). A retention rule was the third when this assessment was drafted; the tool now
expires stored captures on its own, so all that is left of it is confirming that 30 days is the right
window, which is a setting rather than a condition.

**Date approved:**

---

## Copy Instructions

This document was generated from the Airship standard risk assessment structure (fallback), because
the Google Doc at the template URL requires sign-in and could not be parsed — and its title
indicates it holds the BEES AI review prompt rather than a risk assessment template, so the
structure below should be checked against whatever the current canonical template is.

1. Confirm the correct Google Doc template for a **non-AI** internal tool. This assessment follows
   the seven-section standard structure, and its headings map 1:1.
2. Copy each section above into the corresponding section of that document.
3. Fill in: Feature Owner, Engineering Lead and Target Launch Date, left blank above.
4. Update the sign-off table with reviewer names and dates.

**Filing note before publishing.** The skill's default destination is the Confluence AI space under
*Compliance & Risk Assessments*, with an `ISO42K` label on the tracking ticket. Neither fits: ISO/IEC
42001 is the AI management system standard, and this tool has no AI. Publish it where internal tools
handling client data belong, and label it accordingly.

There is no feature manifest in this repository to record the artefact paths in, so the two documents
reference each other directly instead.
