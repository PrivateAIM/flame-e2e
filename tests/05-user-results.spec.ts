/**
 * USER — Result retrieval.
 *
 * After 04 reaches execution, allow the federated run ~2 minutes to finish and
 * publish results, then open the analysis Results tab, download each of the
 * four result files and verify each downloads non-empty and is openable (valid
 * PNG for images, non-empty text otherwise). Shared RUN_ID.
 */
import { test } from '@playwright/test';
import fs from 'node:fs';
import {
  hub, expect,
  EXPECTED_RESULTS, openAnalysis,
} from './shared';

test.describe.configure({ mode: 'serial' });

// ~2 min for the federated execution to finish and publish results (tunable).
const EXEC_DELAY_MS = Number(process.env.EXEC_DELAY_MS ?? 120_000);

test('user: retrieve results — download each file and verify it opens', async ({ page }) => {
  await page.waitForTimeout(EXEC_DELAY_MS);

  await openAnalysis(page);
  await hub.resultsTab(page).click();

  for (const name of EXPECTED_RESULTS) {
    await expect(hub.resultFile(page, name), `result not listed: ${name}`).toBeVisible({ timeout: 30_000 });

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      hub.resultDownload(page, name).click(),
    ]);
    const saved = test.info().outputPath(download.suggestedFilename());
    await download.saveAs(saved);
    await test.info().attach(name, { path: saved });

    const raw = fs.readFileSync(saved);
    expect(raw.length, `${name} downloaded empty`).toBeGreaterThan(0);

    // "can open it": validate the file by type.
    if (name.endsWith('.png')) {
      // PNG magic number: 89 50 4E 47 ("‰PNG").
      expect(raw.subarray(0, 8).toString('latin1'), `${name} is not a valid PNG`).toContain('PNG');
    } else {
      expect(raw.toString('utf8').trim().length, `${name} is empty text`).toBeGreaterThan(0);
    }
  }
});
