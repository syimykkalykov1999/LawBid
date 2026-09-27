## p12 leaf-1.6 — mobile UX: offline banner, pagination, goldens, a11y, layering

**Connectivity (docs/01 §8.3 "Offline — баннер сверху").** New `core/connectivity/`:
`ConnectivityService` combines connectivity_plus (interface up/down), a real
reachability signal from dio traffic (`ReachabilityInterceptor`, last in the
chain: any HTTP response = reachable; connectionError/connectionTimeout/
sendTimeout = unreachable; receiveTimeout/cancel/unknown = no signal) and a
`GET /health/live` probe with exponential backoff (2s → 30s) while unreachable.
Exposed via Riverpod (`connectivityStatusProvider`, `isOfflineProvider`).
`OfflineBannerHost` in `MaterialApp.builder` shows an animated banner on in-app
routes only (pre-app flow untouched): slides from under the status bar, takes
over the inset so the top bar never jumps, polite live region, Retry with
busy state, short "Back online" confirmation; instant under reduce-motion.

**Pagination (docs/01 §7 `meta.nextCursor`, §8.3).** `AppPaginatedListView` +
`AppPaginationFooter` (loading more / error + Retry at the list end / end of
list), shared `CursorPage`/`PaginatedList` in `shared/domain`. Active Devices
uses it; `GET /auth/sessions` currently returns no cursor, so the list ends
after one page — `?cursor=`/`meta.nextCursor` are already honoured.

**Layering (docs/01 §6.4).** Active Devices moved to
`features/settings/active_devices/{domain,data,application,presentation}`
with a `DeviceSessionInfo` domain model and DTO mapper; the screen no longer
imports `auth/data`. Controller: cursor pagination, refresh that keeps rows on
failure, local removal on revoke, no silent Riverpod auto-retry, auto-reload
when connectivity returns.

**Design system.** `AppFeedHeader` (docs/07 §10: static ScalesLogo 96, left;
documented `trailing` slot for file 05's Chats icon + badge), reusable
`AppContentCard` + `AppContentCardSkeleton` (feed empty-state preview),
`AppConnectivityBanner`/`AppTopBannerSlot`, `AppTapTarget` (48dp hit/semantic
area without layout change — welcome goldens byte-identical). `AppTopBar` now
applies the status-bar inset (it drew under the notch). `AppAvatar` initials
on a navy seal (old pairing was 4.35:1). Button/chip semantics de-duplicated.
Bottom-nav label gap 2 → 6 and label text scale capped at 1.35x (overflowed at
200%). `AppOtpField.semanticLabel` added (call sites still use the RU default).

**Tokens.** Status colors aligned to docs/01 §8.1: success `#1F9D67`, warning
`#D98A00`, new `info` `#2F80ED` (+ `infoTint`), danger unchanged. New AA helpers
`dangerText` (light `#C53A3A`, dark `#E36464`) and `dangerFill` (`#C53A3A`)
used by the danger button and destructive list rows — spec `#D64545` is
4.38:1 with white. Onboarding goldens `contacts_client` and
`verification_attorney` regenerated for the new success color (only change).

**Tests.** `test/core/connectivity/**`, `test/design_system/pagination_test.dart`,
`test/design_system/a11y_test.dart` (android/iOS tap target, labeled targets,
text contrast; widgets + feed/search/mine/profile/settings/active devices in
both themes; 200% text), base-widget goldens (text field normal/focus/error,
OTP, icon button, chip, card, avatar, top bar, feed header, banner, footer),
feed screen golden, active devices data/controller/screen tests, token tests.
