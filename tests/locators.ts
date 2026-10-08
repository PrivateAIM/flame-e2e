/**
 * Every selector the specs use lives here, and nowhere else.
 *
 * STATUS: written against the documented UI (docs.privateaim.net), not a live
 * staging DOM. They are role/label based and deliberately tolerant, but treat
 * each one as UNVERIFIED until the first green run. Fix them here
 * (npm run codegen:hub, or PWDEBUG=1) — the specs should not need to change.
 */
import { Page, Locator } from '@playwright/test';

const first = (...candidates: Locator[]): Locator =>
  candidates.reduce((acc, l) => acc.or(l)).first();

// ---------------------------------------------------------------- Hub
export const hub = {
  // Login starts with a Keycloak realm picker ("Select your realm to continue").
  realmPicker: (p: Page) => p.getByText(/select your realm/i),
  realmButton: (p: Page, name: string) =>
    first(p.getByRole('button', { name: new RegExp(`^${name}$`, 'i') }), p.getByRole('link', { name: new RegExp(`^${name}$`, 'i') })),
  // With an existing session, authup shows an account screen instead of the
  // login form (prompt=select_account when switching UIs). The "continue as
  // <user>" button is localized — English "Continue as X" or German
  // "Als X fortfahren" — but never "Anderes Konto verwenden" (use other account).
  continueAs: (p: Page) =>
    first(
      p.getByRole('button', { name: /continue as|fortfahren/i }),
      p.getByRole('link', { name: /continue as|fortfahren/i }),
    ),
  // After the realm picker, authup/Keycloak shows a login form whose inputs
  // carry no name/id/label, so fall back to input type. Submit is "Anmelden".
  loginUser: (p: Page) =>
    first(
      p.locator('#username'),
      p.getByLabel(/^(user)?name$/i),
      p.locator('input[name="name"], input[name="username"]'),
      p.locator('input[type="text"]'),
    ),
  loginPass: (p: Page) => first(p.locator('#password'), p.getByLabel(/password/i), p.locator('input[type="password"]')),
  loginSubmit: (p: Page) =>
    first(p.locator('#kc-login'), p.getByRole('button', { name: /log ?in|sign ?in|anmelden/i })),
  loggedInMarker: (p: Page, user: string) =>
    first(p.getByText(user, { exact: false }), p.getByRole('link', { name: /logout/i })),

  projectsPath: '/projects',
  addButton: (p: Page) =>
    first(p.getByRole('link', { name: /add|create|new/i }), p.getByRole('button', { name: /add|create|new/i })),
  // Form labels are sibling text nodes, not <label for> — target the input (or
  // textarea, e.g. Description) that follows the label text in document order.
  labeledInput: (p: Page, label: string) =>
    p.locator(`xpath=//*[normalize-space(text())="${label}"]/following::*[self::input or self::textarea][1]`),
  nameInput: (p: Page) =>
    first(hub.labeledInput(p, 'Display Name'), p.getByLabel(/^(display )?name$/i), p.getByPlaceholder(/name/i)),
  nameSlugInput: (p: Page) => first(hub.labeledInput(p, 'Name'), p.getByLabel(/^name$/i)),
  descriptionInput: (p: Page) => first(hub.labeledInput(p, 'Description'), p.getByPlaceholder(/description/i)),
  groupCombobox: (p: Page) => p.getByRole('combobox').first(),
  // New-analysis form: choose the base project from a searchable list of toggles.
  // The form's "Projects" label is plain text; exclude the nav "Projects" link.
  analysisProjectSearch: (p: Page) =>
    p.locator('xpath=//*[normalize-space(text())="Projects" and not(ancestor-or-self::a)]/following::input[1]'),
  analysisProjectToggle: (p: Page, name: string) =>
    first(
      p.getByRole('listitem').filter({ hasText: name }).getByRole('button'),
      p.locator('li, tr, [class*="item"]').filter({ hasText: name }).locator('button, input[type="checkbox"]'),
    ),
  // Master image is chosen by group first, then image.
  masterImageGroupPicker: (p: Page) =>
    first(p.getByLabel(/master ?image group|image group|group/i), p.locator('select').filter({ hasText: /group/i })),
  masterImagePicker: (p: Page) =>
    first(p.getByLabel(/master ?image|base image|image/i), p.locator('select').filter({ hasText: /image/i })),
  option: (p: Page, text: string) =>
    first(
      p.getByRole('option', { name: new RegExp(text, 'i') }),
      p.getByRole('listitem').filter({ hasText: new RegExp(text, 'i') }),
      p.getByText(new RegExp(text, 'i')),
    ),
  nodeSearch: (p: Page) =>
    first(hub.labeledInput(p, 'Nodes'), p.getByPlaceholder(/search|node/i), p.getByLabel(/node/i)),
  // Node rows are role=listitem ("NAME (type)") each with an add button.
  nodeToggle: (p: Page, node: string) =>
    first(
      p.getByRole('listitem').filter({ hasText: node }).getByRole('button'),
      p.locator('li, tr, .list-item, [class*="item"]').filter({ hasText: node }).locator('button, input[type="checkbox"]'),
    ),
  submit: (p: Page) => p.getByRole('button', { name: /^(create|save|submit|add)$/i }).first(),

  // Open a named project / analysis from a list.
  projectLink: (p: Page, name: string) =>
    first(p.getByRole('link', { name: new RegExp(name, 'i') }), p.getByText(name, { exact: false })),
  analysisLink: (p: Page, name: string) =>
    first(p.getByRole('link', { name: new RegExp(name, 'i') }), p.getByText(name, { exact: false })),

  // The project page's own Analyses tab (/projects/<id>/analyses) — NOT the
  // left-sidebar "Analyses" nav link (/analyses, the global list).
  analysesTab: (p: Page) =>
    first(
      p.locator('a[href*="/projects/"][href$="/analyses"]'),
      p.getByRole('tab', { name: /analys[ei]s/i }),
    ),
  // Analysis Wizard steps: Nodes / Code / Image / Overview.
  wizardTab: (p: Page, label: RegExp) =>
    first(p.getByRole('tab', { name: label }), p.getByRole('link', { name: label }), p.getByRole('button', { name: label })),
  addFileButton: (p: Page) => p.getByRole('button', { name: /add file/i }),
  // Upload modal defaults to "Directories"; switch to "Files" for a single file.
  uploadFilesMode: (p: Page) => p.getByRole('button', { name: /^files$/i }),
  fileInput: (p: Page) => p.locator('input[type="file"]:not([webkitdirectory])').first(),
  entrypointToggle: (p: Page, file: string) =>
    p
      .locator('li, tr, [class*="file"]')
      .filter({ hasText: file })
      .first()
      .locator('input[type="radio"], input[type="checkbox"], button')
      .first(),
  uploadButton: (p: Page) => p.getByRole('button', { name: /upload/i }).first(),
  lockButton: (p: Page) => p.getByRole('button', { name: /lock|finish/i }).first(),
  // After approval: "start" in the Build area, then "start" in the Distribution area.
  buildStart: (p: Page) =>
    p.locator('section, div, fieldset').filter({ hasText: /build/i }).getByRole('button', { name: /start|build/i }).first(),
  buildStatus: (p: Page) =>
    p.locator('section, div, fieldset').filter({ hasText: /build/i }).first(),
  distributionStart: (p: Page) =>
    p.locator('section, div, fieldset').filter({ hasText: /distribut/i }).getByRole('button', { name: /start|distribut/i }).first(),
  distributionStatus: (p: Page) =>
    p.locator('section, div, fieldset').filter({ hasText: /distribut/i }).first(),
  statusText: (p: Page) => p.locator('body'),
  resultsTab: (p: Page) => first(p.getByRole('link', { name: /result/i }), p.getByRole('tab', { name: /result/i })),
  downloadButton: (p: Page) =>
    first(p.getByRole('button', { name: /download/i }), p.getByRole('link', { name: /download/i })),
  resultFile: (p: Page, name: string) =>
    first(p.getByRole('link', { name: new RegExp(name, 'i') }), p.getByText(name, { exact: false })),
  // Each result row is: checkbox + "<file> <size>" + an icon "Download" button
  // (aria-label only, no text) — take the first button after the filename.
  resultDownload: (p: Page, name: string) =>
    p.getByText(name, { exact: false }).first().locator('xpath=following::button[1]'),
  imagePreview: (p: Page) =>
    p.locator('[role="dialog"] img, .p-image-preview img, .p-dialog img, img[src^="blob:"], img[src*="result"]').first(),

  // Deletion (cleanup). Global left-sidebar nav, then open the item and use its
  // red delete button (top-right of the analysis/project page).
  sidebarAnalyses: (p: Page) => p.locator('a[href="/analyses"]').first(),
  sidebarProjects: (p: Page) => p.locator('a[href="/projects"]').first(),
  // The red/error-styled icon button (top-right) with no accessible name.
  deleteTopRight: (p: Page) =>
    first(
      p.locator('button.vc-button[class*="error"]:visible'),
      p.getByRole('button', { name: /delete|remove/i }),
      p.locator('button.p-button-danger, button[class*="danger"]'),
    ),
  rowDelete: (p: Page, text: string) =>
    p.getByRole('row').filter({ hasText: text }).getByRole('button', { name: /delete|remove|trash/i }).first(),
  deleteButton: (p: Page) => p.getByRole('button', { name: /delete|remove/i }),
  confirm: (p: Page) => p.getByRole('button', { name: /^(yes|delete|confirm|ok|remove)$/i }).last(),
  // The project page's own Settings tab (/projects/<id>/settings).
  projectSettingsTab: (p: Page) =>
    first(p.locator('a[href*="/projects/"][href$="/settings"]'), p.getByRole('tab', { name: /setting/i })),
};

// ------------------------------------------------------- Node UI (Keycloak)
export const nodeUi = {
  loginWithHub: (p: Page) =>
    first(p.getByRole('button', { name: /login with hub/i }), p.getByRole('link', { name: /login with hub/i })),
  loginTrigger: (p: Page) => p.getByRole('button', { name: /log ?in|sign ?in/i }),
  kcUser: (p: Page) => p.locator('#username'),
  kcPass: (p: Page) => p.locator('#password'),
  kcSubmit: (p: Page) => p.locator('#kc-login'),

  dataStoresPath: '/data-stores',
  dataStoreCreatePath: '/data-stores/create',
  analysesPath: '/analyses',
  createButton: (p: Page) =>
    first(p.getByRole('button', { name: /create|add|new/i }), p.getByRole('link', { name: /create|add|new/i })),
  field: (p: Page, label: RegExp) => first(p.getByLabel(label), p.getByPlaceholder(label)),
  option: (p: Page, text: string) =>
    first(p.getByRole('option', { name: new RegExp(text, 'i') }), p.getByText(new RegExp(text, 'i'))),
  row: (p: Page, text: string) => p.getByRole('row').filter({ hasText: text }).first(),
  startButton: (row: Locator) => row.getByRole('button', { name: /start|run|play/i }).first(),
  // Datastore list: search box + per-row delete (right-side action).
  dsListSearch: (p: Page) => first(p.getByPlaceholder(/search|keyword|filter/i), p.getByRole('textbox')),
  // Each datastore row has "test-connection" + "Delete"; anchor on the name.
  dsRowDelete: (p: Page, text: string) =>
    first(
      p.getByRole('row').filter({ hasText: text }).getByRole('button', { name: /^delete$/i }),
      p.getByText(text, { exact: false }).first().locator('xpath=following::button[normalize-space()="Delete"][1]'),
    ),

  // Datastore create form (PrimeVue). "Autofill S3" sets type=S3 + the SeaweedFS
  // host/port; then fill bucket, Private, and the access/secret keys.
  dsProjectSelect: (p: Page) => p.locator('[data-pc-name="select"]').filter({ hasText: /select a project/i }).first(),
  dsSelectFilter: (p: Page) => p.locator('[data-pc-section="filterinput"], [data-pc-name="pcfilter"] input, input[role="searchbox"]').first(),
  dsSelectOption: (p: Page, text: string) =>
    p.locator('[data-pc-section="option"], li[role="option"]').filter({ hasText: text }).first(),
  autofillS3: (p: Page) => p.getByRole('button', { name: /autofill s3/i }),
  dsName: (p: Page) => p.getByPlaceholder(/name of the data store/i),
  dsBucket: (p: Page) => p.getByPlaceholder(/name of the s3 bucket/i),
  dsAccessKey: (p: Page) => p.getByPlaceholder(/access key/i),
  dsSecretKey: (p: Page) => p.getByPlaceholder(/secret key/i),
  dsPrivate: (p: Page) => p.getByText('Private', { exact: true }),
  dsSubmit: (p: Page) => p.getByRole('button', { name: /create data store|create|save|submit/i }).last(),
  dsSuccess: (p: Page) =>
    first(p.locator('.p-toast-message').filter({ hasText: /success|registered/i }), p.getByText(/successfully registered|registration success/i)),
};

// ------------------------------------------------------ S3 console (SeaweedFS)
// SeaweedFS Admin UI under /s3. Login is a classic form (hidden csrf_token);
// the console is a server-rendered SPA with /object-store/* routes.
export const s3 = {
  user: (p: Page) =>
    first(p.locator('#accessKey'), p.getByLabel(/user|access key/i), p.getByPlaceholder(/username|access key/i), p.locator('input[type="text"]:visible')),
  pass: (p: Page) => first(p.locator('#secretKey'), p.getByLabel(/password|secret key/i), p.locator('input[type="password"]:visible')),
  submit: (p: Page) => first(p.locator('#do-login'), p.getByRole('button', { name: /log ?in|sign ?in|anmelden/i })),

  bucketsPath: '/object-store/buckets',
  usersPath: '/object-store/users',
  filesPath: '/files',

  // Create Bucket: page button opens the Bootstrap modal #createBucketModal.
  createBucketOpen: (p: Page) => p.getByRole('button', { name: /create bucket/i }).first(),
  bucketName: (p: Page) => first(p.locator('#bucketName'), p.getByLabel(/bucket name/i)),
  createBucketSubmit: (p: Page) =>
    p.locator('#createBucketModal').getByRole('button', { name: /create bucket/i }).last(),
  bucketRow: (p: Page, bucket: string) => p.getByText(bucket, { exact: true }).first(),

  // File browser for a bucket: /s3/files?path=/buckets/<bucket>. Toolbar
  // "Upload" opens #uploadFileModal (file input + "Upload Files" submit).
  bucketFilesPath: (bucket: string) => `/files?path=/buckets/${bucket}`,
  uploadOpen: (p: Page) => p.locator('button[onclick="uploadFile()"]'),
  fileInput: (p: Page) => p.locator('#uploadFileModal input[type="file"]').first(),
  uploadSubmit: (p: Page) => p.locator('button[onclick="submitUploadFile()"]'),
  object: (p: Page, name: string) => p.getByText(name, { exact: false }).first(),

  // Create User dialog (#createUserModal): username, Read/List permissions,
  // Specific Buckets -> #selectedBuckets. On submit a "New Access Key Created"
  // modal shows the generated access/secret key (inputs id$=_accessKey/_secretKey).
  createUserOpen: (p: Page) => p.getByRole('button', { name: /create user|add user|new user/i }).first(),
  username: (p: Page) => p.locator('#createUserModal #username'),
  permissions: (p: Page) => p.locator('#createUserModal #actions'),
  specificBuckets: (p: Page) => p.locator('#createUserModal #specificBuckets'),
  selectedBuckets: (p: Page) => p.locator('#createUserModal #selectedBuckets'),
  createUserSubmit: (p: Page) => p.locator('#createUserModal').getByRole('button', { name: /^create user$/i }).last(),
  newKeyAccess: (p: Page) => p.locator('input[id$="_accessKey"]').first(),
  newKeySecret: (p: Page) => p.locator('input[id$="_secretKey"]').first(),
  userRow: (p: Page, name: string) => p.getByText(name, { exact: true }).first(),

  // Deletion (cleanup): per-row delete in the buckets/users tables + a confirm.
  bucketRowDelete: (p: Page, bucket: string) =>
    first(
      p.getByRole('row').filter({ hasText: bucket }).getByRole('button', { name: /delete|remove|trash/i }),
      p.getByRole('row').filter({ hasText: bucket }).getByRole('button').last(),
    ),
  userRowDelete: (p: Page, user: string) =>
    first(
      p.getByRole('row').filter({ hasText: user }).getByRole('button', { name: /delete|remove|trash/i }),
      p.getByRole('row').filter({ hasText: user }).getByRole('button').last(),
    ),
  confirmDelete: (p: Page) =>
    first(
      p.locator('.modal.show, [role="dialog"]').getByRole('button', { name: /delete|confirm|yes|ok/i }),
      p.getByRole('button', { name: /^(delete|confirm|yes|ok)$/i }),
    ).last(),
};
