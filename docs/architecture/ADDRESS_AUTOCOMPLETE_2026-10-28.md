# Address autocomplete + open in maps (2026-10-28)

Owner request (2026-10-28): (a) every address input suggests real US addresses
while typing, including small towns, street level (like Google / Uber);
(b) a tapped address opens the phone's maps apps with the address filled in
for directions; (c) address fields "do not work" today — find and fix.

## 1. What was wrong (c)

| # | Finding | Fix |
|---|---|---|
| 1 | There was no suggestion source at all: no endpoint, no provider, no key. Every address field was a bare `AppTextField`, so typing could never suggest anything. | `GET /addresses/suggest` (server proxy) + `AddressField` on every address input. |
| 2 | Chat place card: only the small «Open in maps» line under the card reacted; a tap on the address itself did nothing. | The whole card opens the maps chooser. |
| 3 | Case city (owner and attorney case screens) was plain text, not tappable. | Tappable → maps (`City, ST`). |
| 4 | Maps opened hard-wired apps: Apple Maps on iPhone, the Google web link elsewhere; no Waze, no choice. iOS `Info.plist` had no `LSApplicationQueriesSchemes`, Android had no `geo` `<queries>` entry, so installed maps apps could not even be detected. | Android: the `geo:` system chooser; iPhone: a sheet with the installed apps (Apple Maps / Google Maps / Waze) + «Copy the address»; web: Google Maps directions. Platform entries added. |
| 5 | Checked and NOT a bug: place messages in a pre-hire chat go through the contact masker; real US addresses (`350 5th Ave, New York, NY 10118`, `4500 N 1200 E, Logan, UT 84341`, …) are not masked. | — |
| 6 | Note: the task-level «Addresses» editor was removed with the old full task editor (commit 9e4a32177, dead code); task places are display-only in the app now. Not restored (UI frozen). | — |

## 2. Provider choice (research 2026-10-28, live sources)

| | Amazon Location Places v2 | Google Places API (New) | Mapbox Search Box |
|---|---|---|---|
| US data | HERE (street + house numbers, small towns) | Google | Mapbox (OSM + own) |
| Price | Autocomplete «Label» $0.20 / 1 000 (Core $0.50, Stored $4.00); free 10 000 / month for 3 months | Autocomplete $2.83 / 1 000 after 10 000 free a month; a session that ends in Place Details makes later key strokes free | Sessions $11.50 / 1 000 (2.5 k free; preview $3) |
| Auth | IAM SigV4 from the ECS task role: no key anywhere | API key (server side only) | Token |
| Caching | Forbidden: AWS Service Terms §82.5.a (no store / cache of Location Data except stored geocodes / routes); Autocomplete `IntendedUse` = `SingleUse` only | Forbidden except place IDs (Maps Platform terms) | Search Box: no permanent storage |

Sources (checked 2026-10-28):
- AWS pricing table (price map JSON behind https://aws.amazon.com/location/pricing/): Label $0.0002, Core $0.0005, Stored $0.004 per request.
- https://docs.aws.amazon.com/location/latest/developerguide/places-pricing.html — buckets; «Results cannot be stored permanently» for Label/Core.
- https://docs.aws.amazon.com/location/latest/APIReference/API_geoplaces_Autocomplete.html — `IntendedUse`: SingleUse only; `Filter.IncludeCountries`, `IncludePlaceTypes`.
- https://aws.amazon.com/service-terms/ (Last Updated October 22, 2026) §82.5.a — no store/cache of Location Data.
- https://docs.aws.amazon.com/service-authorization/latest/reference/list_geo-places.html — `geo-places:Autocomplete` on `arn:aws:geo-places:<region>::provider/default`.
- https://developers.google.com/maps/billing-and-pricing/pricing and https://developers.google.com/maps/documentation/places/web-service/session-pricing — $2.83 / 1 000, 10 000 free, sessions.
- https://docs.mapbox.com/mapbox-search-js/guides/pricing/ — session pricing; pricingsaas.com tracker (2026 W40) for the preview rate.

**Decision: Amazon Location (default), Google Places as the admin-selectable
second provider.** Same street-level US quality class, 14× cheaper than Google,
no key to leak (IAM task role), already on AWS. Google stays one switch away
(`addresses.provider = google` + a key in Ключи и сервисы).

**Cache decision (deviation from the request, on purpose):** the owner asked
for a Redis cache (normalized query → results, TTL ≥ 7 days). Both providers'
terms forbid caching their answers, so the cache is built and tested
(`addr:v1:<sha256>`, 7 days) but is used only for a provider that declares
`cacheable = true`; Amazon Location and Google both declare `false`. Cost
control instead: 300 ms debounce, 3+ letters, server-side min length,
in-flight de-duplication of identical queries, per-person minute/day limits,
a global per-minute limit and a monthly cap.

## 3. Architecture

```
AddressField (Flutter)  --debounce 300 ms, 3+ letters, session id-->
  GET /api/v1/addresses/suggest?q=&kind=address|city&session=
    AddressesService: switch -> provider configured? -> min length ->
      per-person 60/min + addresses.per_user_per_day -> (cache if allowed) ->
      in-flight dedupe -> global 1 200/min -> addresses.monthly_cap ->
      provider (2.5 s timeout) -> [] on any error
    providers: AwsLocationAddressProvider (geo-places Autocomplete, Label,
      IncludeCountries=USA, Locality for kind=city) |
      GooglePlacesAddressProvider (places:autocomplete, includedRegionCodes=us,
      sessionToken)
```

- Answer: `{ enabled, items: [{ label, city, stateCode }] }`. `enabled=false`
  (switch off, no keys, provider missing) → the app stops asking for that
  field; it is a plain text field again. Provider failure → `items: []`.
- Settings (Админка → Настройки, `app_config`): `addresses.autocomplete_enabled`
  (off | on | auto, default auto = only once keys/region exist),
  `addresses.provider` (aws | google), `addresses.monthly_cap` (300 000),
  `addresses.per_user_per_day` (300). Row in `docs/dev/SWITCH_INVENTORY.md`;
  cost row `vendor.address_autocomplete` in the cost ladder.
- Integrations: `aws_location` (region; keys optional, empty = task role),
  `google_places` (apiKey). Env fallbacks `ADDRESS_AWS_*`, `GOOGLE_PLACES_API_KEY`.
- Terraform: `infra/modules/ecs` policy `geo-places-autocomplete` on the API
  task role (read-only, the stack region). Owner applies it.

### Address inputs now using `AddressField`

| Screen | File | Kind |
|---|---|---|
| Chat → attach → Place | `features/chat/presentation/chat_cards.dart` (`_PlaceSheet`) | address |
| Task step «Address / place» | `features/team/presentation/task_sheet.dart` | address |
| Create / edit case → City | `features/cases/presentation/widgets/case_wizard_steps.dart` | city |
| DMCA notice → postal address | `features/legal/presentation/dmca_notice_screen.dart` | address |

### Addresses that open the maps chooser

Chat place card (conversation + Saved), task places and step location, case
city on the owner and attorney case screens.

## 4. Cost (Amazon Location, Label bucket)

Assumption: one address typed per person every 1–6 months, 3–6 calls each
(debounced) → 2–12 calls per person per month.

| Users | Calls / month | Amazon ($0.20 / 1 000) | Google ($2.83 / 1 000 after 10 k free) |
|---|---|---|---|
| 1 000 | 2 k – 12 k | $0 (free tier 10 k for 3 months) – $2.40 | $0 – $5.70 |
| 100 000 | 200 k – 1.2 M | $40 – $240 | $540 – $3 370 |
| 1 000 000 | 2 M – 12 M | $400 – $2 400 | $5 630 – $34 000 |

Ceiling: `addresses.monthly_cap` (default 300 000 calls ≈ $60 on Amazon).

## 5. Not verified here

- No real Amazon Location / Google call was made (no IAM applied, no key);
  the providers are covered by unit tests with fakes and the e2e with a fake.
- No iOS / Android build (Info.plist / manifest edits checked with `plutil`
  and by review only); the chooser is widget-tested with a fake launcher.
- AWS `Autocomplete` label text for a small town was not seen live.
