# App freeze on tab switch against the older prod server (2026-10-28)

Owner report: a fresh prod build of `main` (0a164caa3) on iPhone and Samsung,
talking to the PROD API that still runs the 2026-10-24 image
(`15ac50c960809644ba328fad828b135a74e51dc1`). Switching bottom tabs / top
segments froze (a page transition stuck half-way); «Кейсы» did not work at
all; «Дела» showed «Нет соединения» while Search showed the same cases.
Prod logs (15 min, both phones): `POST /push-tokens` 400 ×16, `/feed` ×1,
`/posts/:id/promotion` ×2, **no cases request at all**.

## 1. What the new app needs that the old server lacks

Diff of `packages/api-contract/openapi.json` at 15ac50c96 vs `main`
(1088 → 1295 operations, 211 new, admin/staff left out below).

**New routes (404 on the old server).** None of them is called on start,
Feed, Search or Cases:

- `GET /config/flags`, `GET /moderation/standing`, `GET /compliance/age-gate`:
  in the client, not called by the app.
- `/calendar/*`, `/deal-records*` (`GET /cases/{id}/deal-record`; behind
  `bids.rich_terms_enabled`), `/consultations/{id}/no-show*`,
  `/cases/{id}/billing/invoices/{id}/{send,void,remind,payment}`,
  `/cases/{id}/signing/{id}/resend`, `PATCH /case-comments/{id}`,
  `POST /promotions/{id}/action`, `/compliance/sms-consent*`,
  `POST /users/me/deletion/cancel`, `POST /auth/wasnt-me`,
  `POST /auth/reauth/demo`, `POST /calls/{id}/sfu/failed`,
  `POST /stickers/packs/{ref}/report`, `/moderation/*appeal*`.
- `POST /push-actions`: only native code (a notification's Reply / Read).

**Changed request shape.**

- `POST /push-tokens`: new body field `actorStyle`. The old server has
  `forbidNonWhitelisted`, so the Android body (`actorStyle: true`) gets
  **400**. That is the 400 ×16 in the logs: the registrar retried for ever
  (5 s, 30 s, 2 min…, and again on every start).
- New optional query params (`updatedSince` on `/tasks` and
  `/cases/{id}/bids`, `relayFailed` on `/calls/ice-servers`, `billing` and
  `video` on `/promotions/quote`) and `If-Match` headers. The app never sends
  `If-Match`; `updatedSince` is only sent on catch-up reads.
- `/users/me/work`, `/users/me/bids`, `/users/me/cases`, `/questions` and
  `/saved-items` have the same params and filter enums on both servers.

**Changed response shape.** The generated models (swagger_parser +
json_serializable) REQUIRE these fields; a missing one throws a `TypeError`
in `fromJson`:

| Model | Missing on the old server | Routes |
|---|---|---|
| `OwnAttorneyProfileDto` | `version` | `GET/PATCH /attorneys/me/profile` |
| `ClientProfileDto` | `version` | `/users/me/profile`, `/users/me/contact-preferences` |
| `CaseDto`, `OwnerCaseDetailDto` | `version` | `POST/PATCH /cases…`, `/users/me/cases/{id}` |
| `CaseBidItemDto` | `version`, `bestPrice`, `lowOffer` | `/cases/{id}/bids`, `/users/me/cases/{id}` |
| `BidDto`, `MyBidItemDto` | `version` | `/bids/*`, `/users/me/bids` |
| `TaskDto` | `version` | `/tasks*` |
| `ConsultationDto` | `canMarkNoShow`, `noShows` | `/consultations*` |
| `AnswerDto` | `verifiedBadge` | `/questions/{id}…` |
| `CasePromotionDto`, `MyPromotionDto`, `PromotionQuoteDto` | `billing`, `deliveredUnits`, `actions`, … | `/posts/{id}/promotion`, `/cases/{id}/promotion`, `/me/promotions`, `/promotions/quote` |
| `PublicAttorneyDto` | `updatedAt` | `/public/directory/attorneys` (web) |
| `DeadlineResultDto` | `calendarLinks` | `/deadlines/calculate` |
| `SignRequestDto`, `InvoiceDto` | many | case signing / billing |

`guardApiCall` turns such a `TypeError` into
`ApiException(NETWORK_ERROR, 'Unexpected response shape')`, so the screen
says **«Нет соединения»** even though the server answered 200.

## 2. Root cause

**«Кейсы» (Feed) never asks for cases.** `AttorneyCasesTab` watches
`caseFeedProvider` only after `ownAttorneyProfileProvider` has a value.
`GET /attorneys/me/profile` from the old server has no `version`, so parsing
fails and the tab sits on the error or skeleton state. That is why there is
no `/cases/feed` request in the logs. Search → Кейсы uses `/cases/feed` and
`/search/cases` (no changed model), so the same cases show there.

**Requests that never leave the phone.** The HTTP cache coalesces identical
GETs: a follower waited on the leader's completer with **no timeout**. The
completer is only completed in the cache's own `onResponse`/`onError`. When
an earlier interceptor resolved or rejected the leader (the captive-portal
check rejects in `onResponse`; and any leader that never completes), every
later identical GET waited for good and sent nothing. The disk read in front
of it (`DriftHttpCacheStore.read`) and the saved-profile read
(`savedThenLive`) also had no timeout, so a slow or stuck local database held
the network read back for good.

**Push-token storm.** Covered in section 1: 400 from the old server, retried
for ever.

**The frozen half-way transition.** I traced every page built by a segment
switch (Feed Posts/Reels/Cases/Chats, Search people/cases/posts/tags, Cases →
Дела/Задачи/Вопросы):

- I found no synchronous loop and no rebuild or provider cycle that server
  data could drive.
- Riverpod's own retry is bounded, and the Dio retry only fires on 502/503/504
  with backoff.
- Widget tests with every call failing (404/500/unreadable) settle on every
  switch.

The Dart side therefore never spins. Two things remain:

- Sections stuck on skeletons or «no connection», which looks like a freeze.
  This is the hang above.
- A real halt that can only come from native code: video previews and players
  opened while a page slides in, and the HLS loopback proxy. A Dart test
  cannot reach these.

One real bug in the pager was fixed: in `SwipePages`, a second tap during a
slide let the first slide clear the "animating" flag. The pager then chased
the pages it passed, which looked like pages fighting half-way.

If a hard freeze still shows after this build, capture a device trace while
it happens: an Android ANR trace from `adb bugreport`, or an iOS sysdiagnose
or Xcode pause. It will name the native thread.

## 3. Fix (app only, no server change)

- `core/network/legacy_shape_interceptor.dart`: on the routes above, fills
  ONLY the missing new fields with neutral values (0 / false / empty list).
  A field the server sends is never touched. It runs before the HTTP cache,
  and the cache also applies it to copies read from disk (saved by the
  previous build).
- HTTP cache: a follower waits at most 8 s for the leader, then asks the
  server itself (the stuck entry is dropped). The disk read is capped at
  1.5 s; after that it counts as a miss.
- `savedThenLive` (my profile, which the Кейсы tab waits on): the saved copy
  is looked for at most 1 s.
- Push token: `actorStyle` is sent only when on. A 400 VALIDATION_ERROR
  re-registers once without it. The registrar no longer retries a permanent
  4xx (anything except 401/408/429); the next start or resume tries again.
- `SwipePages`: only the latest tap-slide clears the animating flag.
- Cases → «Задачи» and «Вопросы» (owner report, same day): their inner
  sections are nested `SwipePages`, like «Дела». A swipe first moves through
  the inner sections (Задачи: all · overdue · … · done; Вопросы: All · Mine
  · Best · Unanswered). Only at the edge does it move to the neighbouring
  segment, in both directions.

## 4. Search grid: no custom video cover

A video's `thumbnailUrl` is the custom cover: the frame the author picked, or
a gallery picture. That cover now stays in the profile grid only (tab 1 posts,
tab 3 briefs/reposts, and the reels tab are unchanged). The Search grid tile
shows the video's own frame instead.

- **Where the frame comes from:** `PostVideo.frameThumbnailUrl` is the
  stream's `thumbnail.jpg`, which sits next to the signed `playlist.m3u8`. The
  CDN token covers the whole folder.
- **Muted preview:** unchanged. When it cannot play, it falls back to the
  frame, never the cover.
- **Other places switched to the frame:** the post-insights header and the
  "post as a story sticker" picture. Players already showed real frames
  (#486). Shared-post cards in chat get the server's frame thumbnail, which
  never uses the gallery cover.

## 5. After the deploy of current `main`

The new server sends every field and accepts `actorStyle`, so the shape fixes
become no-ops. The hang fixes (coalescing wait, disk and profile timeouts) and
the pager fix still matter: the hang would have happened on the new server
too, whenever a leader GET was taken off the chain or the local database was
slow. «Кейсы» would have worked after the deploy even without this PR.

## 6. Tests

- `test/features/app_freeze/tab_switch_server_errors_test.dart`:
  - Feed Posts → Reels → Cases → Chats and back, by swipes and by the header
    tabs, twice. Every call fails (cases 404, chats 500, a Dio returning 404
    and 500, an unreadable profile). Every `pumpAndSettle` completes with no
    exception.
  - Cases / Tasks / Questions switching, 3 rounds, same conditions.
  - The Задачи and Вопросы nested swipes, both directions. Both fail on the
    old code.
- `test/features/search/search_grid_no_custom_cover_test.dart`: the Search
  tile draws the frame and never the cover; the profile tile keeps the cover;
  `frameThumbnailUrl` cases.
- `test/core/network/legacy_shape_interceptor_test.dart`,
  `captive_and_coalesce_test.dart` (follower never stuck),
  `push_registrar_test.dart` (no retry on 400),
  `own_profile_saved_then_live_test.dart` (stuck disk).
