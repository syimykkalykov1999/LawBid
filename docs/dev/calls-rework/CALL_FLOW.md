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
