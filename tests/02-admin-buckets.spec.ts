/**
 * NODE ADMIN — Bucket creation + data upload.
 *
 * On each node's S3 (SeaweedFS) console, as the custom user: create a private
 * bucket and upload that node's demo CSV. Requires the project from
 * 01-user-project to exist (shared RUN_ID); buckets are referenced by the
 * datastore spec next.
 */
import { test } from '@playwright/test';
import path from 'node:path';
import {
  s3, expect, join, FIXTURES,
  NODES, s3Login, s3Base, createPrivateBucketUser,
} from './shared';

test.describe.configure({ mode: 'serial' });

for (const n of NODES) {
  test(`admin node ${n.idx}: create private bucket "${n.bucket}" and upload ${n.csv}`, async ({ page, request }) => {
    await test.step(`create private bucket "${n.bucket}"`, async () => {
      await s3Login(page, n);
      await page.goto(join(s3Base(n), s3.bucketsPath));

      // Idempotent: reruns reuse the fixed bucket name, so skip if it exists.
      if (!(await s3.bucketRow(page, n.bucket).isVisible().catch(() => false))) {
        await s3.createBucketOpen(page).click();
        await s3.bucketName(page).fill(n.bucket);
        await s3.createBucketSubmit(page).click();
        await page.goto(join(s3Base(n), s3.bucketsPath));
      }
      await expect(s3.bucketRow(page, n.bucket)).toBeVisible();

      // "Private" = anonymous access is rejected. Only checkable if the S3 API is reachable.
      if (n.s3PublicUrl) {
        const res = await request.get(join(n.s3PublicUrl, `/${n.bucket}/`), { failOnStatusCode: false });
        expect([401, 403], `anonymous list on ${n.bucket} must be denied`).toContain(res.status());
      } else {
        test.info().annotations.push({
          type: 'skipped-check',
          description: `Node ${n.idx}: bucket privacy not verified (NODE${n.idx}_S3_PUBLIC_URL unset)`,
        });
      }
    });

    await test.step(`upload ${n.csv}`, async () => {
      const filesUrl = join(s3Base(n), s3.bucketFilesPath(n.bucket));
      await page.goto(filesUrl);
      // Idempotent: skip if the CSV is already in the bucket.
      if (!(await s3.object(page, n.csv).isVisible().catch(() => false))) {
        await s3.uploadOpen(page).click(); // opens #uploadFileModal
        await s3.fileInput(page).setInputFiles(path.join(FIXTURES, n.csv));
        await page.waitForTimeout(500); // let the modal register the selected file
        const uploaded = page.waitForResponse(
          (r) => r.url().includes('/api/files/upload') && r.request().method() === 'POST',
          { timeout: 120_000 },
        );
        await s3.uploadSubmit(page).click(); // submitUploadFile()
        await uploaded.catch(() => {});
        await page.goto(filesUrl); // refresh the listing (no optimistic row)
      }
      await expect(s3.object(page, n.csv)).toBeVisible({ timeout: 30_000 });
    });

    await test.step(`create private-bucket user (Read+List on "${n.bucket}")`, async () => {
      const { username } = await createPrivateBucketUser(page, n);
      // Credentials are persisted for 03; record the username (not the secret).
      test.info().annotations.push({ type: 's3-user', description: `node ${n.idx}: ${username}` });
    });
  });
}
