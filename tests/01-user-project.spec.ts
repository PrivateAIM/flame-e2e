/**
 * USER — Project creation.
 *
 * Creates the project named after the current E2E run, with the master-image
 * group (python/use-cases), and attaches both nodes + the aggregator. Produces
 * the project the admin and analysis specs reuse (same RUN_ID).
 */
import { test } from '@playwright/test';
import {
  hub, expect, join, assertFixtures,
  HUB, NODES, PROJECT, hubLogin, selectHubNode, selectMasterImageGroup,
} from './shared';

test.describe.configure({ mode: 'serial' });

test('user: create project (python/use-cases group, both nodes + aggregator)', async ({ page }) => {
  assertFixtures();
  test.info().annotations.push({ type: 'run-id', description: PROJECT });

  await hubLogin(page);
  await page.goto(join(HUB.url, hub.projectsPath));
  await hub.addButton(page).click();
  // Let the create form finish loading first: it re-renders once its data
  // arrives, which wipes anything typed before that and closes the Group list.
  await page.waitForLoadState('networkidle').catch(() => {});
  // Name the project after the current E2E run (unique per run). "Name" is a
  // slug pre-filled with a random value; overwrite it too so the project is
  // findable by PROJECT (it is already slug-safe: lowercase, digits, hyphens).
  await hub.nameInput(page).fill(PROJECT);
  await hub.nameSlugInput(page).fill(PROJECT);

  // Project picks the master-image group only ("python/use-cases").
  await selectMasterImageGroup(page);

  // Attach both nodes and the aggregator.
  const targets = [...NODES.map((n) => n.hubName), HUB.aggregator];
  for (const name of targets) {
    await selectHubNode(page, name);
  }

  await expect(hub.nameInput(page), 'project form was reset after filling').toHaveValue(PROJECT);
  await hub.submit(page).click();
  await expect(page.getByText(PROJECT).first()).toBeVisible();

  // Verify the project attached all targets — the aggregator in particular.
  await page.goto(join(HUB.url, hub.projectsPath));
  await hub.projectLink(page, PROJECT).click();
  await expect(page.getByText(PROJECT).first()).toBeVisible();
  for (const name of targets) {
    await expect(page.getByText(name).first(), `node not attached to project: ${name}`).toBeVisible();
  }
});
