# Call flow (incoming · outgoing · answer · end) — iOS and Android

Written 2026-10-26 BEFORE the calls rework, from the code on `main`
(1473dd92c). Purpose (owner): every event has exactly ONE handler and ONE
registration — the 12-hour bug of 2026-10-22 (e8b0ab1fa) was a second
subscriber to the CallKit event channel stealing the first one's events.

## Registrations (each exactly once)

| Source of events | Registered in | Count | Guard |
|---|---|---|---|
| CallKit / Android plugin event channel `flutter_callkit_incoming_events` | `callkitEvents()` in `callkit_bridge.dart` (the only `FlutterCallkitIncoming.onEvent.listen`) | 1 | `test/architecture/callkit_single_subscription_test.dart` fails on a second subscriber |
| ↳ fan-out listener: call actions (accept / decline / ended / audio session) | `callkitEventsProvider` (kept alive by `CallHost`) | 1 | one provider |
| ↳ fan-out listener: VoIP token refreshed | `PushService` | 1 | ignores everything but `DidUpdateDevicePushTokenVoip` |
| Realtime socket `call:*` events | `CallController._events` (one per controller) | 1 | `_inOrder(seq)` drops duplicate / old events |
| FCM foreground `onMessage` (`incoming_call`, `call_ended`, `group_call`) | `PushService.start` | 1 | `_startedFor` guard |
| FCM background (Android, app minimised / killed) | `lawbidBackgroundMessage` (top level) → `showLawbidIncoming` | 1 | `onBackgroundMessage` set once |
| PushKit VoIP (iOS) | `AppDelegate.pushRegistry(didReceiveIncomingPushWith:)` → `showCallkitIncoming` (= `reportNewIncomingCall`) | 1 | the only report; a call the socket already reported keeps its one CXCall (same id) |
| iOS CallKit plugin instance | `SwiftFlutterCallkitIncomingPlugin.sharedInstance` (one CXProvider) | 1 | 2026-10-26: a VoIP push that wakes a CLOSED app (UIScene: no window, no plugins yet) brings up a stand-in headless engine that registers the SAME shared instance (`sharePluginWithRegister`); it has no Dart listener and is destroyed when the app's engine registers |

## Incoming call

```
Caller ──POST /conversations/:id/calls──▶ API CallsService.start
API ──socket call:incoming──▶ callee (app open)
API ──push──▶ iOS: PushKit VoIP (apns-push-type voip, priority 10)
          └─▶ Android: FCM data message, priority high
          payload: callId, callerName, video, avatarUrl (avatar added 2026-10-26)

iOS, app open        socket call:incoming → CallController._ring → SystemCallUi.showIncoming (CallKit, same id)
                     the VoIP push for that id → already reported → nothing new
iOS, closed / locked VoIP push → AppDelegate → reportNewIncomingCall (lock-screen sheet)
                     Accept → ActionCallAccept → callkitEvents() → callkitEventsProvider
                       → CallController.ringFromPush(id, accept: true) → GET /calls/:id → _ring(systemUi: false) → accept()
                     app started after the answer: callkitEventsProvider reads activeCalls() once → ringFromPush
Android, app open    socket call:incoming → _ring → showIncoming (full-screen intent notification)
Android, bg / killed FCM data → lawbidBackgroundMessage → showLawbidIncoming (full screen, photo as large icon)
                     Accept → MainActivity (singleTask) → ActionCallAccept → ringFromPush(accept: true)
Decline on the sheet ActionCallDecline → controller.decline() (this call) or POST /calls/:id/decline
Decline in the app   «Decline» → controller.decline() → _finish(declined) + POST /calls/:id/decline
```

Accept has ONE implementation: `CallController.accept()` →
`POST /calls/:id/accept` alongside opening the media → early signals
replayed → `active` when the media connects.

## Outgoing call

```
CallController.call() → POST start → outgoing (ringback) → socket call:accepted
  → connecting → offer (mesh) / SFU session → media connected → active
socket call:ended (declined / busy / missed) → _finish(outcome) → ended → 1.6 s → idle
nobody answers (kCallRingTimeout) → hangUp(noAnswer)
```

## End — one path

Every end on this phone goes through `CallController._finish(outcome)`:
1. dismiss the system call (CallKit / notification), stop the foreground service;
2. `_reset()` → close the media (mic, camera, peer connections, SFU session);
3. state `ended` («Call ended») → 1.6 s → `idle`.

The call screen closes itself on `ended` (+1.5 s) or `idle` (at once),
through one `_close()`, once.

Who calls `_finish`: `hangUp()` (red button, CallKit «End», link lost,
alone in a group), `decline()`, socket `call:ended`, `_resync()` (the
server says over), ring timeouts, refusals. The server hears it from
`hangUp()` → `_endQuietly()` (`POST /calls/:id/end`, retried ~1 min) and
sends `call:ended` to everyone else (`CallsService.finish`).

### Root causes of «I hang up and the call does not end» (2026-10-26)
1. **A «group» call of two.** A 1:1 call becomes a group call once someone
   is added (even if they never answer). The host's red button then opened
   «End for all / Leave», and «Leave» left the other person alone in the
   call for `calls.solo_end_seconds` = 30 s, with the same two buttons.
   Fix: no sheet when nobody else would stay — the red button just ends;
   the server ends a call down to one person with nobody ringing after 3 s
   (cancelled by a join); the client ends by itself after 3 s alone
   (backup for a missed event).
2. **Media teardown was not exception-safe** (`WebRtcCallMedia.close`,
   `CloudflareSfuCallMedia.close`): one throwing `track.stop()` (a camera
   track already stopped by a video toggle) skipped the rest — the peer
   connection stayed open, the other phone kept our picture and voice and
   never saw the link drop. Fix: every step guarded; the SFU media marks
   itself closed first.
3. **The screen closed through `maybePop`**, which `PopScope` refuses while
   a group video has someone big (and while it rings): the listener ran
   before the rebuild, the pop was refused, the screen stayed until a
   600 ms fallback. Fix: `_close()` removes the call route (and any sheet
   above it) itself.
4. **`_finish` side effects could throw before the state changed** —
   guarded, so the phase always reaches `ended`.

## Cloudflare failover mid-call (2026-10-26)

Owner: «when Cloudflare goes down, people must not notice the switch».

```
1:1 / mesh  link failed / disconnected (either phone)
            → CallController._startReconnect → _freshIceThenRestart
            → GET /calls/ice-servers?relayFailed=true   (≤ 1.8 s budget, shared, ≤ 1 per 10 s)
                 server: new Cloudflare login (cache skipped) + own TURN FIRST
                         (a normal call already carries own TURN SECOND, after Cloudflare:
                         a dead Cloudflare relay behind a live credential API costs a
                         timed-out candidate, not the call — FO-1)
                         report → CloudflareTransport.recordClientFailure: the breaker opens
                         when ≥ calls.transport_report_min distinct phones (10; shrinks to
                         2 phones / half of the calls while calls are few) AND
                         ≥ calls.transport_report_ratio_pct (30 %) of the calls that took
                         Cloudflare in the window say so; the API also verifies the
                         relay itself once per 10 s (STUN + Allocate, CF-6)
            → media.updateIceServers (setConfiguration) → ICE restart (offerer) / ask (answerer)
            same call id, same tracks, same peer connections
network change / socket back → _restartAllFresh (fresh list, no report) → ICE restart
every reconnect retry (6 s) asks the list anew first (FO-4; ≤ 1 request per 10 s)
a relay list is reused ≤ 60 s and dropped at the call's end (TS-4): the next call asks

SFU group   any /calls/:id/sfu/* answers 503 CALL_MEDIA_UNAVAILABLE (5xx, timeout, 401/403,
            key removed)  OR  the SFU breaker opens (CloudflareTransport.onOpen)
            → CallsService.moveCallToOwn(callId): media_provider cloudflare → p2p
              (updateMany = idempotent), > calls.sfu_fallback_mesh_max people → audio only,
              Cloudflare state closed, call:participants {mediaProvider: p2p, mediaFallback}
            → every phone: _applyProvider → _swapToMesh: SFU media closed, a FRESH
              /calls/ice-servers list (FO-5, ≤ 1.8 s, else the cached one), mesh media
              opened (mic / camera / speaker kept), early mesh offers replayed, _syncLinks
              the screen keeps every picture (UI-01): CallController.media is ONE
              HeldCallMediaView for the whole call — it holds the last frames while the
              media underneath is swapped, each tile's renderer stays (key = userId) and
              only its stream changes when the mesh's picture arrives; the hold ends
              1.5 s after the first mesh link is up (10 s at most)
            the phone cannot reach the SFU while the API answers (LC-5): the SFU link
              «failed» / still down at a retry → POST /calls/:id/sfu/failed (once a
              minute per phone) → CallsService.sfuFailed: recordClientFailure('sfu') for
              the breaker + per-call reporters (Redis set / in-process, 60 s); half of the
              joined members → moveCallToOwn(callId, 'phones_report') → the swap above
            missed event → _resync (GET /calls/:id) swaps too; a mesh offer reaching an SFU
            phone is kept and makes it ask the server
            never moves back mid-call (per-call stickiness); new calls return by themselves

«Reconnecting…»  CallSession.reconnecting becomes true only after the drop lasted
                 kCallReconnectingDelay (3 s) — a relay switch or the swap is not seen.
```

Health: the TURN breaker probe (`cloudflare-relay-probe.ts`: a login AND a real STUN
Binding + TURN Allocate on the Cloudflare relay) runs at most once a minute fleet-wide —
while open (driven by new calls and the `ops.status-watchdog` job; only a relay that
allocates closes it) and while closed too (the watchdog: two misses in a row open it,
each miss also counts as one of the N failures). Admin → «Ключи и сервисы» →
«Связь для звонков» → «Проверить» runs the same STUN Binding + TURN Allocate
(`relay-check.ts`) on both sides. STUN list default: stun.cloudflare.com:3478, then Google.
