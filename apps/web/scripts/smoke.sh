#!/usr/bin/env bash
# Post-deploy smoke test: scripts/smoke.sh <base-url> <staging|production>
#
# <base-url> is the environment's canonical host or its workers.dev URL. Every request below sends
# the smoke-test header, which lets CI test through workers.dev (worker.ts skips the host redirect
# for it). It checks pages, the badge and the API, the robots rule for the environment, that the
# workers.dev host redirects to the canonical host without the header, and that a write route
# refuses a request with no Origin. Standards: environment-configuration.md (Verification).
#
# /sites/example.com is stored in both environments, so the page never calls Ahrefs.
set -uo pipefail

base="${1:-}"
env="${2:-}"
case "$env" in
  staging)
    canonical="https://staging-dr.serp.co"
    platform="https://serp-dr-preview.serpcompany.workers.dev"
    ;;
  production)
    canonical="https://dr.serp.co"
    platform="https://serp-dr.serpcompany.workers.dev"
    ;;
  *)
    echo "usage: scripts/smoke.sh <base-url> <staging|production>" >&2
    exit 2
    ;;
esac
if [ -z "$base" ]; then
  echo "usage: scripts/smoke.sh <base-url> <staging|production>" >&2
  exit 2
fi
base="${base%/}"

header="x-dr-serp-smoke-test: 1"
# Every request gives up after 15 s, so a stalled connection fails the check instead of hanging.
curl_() { curl -sS --connect-timeout 5 --max-time 15 "$@"; }
failures=0

pass() { echo "ok    $1"; }
fail() {
  echo "FAIL  $1" >&2
  failures=$((failures + 1))
}

# expect_status <path> <status> [content-type prefix]
expect_status() {
  local path="$1" want="$2" type="${3:-}" got
  got=$(curl_ -o /dev/null -w '%{http_code} %{content_type}' -H "$header" "$base$path") || got="000"
  if [ "${got%% *}" != "$want" ]; then
    fail "GET $path: $got, want $want"
  elif [ -n "$type" ] && [[ "${got#* }" != "$type"* ]]; then
    fail "GET $path: content type ${got#* }, want $type"
  else
    pass "GET $path: $want"
  fi
}

expect_status / 200 text/html
expect_status /pricing 200 text/html
expect_status /sites/example.com 200 text/html
expect_status /badge/example.com 200 image/svg+xml
expect_status '/api/sites?limit=1' 200 application/json

# Robots: Staging sends noindex on every response; Production never does.
if ! headers=$(curl_ -D - -o /dev/null -H "$header" "$base/pricing"); then
  fail "GET /pricing for the robots header: request failed"
  headers=""
fi
robots=$(printf '%s' "$headers" | tr -d '\r' |
  awk 'tolower($1) == "x-robots-tag:" { print tolower($2) }')
if [ -z "$headers" ]; then
  : # already reported
elif [ "$env" = staging ] && [ "$robots" != noindex ]; then
  fail "Staging must send X-Robots-Tag: noindex (got '${robots}')"
elif [ "$env" = production ] && [ -n "$robots" ]; then
  fail "Production must not send X-Robots-Tag (got '${robots}')"
else
  pass "robots header for $env: '${robots}'"
fi

# The platform host redirects to the canonical host without the header. A new version can take a
# few seconds to replace the old one at the edge, so retry briefly.
want="$canonical/sites/example.com?smoke=1"
got=""
for _ in 1 2 3 4 5 6; do
  got=$(curl_ -o /dev/null -w '%{http_code} %{redirect_url}' "$platform/sites/example.com?smoke=1") || got="000"
  [ "$got" = "308 $want" ] && break
  sleep 5
done
if [ "$got" = "308 $want" ]; then
  pass "workers.dev redirects to $canonical"
else
  fail "workers.dev without the header: '$got', want '308 $want'"
fi

# A write route refuses a request without Origin before doing any work.
status=$(curl_ -o /dev/null -w '%{http_code}' -X POST -H "$header" \
  -H 'Content-Type: application/json' -d '{}' "$base/api/stripe/checkout") || status="000"
if [ "$status" = 403 ]; then
  pass "POST /api/stripe/checkout without Origin: 403"
else
  fail "POST /api/stripe/checkout without Origin: $status, want 403"
fi

if [ "$failures" -gt 0 ]; then
  echo "$failures smoke check(s) failed for $env at $base" >&2
  exit 1
fi
echo "All smoke checks passed for $env at $base"
