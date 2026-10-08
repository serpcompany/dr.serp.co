# How to Get Ahrefs DR Without API

Archived 2026-10: no caller reaches these scrapers any more (see docs/dr-lookups.md).

Research notes on public DR checker services that can be scraped for Domain Rating data.

## RhinoRank

1. Go to: https://www.rhinorank.io/da-dr-checker/
2. Enter the website into their input
3. Hit enter
4. Pull the Ahrefs DR from their HTML

## EditorialLink

1. Go to: https://editorial.link/da-dr-checker/
2. Enter the website into their input
3. Hit enter
4. Pull the Ahrefs DR from their HTML

## Other Similar Services

- https://websiteseochecker.com/domain-authority-checker/#arearesult
- https://www.dapachecker.org/dr-ur-checker

## Implementation

The actual scraping implementation is in `src/server/dr-providers.mjs`.