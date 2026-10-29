# Аудит системы звонков — 2026-10-26

Ключи Cloudflare: вставляете в админке, жмёте «Проверить», потом «Включить» — и новые звонки сразу идут через Cloudflare, без перезапуска. Наши серверы при этом не предлагаются. Это проверено по коду и работает. Телефон может ещё до 5 минут помнить старый список — чиним.
Переключение при сбое: если Cloudflare перестал отвечать, идущий групповой звонок переезжает на нашу связь тем же звонком, 1:1 делает перезапуск через наш сервер, новые звонки идут по нашей связи, и раз в минуту система сама пробует Cloudflare — как вернётся, новые звонки снова идут через него. Идущий разговор обратно не переезжает (так и задумано, чтобы не дёргать людей).
Что пока НЕ как часики: при переезде группового звонка картинка на телефоне на 1-2 секунды рассыпается в аватарки и чёрные квадраты — люди заметят (главная ошибка, чиним первой).
Если у Cloudflare сломается только сам релей, а его API жив — мы этого не видим, новые 1:1 звонки не соединяются. Чиним: наш сервер всегда идёт запасным в списке + проверка настоящим пакетом раз в минуту.
Ошибочный App ID, одна случайная ошибка или слишком частые запросы с одного телефона сейчас либо ломают звонок без запасного пути, либо зря сбрасывают всех на нашу связь.
На iPhone отбой во время звонка на заблокированном телефоне иногда не доходит — звонит до 45 с. Оборвавшийся разговор пишется как «не удался» с нулевой длительностью.
Внешний вид звонка (авто-скрытие кнопок, плавные переходы сетки, размытое фото, пружинное окошко) ещё не сделан — только описан.
Ветка пока не сливается с main (конфликт в двух файлах админки) — первым делом это.
Сквозного теста «ключи вставил → Cloudflare → сломался → переехали → вернулись» нет; добавляем.
Итого: основа построена правильно, но 1 критичная и ~20 важных правок до «никто не замечает».

**Ключи из админки → сразу Cloudflare:** True  
**Переключение посреди звонка и обратно:** False

## Что уже работает
End to end today (branch origin/claude/calls-failover, fbc6dd20f): calls ring with the caller's photo on both platforms (iOS VoIP push → CallKit, Android CallStyle notification), a 1:1 call connects over own coturn, a group call runs over mesh (or over the Cloudflare SFU when keys are active), every end path closes the call on both sides and logs it once, a group left with one person ends after 3 s, a lost network does an ICE restart / SFU recreate, and «Reconnecting…» is hidden for the first 3 s. Admin: Cloudflare TURN + SFU keys are saved in Integrations, «Проверить» runs a real STUN/TURN Allocate, «Включить» makes them live on every API instance without a restart (secrets:changed, 60 s safety net), the «Связь для звонков» card shows Выкл/Вкл/Авто and the breaker state. With keys active, new 1:1 calls get the Cloudflare relay first and own coturn is not offered; new group calls get the Cloudflare SFU. When Cloudflare's API fails 5 times in 120 s the fleet-wide breaker opens, running SFU calls move to mesh with the same call id, 1:1 calls re-fetch own TURN and ICE-restart, and one probe a minute brings new calls back to Cloudflare. Unit tests cover the breaker, the mid-call moves, stickiness, the ring payload and the mobile swap. What does NOT work: the branch does not merge into main (admin-ops conflicts), the SFU→mesh swap is visibly ugly on the phone (avatars then black boxes), a Cloudflare relay-only outage is not detected at all, and the call UI polish items (auto-hide, 300 ms motion, scrim, blur, spring PiP) are not written.

## Порядок исправлений

### [P0] UI-01 — SFU→mesh failover collapses the video UI (avatars, then black boxes) — the switch is visible
- Файлы: apps/mobile/lib/features/calls/application/call_controller.dart:1068 (_swapToMesh); apps/mobile/lib/features/calls/presentation/call_screen.dart; call_group.dart; call_widgets.dart:74-80; test/features/calls/sfu_call_controller_test.dart
- Правка: Never show media==null to the screen while state.busy: expose media as a ValueListenable that flips to the mesh CallMedia only after _openMedia resolved (keep old referenced until the mesh has streams); hand the existing local MediaStream/tracks to the new mesh media instead of a second getUserMedia; build the same widget tree (ListenableBuilder + CallVideoView with stable ValueKey(userId)) in both branches so _RtcVideoState survives and only srcObject changes. Tests: sfu_call_controller_test «swap never shows media==null»; widget test counting surface mounts across a fake swap (constant).

### [P1] AN-2 — Branch does not merge into main: content conflicts in admin-ops controller and DTO (verified: git merge-tree reports both)
- Файлы: apps/api/src/modules/admin-ops/admin-ops.controller.ts; apps/api/src/modules/admin-ops/admin-ops.dto.ts
- Правка: Rebase claude/calls-failover (and base claude/calls-rework) on current main; both sides add endpoints/DTOs — keep both; re-run apps/api unit tests (calls-failover.spec.ts, push-dispatcher.call-ring.spec.ts) and the api-contract generator; re-check apps/mobile against #417 (StableNetworkImage).

### [P1] FO-1 — Cloudflare relay (data-plane) outage with a live credential API: new 1:1 calls die in the connecting phase and never teach the breaker
- Файлы: apps/api/src/modules/calls/calls.service.ts:915-968 (iceServers); apps/mobile/lib/features/calls/application/call_controller.dart (_onLinkState); apps/api/src/modules/calls/calls-failover.spec.ts
- Правка: (a) iceServers(): always append own TURN after the Cloudflare relay (not only when !cfWorks) — ICE gathers from both in parallel, a dead relay only costs a timed-out candidate (covers TS-2a and FO-8a in one change). (b) call_controller._onLinkState: on `failed` while phase==connecting do one _freshIce(relayFailed: _onCloudflareRelay) + _restartOrAsk before _linkLost, and recordClientFailure from that path. (c) Specs: calls-failover.spec «login OK + relayFailed:false → list contains own TURN»; call_controller_test «failed during connecting → one restart with fresh servers, not hang-up».

### [P1] FO-2 — Health probe checks only the control plane (credential API / sessions/new); the STUN+Allocate relay check exists but never feeds the breaker
- Файлы: apps/api/src/modules/calls/calls.service.ts:979; apps/api/src/common/ops/status/status-probes.service.ts:792-872; apps/api/src/modules/calls/relay-check.ts; apps/api/src/modules/calls/cloudflare-transport.spec.ts
- Правка: In the fleet-wide minute probe for part `turn` (calls.service iceServers probe + status-probes watchdog, also while the breaker is CLOSED) run checkRelay(udpTargetOf(login.urls), creds) after fetchCloudflareTurn and call transport.recordFailure('turn') when the Allocate fails; closing the breaker requires the Allocate to pass, not only the credential API. Keep it in the existing once-a-minute SET NX slot. Specs: cloudflare-transport.spec «credential OK + Allocate fails → stays open», status-probes.service.spec «Allocate failure → breaker open».

### [P1] TS-2 — TURN breaker is blind at launch scale: client reports need ≥10 phones, so 2 of 3 failing calls never open it
- Файлы: apps/api/src/modules/calls/cloudflare-transport.ts:57; apps/api/src/modules/calls/cloudflare-transport.spec.ts; apps/api/src/modules/calls/calls-failover.spec.ts
- Правка: Allocate probe is done in FO-2; here scale the report threshold with usage: min = Math.min(CF_CLIENT_REPORT_MIN, Math.max(2, Math.ceil(uses * 0.5))) so 2 of 3 Cloudflare calls reporting opens the breaker (same fix as CF-6; optionally make min/ratio admin settings calls.transport_report_min / _ratio, defaults 3 / 0.3). Spec: cloudflare-transport.spec small-fleet case; calls-failover.spec «a few reports among many healthy calls do not count» + small-fleet variant.

### [P1] CF-1 — Wrong / not-yet-propagated SFU App ID (HTTP 404 not_found) is treated as the caller's fault: group calls break with no fallback and the breaker never opens
- Файлы: apps/api/src/modules/calls/cloudflare-sfu.client.ts:76; apps/api/src/modules/calls/sfu-broker.service.ts; apps/api/src/modules/calls/cloudflare-sfu.spec.ts; calls-failover.spec.ts
- Правка: In CloudflareSfuClient.once() treat 404/not_found on sessions/new (and 401/403) as a configuration failure (extend isOutage or add isConfigFailure); SfuBrokerService.fail() counts it (recordFailure('sfu')) and throws mediaDown() so viaSfu/moveCallToOwn and the breaker react; new group calls take mesh until the probe with current keys succeeds. Specs: cloudflare-sfu.spec «404 not_found on sessions/new counts and answers 503»; calls-failover.spec «wrong App ID: new calls take the backup».

### [P1] FO-3 — One transient SFU error on any route moves the whole group call off Cloudflare for good (no retry; 429/timeouts included)
- Файлы: apps/api/src/modules/calls/sfu-broker.service.ts:266; apps/api/src/modules/calls/cloudflare-sfu.client.ts; apps/api/src/modules/calls/calls-failover.spec.ts
- Правка: Retry once (200–400 ms backoff, inside the per-session queue) for 5xx/0/429 on every SFU mutation; move the call only when sessions/new or publish fails after retries, on 401/403/keys removed, or when the breaker is open. Non-critical routes (layer, tracks/update) log + count but do not move. Spec: calls-failover.spec «one 503 on subscribe does NOT move, two consecutive do».

### [P1] TS-1 — Group-call start on a freshly dead Cloudflare SFU waits up to 16 s before the mesh fallback
- Файлы: apps/api/src/modules/calls/cloudflare-sfu.client.ts:22; apps/api/src/modules/calls/sfu-broker.service.ts (createSession); sfu-broker.spec.ts; sfu-calls.spec.ts
- Правка: Give sessions/new for a NEW call its own short budget like TURN: ~2 s timeout, one 300 ms retry inside 2.5 s; keep 8 s only for in-call mutations (tracks/new, renegotiate). Pass the timeout per call-site in the CloudflareSfuClient constructor / createSession. Specs: sfu-broker.spec «fetch never answers → session route fails within 2.5 s»; sfu-calls.spec.

### [P1] FO-5 — SFU→mesh swap opens the mesh with the cached (up to 5 min old, Cloudflare-only) relay list, so in a full Cloudflare outage the mesh first tries the dead relay
- Файлы: apps/mobile/lib/features/calls/application/call_controller.dart:1077; apps/mobile/test/features/calls/sfu_call_controller_test.dart
- Правка: In _swapToMesh, before _openMedia: _ice = null; await _freshIce(relayFailed: false) bounded by the 1.8 s budget (fall back to the cached list on timeout); or have the call:participants move event carry fresh iceServers. Test: controller swap after a move → iceServers requested anew.

### [P1] FO-4 — Mid-call retry timer never re-fetches the relay list; after one missed 1.8 s refresh the next 150 s of ICE restarts go through the dead relay
- Файлы: apps/mobile/lib/features/calls/application/call_controller.dart:1983, :1855; apps/mobile/test/features/calls/call_controller_test.dart
- Правка: In the retry tick: await _freshIce(relayFailed: _onCloudflareRelay) before _restartOrAsk(peer) (the 10 s dedupe in _freshIce bounds requests); fix the stale comment at :1855; raise kCallIceRefreshBudget to ~2.5 s or lower the server's Cloudflare budget when relayFailed=true. Test: refresh times out → second retry carries the fresh servers.

### [P1] CF-3 — HTTP 429 (per-session 50 req/s limit) counted as a Cloudflare outage: one looping phone can open the fleet-wide SFU breaker and move every running group call to mesh
- Файлы: apps/api/src/modules/calls/cloudflare-sfu.client.ts:77; apps/api/src/modules/calls/sfu-broker.spec.ts
- Правка: Drop 429 from isOutage (keep it a conflict for that caller; retry once after a short delay through the per-session queue), or count 429 toward the breaker only from ≥ N distinct sessions in the window. Spec: sfu-broker.spec «five 429s from one session never open the breaker».

### [P1] LC-1 — iOS: a cancelled / answered-elsewhere ring keeps ringing on CallKit until the 45 s timeout when the iPhone is locked or the app closed
- Файлы: apps/api/src/modules/notifications/push/fcm-push.sender.ts:434; apps/api/src/modules/notifications/push/push-dispatcher.ts; apps/api/src/modules/notifications/push/apns-voip.sender.ts; apps/mobile/ios/Runner/AppDelegate.swift
- Правка: Send the stop as a VoIP push too: ApnsVoipSender.endCall(userId,{callId}) (voip topic, priority 10, payload {type:'call_ended', callId}) from PushDispatcher.dispatch for kind 'call_end' alongside FCM (skip FCM for tokens covered by VoIP, as ringCall does). AppDelegate.pushRegistry(didReceiveIncomingPushWith:): on type=='call_ended' end the active CallKit call; if not shown (reordering) report-then-end in the same callback (one report per VoIP push). Tests: apns-voip.sender.spec, push-dispatcher.call-end.spec; note in CALL_FLOW.md.

### [P1] LC-2 — A connected call that drops (reconnect grace exhausted, peer's phone died) is logged as «failed» with duration 0 instead of «ended» with its duration
- Файлы: apps/api/src/modules/calls/calls.service.ts:808 (end/finish); apps/mobile/lib/features/calls/application/call_controller.dart (_linkLost); apps/api/src/modules/calls/call-end-idempotent.spec.ts
- Правка: CallsService.end(): if call.status==='active' && call.answered_at → outcome 'ended' (client reason goes to end_reason, e.g. link_lost, passed to finish()), count callConnected; only a never-answered call with reason failed stays 'failed'; finish() computes durationSec whenever answered_at is set. Client: _linkLost/_startReconnect after CallPhase.active → hangUp(reason: hangup or new linkLost) so the ended screen shows «Call ended». Tests: call-end-idempotent.spec, owner-calls.e2e history row, call_controller_test «grace runs out: outcome ended».

### [P1] T3 — «Paste keys in admin → calls use Cloudflare at once» is never tested through SecretsService or the admin endpoints
- Файлы: apps/api/test/owner-calls-cloudflare.e2e-spec.ts (new); apps/api/src/common/secrets/secrets.service.ts:64
- Правка: New apps/api/test/owner-calls-cloudflare.e2e-spec.ts with undici MockAgent for rtc.live.cloudflare.com: (1) no keys → STUN + own TURN; (2) admin PUT cloudflare_turn + cloudflare_sfu, Проверить, Включить → next ice-servers has the Cloudflare login first and no own TURN, group start media_provider=cloudflare, calls-path carrying=cloudflare; (3) mock 503 ×limit → calls:cf:open:turn exists, new ice-servers = own TURN, running group call flipped to p2p and the socket client got call:participants {mediaProvider:'p2p'}; (4) mock 200 + probe key deleted → next call back on Cloudflare; (5) DELETE secrets → own path, no 5xx. Document the 60 s secrets cache as the «at once» bound (or invalidate via Redis on write).

### [P1] T4 — No single test proves the owner's end-to-end scenario (keys in → Cloudflare primary → dies → moved → back)
- Файлы: apps/api/src/modules/calls/calls-failover.spec.ts:153; apps/mobile/test/features/calls/sfu_call_controller_test.dart; apps/mobile/test/features/calls/fixtures/
- Правка: (a) the e2e from T3 (API + Postgres/Redis + socket client, mocked Cloudflare HTTP); (b) one Dart test in sfu_call_controller_test driving the SAME fixtures the e2e records (save call:participants and ice-servers JSON to test/features/calls/fixtures/*.json) so the phone consumes real server output; (c) keep the unit specs. Run (a) in api-ci's e2e shard, (b) in mobile-ci.

### [P1] T1 — GET /calls/ice-servers?relayFailed=true is untested at the HTTP layer (query DTO + throttle) — the phone-side failover rides an untested wire
- Файлы: apps/api/src/modules/calls/calls.controller.ts:335; apps/api/test/owner-calls.e2e-spec.ts; apps/api/src/modules/calls/calls-failover.spec.ts
- Правка: owner-calls.e2e-spec: with the turn secret set, ?relayFailed=true → 200, iceServers[0].urls[0] starts with turn:, username matches ^\d+:<userId>$; ?relayFailed=maybe → 400; ?bogus=1 → 400 (forbidNonWhitelisted); 31 calls → 429. Unit: calls-failover.spec asserts recordClientFailure('turn', user.sub) and forgetCloudflareTurn called exactly once per relayFailed request.

### [P1] T2 — Phone-report ratio (recordClientFailure/noteUse/peek) is only tested in-memory; the Redis path production runs is untested
- Файлы: apps/api/src/modules/calls/cloudflare-transport.spec.ts:8
- Правка: Add get(k) to FakeRedis in cloudflare-transport.spec and port the two ratio tests to Redis mode: 30 noteUse + 20 reports from one user → 0; 15 distinct users → open; 1000 uses + 50 reports → 0; clock past calls.transport_fail_window_sec → use counter expired so the next 10 reports open it; calls:cf:reporter:turn:<user> blocks a second report inside 60 s.

### [P1] TS-3 — LiveKit is never used in the automatic failover although the admin card promises «Своя связь (coturn + LiveKit) … включится сама»
- Файлы: apps/api/src/modules/calls/calls.service.ts:246; apps/api/src/modules/calls/sfu-broker.service.ts; apps/admin/src/lib/calls-transport.ts:40,94; apps/api/src/modules/admin-config/config-schema.ts:93
- Правка: Preferred: in SfuBrokerService.decide / CallsService.decideMedia, when cloudflareWanted && !useCloudflare and calls.video_provider==='livekit' with LiveKit keys present, choose the LiveKit provider (activeVideoProvider consults transport.isOpen('sfu')). Minimal: rename the row to «Своя связь (coturn, напрямую между телефонами)» and drop LiveKit from the backup wording in calls-transport.ts:40/94, config-schema.ts:93 and the admin guide. Tests: sfu-calls.spec (breaker open + livekit keys), calls-transport.test.

### [P1] UI-02 — Grid ↔ focus ↔ strip changes remount every renderer: black flash, no 300 ms motion
- Файлы: apps/mobile/lib/features/calls/presentation/call_group.dart:174; apps/mobile/test/features/calls/
- Правка: One Stack over the grid area with one AnimatedPositioned(duration: reduceMotion ? 0 : 300 ms, curve: AppMotion.enterCurve, key: ValueKey(userId)) per visible member; compute each member's Rect for grid vs focused layout (big = full area, others = 64×88 strip cards); strip scroll offset as an animated left. Tiles keep their _MemberTile + CallVideoView subtree. Widget test: toggleFocus ×2 keeps surface-mount count equal to stream count.

### [P1] UI-03 — 1:1 swap recreates the big renderer (ValueKey(selfBig)) — black until ready, no cross-fade
- Файлы: apps/mobile/lib/features/calls/presentation/call_screen.dart:431
- Правка: Remove ValueKey(selfBig) (mirror is a prop); keep two persistent CallVideoViews (local, remote) in one Stack and animate rect/opacity between the full-screen slot and the PiP slot with AnimatedPositioned 300 ms instead of swapping streams. Test: swap twice, surface mount count unchanged.

### [P1] UI-04 — No 4 s auto-hide of controls in video calls; a tap also hides the self-view PiP
- Файлы: apps/mobile/lib/features/calls/application/call_video_layout.dart:87; apps/mobile/lib/features/calls/presentation/call_screen.dart:696
- Правка: CallVideoLayoutNotifier.touched(): show controls and (re)arm a 4 s Timer → controlsHidden=true; call from Listener(onPointerDown) around the call Stack and from toggleControls; arm only when videoLive && videoPrompt==null && notice==null; cancel on dispose. In call_screen keep the PiP mounted when hideChrome (drop !hideChrome at :696) with AnimatedSlide + AnimatedOpacity 300 ms (zero under reduceMotion). Test: FakeAsync 4 s → hidden; tap → visible; audio never hides.

### [P1] UI-05 — PiP window overlaps the top-right buttons (flip / add / members)
- Файлы: apps/mobile/lib/features/calls/presentation/call_screen.dart:704; apps/mobile/test/features/calls/call_screens_golden_test.dart
- Правка: topInset: MediaQuery.paddingOf(context).top + 60 + AppSpacing.md (or measure the top row) and bottomInset: bottom + pillHeight + md; golden call_video_1to1 must show the three top buttons uncovered.

### [P1] UI-06 — Name / timer drawn on raw video with no scrim or shadow; chrome fade ignores reduceMotion
- Файлы: apps/mobile/lib/features/calls/presentation/call_screen.dart:512
- Правка: When videoLive put a DecoratedBox(gradient black 0.45→0, height 160) under the top overlay and a matching bottom scrim under the pill, inside the same AnimatedOpacity; Shadows on the two texts; duration: reduceMotion ? zero : 300 ms. Golden with a bright stand-in surface.

### [P1] UI-07 — Whole screen rebuilt every second; pulse controller + empty painter repaint at 60 fps for the entire call
- Файлы: apps/mobile/lib/features/calls/presentation/call_screen.dart:104
- Правка: Move the running time into a small _CallClock StatefulWidget (own 1 s Timer, only while phase==active), delete _tick; ref.listen phase → _pulse.repeat() only while outgoing/incoming && !reduceMotion, _pulse.stop() otherwise; shouldRepaint => on != old.on || (on && progress != old.progress); RepaintBoundary around the group grid.

### [P1] AN-1 — REFERENCE.md promises blurred-photo backgrounds that the call UI never draws (voice calls, camera-off tiles)
- Файлы: docs/dev/calls-rework/REFERENCE.md:30; apps/mobile/lib/features/calls/presentation/call_widgets.dart; call_screen.dart:428; call_group.dart:318; test/features/calls/call_screens_golden_test.dart
- Правка: Implement CallPhotoBackdrop in call_widgets.dart: RepaintBoundary > ImageFiltered(ImageFilter.blur(40,40)) > Image(appNetworkImage(url, 64), fit: cover) under ColoredBox(navy 45 %); use under the big avatar in 1:1 (call_screen ~:429/:620) and in _MemberTile (call_group :318) when stream==null && avatarUrl!=null; initials-only when no photo; regenerate goldens. (Same fix as UI-09.)

### [P1 in CI / P2 in prod] CF-2 — Breaker MGET/DEL span two hash slots: the repo's Redis Cluster guard spec fails on cloudflare-transport.ts (prod Redis is NOT cluster — growth.tf refuses redis_cluster_mode — so today this breaks the test suite, not calls)
- Файлы: apps/api/src/modules/calls/cloudflare-transport.ts:155; apps/api/src/redis/redis-cluster-safe.ts; apps/api/src/redis/redis-cluster-scan.spec.ts
- Правка: Build every calls:cf:* key with ck('cfcalls', …) (one slot per part) or replace r.mget/r.del with mgetSafe/delSafe from redis-cluster-safe.ts; add the allowlist entry with its reason if a multi-key call stays. Run redis-cluster-scan.spec and cloudflare-transport.spec; add a REDIS_CLUSTER=true test that state()/close() still work.

### [P2] TS-4 — After the keys are activated a phone can still start its next call on the old relay list for up to 5 minutes
- Файлы: apps/mobile/lib/features/calls/application/call_controller.dart:471, :2488
- Правка: Clear _ice/_iceAt in the call teardown (around call_controller.dart:2488 where _servers = const []) so a NEW call asks /calls/ice-servers again; keep the 5-min reuse only within one ringing/answer sequence; or key the cache by provider/ttlSec from the response. Test: «new call after hang-up asks /calls/ice-servers again».

### [P2] TS-6 — A freshly created Cloudflare App answers 404 for up to 60 s; «Проверить» shows a bare «HTTP 404» and the owner cannot press «Включить»
- Файлы: apps/api/src/common/secrets/provider-registry.ts:100, :500-593
- Правка: In the cloudflare_sfu (and cloudflare_turn) test handler map HTTP 404 to «Cloudflare ещё не раздал новый App/ключ (до 60 с). Подождите минуту и нажмите «Проверить» снова.»; optionally retry once after 10 s. Test: provider-registry.spec.

### [P2] FO-6 — No hysteresis on switch-back: one good probe closes the breaker; a flapping Cloudflare moves fresh group calls to mesh once a minute
- Файлы: apps/api/src/modules/calls/cloudflare-transport.ts:441; cloudflare-transport.spec.ts
- Правка: Require 2 consecutive successful probes (calls:cf:okprobe:{part} counter) or a minimum open time of 2 × window before close(); expose probeOkStreak in CfBreakerState for the card. Spec: ok, fail, ok → still open; ok, ok → closed.

### [P2] FO-8 — While the breaker is open Cloudflare is dropped from the relay list entirely and own TURN health is never checked
- Файлы: apps/api/src/modules/calls/calls.service.ts:938; apps/api/src/common/ops/status/status-probes.service.ts
- Правка: (a) While breaker_open still append the Cloudflare relay after own TURN if the credential fetch succeeds within 500 ms (ICE gathers in parallel). (b) Feed checkOwn() into a small own-TURN breaker or at least alert=own_turn_failed from the watchdog, red in the card. Test: breaker open + own TURN → list has own first, Cloudflare second.

### [P2] CF-6 — Client relay reports cannot open the TURN breaker at launch scale (min 10 phones)
- Файлы: apps/api/src/modules/calls/cloudflare-transport.ts:57; apps/api/src/modules/calls/calls.service.ts (relayFailed path)
- Правка: Covered by TS-2 (usage-scaled threshold / admin settings calls.transport_report_min and _ratio, defaults 3 / 0.3); additionally on a relayFailed request run one uncached checkRelay (2 s) against the Cloudflare UDP relay and count its failure as a real breaker failure.

### [P2] LC-5 — A Cloudflare SFU that the phone cannot reach (but the API can) never moves the call — the phone retries for 150 s and ends with «failed»
- Файлы: apps/mobile/lib/features/calls/application/call_controller.dart:1878; apps/api/src/modules/calls/calls.controller.ts; sfu-broker.service.ts
- Правка: Add POST /calls/:id/sfu/failed (once per user per minute): server calls cfTransport.recordClientFailure('sfu') and, when reports come from ≥ half the joined members within 60 s, moveCallToOwn(callId,'phones_report'). Client: after the first failed _recreate (or SFU link failed while the API answers 200) call it before the next retry. Tests: calls-failover.spec «phones report the SFU: the call moves»; cloudflare_sfu_call_media_test extended.

### [P2] CF-4 — In-body SFU error codes (HTTP 200 + errorCode) are all mapped to a 400 'caller fault': transient/backend errors are neither retried nor counted
- Файлы: apps/api/src/modules/calls/cloudflare-sfu.client.ts:161; cloudflare-sfu.spec.ts
- Правка: Map codes in once(): retryable_transient_error → one bounded retry; backend_error / internal_error / transport_unavailable_error / temporarily_unavailable_error → isOutage=true (counted, 503 so viaSfu moves the call); session_error → dedicated 409 the phone reads as «replace the session now» (skip the 3× _retrying). Tests per code in cloudflare-sfu.spec.

### [P2] CF-5 — Cost hard stop (egress ceiling) never covers the Cloudflare TURN path, which carries every 1:1 call
- Файлы: apps/api/src/modules/calls/calls.service.ts:915; apps/api/src/modules/calls/cloudflare-turn.spec.ts; docs/runbooks/TURN.md
- Правка: In iceServers(), when hardStopped('cloudflare') and own TURN is configured, skip Cloudflare TURN (own relay + STUN) and say so in the cost row's neededNote; with no own TURN keep Cloudflare (never refuse calls) but log alert=cloudflare_hardstop_turn_kept. Spec in cloudflare-turn.spec; note in docs/runbooks/TURN.md that SFU egress is not in the measured figure.

### [P2] TS-5 — «Вкл» hint says no automatic fallback, but forced mode still appends own coturn and moves SFU calls to own
- Файлы: apps/admin/src/lib/calls-transport.ts:41; apps/admin/content/guides/cloudflare-turn.md:53; apps/admin/src/lib/calls-transport.test.ts
- Правка: Hint → «Cloudflare всегда первым, даже при сбоях (запасной путь берётся только если Cloudflare не ответил). Нужны ключи Cloudflare.» in calls-transport.ts:41 and apps/admin/content/guides/cloudflare-turn.md:53; update calls-transport.test.

### [P2] FO-7 — Running calls never return to Cloudflare (by design) but the admin card says the opposite
- Файлы: apps/admin/src/components/integrations/calls-transport-card.tsx:162; apps/admin/src/lib/integration-guides.ts:256; apps/api/src/common/secrets/provider-registry.ts:561
- Правка: Card text → «новые звонки сами возвращаются на Cloudflare; идущий разговор остаётся на своей связи до конца» (copy only, no layout change); same sentence in integration-guides.ts:256 and provider-registry.ts:561; optionally show a count of running calls still on own path.

### [P2] TS-7 — System-health cloudflare_turn probe stays red and pages while calls.transport = own
- Файлы: apps/api/src/common/ops/status/status-probes.service.ts:449; status-probes.service.spec.ts
- Правка: In cloudflareTurn() read calls.transport like cloudflareSfu() does and return { status:'grey', detail:{configured:true, inUse:false, transport:'own'} } before the cached probe; spec case next to «cloudflare_sfu is grey … when calls.transport = own».

### [P2] CF-7 — Cloudflare's own STUN (stun.cloudflare.com:3478) is dropped; Google STUN stays default next to the Cloudflare relay
- Файлы: apps/api/src/modules/calls/calls.service.ts:872; apps/api/src/modules/calls/turn-urls.spec.ts
- Правка: Keep Cloudflare's STUN entry from the response (or default STUN_URLS to stun:stun.cloudflare.com:3478 when Cloudflare TURN keys exist) ahead of Google; update turn-urls.spec / cloudflare-turn.spec.

### [P2] LC-3 — Ring timeouts disagree: CallKit via VoIP 45 s, via Dart 60 s, caller 60 s, server 65 s
- Файлы: apps/mobile/ios/Runner/AppDelegate.swift:283; apps/mobile/lib/features/calls/application/callkit_bridge.dart
- Правка: Use 60000 in AppDelegate (same as lawbidIncomingParams); on CallEventActionCallTimeout for the current incoming call set systemRingingCallProvider to null, _finish(CallStatus.missed) and POST /calls/:id/decline reason no_answer so the caller's ringback stops with the sheet. Test in callkit_bridge_test.dart.

### [P2] LC-4 — Admin heartbeat client.call_sync_s may exceed the server's 180 s silence cut-off and would sweep live calls
- Файлы: apps/mobile/lib/core/config/client_tuning.dart:101; apps/api/src/modules/admin-config/config-schema.ts; apps/api/src/modules/calls/ongoing-call.ts
- Правка: Cap client.call_sync_s at 90 (client_tuning.dart pick max, config-schema.ts max); fix the stale comment in ongoing-call.ts; optionally derive CALL_SILENT_MS ≥ 2 × the configured max. Test: client_tuning_test clamp.

### [P2] LC-6 — Signalling answer to a member who joined within the last 30 s can be refused (per-socket member cache) and the refusal is ignored
- Файлы: apps/api/src/modules/realtime/realtime.gateway.ts:1171; apps/mobile/lib/features/calls/application/call_controller.dart
- Правка: On targets.length===0 with a cached call re-query once (bypass the cache) before ok:false; drop the cache entry on call:participants for that call. Client: if the answer send returns false mark the peer for _syncLinks to re-offer. Test: realtime.gateway.lifecycle.spec «member who joined after the cache was filled receives the signal».

### [P2] LC-7 — call:ended sent to an invitee whose invite expired carries status «active» → ended screen looks up a missing label
- Файлы: apps/api/src/modules/calls/calls.service.ts:2440
- Правка: In sweepInvites (and declineInvite) send the DTO with per-viewer status 'missed'/'declined' (buildDto status override), or map incoming && status.active → CallStatus.missed in the client's call:ended handler. Tests: ongoing-call-events.spec «expired invite is told missed»; call_controller_test «invite times out: screen says missed».

### [P2] UI-08 — Group grid: fixed tiles, no last-row stretch, 8 px gap / 12 px radius instead of spec
- Файлы: apps/mobile/lib/features/calls/presentation/call_group.dart:98
- Правка: Compute rects per count (1 full, 2 stacked, 3 = 2 + 1 wide, 4 = 2×2, 5-6 = 3×2, 7-9 = 3×3, last row stretched), 4 px gap, radius 20 + border; feed them to the AnimatedPositioned Stack from UI-02. Update goldens grid_3 / grid_5.

### [P2] UI-09 — Camera off shows a flat navy box + small avatar, not the blurred photo
- Файлы: apps/mobile/lib/features/calls/presentation/call_screen.dart:428; call_group.dart:318
- Правка: Done by AN-1's CallBlurredBackdrop/CallPhotoBackdrop; use it under the big avatar in 1:1 and in _MemberTile when stream==null && avatarUrl!=null; initials-only when no photo.

### [P2] UI-10 — PiP: linear 180 ms snap, no fling, no border/shadow, no snap haptic
- Файлы: apps/mobile/lib/features/calls/presentation/call_pip_window.dart:77
- Правка: Use d.velocity.pixelsPerSecond projected 150 ms ahead to choose the corner; animate with AnimationController + SpringSimulation(mass 1, stiffness 600, damping ~49) or Curves.easeOutBack 300 ms (zero under reduceMotion); HapticFeedback.selectionClick() on snap; DecoratedBox border + BoxShadow; keep callVideoLayoutProvider.moveTo.

### [P2] UI-11 — Press feedback weaker than spec; Material ink splash over video; tile taps have no haptic
- Файлы: apps/mobile/lib/features/calls/presentation/call_screen.dart:739; call_controls.dart
- Правка: Make _TopButton an AppPressable (or InkWell with NoSplash); call-only pressScaleFactor 0.92 for the island and top buttons; HapticFeedback.selectionClick() in toggleFocus / PiP swap call sites.

### [P2] UI-12 — Status line collapses to '' (layout jump); texts change without cross-fade; prompt/notice push the grid down
- Файлы: apps/mobile/lib/features/calls/presentation/call_screen.dart:769
- Правка: Return t.t('call.status.connecting') while connectedAt==null; wrap name/status in SizedBox(fixed height) + AnimatedSwitcher(200 ms, zero under reduceMotion) keyed by text; overlay the notice/prompt in the Stack (Positioned top) so the grid/PiP do not move.

### [P2] UI-13 — No tests guard renderer reuse, auto-hide or the failover view; goldens are static only
- Файлы: apps/mobile/test/features/calls/call_screens_golden_test.dart:17; call_screen_fakes.dart; sfu_call_controller_test.dart
- Правка: Counting surface in call_screen_fakes.dart (records initState) and tests: toggleFocus ×2 and swap ×2 keep the count constant; FakeAsync: video active → after 4 s controlsHidden==true, tap → false, audio never hides; sfu_call_controller_test: during a fake swap controller.media (listenable) never null while state.busy.

### [P2] AN-3 — Android ongoing-call notification shows no caller photo
- Файлы: apps/mobile/android/app/src/main/kotlin/com/lawbid/lawbid/CallForegroundService.kt:172; MainActivity.kt; apps/mobile/lib/features/calls/application/call_foreground.dart
- Правка: Add avatarUrl to CallForegroundNotification.start (call_foreground.dart) and EXTRA_AVATAR in MainActivity.kt's lawbid/call_service handler; in CallForegroundService reuse ChatNotifications.kt cacheAvatar/avatarIcon (192 px cache, key = avatar file id) and Person.Builder().setIcon(icon); controller passes state.peer?.avatarUrl. Verify on Android 12+.

### [P2] AN-4 — CallKit extra.avatarUrl / data.avatar is dead data with a misleading comment
- Файлы: apps/mobile/ios/Runner/AppDelegate.swift:285; apps/mobile/lib/features/calls/application/callkit_bridge.dart
- Правка: Make it real: read callKitParams.extra['avatarUrl'] in callkitEventsProvider (CallEventActionCallAccept) and seed CallPeer.avatarUrl before _getWithRetry returns so the screen shows the photo during the fetch; or drop it and fix the comment to «CallKit shows no photo».

### [P2] AN-5 — live_calls_fab keeps a second raw CachedNetworkImageProvider instead of appNetworkImage
- Файлы: apps/mobile/lib/features/calls/presentation/live_calls_fab.dart:181
- Правка: Replace with appNetworkImage(c.avatarUrl!, decodeWidthFor(44)); delete the cached_network_image import; widget test asserting the FAB uses the same provider type as CallAvatar.

### [P2] AN-6 — Ring push sends only the _w256 preview; a missing preview leaves the native Android ring screen without a photo
- Файлы: apps/api/src/modules/notifications/push/push-dispatcher.ts:1071; apps/mobile/lib/features/push/push_service.dart
- Правка: dispatchCall sends avatarUrl (256) + avatarFallbackUrl: link.url; lawbidBackgroundMessage/lawbidIncomingParams keep avatar=preview and on Android pass the full link via extra so a native check (Glide error → retry full) picks the one that exists; run #417's media:avatar-previews --apply on prod. Extend push-dispatcher.call-ring.spec and callkit_push_params_test.

### [P2] AN-7 — Missed-call push has no caller photo here, and after #417 only when the caller is an attorney
- Файлы: apps/api/src/modules/notifications/push/push-dispatcher.ts:571
- Правка: After rebasing on #417 drop the attorney gate for n.type==='missed_call' (keep the viewer-context privacy check from avatarUrls); push-dispatcher.actions.spec case for a client caller's missed call carrying actorAvatar.

### [P2] AN-8 — Group-call «Join» notice carries no photo
- Файлы: apps/api/src/modules/notifications/push/push-dispatcher.ts:389; apps/mobile/lib/features/push/push_service.dart
- Правка: Fetch group.avatar_file_id in dispatchGroupCallNotice, call avatarUrls(recipientId,[group.avatar_file_id, who.avatar_file_id]), add chatAvatar/chatAvatarKey (plus #417's actorPushData) to the data; _showCallInvite passes the link to the local notification's large icon. Cover in push-dispatcher.call-ring.spec.

### [P2] T5 — Mobile failover/reconnecting tests sleep ~25 s wall-clock on macos-latest (flaky, slow)
- Файлы: apps/mobile/test/features/calls/call_controller_test.dart:641
- Правка: Rewrite the five tests with fakeAsync + async.elapse(kCallReconnectingDelay + 1 ms) as done in «every end closes the call»; remove the 30 s Timeout.

### [P2] T6 — Breaker-open move chain is awaited with two setImmediate ticks (timing-coupled)
- Файлы: apps/api/src/modules/calls/calls-failover.spec.ts:244; cloudflare-transport.ts
- Правка: Let CloudflareTransport.onOpen listeners return void | Promise<void> and have recordFailure await them (or keep a lastOpenRun promise under @internal); await w.svc.lastMove in the test. Add the Redis-mode variant: two CallsService+transport on one FakeRedis, 5 failures split across both → exactly one moveSfuCallsToOwn and one call:participants per call.

### [P2] T7 — Call-screen goldens derive the timer text from DateTime.now()
- Файлы: apps/mobile/test/features/calls/call_screen_fakes.dart:104
- Правка: Give callSession1to1 a fixed connectedAt relative to a fixed now injected via a callClockProvider overridden in callScreenFakeOverrides (pairs with UI-07's _CallClock); keep the 2 % tolerance as the font guard only.

### [P2] T8 — SFU→mesh swap tested for audio only; video swap, >4-people audio-only, slow ice-servers budget and answerer side untested
- Файлы: apps/mobile/test/features/calls/sfu_call_controller_test.dart; call_controller_test.dart
- Правка: sfu_call_controller_test: video call with cameraOn → after participants(provider:'p2p') h.mesh.openedVideo==true; 6 members with video:false → openedVideo==false; call_controller_test (fakeAsync): repo.iceServers completes after 5 s → iceRestarts==1 by 1.8 s with the OLD list; answerer link fails → repo asked with relayFailed and a restart-request signal is sent.

### [P2] T9 — Mobile 6-hour TURN credential refresh timer has no test
- Файлы: apps/mobile/lib/features/calls/application/call_controller.dart:1769; apps/api/src/modules/calls/cloudflare-turn.spec.ts
- Правка: fakeAsync: active call, elapse 6 h + 1 s → repo.iceAsks grew by one (relayFailed false) and media.iceUpdates.last is the new list; 12 h → two; after hangUp none. API: cloudflare-turn.spec asserts a cached login older than 30 min is re-fetched and ttlSec in the DTO equals the TTL sent to Cloudflare.

### [P2] T10 — «Связь для звонков» card component and the two admin-ops calls-path endpoints have no tests
- Файлы: apps/admin/src/components/integrations/calls-transport-card.tsx:85; apps/api/test/admin-ops-calls-path.e2e-spec.ts (new)
- Правка: calls-transport-card.test.tsx with mocked api: three pills → own/cloudflare/auto PUTs, «Проверить» POSTs once and shows ✓ NN мс / ✗ reason, breaker open renders amber. apps/api/test/admin-ops-calls-path.e2e-spec.ts: non-admin 403; admin GET envelope with carrying/breakers and no outside request; POST check with no keys → both sides check:null.

### [P2] T11 — The solo_end_seconds default change 30→3 is not asserted anywhere
- Файлы: apps/api/src/modules/admin-config/cloudflare-sfu-switch.spec.ts:54; apps/api/test/owner-solo-calls.e2e-spec.ts
- Правка: cloudflare-sfu-switch.spec: expect schema['calls.solo_end_seconds'].defaultValue toBe 3 and OWNER_CHAT_ACTION_SETTINGS value 3; one e2e in owner-solo-calls.e2e-spec without override asserting the call ends between 3 s and 6 s.

## Сводки по направлениям

### ui-parity
The branch fixes the close/hang-up logic and writes a good WhatsApp/FaceTime spec (docs/dev/calls-rework/REFERENCE.md) plus "before" goldens, but the call UI itself was NOT reworked: the diff vs main touches only call_screen.dart (close + end-for-all) and call_widgets.dart (test surface hook); call_group.dart, call_pip_window.dart, call_controls.dart and call_video_layout.dart are unchanged from main, so none of the spec items (4 s auto-hide, 300 ms grid↔focus motion, scrim, blurred photo, last-row stretch, spring PiP) exist in code. What is correct: RepaintBoundary per video and srcObject swap in didUpdateWidget (call_widgets.dart:33,74-80), renderer/timer disposal, gold speaker ring, WhatsApp pill order with haptics, reduceMotion on AnimatedContainers, «Reconnecting…» delayed 3 s, 1:1 ICE restart keeps the same media so the screen does not change, Android call notification gets the avatar. The one owner-scenario break: the SFU→mesh swap sets controller._media = null for 1-2 s and the screen/grid are built from `media == null`, so every picture collapses to avatars + crossed cameras and then comes back as black boxes while new renderers initialise — people WILL notice the Cloudflare switch even though the text stays hidden. Beyond that, every focus/grid/strip change and the 1:1 swap remount RTCVideoRenderers (black flash, no animation), the PiP covers the top buttons, the name/timer have no scrim over video, and the whole tree is rebuilt by a 1 s setState with a 60 fps empty ring painter for the whole call.

### failover
The failover skeleton is sound and matches the research notes in most places: one distributed circuit breaker per Cloudflare service (turn/sfu) in Redis with N-in-M failure counting (5 in 120 s), one fleet-wide probe a minute while open (driven by new calls AND the every-minute status watchdog, so Cloudflare comes back even with no calls), client relay reports that count only with >=10 phones and >=30 % of Cloudflare calls (good lift/false-positive protection), per-call stickiness (a moved call never returns mid-call; new calls go back by themselves), SFU->mesh swap with the SAME call id via `call:participants {mediaProvider:p2p}` plus `_resync` for a missed event, 1:1 relay failover via `GET /calls/ice-servers?relayFailed=true` (cache skipped, new Cloudflare login, own TURN first) + `setConfiguration` + ICE restart, and «Reconnecting…» suppressed for the first 3 s. The SFU reconnect (ICE restart within 12 s, new session after the 30 s window, bounded recreate) follows Cloudflare's documented 30 s reuse window. Unit tests cover the server moves, stickiness and the report thresholds. What does not hold up: both health probes test only the control plane (credential API / sessions/new), never the relay itself, and new 1:1 calls get NO own TURN while Cloudflare looks healthy, so a Cloudflare relay (data-plane) outage with a live API makes new relay-dependent calls die in the connecting phase and the breaker never learns about it; a single transient SFU error (one 5xx/429/timeout on any route, no retry) moves a whole group call off Cloudflare for good; the mid-call retry timer never re-fetches the relay list; the SFU->mesh swap reuses a cached (Cloudflare-only) relay list; and the breaker closes on one good probe with no hysteresis. Switch-back for running calls is by design absent (new calls only), which is defensible but contradicts the admin card text and the owner's literal wording. The reverse direction (own relay dead while Cloudflare is primary) is harmless because own TURN is not even in the list; but while the breaker is open, own TURN health is never checked and Cloudflare is dropped from the list entirely.

### transport-selection
The admin-keys → call-setup chain is built correctly and needs no restart. Keys live in Integrations as `cloudflare_turn` {keyId, apiToken, optional accountId/analyticsToken} (apps/api/src/common/secrets/provider-registry.ts:500-556) and `cloudflare_sfu` {appId, appToken} (:558-593); a saved version is `pending` and becomes live only after «Проверить» → «Включить» (secrets.service.ts:577, :644-669), at which point `changed()` publishes `secrets:changed` and every API/worker process drops its in-memory copy at once (secrets.service.ts:107-115, :333-340; 60 s safety-net). The API reads the keys per call, not at boot: `iceServers` calls `secrets.get('cloudflare_turn')` on every GET /calls/ice-servers (calls.service.ts:891-901) and the SFU provider reads `cloudflare_sfu` on every session (cloudflare-sfu.provider.ts:25-38). `calls.transport` defaults to `auto` (app-settings.defaults.ts:745, config-schema.ts:112-118), is read via AppConfig (Redis 30 s + 5 s in-process memo) and an admin PUT drops both caches (admin-config.service.ts:402, app-config.service.ts:30-34), so Выкл/Вкл/Авто applies within ≤5 s on every instance; Вкл is refused without at least one Cloudflare key (admin-config.service.ts:304-326). `CloudflareTransport.decide` (cloudflare-transport.ts:452-471) gives no_keys→own, own→own, cloudflare→forced, auto→Redis breaker (5 failures/120 s, one probe a minute fleet-wide, also driven by the status watchdog :421-445). 1:1 calls get the Cloudflare relay first and own coturn only when Cloudflare failed within 1.5 s or on relayFailed (calls.service.ts:915-968); group calls get the SFU session when wanted and the breaker is closed, else mesh (sfu-broker.service.ts:210-255, media-provider.ts:41-56). Nothing is ON without keys, the «Связь для звонков» card reads breaker state + the last «Проверить» (status-probes.service.ts:792-872), and the synthetic STUN+TURN Allocate check can leave the ECS tasks (egress all, infra/modules/stack/main.tf:909-914). So the claim "save (and activate) the keys → the next call uses Cloudflare, own servers are not offered" is CONFIRMED for the API side. What does not fully meet the owner's "nobody notices" rule: a group call started right after Cloudflare dies waits up to 16 s (8 s timeout × one retry) before it falls to mesh; a Cloudflare relay-only outage (REST still issues logins) is invisible to the TURN breaker at small scale; and LiveKit, which the card promises as part of the automatic backup, is never used during automatic failover.

### tests-ci
Coverage on origin/claude/calls-failover (fbc6dd20f) is real and broad at the unit level: API jest specs cover the shared breaker (cloudflare-transport.spec.ts: N-in-M with expiry across two instances on a fake Redis, one probe a minute, forced own/cloudflare, Redis error reads as closed), chaos failover of a running SFU call (calls-failover.spec.ts: 503/500/401 mid-call keep the call id, move it to p2p, announce once, >4 people drop to audio, breaker-open moves every live call, per-call stickiness), 1:1 relay failover (cloudflare-turn.spec.ts: 1.5 s budget, breaker open/close via background probe, key rotation and broken-then-restored key, relayFailed gives a NEW login with own TURN first), idempotent end and the 3 s solo grace (call-end-idempotent.spec.ts, solo-call.spec.ts, owner-solo-calls.e2e-spec.ts), the synthetic STUN/TURN check against a real UDP fake (relay-check.spec.ts), the admin card helpers (calls-transport.test.ts), VoIP ring payload with avatar (push-dispatcher.call-ring.spec.ts), and on mobile the relayFailed ICE refresh before restart, SFU→mesh swap keeping id/mute with «Reconnecting…» only after 3 s, missed-event resync, every end path closing the call, alone-in-group 3 s, screen close with sheets, CallKit single-subscriber architecture test, push→CallKit params, and 14 call-screen goldens. CI is wired: mobile-ci.yml triggers on apps/mobile/** and packages/api-contract/** (both changed) and runs flutter analyze/test on macos-latest then build-android (debug APK), build-web (wasm) and build-ios (debug, --no-codesign); api-ci runs unit+coverage, sharded e2e and the openapi/Dart-client drift check (the branch includes regenerated contract files); admin-ci typechecks against generated types and runs vitest. What is NOT proven: the HTTP path of GET /calls/ice-servers?relayFailed=true (query DTO transform under whitelist/forbidNonWhitelisted + 30/min throttle) has no test, so the phone-side failover depends on an untested wire; the Redis-mode phone-report ratio (recordClientFailure/noteUse/peek) is only tested in-memory; «paste keys in admin → next call uses Cloudflare» is never exercised through SecretsService (60 s cache) or the admin endpoints, and no test strings the owner's scenario together end to end (keys in → Cloudflare primary → Cloudflare dies → running call moved and new calls on own path → Cloudflare back → new calls on Cloudflare). Flaky risks: ~25 s of wall-clock Future.delayed waits in the mobile failover/reconnecting tests, two setImmediate ticks standing in for the async move chain in calls-failover.spec, and goldens whose timer text derives from DateTime.now(). The admin card component and the two admin-ops calls-path endpoints have no tests at all.

### cloudflare-api
What is right: both Cloudflare adapters match the docs in the research notes. TURN: POST https://rtc.live.cloudflare.com/v1/turn/keys/{id}/credentials/generate-ice-servers with Bearer + {ttl}, the relay entry (urls/username/credential) is taken from the iceServers array, port-53 URLs are filtered, ttl = 86400 s (under the 48 h max and far above the 6 h SFU-state/4 h call bound), a 30 min per-user cache, 1.5 s total budget with one retry, failures counted to the SLO and the breaker (apps/api/src/modules/calls/cloudflare-turn.ts, calls.service.ts:865-1016). SFU: base /v1/apps/{appId}, Bearer App Secret, sessions/new, tracks/new (local with offer / remote by publisher sessionId+trackName, never mixed), renegotiate with the answer, tracks/close by mid + force, tracks/update with simulcast.preferredRid, ≤64 tracks per request, per-item errorCode checked, one mutation at a time per session (Redis lock + in-process chain), requiresImmediateRenegotiation blocks further mutations until the answer (15 s stale guard), only sessions/new is retried (safe), renegotiate never (apps/api/src/modules/calls/cloudflare-sfu.client.ts, sfu-broker.service.ts, sfu-state.store.ts). Secrets: the token/App Secret only appear in the Authorization header; every logged message is status/code only; no SDP or credential is logged on API or phone. Breaker keys calls:cf:{fail,open,probe,lastprobe,use,report,reporter} all carry TTLs; one probe a minute fleet-wide via SET NX PX; the admin card and cost registry row vendor.cloudflare_calls (ceiling usage.cloudflare_egress_crit_gb, scale.cloudflare_hardstop.mode) exist. What is not right: (1) a wrong or not-yet-propagated App ID (HTTP 404 not_found, measured in the notes) is treated as the caller's fault, so group calls fail with no fallback and the breaker never opens; (2) the breaker's MGET/DEL span two hash slots: the repo's own Redis Cluster guard spec fails on cloudflare-transport.ts and in cluster mode the breaker silently never opens or closes; (3) HTTP 429 (a per-session 50 req/s limit) is counted as a Cloudflare outage, so one looping phone can move every running group call to mesh; smaller gaps: in-body error codes (retryable_transient_error, backend_error, ...) are mapped to a 400 "caller fault", the cost hard stop never covers the TURN path that now carries every 1:1 call, and the client-report threshold (10 phones) cannot open the TURN breaker at launch scale. The "Проверить" button's UDP STUN/TURN Allocate from the API task was not verified against the ECS egress rules.

### avatars-notifications
The ring path is correctly built and tested: dispatchCall resolves the caller's photo once under the recipient's viewer context (privacy respected), hands it to the pure voipRequest (iOS VoIP, keys match AppDelegate.swift) and to the FCM data message; the Android background isolate and lawbidIncomingParams pass it to flutter_callkit_incoming 3.1.6, which on Android 14+ posts a CallStyle notification and loads the photo via Glide as the large icon (headers default to an empty HashMap, no null-cast), and on older Android into its custom views. iOS CallKit cannot show a photo (correctly stated in REFERENCE.md:55). In-call tiles with the camera off use the single CallAvatar → AppAvatar → appNetworkImage path with initials fallback; there is one avatar helper (avatarUrls) and one push builder per platform, and a read-only merge-tree against PR #417 shows push-dispatcher.ts and AppDelegate.swift auto-merge with no duplicated avatar logic (CallAvatar will transparently pick up #417's StableNetworkImage). What does not hold up: REFERENCE.md promises blurred-photo backgrounds for voice calls and camera-off tiles, but no blur exists anywhere in the call UI; the Android ongoing-call notification has no photo; AppDelegate stores an avatar in CallKit extra that nothing reads; live_calls_fab keeps a second raw CachedNetworkImageProvider; the ring sends only the _w256 link, so avatars without a preview show nothing on the native Android ring screen; missed-call pushes carry no photo here and only an attorney's photo after #417. Separately, the branch conflicts with main in admin-ops.controller.ts/admin-ops.dto.ts, so nothing merges until that is resolved.

### lifecycle
The call lifecycle on origin/claude/calls-failover (fbc6dd20) is largely sound: ring carries the avatar on both platforms (push-dispatcher.ts:343-379, AppDelegate.swift:273-283), every iOS VoIP push reports to CallKit even for a closed app (stand-in engine, AppDelegate.swift:239-263), the CallKit event channel has one subscriber enforced by test/architecture/callkit_single_subscription_test.dart, accept is guarded by _accepting and hangUp by state.busy (call_controller.dart:692-696, 786-795), the server end is a conditional updateMany so two hang-ups/instances end and log once (calls.service.ts:1108-1116, specs call-end-idempotent/solo-call), a 1:1 call ends at once via end()→finish()→call:ended, a group down to one person ends after calls.solo_end_seconds=3 on the server (settleHeadcount/endSolo 2519-2576) with a 3 s client backup (_checkAlone 1149-1177), seq ordering + resync on gaps (_inOrder 2174-2187), network loss is handled with a fresh relay list + ICE restart or SFU recreate, teardown is exception-safe in both medias (_guard, call_media.dart:720-760, cloudflare_sfu_call_media.dart:787-830) and _finish always reaches «ended» (2386-2434), and the screen removes its own route instead of maybePop (call_screen.dart:69-92) — the «call does not end» bug is closed. Two real defects remain: on iOS a ring cancelled while the phone is locked/closed is told only by a priority-5 background push that iOS does not deliver to a force-quit app or to the headless stand-in engine, so CallKit rings on until its 45 s timeout; and a connected call that drops after the 150 s reconnect grace is recorded as «failed» with duration 0 instead of «ended» with its real duration. The rest are polish: a 45 s/60 s/65 s ring-timeout mismatch, an admin heartbeat value that can exceed the server's 180 s silence cut-off, no phone-side report for a Cloudflare SFU that the phone (but not the API) cannot reach, a 30 s signalling cache that can swallow a late joiner's answer, an invitee's «call:ended» carrying status active, and no client unit test for the SFU→mesh swap.
