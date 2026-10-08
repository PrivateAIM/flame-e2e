/**
 * NODE ADMIN — Data store creation.
 *
 * On each node UI (/data-stores/create), create an S3 datastore for the project
 * pointing at the node's bucket, using the private-bucket user's keys captured
 * in 02. Flow: pick the project, click "Autofill S3" (sets type=S3 + the
 * SeaweedFS host/port), then fill bucket name, Private, and the access/secret
 * keys. Requires the project (01) to be approved/selectable on the node and the
 * bucket (02) to exist.
 */
import { test } from '@playwright/test';
import {
  nodeUi, expect, join,
  NODES, PROJECT, nodeUiLogin, loadS3Creds,
} from './shared';

test.describe.configure({ mode: 'serial' });

for (const n of NODES) {
  test(`admin node ${n.idx}: create S3 datastore for "${PROJECT}"`, async ({ page }) => {
    const creds = loadS3Creds(n.idx);
    const accessKey = creds?.accessKey ?? n.s3User;
    const secretKey = creds?.secretKey ?? n.s3Pass;

    await nodeUiLogin(page, n);
    await page.goto(join(n.uiUrl, nodeUi.dataStoreCreatePath));

    // Select the project. Auto-approval is asynchronous, so retry opening the
    // dropdown until the project is offered (filtering the long list by name).
    await expect(async () => {
      await nodeUi.dsProjectSelect(page).click();
      const filter = nodeUi.dsSelectFilter(page);
      if (await filter.isVisible().catch(() => false)) await filter.fill(PROJECT);
      await nodeUi.dsSelectOption(page, PROJECT).click({ timeout: 5_000 });
    }, 'project never became selectable on the node (not approved/propagated?)').toPass({
      timeout: 180_000,
      intervals: [5_000, 10_000, 15_000],
    });

    // Name the datastore after the project/run.
    await nodeUi.dsName(page).fill(`${PROJECT}-ds`);

    // Autofill S3 sets type=S3 and the SeaweedFS host/port; then the S3 fields.
    await nodeUi.autofillS3(page).click();
    await nodeUi.dsBucket(page).fill(n.bucket);
    await nodeUi.dsPrivate(page).click();
    await nodeUi.dsAccessKey(page).fill(accessKey);
    await nodeUi.dsSecretKey(page).fill(secretKey);

    await nodeUi.dsSubmit(page).click();

    // Wait for the registration to complete — do NOT navigate away first, or the
    // async POST is cancelled. Success is a toast, then a redirect to analyses.
    await expect(
      nodeUi.dsSuccess(page),
      'datastore registration did not report success',
    ).toBeVisible({ timeout: 30_000 });
  });
}
