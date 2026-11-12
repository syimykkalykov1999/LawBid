# Attorney bar-number sources: 50 states, DC and territories (2026-11-12)

Owner request 2026-11-12, row 54 of `OWNER_LIST_2026-11-11.md`: automate bar-number checks as far as the rules allow. Free sources are ON by default and paid sources are wired but OFF.

This file starts from `STATE_BAR_REGISTRIES_2026-10-28.md` (live checks of every lookup page, 2026-10-28) and adds what was re-checked on 2026-11-12:
- the terms of use and robots.txt of every automated site;
- open-data catalogs (Socrata Discovery API, ArcGIS Hub);
- bulk files;
- paid vendors.

Code:
- `apps/api/src/modules/verification/providers/bar-lookup/state-presets.ts` (`FREE_DEFAULT_STATES`, `PRESET_TERMS_BAN`, `PRESET_BOT_WALL`);
- `paid-bar-vendors.ts`;
- `services/state-registry.service.ts`.

## Hard limits (applied in code)
- We use only sources whose terms allow automated access. If a bar's terms forbid robots or commercial use (TX, IN, MS), the state is never asked automatically. The admin cannot switch it on: `save()` refuses it, and an old saved row is ignored.
- We never scrape a page behind CAPTCHA, Cloudflare/Turnstile, Incapsula or a login, and we never bypass bot detection.
  - The Cloudflare-fronted presets (CO, FL, MO, ND) stay **off by default**. A challenge sends the license to a verifier.
  - Captcha and login states stay manual.
- robots.txt is read before every host (RFC 9309, `robots.ts`, 24 h cache).
- Rate limits: 10 requests per minute per state by default (CO 5, FL 4), a 24 h cache, and a circuit breaker. Public pages are never swept in the monthly bulk re-check.
- Tests use recorded fixtures (`__fixtures__/`). CI never asks a live registry: `NODE_ENV=test` starts with the free defaults off, and `BAR_REGISTRY_FREE_DEFAULTS=off|on` overrides that.

## What every automatic check reports
The check matches the bar number and the full name: first, middle and last, using `namesMatch` in `registry-http.ts`. That is the same normalization the trust name-mismatch flag uses through `checkLegalName`.
- A middle name is compared only when both sides have one. An initial matches the full name.
- A first name typed with the middle name ("John Michael") matches a registry record of "John" with middle "M.".
- The license status (active / inactive) and the registry status text are stored on the check.
- A different name gives `manual_review` / `name_mismatch`. It is never a rejection.

## Count
| Result | States | Count |
|---|---|---|
| Fully automatic, free, ON by default | NY, AR, CA, NC, OH, OK, OR, PA, WA | **9** |
| Automatic preset exists, OFF by default (Cloudflare in front) | CO, FL, MO, ND | **4** |
| Terms forbid automated use (manual, cannot be switched on) | IN, MS, TX | **3** |
| Manual (no number search, captcha, login, robots ban, bot wall) | the other 35 | **35** |
| Paid services wired, OFF (each with its own switch + key slot) | MicroBilt, Surepass (both say "all 50 states") | 2 vendors |

The 4 + 3 + 35 = 42 jurisdictions without a free default can use a paid vendor once the owner switches one on. A paid vendor is asked only for a state with no free source on.

Notes on single states:
- AR and MS publish no status. A match still goes to a verifier.
- OK: its Terms of Use ban harvesting information about others. A single lookup of the number the attorney gave is not harvesting (same reading as 2026-10-28). The owner can switch OK off in «Реестры».

## Per state
Type: `open-data` = official dataset/API; `page` = official public lookup page read by a ready-made preset; `manual` = verifier opens the link. Free/paid is the source's price to us. Checked = research date (2026-10-28 = original live test, 2026-11-12 = terms / robots re-check).

| State | Source | Type | Free/paid | Terms / robots | URL | In code | Checked |
|---|---|---|---|---|---|---|---|
| AL | Alabama State Bar member search | manual | free | name search only (iMIS) | https://members.alabar.org/Member_Portal/Member_Portal/Member-Search.aspx | manual | 2026-10-28 |
| AK | Alaska Bar member directory | manual | free | no number search | https://alaskabar.org/member-directories/ | manual | 2026-10-28 |
| AZ | State Bar of Arizona Find a Lawyer | manual | free | no number field | https://www.azbar.org/FindALawyer | manual | 2026-10-28 |
| AR | AOC Attorney Search (Supreme Court) | page | free | no terms page; robots.txt returns 500 (none usable); no bot wall; rosters page offers downloads | https://attorneyinfo.aoc.arkansas.gov/info/attorney/attorneysearch.aspx | **ON** (state_preset, no status → verifier) | 2026-11-12 |
| CA | State Bar of California licensee profile | page | free | /Notices: no bot or scraping clause; robots allows /attorney/ | https://apps.calbar.ca.gov/attorney/Licensee/Detail/{n} | **ON** | 2026-11-12 |
| CO | Office of Attorney Regulation Counsel | page | free | terms not found; robots Crawl-delay 10; **Cloudflare bot management** | https://www.coloradolegalregulation.com/attorney-search/ | preset, **OFF** by default | 2026-11-12 |
| CT | Judicial Branch attorney lookup | manual | free | **robots.txt Disallow: /** | https://lookup.jud.ct.gov/AttorneyFirm | manual | 2026-10-28 |
| DE | DE Supreme Court (login only) | manual | free | no public search; phone (302) 739-4155 | https://www.desclms.org/ | manual | 2026-10-28 |
| DC | DC Bar member directory | manual | free | reCAPTCHA | https://my.dcbar.org/memberdirectory | manual | 2026-10-28 |
| FL | The Florida Bar member profile | page | free (bulk file = paid public-records request) | Terms of Use silent on bots ("not intentionally made available" / "overburden" clauses); **Cloudflare, 429** | https://www.floridabar.org/directories/find-mbr/ | preset, **OFF** by default | 2026-11-12 |
| GA | State Bar of Georgia (ReliaGuide) | manual | free | JS app, number search not confirmed | https://www.gabar.org/member-directory | manual | 2026-10-28 |
| HI | Hawaii State Bar directory | manual | free | name search only | https://hsba.org/member-directory | manual | 2026-10-28 |
| ID | Idaho State Bar roster | manual | free | last-name search only | https://isb.idaho.gov/licensing-mcle/attorney-roster-search/ | manual | 2026-10-28 |
| IL | ARDC lawyer search | manual | free | no number field; ARDC terms bar commercial compilation | https://www.iardc.org/Lawyer/Search | manual | 2026-11-12 |
| IN | Roll of Attorneys JSON (Supreme Court) | page (JSON) | free | **Terms prohibit "spiders, robots, avatars, intelligent agents"** | https://www.in.gov/courts/policies/tou-roll-of-attorneys | **manual** (terms ban) | 2026-11-12 |
| IA | Iowa Court Commissions | manual | free | name search only | https://www.iacourtcommissions.org/ords/f?p=106:10 | manual | 2026-10-28 |
| KS | Kansas attorney directory | manual | free | Cloudflare block | https://directory-kard.kscourts.gov | manual | 2026-10-28 |
| KY | Kentucky Bar Find a Lawyer | manual | free | name search only | https://kybar.org/For-Public/Find-a-Lawyer | manual | 2026-10-28 |
| LA | LSBA / LADB | manual | free | captcha | https://www.lsba.org/MD321654/MembershipDirectory.aspx | manual | 2026-10-28 |
| ME | Maine Board of Overseers directory | manual | free | **robots.txt Disallow: /cgi-bin/** | https://apps.web.maine.gov/cgi-bin/online/maine_bar/attorney_directory.pl | manual | 2026-10-28 |
| MD | MD Courts attorney search | manual | free | name search only | https://www.mdcourts.gov/attysearch | manual | 2026-10-28 |
| MA | Board of Bar Overseers | manual | free | Salesforce JS app | https://www.massbbo.org/s/ | manual | 2026-10-28 |
| MI | State Bar of Michigan directory | manual | free | internal JSON needs a site session | https://dir.michbar.org/ | manual | 2026-10-28 |
| MN | MARS (Lawyer Registration) | manual | free | reCAPTCHA | https://mars.courts.state.mn.us/ | manual | 2026-10-28 |
| MS | Supreme Court Bar Roll | page | free | **msbar.org terms: personal non-commercial use only** | https://msbar.org/terms-conditions/ | **manual** (terms ban) | 2026-11-12 |
| MO | Missouri Bar Lawyer Directory | page | free | no terms page found; robots allows; **Cloudflare** | https://mobar.org/public/LawyerSearch.aspx | preset, **OFF** by default | 2026-11-12 |
| MT | State Bar of Montana directory | manual | free | reCAPTCHA v3, name only | https://www.montanabar.org/For-Attorneys/Attorney-Directory | manual | 2026-10-28 |
| NE | Nebraska attorney search JSON | manual | free | JSON does not filter by number | https://attorneys.nejudicial.gov/ | manual | 2026-10-28 |
| NV | State Bar of Nevada | manual | free | dynamic site, number search not confirmed | https://nvbar.org/for-the-public/find-a-lawyer/ | manual | 2026-10-28 |
| NH | NH Bar directory | manual | free | login | https://member.nhbar.org/directory | manual | 2026-10-28 |
| NJ | NJ Courts attorney search | manual | free (bulk CD by paid request) | Incapsula 403 | https://www.njcourts.gov | manual | 2026-11-12 |
| NM | State Bar of New Mexico | manual | free | name search only | https://www.sbnm.org/For-Public/I-Need-a-Lawyer/Online-Bar-Directory | manual | 2026-10-28 |
| NY | **NYS Attorney Registrations** (OCA, data.ny.gov `eqw2-r5nb`) | **open-data (Socrata API)** | free (optional app token) | Open NY terms: free reuse incl. commercial via the API; robots Crawl-delay 1, /resource/ open; 435,507 rows, updated 2026-11-12 | https://data.ny.gov/resource/eqw2-r5nb.json | **ON** (ny_open_data; status, middle name, renewal month) | 2026-11-12 |
| NC | NC State Bar membership directory | page | free | no terms page found; www robots fine | https://portal.ncbar.gov/Verification/search.aspx | **ON** | 2026-11-12 |
| ND | ND Courts lawyer page | page | free | /disclaimer silent; no robots.txt; **Cloudflare** | https://www.ndcourts.gov/lawyers | preset, **OFF** by default | 2026-11-12 |
| OH | Supreme Court of Ohio Attorney Search | page (JSON) | free | no terms page found; robots allows /AttorneySearch/; no bot wall | https://www.supremecourt.ohio.gov/AttorneySearch/ | **ON** | 2026-11-12 |
| OK | OBA member verification | page | free | Terms silent on bots ("harvest information about others" clause, read as not covering a single lookup) | https://my.okbar.org/member-verification/ | **ON** | 2026-11-12 |
| OR | Oregon State Bar licensee directory | page | free | termsofuse silent on bots; empty robots.txt | https://www.osbar.org/members/membersearch_start.asp | **ON** | 2026-11-12 |
| PA | PA Disciplinary Board attorney detail | page | free (CSV = paid data request, $80/h) | disclaimer silent; robots 404 | https://www.padisciplinaryboard.org/for-the-public/find-attorney | **ON** | 2026-11-12 |
| RI | RI Judiciary attorney search | manual | free | must click «I ACCEPT» (we never accept terms for a user) | https://rijrs.courts.ri.gov/rijrs/searchAttorney.do | manual | 2026-10-28 |
| SC | SC Bar | manual | free | login | https://www.scbar.org/ | manual | 2026-10-28 |
| SD | State Bar of South Dakota | manual | free | Cloudflare block | https://members.statebarofsouthdakota.com/ | manual | 2026-10-28 |
| TN | Board of Professional Responsibility | manual | free | 403 to automated requests | https://www.tbpr.org/for-the-public/online-attorney-directory | manual | 2026-10-28 |
| TX | State Bar of Texas Find a Lawyer | page | free | **Terms forbid "mining, scraping or capture of data… through repetitive or automated means"** and commercial use | https://www.texasbar.com/AM/template.cfm?section=terms_of_use | **manual** (terms ban) | 2026-11-12 |
| UT | Utah State Bar licensee directory | manual | free | JS app | https://services.utahbar.org/Licensee-Directory | manual | 2026-10-28 |
| VT | VT Judiciary | manual | free | no public search | https://www.vtcourts.gov/attorneys | manual | 2026-10-28 |
| VA | Virginia State Bar directory | manual | free | 403 + captcha | https://vsb.org/Site/Shared_Content/Directory/va-lawyer-directory.aspx | manual | 2026-10-28 |
| WA | WSBA Legal Directory | page | free (mailing lists sold case by case) | no terms page found; robots 404 | https://www.mywsba.org/PersonifyEbusiness/LegalDirectory.aspx | **ON** | 2026-11-12 |
| WV | West Virginia State Bar | manual | free | Cloudflare block | https://wvbar.org/directory/ | manual | 2026-10-28 |
| WI | State Bar of Wisconsin | manual | free | CAPTCHA | https://www.wisbar.org/Pages/BasicLawyerSearch.aspx | manual | 2026-10-28 |
| WY | Wyoming State Bar | manual | free | blocks automated requests | https://www.wyomingbar.org/for-the-public/hire-a-lawyer/lawyer-search/ | manual | 2026-10-28 |

## Territories (not in the app's state list today; recorded for later)
| Territory | Source | Type | Terms / access | URL | Checked |
|---|---|---|---|---|---|
| Puerto Rico | Poder Judicial "Directorio de Abogados y Abogadas" (RUA) | page | searches by Num. TS, no captcha or login seen; no open data/API/bulk | https://tribunalelectronico.poderjudicial.pr/dirabogados/search.aspx | 2026-11-12 (fixture not captured; candidate for a preset) |
| Guam | Office of Regulation Counsel "Search Lawyer Status & History" | page | name search; per-lawyer pages show bar no. and status; terms at /website-terms-use not read in full | https://orc.guamcourts.gov/LawyerSearch | 2026-11-12 |
| US Virgin Islands | VI Bar "Find A Lawyer" | manual | 403 to automated requests; Judiciary behind Cloudflare | https://vibar.org | 2026-11-12 |
| Northern Mariana Islands | NMI Judiciary | manual | no public roll found | https://www.nmijudiciary.gov | 2026-11-12 |
| American Samoa | American Samoa Bar Association | manual | 403 to automated requests | https://asbar.org | 2026-11-12 |

## Open-data and bulk sweep (2026-11-12)
- **Socrata Discovery API** (`api.us.socrata.com/api/catalog/v1`). Searched for: attorney, attorney registration, lawyer, bar admission, licensed attorneys, attorney license, bar members. The only attorney roster is **NY `eqw2-r5nb`**; everything else is DA or AG case data.
- **ArcGIS Hub** (`hub.arcgis.com/api/v3/datasets`, "attorney roster"): no official roster.
- **Bulk files.** None of these is an open bulk file, so none is wired:
  - Arkansas: result downloads and a rosters page (https://attorneyinfo.aoc.arkansas.gov/info/rosters.aspx). The site has no terms page.
  - Florida: a paid public-records request for membership data (2026-06 form).
  - Pennsylvania: CSV by Public Data Request, $80 per hour, "should not be used in any other manner".
  - New Jersey: a CD-ROM by request.
  - Washington: mailing lists sold at commercial prices, case by case.

## Paid and commercial sources
| Vendor | What | Price | Sign-up | Covers | Terms for licence verification | In code | Checked |
|---|---|---|---|---|---|---|---|
| MicroBilt Professional License Search | API / batch / web search of 400+ licensing sources incl. legal | by contract (no public price) | https://developer.microbilt.com/getting-started (production keys from MicroBilt Compliance) | "all 50 States and U.S. Territories" | permissible-purpose use, keep documentation per transaction | **wired, OFF**: `bar_vendor_microbilt` key slot, switch `verification.bar_vendor_microbilt_enabled`, cost row `vendor.bar_vendor_microbilt` | 2026-11-12 |
| Surepass US Professional License Verification API | license number + state → status, expiry, discipline | by contract (sandbox free) | https://surepass.io/global/get-api-key/ | "all 50 USA states" (attorneys not named; confirm before switching on) | https://surepass.io/terms-of-service/ | **wired, OFF**: `bar_vendor_surepass` key slot, switch `verification.bar_vendor_surepass_enabled`, cost row `vendor.bar_vendor_surepass` | 2026-11-12 |
| Authenticate.com Professional License | API: submit, then poll for the result; law, healthcare, education | quote only | https://info.authenticate.com/professional-license-verification | not stated | not a consumer report; FCRA uses excluded | not wired: async with manual review (our registry check is synchronous); docs updated 2024-10-30 | 2026-11-12 |
| Checkr professional license verification | background-check line item | $12 per check | https://checkr.com/see-pricing | not stated | FCRA consumer report (candidate consent, employment purpose) | not wired: async, consent flow, API for this check not confirmed | 2026-11-12 |
| Thomson Reuters CLEAR / LexisNexis | people and business records APIs | enterprise quote | sales | not confirmed for bar status | enterprise contract | not wired: no attorney-licence endpoint confirmed | 2026-11-12 |
| UniCourt Legal Data API | court-records attorney data | $49–$299 per month to enterprise (third-party listings) | https://unicourt.com/pricing | court records, not licence status | contract | not wired: not a licence source | 2026-11-12 |
| Apify "state bar scraper" actors | scrape the bar sites above | from $1 per 1,000 results | apify.com | 4–14 states | they scrape the same pages, including ones whose terms forbid it | **rejected**: scraping by proxy breaks the hard limits | 2026-11-12 |

How a paid vendor is switched on (owner, at the end):
1. Sign up with the vendor.
2. Paste the API key and the request URL from the vendor's docs in Админка → Ключи и сервисы → MicroBilt / Surepass. If the answer's field names differ from the defaults, set the status and name paths too.
3. Turn on Настройки → `verification.bar_vendor_*_enabled`.
4. Press «Проверить» on one known number.

## Sources (live, 2026-11-12)
- Indiana Roll of Attorneys terms: https://www.in.gov/courts/policies/tou-roll-of-attorneys
- Texas Bar terms: https://www.texasbar.com/AM/template.cfm?section=terms_of_use
- Mississippi Bar terms: https://msbar.org/terms-conditions/
- Florida Bar terms: https://www.floridabar.org/home/terms-of-use/
- Oklahoma Bar terms: https://www.okbar.org/terms-of-use/ ; Oregon: https://www.osbar.org/termsofuse.html ; PA: https://www.padisciplinaryboard.org/about/disclaimer ; ND: https://www.ndcourts.gov/disclaimer ; CA: https://www.calbar.ca.gov/Notices
- Open NY terms: https://data.ny.gov/dataset/OPEN-NY-Terms-Of-Use/77gx-ii52
- MicroBilt: https://www.microbilt.com/product/professional-license-verification
- Surepass: https://surepass.io/global/usa/professional-license-verification-api/ (published 2026-10-28, modified 2026-10-29)
- Authenticate: https://docs.authenticate.com/reference/professional-license
- Checkr pricing: https://checkr.com/see-pricing
