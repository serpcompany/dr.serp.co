# Invalid Domain Cleanup

- `normalizeTarget()` now lives in `src/server/domain-target.mjs` and is the single source of truth for domain validation.
- Invalid path-like inputs such as `phpinfo.php`, `wp-login.php`, `ftp-config.json`, `contact`, and `pricing` must be rejected at API boundaries before any claim or recheck work begins.
- `/sites` and `countSites()` also filter invalid domains at read time as a defense-in-depth backstop, so legacy junk rows do not leak into the public list.
- Existing bad rows are not removed automatically by validation alone. Use `POST /api/admin/sites/cleanup-invalid` with `x-admin-token: $DR_ADMIN_TOKEN` to dry-run or purge the known invalid domain set through app code.
- Scanner probes are rejected too: backup/config suffixes (`.save`, `.properties`, `.inc`, `.old`), the closed `.map` and `.prod` TLDs, script extensions before `.dev`/`.new` (`index.php.dev`), and bare config file names (`dockerfile.dev`, `outputs.tf`, `sendmail.cf`).
- Spam sites (gambling, escort, darknet markets, pharma, toto/togel) are matched by domain and site title in `src/server/site-spam.mjs`. They are hidden from `/sites` and counts, their pages render not-found with `noindex`, and spam domains get no paid DR lookup. Adult keywords are excluded on purpose so our own downloader sites are not caught.
- The cleanup purge (`npm run sites:purge-invalid`, or the admin call below with no `domains`) deletes invalid domains and **unclaimed** spam sites. Claimed rows are never purged by the spam rule.
- First-visit DR lookups are capped at 10 per IP per hour and 100 per day site-wide (`NEW_SITE_LOOKUP_*`).
- Regression coverage lives in `src/server/site-spam.test.ts`, `src/server/db-d1.test.ts`, `src/server/domain-target.test.ts`, `src/app/api/claims/route.test.ts`, `src/app/api/recheck/route.test.ts`, and `src/server/db-sites.test.ts`.

## Cleanup Call

Dry-run:

```bash
curl -X POST \
  -H "x-admin-token: $DR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"dryRun":true}' \
  https://dr.serp.co/api/admin/sites/cleanup-invalid
```

Execute purge:

```bash
curl -X POST \
  -H "x-admin-token: $DR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"dryRun":false}' \
  https://dr.serp.co/api/admin/sites/cleanup-invalid
```
