/**
 * Shared configuration, derived names and login/navigation helpers for the
 * FLAME staging suite. The workflow is split across role-based spec files:
 *
 *   01-user-project.spec.ts      User:       create the project
 *   02-admin-buckets.spec.ts     Node admin: create buckets + upload data
 *   03-admin-datastores.spec.ts  Node admin: create S3 datastores
 *   04-user-analysis.spec.ts     User:       submit analysis + fetch results
 *
 * They share one project per run through RUN_ID. With the default config
 * (workers: 1, fullyParallel: false) Playwright runs the files in filename
 * order, so the numeric prefixes keep the sequence correct. To run a later
 * file against an earlier run's project, export the same RUN_ID.
 */
import { expect, Page } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import 'dotenv/config';
import { hub, nodeUi, s3 } from './locators';

export { hub, nodeUi, s3, expect };
export type { Page };

// ------------------------------------------------------------------ config
const env = (key: string, fallback?: string): string => {
  const v = process.env[key] ?? fallback;
  if (v === undefined || v === '') throw new Error(`Missing required env var ${key} (see .env.example)`);
  return v;
};
export const opt = (key: string) => process.env[key] || undefined;
export const join = (base: string, p: string) => base.replace(/\/+$/, '') + p;

// One RUN_ID per `playwright test` invocation, shared across every spec file.
// Each spec re-imports this module in its own worker, so `new Date()` here would
// differ per file — instead globalSetup writes the id to .run-id and every
// worker reads it. An explicit RUN_ID env var still wins (to target a prior run).
export const RUN_ID_FILE = path.resolve('.run-id');
function resolveRunId(): string {
  if (process.env.RUN_ID) return process.env.RUN_ID;
  try {
    const fromFile = fs.readFileSync(RUN_ID_FILE, 'utf8').trim();
    if (fromFile) return fromFile;
  } catch {
    /* no globalSetup (e.g. typecheck) — fall back to a fresh id */
  }
  return `e2e-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}`;
}
export const RUN_ID = resolveRunId();
export const FIXTURES = path.resolve(env('FIXTURES_DIR', './fixtures'));
export const ANALYSIS_FILE = 'analysis-halta.py';
export const EXPECTED_RESULTS = [
  'age_distribution_federated.png',
  'dataset_description_federated.txt',
  'pasc_distribution_federated.png',
  'sex_distribution_federated.png',
];
export const ROWS_PER_CSV = 2798;

export const HUB = {
  url: env('HUB_URL', 'https://staging.privateaim.net'),
  user: env('HUB_USER'),
  pass: env('HUB_PASS'),
  // Master image lives under a group: pick the group, then the image.
  masterImageGroup: env('MASTER_IMAGE_GROUP', 'usecases'),
  masterImage: env('MASTER_IMAGE', 'fedstats'),
  aggregator: env('AGG_HUB_NAME'),
};

// How the NODE reaches the object store, entered in the datastore form.
// Defaults match a standard SeaweedFS all-in-one deployment (per the docs);
// override per node with NODEx_S3_HOST / _PORT / _PROTOCOL only if it differs.
const S3_DEFAULT = {
  host: 'node-datastore-seaweedfs-all-in-one',
  port: '8333',
  protocol: 'http',
};

export interface NodeCfg {
  idx: number;
  hubName: string;
  uiUrl: string;
  // S3 (SeaweedFS) console: creates the bucket, uploads the CSV, and whose
  // credentials double as the datastore Access Key / Secret Key.
  s3Url: string;
  s3User: string;
  s3Pass: string;
  // Datastore connection as the node sees the object store.
  s3Host: string;
  s3Port: string;
  s3Protocol: string;
  s3PublicUrl?: string;
  csv: string;
  bucket: string;
}

const node = (i: 1 | 2): NodeCfg => ({
  idx: i,
  hubName: env(`NODE${i}_HUB_NAME`),
  uiUrl: env(`NODE${i}_UI_URL`),
  s3Url: env(`NODE${i}_S3_URL`),
  s3User: env(`NODE${i}_S3_USER`),
  s3Pass: env(`NODE${i}_S3_PASS`),
  s3Host: env(`NODE${i}_S3_HOST`, S3_DEFAULT.host),
  s3Port: env(`NODE${i}_S3_PORT`, S3_DEFAULT.port),
  s3Protocol: env(`NODE${i}_S3_PROTOCOL`, S3_DEFAULT.protocol),
  s3PublicUrl: opt(`NODE${i}_S3_PUBLIC_URL`),
  csv: `synthetic_eucare_${i}_labeled.csv`,
  bucket: `node${i}-e2e-test`, // readable, valid S3 name (lowercase, digits, hyphens)
});

export const NODES = [node(1), node(2)];
export const PROJECT = `${RUN_ID}-project`;
export const ANALYSIS = `${RUN_ID}-halta`;
export const HUB_REALM = process.env.HUB_REALM ?? 'master';
export const AUTO_EXECUTE = (process.env.AUTO_EXECUTE ?? 'true') === 'true';
export const RUN_TIMEOUT_MS = Number(process.env.ANALYSIS_TIMEOUT_MIN ?? 30) * 60_000;

export function assertFixtures() {
  for (const f of [ANALYSIS_FILE, ...NODES.map((n) => n.csv)]) {
    expect(fs.existsSync(path.join(FIXTURES, f)), `fixture missing: ${f}`).toBe(true);
  }
}

// ----------------------------------------------------------------- helpers
// Keycloak login: pick the realm (if the picker is shown), then fill creds.
// The realm buttons animate in, so isVisible() races; detect by count and let
// click()'s own auto-wait handle readiness. Selecting a realm redirects to the
// authup/Keycloak login form, so wait for the form before filling.
async function keycloakLogin(page: Page, user: string, pass: string) {
  // The realm picker animates in, so wait for it explicitly (count()/isVisible()
  // race the render). If a deployment shows the login form directly, skip it.
  const realm = hub.realmButton(page, HUB_REALM);
  const shown = await realm
    .waitFor({ state: 'visible', timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  if (shown) await realm.click(); // selecting a realm redirects to the authup login form
  await authupSubmit(page, user, pass);
}

// At authup, either the login form is shown (fill + Enter) or, with an existing
// session, a "Continue as <user>" account screen (just click it). Handle both.
async function authupSubmit(page: Page, user: string, pass: string) {
  const continueAs = hub.continueAs(page);
  const userField = hub.loginUser(page);
  await continueAs.or(userField).first().waitFor({ state: 'visible', timeout: 30_000 });
  if (await continueAs.isVisible().catch(() => false)) {
    await continueAs.click(); // existing session — continue as the current user
    return;
  }
  // The authup authorize SPA needs its request initialised before submit, or it
  // posts to a bare /authorize and errors; wait for it to settle, and submit
  // with Enter (a Login-button click drops the OAuth query params).
  await page.waitForLoadState('networkidle').catch(() => {});
  await userField.fill(user);
  const pw = hub.loginPass(page);
  await pw.fill(pass);
  await pw.press('Enter');
}

export async function hubLogin(page: Page) {
  await page.goto(join(HUB.url, '/login'));
  await keycloakLogin(page, HUB.user, HUB.pass);
  // Must land back in the Hub app — not stuck on the auth server (bad creds) or
  // bounced to the login page. Fail loudly with a hint if not.
  await expect(
    page,
    'Hub login did not complete — check HUB_USER / HUB_PASS / HUB_REALM (authup reported invalid credentials?)',
  ).not.toHaveURL(/auth\.|\/authorize|\/login/, { timeout: 30_000 });
}

// The node UI home page has a "Login with Hub" button that redirects to the
// authup login form directly (master realm, no realm picker). Click it, then
// fill the Hub credentials and submit with Enter (preserves the OAuth params).
export async function nodeUiLogin(page: Page, n: NodeCfg) {
  await page.goto(n.uiUrl);
  await nodeUi.loginWithHub(page).click();
  await authupSubmit(page, HUB.user, HUB.pass);
  await expect(
    page,
    'Node UI login did not complete — still on the auth/login page',
  ).not.toHaveURL(/auth\.|\/authorize/, { timeout: 30_000 });
  // Let the auth callback finish setting the session before navigating, or the
  // next goto bounces back to the login page.
  await page.waitForLoadState('networkidle').catch(() => {});
}

// The object store is a SeaweedFS S3 console. NODEx_S3_URL may point straight
// at the login page; strip the trailing /login to get the console base.
export const s3Base = (n: NodeCfg) => n.s3Url.replace(/\/login\/?$/, '');

export async function s3Login(page: Page, n: NodeCfg) {
  await page.goto(n.s3Url);
  await s3.user(page).fill(n.s3User);
  await s3.pass(page).fill(n.s3Pass);
  await s3.submit(page).click();
  await expect(page).not.toHaveURL(/\/login/);
}

// Project creation picks only the master-image GROUP (e.g. "usecases") via the
// "Group" combobox. The specific image is chosen later in the analysis wizard.
export async function selectMasterImageGroup(page: Page) {
  const combo = hub.groupCombobox(page);
  await combo.click();
  await hub.option(page, HUB.masterImageGroup).click();
}

// Analysis Image tab: two PrimeVue comboboxes — "Group" (python/use-cases),
// then "Image" (fedstats). Anchor on the field labels, excluding the nav/tab
// links (the "Image" tab link would otherwise match).
export async function selectMasterImage(page: Page) {
  const comboAfter = (label: string) =>
    page
      .locator(`xpath=//*[normalize-space(text())="${label}" and not(ancestor-or-self::a)]/following::*[@role="combobox"][1]`)
      .first();

  await comboAfter('Group').click();
  await hub.option(page, HUB.masterImageGroup).click();
  await page.waitForTimeout(800); // the Image choices depend on the group

  await comboAfter('Image').click();
  await hub.option(page, HUB.masterImage).click();
}

// Filter the (long, paginated) node list to the target via the search box,
// then click its add button. No isVisible() gate — that races the render.
// Private-bucket credentials captured in 02 and reused in 03. Persisted to a
// gitignored file keyed by RUN_ID + node, so the datastore spec can read them
// (within one run, or across runs with the same RUN_ID).
const CREDS_FILE = path.resolve('.e2e-s3-creds.json');
export interface S3Creds { username: string; accessKey: string; secretKey: string; }

export function saveS3Creds(idx: number, creds: S3Creds) {
  let all: Record<string, S3Creds> = {};
  try { all = JSON.parse(fs.readFileSync(CREDS_FILE, 'utf8')); } catch { /* first write */ }
  all[`${RUN_ID}-n${idx}`] = creds;
  fs.writeFileSync(CREDS_FILE, JSON.stringify(all, null, 2));
}

export function loadS3Creds(idx: number): S3Creds | undefined {
  try {
    return (JSON.parse(fs.readFileSync(CREDS_FILE, 'utf8')) as Record<string, S3Creds>)[`${RUN_ID}-n${idx}`];
  } catch {
    return undefined;
  }
}

// Create the dedicated "e2e" user (Read + List, scoped to the node's bucket),
// capture its generated access/secret key, and persist them for the datastore.
export async function createPrivateBucketUser(page: Page, n: NodeCfg): Promise<S3Creds> {
  const username = `e2e-n${n.idx}-${RUN_ID.replace(/^e2e-/, '')}`;
  await page.goto(join(s3Base(n), s3.usersPath));
  await s3.createUserOpen(page).click();
  await s3.username(page).fill(username);
  await s3.permissions(page).selectOption([{ label: 'Read' }, { label: 'List' }]);
  await s3.specificBuckets(page).check();
  await s3.selectedBuckets(page).selectOption({ label: n.bucket });
  await s3.createUserSubmit(page).click();

  await s3.newKeyAccess(page).waitFor({ state: 'visible', timeout: 30_000 });
  const accessKey = await s3.newKeyAccess(page).inputValue();
  const secretKey = await s3.newKeySecret(page).inputValue();
  expect(accessKey, 'access key not captured').toBeTruthy();
  expect(secretKey, 'secret key not captured').toBeTruthy();

  const creds = { username, accessKey, secretKey };
  saveS3Creds(n.idx, creds);
  return creds;
}

// New-analysis form: pick the base project from the searchable toggle list.
export async function selectAnalysisProject(page: Page, name: string) {
  const search = hub.analysisProjectSearch(page);
  if ((await search.count()) > 0) {
    await search.first().fill('');
    await search.first().fill(name);
    await page.waitForTimeout(400); // debounce the filter
  }
  const toggle = hub.analysisProjectToggle(page, name);
  await toggle.waitFor({ state: 'visible', timeout: 10_000 });
  await toggle.click();
}

export async function selectHubNode(page: Page, name: string) {
  const search = hub.nodeSearch(page);
  if ((await search.count()) > 0) {
    await search.first().fill('');
    await search.first().fill(name);
    await page.waitForTimeout(400); // debounce the filter
  }
  const toggle = hub.nodeToggle(page, name);
  await toggle.waitFor({ state: 'visible', timeout: 10_000 });
  await toggle.click();
}

export async function openProject(page: Page) {
  await hubLogin(page);
  await page.goto(join(HUB.url, hub.projectsPath));
  await hub.projectLink(page, PROJECT).click();
  await expect(page.getByText(PROJECT).first()).toBeVisible();
}

export async function openAnalysis(page: Page) {
  await openProject(page);
  await hub.analysesTab(page).click();
  await hub.analysisLink(page, ANALYSIS).click();
  await expect(page.getByText(ANALYSIS).first()).toBeVisible();
}
