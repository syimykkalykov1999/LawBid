# Store listing (ASO) package — drafts

Owner 2026-10-27, task 8 of `docs/architecture/PSEO_ASO_PACKAGE_PLAN_2026-10-27.md` (§4). Files only: nothing here calls the App Store Connect or Play Console API and nothing here is live until the owner copies it (see "How a draft goes live").

## What is here

| File | What |
|---|---|
| `app-store/en-US/*.txt` | App Store draft, US market: name, subtitle, keywords, promotional text, description (fastlane `deliver` file names) |
| `google-play/en-US/*.txt` | Google Play draft: title, short description, full description (fastlane `supply` file names) |
| `KEYWORDS.md` | three keyword sets: client intent, attorney intent, New York local |
| `SCREENSHOTS.md` | screenshots and preview-video plan: what to capture, order, captions |
| `CUSTOM_PRODUCT_PAGES.md` | Custom Product Pages (App Store) and custom store listings (Google Play) |
| `REVIEW_PROMPTS.md` | when the app asks for a rating (the code that exists today) |
| `CHECKLIST.md` | click-by-click steps with the English names of the App Store Connect / Play Console screens; checklist keys `seo.checklist.app_store` and `seo.checklist.play_store` |

Limits are enforced by `scripts/seo/test/aso-metadata.test.mjs` (`node --test scripts/seo/test/*.test.mjs`): iOS name <= 30, subtitle <= 30, keywords <= 100 characters with no spaces, promotional text <= 170, description <= 4000; Play title <= 30, short description <= 80, full description <= 4000; and none of the words the advertising rules forbid (below). The same test also checks the live fastlane files for the same limits.

## Where the live listing is

fastlane is already used and already holds the live listing in every language: `apps/mobile/ios/fastlane/metadata/<locale>/` (lane `ios metadata`) and `apps/mobile/android/fastlane/metadata/android/<locale>/` (lane `android metadata`). So no new `metadata/` skeleton was created; the drafts above are English (US) only and sit beside it.

## How a draft goes live (owner decides)

1. Read the draft, change what you do not like (keep it plain, no promises).
2. Show the final text to a New York lawyer (plan §6: this is not legal advice).
3. Copy `app-store/en-US/*.txt` over `apps/mobile/ios/fastlane/metadata/en-US/` (keep `privacy_url.txt`, `support_url.txt`, `marketing_url.txt` as they are) and `google-play/en-US/title.txt`, `short_description.txt`, `full_description.txt` over `apps/mobile/android/fastlane/metadata/android/en-US/`.
4. Open a PR, merge, run the metadata lanes — or paste the text by hand (CHECKLIST.md).

## Advertising rules used in every text (plan §6, New York Rules of Professional Conduct 7.1)

Never write: best, top, #1, leading, guaranteed, "we will win", lowest fees, specialist / expert / certified (without an approved certifying body), "free consultation" without its conditions, comparisons with other attorneys, a client review as a promise of a result. Write: "Verified attorney" with what it means (license checked against the state registry), "licensed in", "practices in", neutral "compare offers", and "not a law firm". The check of the live copy against this list (2026-10-27):

- Live `promotional_text.txt` says "no hidden fees" — an absolute claim about every attorney's fees; the draft drops it.
- Live description says "Every attorney's license is checked before they can send offers" and "Verified badges for attorneys and clients" — keep only if it is true for every attorney (the draft says it as "a Verified badge means…", which is exactly what the badge is).
- Live Google Play short description says "Post your case free" — fine for the client side only if posting stays free; the draft keeps the wording neutral.

Not legal advice — a lawyer in New York must read the final text. The 120-day rating interval in the plan differs from the 90 days in the code: see `REVIEW_PROMPTS.md`.
