# ASO checklist — what the owner clicks

Two checklists, referenced by key from the admin page «Продвижение» (Promotion) — the page itself belongs to the branch `claude/pseo-admin-promotion`; this file only defines the keys and items, the page reads them. Screen names are the English names in the consoles. Console menus move between releases: if a name is not where it says, use the console's search box with the English name.

Each item has an id (`<key>.<item>`) so the page can track `not started / in progress / done`. Status is set by hand by the owner.

Before you start: the drafts are in `docs/aso/` (README.md says how they go live). A New York lawyer reads the final text first.

---

## `seo.checklist.app_store` — App Store Connect

| Item id | Where (English UI names) | What to do |
|---|---|---|
| `seo.checklist.app_store.access` | appstoreconnect.apple.com -> Apps -> LawBid | Sign in with the Apple ID that owns the developer account (2-step code) |
| `seo.checklist.app_store.name_subtitle` | Apps -> LawBid -> App Information -> Localizable Information (English (U.S.)) | Name: `app-store/en-US/name.txt`; Subtitle: `subtitle.txt` -> Save |
| `seo.checklist.app_store.keywords` | Apps -> LawBid -> iOS App version -> Version Information (English (U.S.)) | Keywords: `keywords.txt` (<= 100 characters), Promotional Text: `promotional_text.txt`, Description: `description.txt`; Support URL and Marketing URL as before -> Save |
| `seo.checklist.app_store.category` | App Information -> Category | Primary: Lifestyle (as in `primary_category.txt`), Secondary: Business — change only on purpose |
| `seo.checklist.app_store.screenshots` | Version Information -> App Previews and Screenshots -> iPhone 6.9" Display | Upload the eight frames in the order of SCREENSHOTS.md; optional App Preview (15-30 s) |
| `seo.checklist.app_store.privacy` | Apps -> LawBid -> App Privacy | Check the answers still match the app (docs/RELEASE_CHECKLIST §4); Privacy Policy URL https://lawbid.dev/privacy |
| `seo.checklist.app_store.age_rating` | App Information -> Age Rating -> Edit | Unchanged unless a feature changed |
| `seo.checklist.app_store.cpp` | Apps -> LawBid -> Custom Product Pages (sidebar, under the Marketing / Distribution area; Product Page Optimization sits next to it) | Create the pages in the order of CUSTOM_PRODUCT_PAGES.md: Create Custom Product Page -> name -> promotional text + screenshots -> Keywords (bind) -> Save, then Submit for review with the next version or alone |
| `seo.checklist.app_store.events` | Apps -> LawBid -> In-App Events | Only a real event (for example a Q&A week). Do not invent one; leave empty otherwise |
| `seo.checklist.app_store.ratings` | Apps -> LawBid -> Ratings and Reviews | Reply to each review by hand (no result promises). Rating dialog in the app: switch the flag `in_app_review` on in the admin only after the listing is live (REVIEW_PROMPTS.md) |
| `seo.checklist.app_store.universal_links` | Apple Developer -> Certificates, Identifiers & Profiles -> Identifiers -> com.lawbid.lawbid -> Capabilities | Associated Domains stays checked (docs/deeplinks/README.md) |
| `seo.checklist.app_store.search_console_apple` | Settings -> Siri & Search -> LawBid on a test iPhone | Show App in Search and Show Content in Search are on (Spotlight check, docs/deeplinks/README.md) |
| `seo.checklist.app_store.submit` | Version page -> Add for Review -> Submit for Review | Only with a build; a metadata-only change can be sent with the next version |
| `seo.checklist.app_store.watch` | Apps -> LawBid -> Analytics -> Acquisition / Sources | Look weekly at impressions, product page views, conversion, per page; log one line per change |

## `seo.checklist.play_store` — Google Play Console

| Item id | Where (English UI names) | What to do |
|---|---|---|
| `seo.checklist.play_store.access` | play.google.com/console -> All apps -> LawBid | Sign in with the developer account |
| `seo.checklist.play_store.main_listing` | Grow users -> Store presence -> Main store listing (older name: Store listing) | App name: `google-play/en-US/title.txt`; Short description: `short_description.txt`; Full description: `full_description.txt` -> Save |
| `seo.checklist.play_store.graphics` | Main store listing -> Graphics | App icon 512 x 512, Feature graphic 1024 x 500, Phone screenshots (8, order of SCREENSHOTS.md), optional Video (YouTube link) |
| `seo.checklist.play_store.custom_listings` | Grow users -> Store presence -> Custom store listings -> Create listing | Start with injury, immigration, divorce (CUSTOM_PRODUCT_PAGES.md); target: Search keyword, a Country/region, or a Campaign |
| `seo.checklist.play_store.experiments` | Grow users -> Store presence -> Store listing experiments -> Create experiment | One test at a time: icon, screenshots or short description; run until Play says the result is significant |
| `seo.checklist.play_store.signing_sha` | Test and release -> App integrity -> Play app signing -> Settings -> App signing key certificate | Copy SHA-256 certificate fingerprint; add the upload key fingerprint too, comma-separated |
| `seo.checklist.play_store.assetlinks` | GitHub -> LawBid repo -> Settings -> Secrets and variables -> Actions -> Variables -> New repository variable | Name `ANDROID_APP_SHA256`, value = the fingerprints; then Actions -> SEO pages -> Run workflow. Check: `adb shell pm verify-app-links --re-verify com.lawbid.lawbid` (docs/deeplinks/README.md) |
| `seo.checklist.play_store.app_content` | Policy and programs -> App content | Data safety, Target audience and content, Ads, Content rating: still match the app |
| `seo.checklist.play_store.reviews` | Grow users -> Ratings and reviews -> Reviews | Reply to each review by hand; in-app rating dialog is the same flag `in_app_review` |
| `seo.checklist.play_store.publish` | Main store listing -> Publish changes / Publishing overview -> Send changes for review | Listing changes are reviewed separately from the app bundle |
| `seo.checklist.play_store.watch` | Grow users -> Store presence -> Store listing acquisition (and Statistics) | Weekly: visitors, installers, conversion by listing; one log line per change |

---

## Order that works

1. `app_store.access`, `play_store.access`.
2. Texts (`name_subtitle`, `keywords`, `main_listing`), then graphics (`screenshots`, `graphics`).
3. Links: `signing_sha` -> `assetlinks`; `universal_links`.
4. Wait two weeks of data, then `cpp` and `custom_listings`, one at a time.
5. Flip the flag `in_app_review` in the admin when both listings are live.

Not covered here: paid ads (Apple Ads, Google App campaigns) — off, owner decision with a budget ceiling in the admin; web directories, Search Console and Bing — see the Promotion page rows and plan §5.
