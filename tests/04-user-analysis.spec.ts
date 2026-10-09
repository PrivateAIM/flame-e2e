/**
 * USER — Analysis submission + run.
 *
 * Within the project (shared RUN_ID): create the HALTA analysis from the
 * project's Analyses tab, upload the code, pick the fedstats image + entrypoint,
 * lock, then build and distribute it and wait for completion. Result retrieval
 * is verified separately in 05. Requires the datastores (03) on both nodes.
 */
import { test } from '@playwright/test';
import path from 'node:path';
import {
  hub, expect,
  NODES, ANALYSIS, ANALYSIS_FILE, RUN_TIMEOUT_MS, FIXTURES,
  openProject, selectMasterImage,
} from './shared';

test.describe.configure({ mode: 'serial' });

const ANALYSIS_DESC = 'synthetic data, automated e2e test';

test('user: submit analysis and run it to completion', async ({ page }) => {
  // 1-5: open the project, Analyses tab, + Add, display name + description, create.
  await test.step('create analysis (name + description) within the project', async () => {
    await openProject(page);
    await hub.analysesTab(page).click();
    await hub.addButton(page).click();
    await hub.nameInput(page).fill(ANALYSIS);
    await hub.descriptionInput(page).fill(ANALYSIS_DESC);
    await hub.submit(page).click();
    await expect(page.getByText(ANALYSIS).first()).toBeVisible();
  });

  // 6: Code -> Add File -> select file -> upload the demo analysis file.
  await test.step('code: upload the analysis file', async () => {
    await hub.wizardTab(page, /code/i).click();
    // The Hub creates the analysis' CODE bucket in the background. If the tab is
    // opened before it exists it shows "The CODE bucket does not exist" with a
    // Retry button instead of Add File — retry until the bucket is there.
    await expect(async () => {
      if (await hub.bucketRetry(page).isVisible()) await hub.bucketRetry(page).click();
      await expect(hub.addFileButton(page)).toBeVisible({ timeout: 3_000 });
    }, 'the CODE bucket was never created').toPass({ timeout: 90_000, intervals: [2_000] });
    await hub.addFileButton(page).click();       // opens the Upload modal
    await hub.uploadFilesMode(page).click();     // switch from Directories to Files
    await hub.fileInput(page).setInputFiles(path.join(FIXTURES, ANALYSIS_FILE));
    await hub.uploadButton(page).click();        // Upload
    await expect(page.getByText(ANALYSIS_FILE).first()).toBeVisible();
  });

  // 7: Image -> select group + fedstats base image -> select entrypoint (green check).
  await test.step('image: group + fedstats base + entrypoint', async () => {
    await hub.wizardTab(page, /image/i).click();
    await selectMasterImage(page);
    // The image and entrypoint saves are async; back to back they clobber each
    // other, so give each a short break and check the Command preview after.
    await page.waitForTimeout(2_000);
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'POST' && /\/analysis-bucket-files\//.test(r.url()) && r.ok()),
      hub.entrypointToggle(page, ANALYSIS_FILE).click(),
    ]);
    await expect(hub.commandBox(page), 'entrypoint was not selected').toContainText(ANALYSIS_FILE);
    await expect(hub.commandBox(page), 'master image was lost').not.toContainText('[Command]');
  });

  // 8: Overview -> lock the configuration.
  await test.step('overview: lock the configuration', async () => {
    await hub.wizardTab(page, /overview/i).click();
    await hub.lockButton(page).click();
    await expect(hub.unlockButton(page), 'configuration was not locked').toBeVisible();
  });

  // A "start" click only counts once the Hub has accepted the command. The
  // previous step is applied in the background, so a start sent straight after
  // it can be rejected (HTTP 400) and the button then just stays there — click
  // again until the Hub accepts.
  const startStep = async (start: ReturnType<typeof hub.buildStart>, what: string) => {
    await expect(async () => {
      const answered = page.waitForResponse(
        (r) => r.request().method() === 'POST' && /\/analyses\/[^/]+\/command$/.test(r.url()),
        { timeout: 10_000 },
      );
      answered.catch(() => {}); // rethrown below; avoid an unhandled rejection if the click fails
      await start.click({ timeout: 5_000 });
      const status = (await answered).status();
      expect(status, `Hub rejected the ${what} start`).toBeLessThan(400);
    }, `${what} was not started`).toPass({ timeout: 60_000, intervals: [500, 1_000, 2_000] });
  };

  // 9: Build -> start, straight after the lock. The Distribution card only offers
  // "start" once the build has finished, so that button is the build-done signal.
  await test.step('build: start and wait for completion', async () => {
    await startStep(hub.buildStart(page), 'build');
    await expect(hub.distributionStart(page), 'build did not finish in time').toBeVisible({
      timeout: RUN_TIMEOUT_MS,
    });
  });

  // 10: Distribute -> start, then open the Nodes tab.
  await test.step('distribute: start and open the Nodes tab', async () => {
    await startStep(hub.distributionStart(page), 'distribution');
    await expect(hub.distributionStart(page), 'distribution did not start').toBeHidden({ timeout: 30_000 });
    await hub.wizardTab(page, /node/i).click();
  });

  // Completion: every node (2 nodes + aggregator) reaches execution. Node cards
  // auto-refresh and show "execution: <status>"; accept running or executed.
  await test.step('nodes: all nodes report execution status', async () => {
    // A node reporting "execution: failed" will not recover — stop waiting and
    // fail right away rather than sitting out the whole run timeout.
    let failedNodes = 0;
    await expect(async () => {
      failedNodes = await page.getByText(/execution:\s*failed/i).count();
      if (failedNodes > 0) return;
      const inExecution = await page.getByText(/execution:\s*(execution|executed)/i).count();
      expect(inExecution, 'not all nodes in execution yet').toBeGreaterThanOrEqual(NODES.length + 1);
    }, 'not all nodes reached execution in time').toPass({
      timeout: RUN_TIMEOUT_MS,
      intervals: [5_000, 10_000, 15_000],
    });
    expect(failedNodes, 'the analysis failed on the nodes — see the node logs on the Nodes tab').toBe(0);
  });
});
