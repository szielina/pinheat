# pinheat

**Live version: <https://szielina.github.io/pinheat/>**

An interactive heat map of 4-digit PIN codes. Every cell of the map is one PIN
(0000 to 9999), and its colour says how often that PIN shows up in leaked
passwords. Instead of one static picture, you pick the projection, the colour
scale and the filters yourself, and see where the same set of PINs lands under a
different view.

The data has only one dimension (how often each PIN appears), so the value is
not in new data but in how those 10,000 numbers are sliced and labelled.

## How to read it

- **Position.** In the default view (AB × CD) the rows are the first two digits
  and the columns the last two, so `47nn` is the whole row of PINs starting with
  47. The other projections arrange the same PINs differently.
- **Colour.** The bar under the map says what the colours mean. Counts are shown
  relative to an average PIN: `10×` means ten times as common as if all PINs were
  equally likely, `1× avg` is the average itself.
- **Scales.** Linear, gamma and logarithmic show the counts; rank equalises the
  colours so every shade holds the same number of PINs. A few PINs (1234, 1111,
  0000) are so common that they wash out everything else on a linear scale.
  "vs row/column" takes out what the PIN's row and column of the map predict and
  colours the rest (1× = as expected), so diagonals and blocks that the rows and
  columns do not explain stand out; it depends on the projection.
- **Dimmed cells** are filtered out by a tag, by popularity or by a selection.

## Features

- Three projections of a 4-digit PIN: AB × CD, AC × BD, AD × BC
- Five colour scales, four palettes (two of them colour-blind friendly), clipping
  at a percentile
- A legend that follows the scale, with markers for the PIN under the cursor and
  the clicked PIN
- Zoom and pan, axes labelled with PIN patterns
- Click a PIN for its stats: how it compares with an average PIN, its rank, its
  tags
- Tags for patterns (dates, years, also with two-digit years or read backwards;
  repeats, sequences, palindromes) and for shapes
  on a numeric keypad (squares, lines, diamonds, echoes), each with the share of all
  occurrences it explains and how much more common than chance that is
- "By popularity": highlight the N most (or least) common PINs
- Charts under the map for the PINs that are shown: how often each digit occurs
  (by occurrences or by PIN, pooled or per position) and totals per row and column
  of the current projection (linear or logarithmic)
- Rectangle selection (Shift + drag) that survives a change of projection
- View settings are kept in the URL hash, so a view can be shared by link
- Works on touch screens (drag, pinch, tap)

## Quick start

Requires Node.js 20.19 or newer (or 22.12+).

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

The Pwned Passwords data and API are licensed by HIBP under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). `pins4.bin` only holds
the occurrence count for each of the 10,000 four-digit strings, aggregated from
that API.

Caveats: these are passwords from data breaches, not a representative sample of
PINs in use, and the counts are occurrences, not unique people.

## Architecture

A static client (TypeScript, Vite, canvas); no backend. Everything is computed in
your browser; the app itself sends nothing anywhere. The hosted site only counts
page views with Cloudflare Web Analytics (no cookies, no ad tracking).

    src/core/   domain: dataset, projections, classifier, scale, legend, coverage
                (pure functions, no DOM; enforced by its own tsconfig)
    src/app/    adapters: data loading, URL state, axes, tooltips
    src/main.ts composition root and UI

`npm run typecheck` compiles `src/core` against the ES2020 library only, so any
use of `document`, `fetch` or `console` in the domain layer fails the build.

## Deployment

GitHub Actions builds the site and publishes it to GitHub Pages on every push to
`main` (see `.github/workflows/deploy.yml`). In the repository settings, set
Pages → Source to "GitHub Actions".

## Credits and inspirations

- **Data:** [Have I Been Pwned](https://haveibeenpwned.com/) by Troy Hunt
  (Pwned Passwords range API).
- **Nick Berry**, [PIN number analysis](https://datagenetics.com/blog/september32012/)
  (DataGenetics, 2012): an early heat map of 4-digit PINs, with the analysis of
  years, dates and the diagonal that this kind of map is known for.
- **Tareq "Torque" Dandachi**, [Analyzing Pin Code Breaches](https://www.itstorque.com/blog/2025_01_05_pin_analysis/)
  (2025): an updated map with an interactive chart, and a look at dates, years,
  the diagonal and the rarely used region.
- **Slon104**, [Common-PIN-Analysis-from-haveibeenpwned.com](https://github.com/Slon104/Common-PIN-Analysis-from-haveibeenpwned.com)
  (MIT): PIN lists by popularity, plus static heat maps and 3D plots.

pinheat is an independent project. It is not affiliated with or endorsed by Have I
Been Pwned or the authors above.

## Built with

The code was written entirely by Claude (Anthropic, Sonnet 5.5 at medium effort).
The ideas, the direction, the testing and the decisions are Sławek's.
