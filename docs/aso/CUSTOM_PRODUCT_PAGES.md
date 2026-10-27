# Custom Product Pages (App Store) and custom store listings (Google Play)

Source facts (secondary sources, check Apple's and Google's own help pages before the first page): Apple lets a Custom Product Page be linked to keywords from the Keywords field so it can show in organic search (reported July 2025), and the number of pages per app is reported to have grown from 35 to 70 (Adapty and AppTweak blogs). Google Play custom store listings: by country, keyword search target, or ad campaign; up to 50 (Play Console "Custom store listings" page). Each keyword is attached to ONE page only.

## Rollout order (3 first, as in plan §4)

| # | Page / listing | Audience | Keywords bound (from KEYWORDS.md) | Frames 1-3 |
|---|---|---|---|---|
| 1 | Personal injury | client | injury, accident, claim | sample: car accident matter |
| 2 | Immigration | client | immigration, visa, green card | sample: visa matter |
| 3 | Divorce and custody | client | divorce, custody, child support | sample: custody matter |
| 4 | Criminal / DUI-DWI | client | dui, criminal, expungement | wait for data |
| 5 | Tenant and landlord | client | tenant, landlord, eviction, housing court | wait for data |
| 6 | Business | client | llc, contract, trademark | wait for data |
| 7 | For attorneys | attorney | Set B | attorney side frames |
| 8 | New York | client | Set C | New York wording, same frames |

Start with 1-3 and 7. Add one at a time after 2-4 weeks of impressions. A page with fewer than a few hundred impressions is noise: do not read conversion from it.

## What each page contains (App Store)

Promotional text (170) and the screenshots/preview (frames 1-3 swapped); name, subtitle, description and keywords stay the app's. Text is descriptive: "Describe your immigration matter and compare offers from attorneys licensed in your state." Not: "Best immigration lawyers".

Google Play: each custom listing has its own short description (80), full description and graphics; create it with the same wording.

## Linking from the web (no app code needed)

A Custom Product Page has its own App Store URL with `?ppid=<id>`; the PSEO website pages (plan §2) may link "Get the app" to the page that matches the practice (immigration page -> page 2). Play custom listings have their own URL with `&listing=<name>`. Only the link changes; the app and its screens are not touched.

## Measure (owner reads, manually at first)

App Store Connect -> Analytics -> Acquisition (product page views, conversion rate by page); Play Console -> Grow users -> Store presence -> Custom store listings / Store listing experiments. Keep a one-line log per change: date, page, what changed.
