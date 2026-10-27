# Keyword sets (US market, English)

How they are used: the App Store has ONE hidden Keywords field per language (100 characters, comma-separated, no spaces after commas); Apple already indexes the Name and Subtitle, so never repeat their words there. Google Play has no keyword field: it reads the title, short and full description, so the words below must appear naturally in the text (do not stuff). The sets differ in intent; Set A is what is in the draft files. Sets B and C feed Custom Product Pages / custom store listings, search ads (off by default) and the website pages (PSEO package), not the one field.

Rules for all sets: no "best", "top", "#1", "leading", "guaranteed", "cheap", "free consultation", no competitor names, no "specialist/expert", no brand names of courts or agencies as if endorsed.

## Set A — client intent (the default field, in `app-store/en-US/keywords.txt`)

```
attorney,legal,divorce,immigration,injury,dui,custody,eviction,tenant,bankruptcy,visa,estate,court
```
Already in Name/Subtitle (not repeated): lawbid, find, lawyer, post, case, compare, offers. Wider pool to rotate in after 4-6 weeks of data (one change at a time): lawsuit, will, trust, traffic, ticket, accident, landlord, wage, claim, appeal, probate, green card, citizenship, asylum, expungement, small claims, child support, restraining order.

## Set B — attorney intent (Custom Product Page "For attorneys"; Play custom listing)

```
attorney,cases,clients,law firm,practice,profile,offers,alerts,marketing,solo,leads,subscription
```
Use in the page's promotional text and screenshots (new cases in your state, send offers, flat subscription, no commission on your fees). Wording to avoid: "get more clients" as a promise, "guaranteed cases", "top-ranked". Play full description second block ("FOR ATTORNEYS") already carries the words.

## Set C — New York local (Custom Product Page "New York"; Play custom listing for the New York state target; ads)

```
new york,nyc,brooklyn,queens,bronx,manhattan,long island,albany,buffalo,rochester,housing court,landlord,tenant,nys
```
Only claim what is true: "attorneys licensed in New York" (not "NYC's lawyers"), never a court-endorsement look. Pair with practice words that matter in New York: tenant/landlord, immigration, DUI/DWI (New York uses DWI), personal injury, divorce, custody. Add the same words as plain text in the page copy, not only as keywords.

## Notes

- Apple's field is per locale. The US storefront is read from en-US; ASO vendors report that a second locale (for example es-MX) also feeds US search — verify in Apple's documentation before relying on it, and never put Spanish promises without Spanish-reading support.
- Singular/plural: Apple matches both, write the singular only.
- Check again in 4-6 weeks: App Store Connect → Analytics → Sources → App Store Search, and Play Console → Grow users → Store presence → Store listing acquisition (names move between releases; use the console search box).
