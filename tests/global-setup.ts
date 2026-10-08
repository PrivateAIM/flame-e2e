/**
 * Computes one RUN_ID for the whole `playwright test` invocation and writes it to
 * .run-id, so every spec file (each loaded in its own worker) shares the same id
 * and the role-based specs chain against one project. An explicit RUN_ID env var
 * is honoured, to re-target a prior run.
 */
import fs from 'node:fs';
import path from 'node:path';

export default function globalSetup() {
  const runId =
    process.env.RUN_ID ?? `e2e-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}`;
  fs.writeFileSync(path.resolve('.run-id'), runId);
  // eslint-disable-next-line no-console
  console.log(`RUN_ID=${runId}`);
}
