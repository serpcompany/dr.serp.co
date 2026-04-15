# Invalid Domain Cleanup

- `normalizeTarget()` now lives in `src/server/domain-target.mjs` and is the single source of truth for domain validation.
- Invalid path-like inputs such as `phpinfo.php`, `wp-login.php`, `ftp-config.json`, `contact`, and `pricing` must be rejected at API boundaries before any claim or recheck work begins.
- `/sites` and `countSites()` also filter invalid domains at read time as a defense-in-depth backstop, so legacy junk rows do not leak into the public list.
- Existing bad rows are not removed automatically by validation alone. Use `POST /api/admin/sites/cleanup-invalid` with `x-admin-token: $DR_ADMIN_TOKEN` to dry-run or purge the known invalid domain set through app code.
- Regression coverage lives in `src/server/domain-target.test.ts`, `src/app/api/claims/route.test.ts`, `src/app/api/recheck/route.test.ts`, and `src/server/db-sites.test.ts`.

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
