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
  NODES, PROJECT, ANALYSIS,
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

  await tryStep(page, `delete analysis "${ANALYSIS}"`, async () => {
    await hub.sidebarAnalyses(page).click();
    await page.waitForLoadState('networkidle').catch(() => {});
    await hub.analysisLink(page, ANALYSIS).click();
    await hub.deleteTopRight(page).click({ timeout: 10_000 });
    await hub.confirm(page).click({ timeout: 5_000 }).catch(() => {});
  });

  await tryStep(page, `delete project "${PROJECT}"`, async () => {
    await hub.sidebarProjects(page).click();
    await page.waitForLoadState('networkidle').catch(() => {});
    await hub.projectLink(page, PROJECT).click();
    await hub.deleteTopRight(page).click({ timeout: 10_000 });
    await hub.confirm(page).click({ timeout: 5_000 }).catch(() => {});
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
