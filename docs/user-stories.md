# User stories covered by the E2E test

Each story maps to one of the role-based spec files under `tests/`.

| ID | Spec | Story |
|---|---|---|
| US-1 | `01-user-project` | Create a project |
| US-2 | `03-admin-datastores` | Automatic project approval |
| US-3 | `02-admin-buckets` | Private bucket |
| US-4 | `02-admin-buckets` | Upload data |
| US-5 | `02-admin-buckets` | Private-bucket user and credentials |
| US-6 | `03-admin-datastores` | Create a datastore |
| US-7 | `04-user-analysis` | Configure an analysis |
| US-8 | `04-user-analysis` | Run the federated analysis to execution |
| US-9 | `05-user-results` | Retrieve results |
| US-10 | `06-cleanup` | Tear everything down |

## US-1: Create a project

As an analyst, I want to create a project in the Hub with a master-image group, so that analyses in it run on an approved base image.

- I can log in to the Hub (authup realm picker → credentials).
- The project is created, named after the run, with the `python/use-cases` image group.
- Both nodes **and** the aggregator are attached (verified on the project page).

## US-2: Automatic project approval

As an analyst on staging, I want my project approved by the participating nodes without manual action, so that I can continue immediately.

- The project becomes selectable in each node's datastore form within 3 minutes.

## US-3: Private bucket

As a node data steward, I want to create a private bucket on my node's S3 (SeaweedFS) console, so that only authorised users can reach the data.

- I can log in to the S3 console and create the bucket (idempotent across reruns).
- Anonymous access to the bucket is rejected with 401 or 403 (only checked if `NODEx_S3_PUBLIC_URL` is set).

## US-4: Upload data

As a node data steward, I want to upload the demo dataset to my bucket, so that it is available for analysis.

- The CSV is uploaded via the console's Files upload and is still listed after a reload.

## US-5: Private-bucket user and credentials

As a node data steward, I want a dedicated user that can only read the bucket, so that the datastore uses least-privilege credentials.

- A user with Read + List permissions, scoped to the bucket, is created.
- Its generated access/secret key is captured and reused as the datastore credentials.

## US-6: Create a datastore

As a node administrator, I want to register the bucket as an S3 datastore linked to the project, so that analyses of that project can read the data.

- I can log in to the node UI ("Login with Hub").
- The datastore form is filled with "Autofill S3" plus the bucket name and captured keys, and registration reports success.

## US-7: Configure an analysis

As an analyst, I want to create an analysis in the project, upload my code, pick the image and entrypoint and lock it, so that it is ready to run.

- The analysis is created from the project's own Analyses tab (name + description).
- `analysis-halta.py` is uploaded, and `python/use-cases` → `fedstats` is selected with the file as entrypoint.
- The configuration can be locked, then built and distributed.

## US-8: Run the federated analysis to execution

As an analyst, I want the analysis to build, distribute and execute across all nodes, so that I get a result without coordinating node admins.

- Every node (2 nodes + aggregator) reaches execution on the Nodes tab.
- The federated run completes its iterations (e.g. 10 iterations across 2 nodes × 2,798 rows).

## US-9: Retrieve results

As an analyst, I want to download the results from the Hub, so that I can use the aggregated statistics.

- All four expected files are present: three plots and the text report.
- Each file downloads non-empty and opens — PNG magic bytes for the images, non-empty text for the report.

## US-10: Tear everything down

As an operator, I want the test to clean up after itself, so that staging is not left full of e2e artefacts.

- The analysis and project are deleted on the Hub.
- Each node's datastore, bucket and private-bucket user are deleted.
- Cleanup is resilient: already-removed targets are logged, not failed.

## Not covered

- Negative paths: wrong credentials, rejected projects or analyses, invalid uploads.
- Role and permission boundaries, such as a second user being denied access to the bucket or project.
- Correctness of the plots and of the SVM accuracy value.
- Convergence behaviour and per-iteration progress display.
- Manual approval flows (`AUTO_EXECUTE=false` adds per-node start clicks but is not exercised on staging).
