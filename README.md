# flame-e2e

End-to-end browser test for a FLAME / PrivateAIM instance. It drives **real Chrome**
through the full acceptance workflow and tears everything down afterwards:

1. **Project** — create a project with a master-image group (`python/use-cases`) and attach both nodes + the aggregator.
2. **Buckets** — on each node's S3 (SeaweedFS) console, create a private bucket, upload the demo CSV, and create a dedicated Read/List user whose access/secret keys are captured.
3. **Datastores** — on each node UI, register the bucket as an S3 datastore for the project, using the captured keys.
4. **Analysis** — create the HALTA analysis, upload the code, pick the `fedstats` image + entrypoint, lock, build and distribute it, and wait until all nodes report execution.
5. **Results** — download each of the four result files and verify each one opens.
6. **Cleanup** — delete the analysis, project, datastores, buckets and users.

> **Status: passing against staging.** The full suite was last run green end-to-end
> (see [Last run](#last-run)). Selectors in `tests/locators.ts` were mapped against
> the live staging DOM.

## Repository layout

```
.
├── tests/
│   ├── 01-user-project.spec.ts      # USER:       create the project
│   ├── 02-admin-buckets.spec.ts     # NODE ADMIN: buckets + upload + private-bucket user
│   ├── 03-admin-datastores.spec.ts  # NODE ADMIN: create the S3 datastores
│   ├── 04-user-analysis.spec.ts     # USER:       submit analysis + run to execution
│   ├── 05-user-results.spec.ts      # USER:       download each result file + verify it opens
│   ├── 06-cleanup.spec.ts           # delete analysis / project / datastore / bucket / user
│   ├── shared.ts                    # config, derived names, login/nav helpers, creds store
│   ├── global-setup.ts              # computes one RUN_ID per invocation (-> .run-id)
│   └── locators.ts                  # every selector, in one place
├── fixtures/
│   ├── analysis-halta.py                 # demo analysis (entrypoint)
│   ├── synthetic_eucare_1_labeled.csv    # demo data, node 1 (2,798 rows)
│   └── synthetic_eucare_2_labeled.csv    # demo data, node 2 (2,798 rows)
├── docs/user-stories.md             # user stories and acceptance criteria covered
├── playwright.config.ts
├── .env.example                     # configuration template
└── .github/workflows/typecheck.yml
```

## Requirements

- Node.js 20 or newer
- Google Chrome installed (the test uses `channel: 'chrome'`, so no Playwright browser download is needed)
- Network access to the Hub, both node UIs and both node S3 (SeaweedFS) consoles

## Setup

```bash
npm install
npx playwright install ffmpeg   # once, for failure-video capture
cp .env.example .env
```

Fill in `.env`. It is git-ignored; never commit it.

| Variable | Meaning |
|---|---|
| `HUB_URL`, `HUB_USER`, `HUB_PASS` | Staging Hub login. Also used for the node UI, which logs in through "Login with Hub" (authup) with these credentials |
| `HUB_REALM` | Realm to pick on the Hub login screen (default `master`) |
| `MASTER_IMAGE_GROUP`, `MASTER_IMAGE` | Master image is chosen by group then image — `python/use-cases` / `fedstats` |
| `NODE1_HUB_NAME`, `NODE2_HUB_NAME`, `AGG_HUB_NAME` | Node names exactly as shown in the Hub node picker |
| `NODEx_UI_URL` | Node UI base URL |
| `NODEx_S3_URL`, `NODEx_S3_USER`, `NODEx_S3_PASS` | S3 (SeaweedFS) console login — used to create the bucket, upload data and create the private-bucket user |
| `NODEx_S3_HOST`, `NODEx_S3_PORT`, `NODEx_S3_PROTOCOL` | Optional. How the node reaches the object store in the datastore form. Default to the SeaweedFS all-in-one values (`node-datastore-seaweedfs-all-in-one`, `8333`, `http`) — also filled by the form's "Autofill S3" button |
| `NODEx_S3_PUBLIC_URL` | Optional. Externally reachable S3 API URL; enables the anonymous-access check |
| `ANALYSIS_TIMEOUT_MIN` | Maximum wait for the analysis to finish (default 30) |
| `AUTO_EXECUTE` | `true` if staging approves and starts the analysis by itself; `false` adds a Start click on each node |
| `HEADLESS` | `true` for unattended runs |
| `IGNORE_HTTPS_ERRORS` | `true` only for self-signed node certificates |

Runtime-only overrides (not in `.env`): `RUN_ID` targets a prior run, `EXEC_DELAY_MS`
tunes the execution wait in 05 (default `120000`), `CLEANUP_DEBUG=true` dumps button
info while iterating on 06.

The datastore in 03 uses the **captured keys** of the private-bucket user created in
02 (persisted to `.e2e-s3-creds.json`, git-ignored); it falls back to
`NODEx_S3_USER` / `NODEx_S3_PASS` only if that file is missing.

## Run

```bash
npm run test:headed    # watch the browser (default here)
npm test               # headed or headless per HEADLESS in .env
npm run report         # HTML report with trace, video and screenshots of the last run
```

A full run takes as long as the image build plus the federated iterations; plan for
about 6–10 minutes.

### Role-based files and run order

The workflow is split by persona across six ordered spec files:

| File | Role | Does |
|---|---|---|
| `01-user-project` | User | Creates the project (group, both nodes + aggregator) |
| `02-admin-buckets` | Node admin | Buckets + data upload + private-bucket user |
| `03-admin-datastores` | Node admin | Creates the S3 datastores |
| `04-user-analysis` | User | Submits the analysis and runs it to execution |
| `05-user-results` | User | Downloads each result file and verifies it opens |
| `06-cleanup` | — | Deletes the analysis, project, datastores, buckets, users |

They chain against **one project per invocation** via `RUN_ID`. `global-setup.ts`
computes a single `RUN_ID` and writes it to `.run-id`; every spec (each in its own
worker) reads it, so `npm test` runs 01→06 against the same project. With the default
config (`workers: 1`, `fullyParallel: false`) the numeric filename prefixes keep the
order.

To run one file against an earlier run's project, export the same id:

```bash
RUN_ID=e2e-20261008094820 npx playwright test tests/03-admin-datastores.spec.ts
```

### As a scheduled routine

Example for cron, weekdays at 07:00:

```cron
0 7 * * 1-5 cd /path/to/flame-e2e && HEADLESS=true npm test >> e2e.log 2>&1
```

The exit code is non-zero on failure, so any scheduler or wrapper can alert on it.

## What is asserted

| Spec | Assertions |
|---|---|
| 01 | Project created and named after the run; both nodes **and** the aggregator attached (verified on the project page) |
| 02 | Bucket exists (idempotent create); CSV is listed after a reload; a Read/List user scoped to the bucket is created and its keys captured. Anonymous access returns 401/403 only if `NODEx_S3_PUBLIC_URL` is set |
| 03 | Project becomes selectable on the node (auto-approve, polled up to 3 min); datastore registration reports success |
| 04 | Analysis created in the project, code uploaded, `python/use-cases` → `fedstats` image + entrypoint selected, locked, built and distributed; **every node (2 nodes + aggregator) reaches execution** |
| 05 | All four result files download non-empty and open (PNG magic bytes for images, non-empty text for the report) |
| 06 | Analysis, project, both datastores, both buckets and both users are deleted |

Checks that could not run (e.g. the anonymous-access check without a public URL, or a
cleanup target that is already gone) are logged — `skipped-check` annotations in 02–05,
`cleanup-SKIP` lines in 06 — rather than silently passed.

The user stories behind these steps, and what the test does not cover, are in
[docs/user-stories.md](docs/user-stories.md).

## Last run

Full suite, single invocation, real Chrome — `RUN_ID=e2e-20261008094820`:

| # | Spec | Result | Time |
|---|---|---|---|
| 1 | 01 create project | ✅ | 11.2s |
| 2 | 02 node 1 bucket + upload | ✅ | 2.9s |
| 3 | 02 node 2 bucket + upload | ✅ | 2.3s |
| 4 | 03 node 1 datastore | ✅ | 12.5s |
| 5 | 03 node 2 datastore | ✅ | 12.5s |
| 6 | 04 analysis → execution | ✅ | 3.2m |
| 7 | 05 download + verify results | ✅ | 2.1m |
| 8 | 06 cleanup analysis + project | ✅ | 5.6s |
| 9 | 06 cleanup node 1 | ✅ | 9.4s |
| 10 | 06 cleanup node 2 | ✅ | 8.3s |

**10 passed (6.4m).** The federated run completed 10 iterations across 2 nodes ×
2,798 rows; cleanup removed every resource (`cleanup-ok` for the analysis, project,
both datastores, both buckets and both users), leaving staging clean.

## Design notes

- **One shared `RUN_ID` per run.** `global-setup.ts` writes `.run-id` so all six
  specs target the same project. Project, datastores and analysis carry the
  `e2e-<timestamp>` prefix; buckets use fixed per-node names (`node1-e2e-test`,
  `node2-e2e-test`) and are created idempotently.
- **Cleanup included.** 06 deletes everything the run created and is resilient — each
  deletion is best-effort and logged (`cleanup-ok` / `cleanup-SKIP`), so a partially
  torn-down run still removes what remains.
- **Private-bucket credentials.** 02 creates a dedicated SeaweedFS user (Read + List,
  scoped to the bucket), captures its generated access/secret key to
  `.e2e-s3-creds.json`, and 03 uses those in the datastore.
- **Login quirks handled.** The Hub login is the authup realm picker (`master`) + a
  Name/Password form submitted with Enter (a button click drops the OAuth params); the
  node UI uses "Login with Hub"; and switching UIs can show a localized
  "Continue as <user>" / "Als <user> fortfahren" account screen, which is clicked
  automatically.
- **No retries.** A retry would create a second project and analysis.
- **One CSV per node** (`_1` to node 1, `_2` to node 2).

## Demo data

The CSVs in `fixtures/` are synthetic. Do not add real patient data to this repository.

## CI

`.github/workflows/typecheck.yml` only compiles the test code on push and pull request.
The E2E run is not executed in GitHub Actions, because it needs staging credentials and
network access to the nodes.
