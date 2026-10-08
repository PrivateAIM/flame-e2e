/**
 * CLEANUP — remove everything this run created.
 *
 * Hub: delete the analysis (left-sidebar Analyses -> open it -> red delete,
 * top-right), then the project (left-sidebar Projects -> open it -> delete bin).
 * Per node: delete the datastore (/data-stores -> search -> delete), the bucket
 * and the SeaweedFS private-bucket user (S3 console, delete on the right).
 *
 * Resilient by design: each deletion is best-effort and logged (cleanup-ok /
 * cleanup-SKIP), so a partially torn-down run still cleans up what remains.
 */
import { test, Page } from '@playwright/test';
import {
  hub, nodeUi, s3, expect, join,
  HUB, NODES, PROJECT, ANALYSIS,
  hubLogin, nodeUiLogin, s3Login, s3Base, loadS3Creds,
} from './shared';

test.describe.configure({ mode: 'serial' });

const DEBUG = process.env.CLEANUP_DEBUG === 'true';

async function tryStep(page: Page, title: string, fn: () => Promise<void>) {
  await test.step(title, async () => {
    try {
      await fn();
      console.log(`cleanup-ok: ${title}`);
    } catch (e) {
      const msg = `${title}: ${(e as Error).message.split('\n')[0].slice(0, 140)}`;
      test.info().annotations.push({ type: 'cleanup-skip', description: msg });
      console.log(`cleanup-SKIP: ${msg}`);
      if (DEBUG) {
        const btns = await page
          .getByRole('button')
          .evaluateAll((els) =>
            els.map((b) => ((b as HTMLElement).innerText || b.getAttribute('aria-label') || (b as HTMLElement).title || '').trim()).filter(Boolean).slice(0, 25),
          )
          .catch(() => []);
        console.log(`  debug url=${page.url()} buttons=${JSON.stringify(btns)}`);
      }
    }
  });
}

test('cleanup: delete analysis and project on the Hub', async ({ page }) => {
  await hubLogin(page);

  // A delete is only done once its DELETE request has answered. Removing a built
  // analysis takes a few seconds, and the project's delete button stays disabled
  // for as long as the Hub still counts that analysis — so wait for the response
  // instead of moving on (navigating away early would even abort the request).
  const deleted = (resource: 'analyses' | 'projects') =>
    page.waitForResponse(
      (r) => r.request().method() === 'DELETE' && new RegExp(`/${resource}/[^/?]+$`).test(r.url()),
      { timeout: 90_000 },
    );

  await tryStep(page, `delete analysis "${ANALYSIS}"`, async () => {
    await hub.sidebarAnalyses(page).click();
    await page.waitForLoadState('networkidle').catch(() => {});
    await hub.analysisLink(page, ANALYSIS).click();
    const response = deleted('analyses');
    response.catch(() => {}); // surfaced below; avoid an unhandled rejection if the click fails
    await hub.deleteTopRight(page).click({ timeout: 10_000 });
    await hub.confirm(page).click({ timeout: 5_000 }).catch(() => {});
    expect((await response).ok(), 'Hub rejected the analysis delete').toBeTruthy();
  });

  await tryStep(page, `delete project "${PROJECT}"`, async () => {
    // Load the list fresh (not via the sidebar) so the analysis count is current,
    // and retry until the project is really gone.
    let deleteClicked = false;
    await expect(async () => {
      await page.goto(join(HUB.url, hub.projectsPath));
      await page.waitForLoadState('networkidle').catch(() => {});
      if ((await page.getByText(PROJECT).count()) === 0) return;
      await hub.projectLink(page, PROJECT).click({ timeout: 10_000 });
      const response = deleted('projects');
      response.catch(() => {});
      await hub.deleteTopRight(page).click({ timeout: 10_000 });
      deleteClicked = true;
      await hub.confirm(page).click({ timeout: 5_000 }).catch(() => {});
      expect((await response).ok(), 'Hub rejected the project delete').toBeTruthy();
      await page.goto(join(HUB.url, hub.projectsPath));
      await page.waitForLoadState('networkidle').catch(() => {});
      await expect(page.getByText(PROJECT)).toHaveCount(0, { timeout: 5_000 });
    }).toPass({ timeout: 120_000, intervals: [5_000] });
    if (!deleteClicked) throw new Error('project not found (already deleted?)');
  });
});

for (const n of NODES) {
  test(`cleanup node ${n.idx}: delete datastore, bucket and SeaweedFS user`, async ({ page }) => {
    await tryStep(page, `delete datastore "${PROJECT}-ds" on node ${n.idx}`, async () => {
      const dsName = `${PROJECT}-ds`;
      await nodeUiLogin(page, n);
      await page.goto(join(n.uiUrl, nodeUi.dataStoresPath));
      await page.waitForLoadState('networkidle').catch(() => {});
      const search = nodeUi.dsListSearch(page);
      await search.first().waitFor({ state: 'visible', timeout: 15_000 });
      await search.first().fill(dsName); // "Keyword Search" filters the table
      await expect(page.getByText(dsName, { exact: false }).first()).toBeVisible({ timeout: 10_000 });
      await nodeUi.dsRowDelete(page, dsName).click({ timeout: 10_000 });
      await hub.confirm(page).click({ timeout: 5_000 }).catch(() => {});
    });

    await tryStep(page, `delete bucket "${n.bucket}" on node ${n.idx}`, async () => {
      await s3Login(page, n);
      await page.goto(join(s3Base(n), s3.bucketsPath));
      await s3.bucketRowDelete(page, n.bucket).click({ timeout: 10_000 });
      await s3.confirmDelete(page).click({ timeout: 5_000 }).catch(() => {});
    });

    await tryStep(page, `delete SeaweedFS user on node ${n.idx}`, async () => {
      const creds = loadS3Creds(n.idx);
      if (!creds) throw new Error('no captured user to delete');
      await page.goto(join(s3Base(n), s3.usersPath));
      await s3.userRowDelete(page, creds.username).click({ timeout: 10_000 });
      await s3.confirmDelete(page).click({ timeout: 5_000 }).catch(() => {});
    });
  });
}
