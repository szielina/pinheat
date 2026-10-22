# pinheat

An interactive heat map of PIN codes. Instead of a single static picture, you
choose the projection, the scale and the filters yourself, and see where the
same set of PINs lands under a different view.

The data has one dimension (how often each PIN appears in leaked passwords), so
the value is not in new data but in how those 10,000 numbers are sliced and
classified.

## Features

- Three projections of a 4-digit PIN: AB×CD, AC×BD, AD×BC
- Linear, logarithmic and gamma colour scales
- Pattern tags (dates, years, repeats, sequences, keypad lines, palindromes)
  with a "share of mass explained" for each tag and for the remainder
- Hover: PIN, count, share, popularity rank
- Rectangle selection that persists across projections, with the top 5 PINs
- "Number of attempts" slider showing the cumulative coverage
- View state kept in the URL hash (`#p=&s=&g=&t=`), so views can be shared

## Quick start

Requires Node.js 18 or newer.

    npm install
    npm run data      # one-off: fetches public/pins4.bin from HIBP
    npm run dev       # http://localhost:5173
    npm run build     # type-check + production build into dist/

Without `public/pins4.bin` the app shows clearly labelled synthetic demo data.

## Data

Source: [Have I Been Pwned – Pwned Passwords](https://haveibeenpwned.com/API/v3#PwnedPasswords)
range API (k-anonymity: only a 5-character SHA-1 prefix is sent). Only the number
of occurrences per string is available: no breach, date or country.

`public/pins4.bin` is a little-endian `Uint32Array` (40 KB) where the index is the
PIN value. It is generated offline by `scripts/fetch-hibp.mjs`.

Caveats: these are passwords from data breaches, not a representative sample of
PINs in use, and the counts are occurrences, not unique people.

## Architecture

A static client (TypeScript, Vite, canvas); no backend. Everything runs in the
browser and no user data is sent anywhere.

    src/core/   domain: dataset, projections, classifier, scale, coverage
                (pure functions, no DOM; enforced by its own tsconfig)
    src/app/    adapters: data loading, URL state
    src/main.ts composition root and UI

`npm run typecheck` compiles `src/core` against the ES2020 library only, so any
use of `document`, `fetch` or `console` in the domain layer fails the build.

## Deployment

GitHub Actions builds the site and publishes it to GitHub Pages on every push to
`main` (see `.github/workflows/deploy.yml`). In the repository settings, set
Pages → Source to "GitHub Actions".
