import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:lawbid/core/diagnostics/app_event_names.dart';
import 'package:lawbid/core/diagnostics/app_events.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/application/call_screen_addon.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/hotline/data/hotline_repository.dart';
import 'package:lawbid/features/hotline/domain/hotline_models.dart';
import 'package:lawbid/features/hotline/presentation/hotline_call_client.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/shared/domain/user_role.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// The master switch («Флаги → Горячая линия»).
const kHotlineFlag = 'hotline';

/// The client's phone is not confirmed by SMS (owner q. 10): the form
/// says so instead of «could not connect».
const kHotlinePhoneNotVerified = 'PHONE_NOT_VERIFIED';

/// The push of «Сообщите, когда появится адвокат» (server
/// `HOTLINE_NOTICE_TYPE`): data `requestId`, `claimToken`, `expiresAt`.
const hotlineNoticeType = 'hotline_attorney_available';

/// The client's hotline, end to end (owner row 87, plan step 5; approved
/// mockup v4, 18.11): the request, its live state (socket `hotline:*` +
/// an ETag poll while a hotline screen is open), «Сообщите…» and its
/// notice, the call hand-off, the review after it.
///
/// Like Uber's rider app the request survives everything the phone does:
/// the id is kept on the device per account, so a restart, a lost network
/// or a killed app come back to the same place (the server keeps the place
/// in the queue). The server is the truth: every change re-reads it.
@immutable
class HotlineFlow {
  const HotlineFlow({
    this.config,
    this.draft,
    this.request,
    this.counters = const [],
    this.busy = false,
    this.errorCode,
    this.notice,
    this.review,
    this.waitingSince,
    this.callId,
  });

  /// The hotline call this device entered (kept after it ends, so the
  /// closing call screen keeps the attorney's card).
  final String? callId;

  /// `GET /hotline/config`; null until read.
  final HotlineConfig? config;

  /// What the client asked (kept with the request for the summary card).
  final HotlineDraft? draft;
  final HotlineRequest? request;
  final List<HotlineCounter> counters;

  /// A request is on its way to the server.
  final bool busy;

  /// The last refusal (RATE_LIMITED, FEATURE_DISABLED, VALIDATION_ERROR…).
  final String? errorCode;

  /// «Адвокат на линии. Позвонить сейчас?» waiting for an answer.
  final HotlineNotice? notice;

  /// The short review after a call that was connected.
  final HotlineReviewPrompt? review;

  /// When this device saw the request start waiting (the «ждём 01:40»).
  final DateTime? waitingSince;

  bool get active => request != null && !request!.status.over;

  HotlineFlow copyWith({
    HotlineConfig? config,
    HotlineDraft? draft,
    HotlineRequest? request,
    bool clearRequest = false,
    List<HotlineCounter>? counters,
    bool? busy,
    String? errorCode,
    bool clearError = false,
    HotlineNotice? notice,
    bool clearNotice = false,
    HotlineReviewPrompt? review,
    bool clearReview = false,
    DateTime? waitingSince,
    String? callId,
  }) =>
      HotlineFlow(
        callId: callId ?? this.callId,
        config: config ?? this.config,
        draft: clearRequest ? null : draft ?? this.draft,
        request: clearRequest ? null : request ?? this.request,
        counters: counters ?? this.counters,
        busy: busy ?? this.busy,
        errorCode: clearError ? null : errorCode ?? this.errorCode,
        notice: clearNotice ? null : notice ?? this.notice,
        review: clearReview ? null : review ?? this.review,
        waitingSince: clearRequest ? null : waitingSince ?? this.waitingSince,
      );
}

/// Opens the running hotline call on our ordinary 1:1 call screen (the
/// call host opens it, CallKit / the Android call notification show it as
/// an ongoing call, Cloudflare TURN as for 1:1). The call row is already
/// answered by «Взять»; the client is the caller (its app sends the WebRTC
/// offer). Overridden in tests.
final hotlineEnterCallProvider =
    Provider<Future<void> Function(String callId)>((ref) {
  return (callId) => ref
      .read(callControllerProvider.notifier)
      .enterHotlineCall(callId, caller: true);
});

/// The id of the client's hotline call while it is connected — the call
/// screen adds the attorney's card and drops the camera only for it.
final hotlineClientCallIdProvider = Provider<String?>((ref) {
  final f = ref.watch(hotlineControllerProvider);
  final r = f.request;
  return f.callId ?? (r?.status == HotlineStatus.connected ? r?.callId : null);
});

/// The IANA zone of the phone for «Сообщите…» (the night window); tests
/// override it.
final hotlineTimeZoneProvider = Provider<Future<String?> Function()>(
  (ref) => () async {
    try {
      return (await FlutterTimezone.getLocalTimezone()).identifier;
    } on Object {
      return null;
    }
  },
);

/// The device clock (tests fix it).
final hotlineClockProvider = Provider<DateTime Function()>(
  (ref) => DateTime.now,
);

/// Whether the client may see the hotline at all: the master flag, the
/// admin's mode (not «Выкл для всех») and a client account. Rebuilds live
/// when the flags change (bootstrap refresh) — the button goes at once.
final hotlineClientVisibleProvider = Provider<bool>((ref) {
  final flagOn =
      ref.watch(featureFlagsControllerProvider).isEnabled(kHotlineFlag);
  if (!flagOn) return false;
  if (ref.watch(currentUserRoleProvider) != UserRole.client) return false;
  final cfg = ref.watch(hotlineControllerProvider.select((s) => s.config));
  return cfg == null || cfg.open;
});

class HotlineController extends Notifier<HotlineFlow> {
  static const _storeKey = 'hotline.client.active.v1';

  HotlineRepository get _repo => ref.read(hotlineRepositoryProvider);
  StreamSubscription<RealtimeEvent>? _events;
  bool _restored = false;
  String? _enteredCall;

  @override
  HotlineFlow build() {
    ref.listen<Stream<RealtimeEvent>>(
      realtimeEventsProvider,
      (_, stream) {
        _events?.cancel();
        _events = stream.listen(_onEvent);
      },
      fireImmediately: true,
    );
    // The admin switched the line off: whatever was on screen goes.
    ref.listen<bool>(
      featureFlagsControllerProvider.select((f) => f.isEnabled(kHotlineFlag)),
      (prev, on) {
        if (prev == true && !on) {
          // A call that runs keeps its card until the server ends it.
          state = HotlineFlow(config: HotlineConfig.off, callId: state.callId);
        } else if (prev == false && on) {
          unawaited(loadConfig());
        }
      },
    );
    ref.onDispose(() => _events?.cancel());
    return const HotlineFlow();
  }

  String? get _me => ref.read(currentUserIdProvider);
  DateTime get _now => ref.read(hotlineClockProvider)();

  // --- config / restore -----------------------------------------------------

  Future<HotlineConfig?> loadConfig() async {
    try {
      final c = await _repo.config();
      if (!ref.mounted) return null;
      state = state.copyWith(config: c);
      return c;
    } on ApiException catch (e) {
      if (!ref.mounted) return null;
      if (e.code == ApiErrorCodes.featureDisabled) {
        state = state.copyWith(config: HotlineConfig.off);
      }
      return state.config;
    } on Object {
      return state.config;
    }
  }

  /// After a start, a restart or a reconnect: the request this account had
  /// open on this device, re-read from the server.
  Future<void> restore({bool force = false}) async {
    if (_restored && !force) return;
    _restored = true;
    final saved = _readSaved();
    if (saved == null) return;
    state = state.copyWith(draft: saved.draft, waitingSince: saved.since);
    await refresh(id: saved.id);
  }

  ({String id, HotlineDraft? draft, DateTime? since})? _readSaved() {
    try {
      final raw =
          ref.read(sharedPreferencesProvider).getString(_storeKey) ?? '';
      if (raw.isEmpty) return null;
      final j = jsonDecode(raw) as Map<String, Object?>;
      if (j['user'] != _me || j['id'] is! String) return null;
      return (
        id: j['id']! as String,
        draft: j['draft'] is Map
            ? HotlineDraft.fromJson(
                Map<String, Object?>.from(j['draft']! as Map),
              )
            : null,
        since: j['since'] is int
            ? DateTime.fromMillisecondsSinceEpoch(j['since']! as int)
            : null,
      );
    } on Object {
      return null;
    }
  }

  void _save() {
    final prefs = ref.read(sharedPreferencesProvider);
    final r = state.request;
    if (r == null || r.status.over) {
      unawaited(prefs.remove(_storeKey));
      return;
    }
    unawaited(
      prefs.setString(
        _storeKey,
        jsonEncode({
          'user': _me,
          'id': r.id,
          'draft': state.draft?.toJson(),
          'since': state.waitingSince?.millisecondsSinceEpoch,
        }),
      ),
    );
  }

  // --- the request ----------------------------------------------------------

  /// «Позвонить» on the form.
  Future<bool> start(HotlineDraft draft) async {
    if (!draft.valid || state.busy) return false;
    state = state.copyWith(busy: true, clearError: true, draft: draft);
    AppEvents.track(AppEventNames.hotlineRequest, screen: 'hotline');
    try {
      final r = await _repo.create(draft);
      if (!ref.mounted) return false;
      _apply(r, waitingSince: _now);
      return true;
    } on ApiException catch (e) {
      if (!ref.mounted) return false;
      final phone = e.code == ApiErrorCodes.forbidden &&
          e.details?['reason'] == 'phone_not_verified';
      state = state.copyWith(
        busy: false,
        errorCode: phone ? kHotlinePhoneNotVerified : e.code,
      );
      if (e.code == ApiErrorCodes.featureDisabled) {
        state = state.copyWith(config: HotlineConfig.off);
      }
      return false;
    } on Object {
      if (!ref.mounted) return false;
      state = state.copyWith(busy: false, errorCode: 'NETWORK');
      return false;
    }
  }

  /// Re-reads the request (the poll of an open hotline screen; a 304 when
  /// nothing changed). A request the server no longer has is over.
  Future<void> refresh({String? id}) async {
    final rid = id ?? state.request?.id;
    if (rid == null) return;
    try {
      final r = await _repo.get(rid);
      if (!ref.mounted) return;
      _apply(r);
    } on ApiException catch (e) {
      if (!ref.mounted) return;
      if (e.code == ApiErrorCodes.notFound ||
          e.code == ApiErrorCodes.featureDisabled) {
        state = state.copyWith(clearRequest: true);
        _save();
      }
    } on Object {
      // Offline: the screen keeps what it had and asks again later.
    }
  }

  /// «Сейчас на линии»: one row per chosen language.
  Future<void> refreshCounters() async {
    final langs = state.draft?.languages ?? const <String>[];
    if (langs.isEmpty) return;
    try {
      final rows = await _repo.counters([for (final l in langs) 'l:$l']);
      if (!ref.mounted) return;
      state = state.copyWith(counters: rows);
    } on Object {
      // Keeps the last numbers.
    }
  }

  Future<void> cancel() async {
    await _act(AppEventNames.hotlineCancel, (id) => _repo.cancel(id));
  }

  Future<void> changeLanguages(List<String> languages) async {
    if (languages.isEmpty) return;
    final draft = state.draft;
    if (draft != null) {
      state = state.copyWith(draft: draft.copyWith(languages: languages));
    }
    await _act(
      AppEventNames.hotlineLanguages,
      (id) => _repo.changeLanguages(id, languages),
    );
    unawaited(refreshCounters());
  }

  /// «Сообщите, когда появится адвокат».
  Future<void> notifyMe() async {
    final zone = await ref.read(hotlineTimeZoneProvider)();
    await _act(
      AppEventNames.hotlineNotify,
      (id) => _repo.notifyMe(id, timeZone: zone),
    );
  }

  /// «Вернуться в очередь» / «Позвонить сейчас» (in the app: no token).
  Future<void> claim({String? token}) async {
    final id = state.notice?.requestId ?? state.request?.id;
    if (id == null) return;
    state = state.copyWith(clearNotice: true);
    final code = await _act(
      AppEventNames.hotlineClaim,
      (_) => _repo.claim(id, token: token),
      id: id,
    );
    // An older notice than the newest one is refused; in the app the client
    // may claim without it (the server keeps his place).
    if (token != null && code == ApiErrorCodes.forbidden) {
      await _act(AppEventNames.hotlineClaim, (_) => _repo.claim(id), id: id);
    }
  }

  /// «Не сейчас» under «Позвонить сейчас?»: the notice goes, the place
  /// stays (the server notifies again, up to its limit).
  void dismissNotice() => state = state.copyWith(clearNotice: true);

  Future<void> acknowledgeDisclosure() async {
    final d = state.request?.disclosure ?? state.config?.disclosure;
    if (d == null) return;
    final r = state.request;
    if (r != null) {
      state = state.copyWith(request: r.withoutDisclosure());
    }
    try {
      await _repo.ackDisclosure(d.version);
    } on Object {
      // Shown again next time.
    }
  }

  Future<bool> sendReview(int stars, String? comment) async {
    final p = state.review;
    if (p == null) return false;
    state = state.copyWith(clearReview: true);
    AppEvents.track(AppEventNames.hotlineReview, screen: 'hotline');
    try {
      return await _repo.review(p.requestId, stars: stars, comment: comment);
    } on Object {
      return false;
    }
  }

  void dismissReview() => state = state.copyWith(clearReview: true);

  /// «Предложить дело» in the call (mockup c11b): the case made from this
  /// call, offered to its attorney. The case id, or the refusal's code.
  Future<({String? caseId, String? code})> offerCase() async {
    final id = state.request?.id;
    if (id == null) return (caseId: null, code: ApiErrorCodes.notFound);
    AppEvents.track(AppEventNames.hotlineOfferCase, screen: 'hotline');
    try {
      return (caseId: await _repo.offerCase(id), code: null);
    } on ApiException catch (e) {
      return (caseId: null, code: e.code);
    } on Object {
      return (caseId: null, code: 'NETWORK');
    }
  }

  /// Back to the form after an ended request (or a refusal).
  void clearError() => state = state.copyWith(clearError: true);

  /// Runs one change of the request; the refusal's code (null = done).
  Future<String?> _act(
    String event,
    Future<HotlineRequest> Function(String id) call, {
    String? id,
  }) async {
    final rid = id ?? state.request?.id;
    if (rid == null) return null;
    AppEvents.track(event, screen: 'hotline');
    state = state.copyWith(busy: true, clearError: true);
    try {
      final r = await call(rid);
      if (!ref.mounted) return null;
      _apply(r);
      return null;
    } on ApiException catch (e) {
      if (!ref.mounted) return e.code;
      state = state.copyWith(busy: false, errorCode: e.code);
      if (e.code == ApiErrorCodes.notFound) {
        state = state.copyWith(clearRequest: true);
        _save();
      }
      return e.code;
    } on Object {
      if (!ref.mounted) return 'NETWORK';
      state = state.copyWith(busy: false, errorCode: 'NETWORK');
      return 'NETWORK';
    }
  }

  void _apply(HotlineRequest r, {DateTime? waitingSince}) {
    final prev = state.request;
    if (prev != null && prev.id != r.id && waitingSince == null) return;
    state = state.copyWith(
      request: r,
      busy: false,
      waitingSince: waitingSince ??
          (state.waitingSince == null && r.status.waiting ? _now : null),
    );
    _save();
    if (r.status == HotlineStatus.connected && r.callId != null) {
      _enter(r.callId!);
    }
  }

  void _enter(String callId) {
    if (_enteredCall == callId) return;
    _enteredCall = callId;
    state = state.copyWith(callId: callId);
    // The call screen draws the attorney's card for this call (voice only).
    ref.read(callScreenAddonProvider.notifier).set(
          CallScreenAddon(
            callId: callId,
            stage: (
              context, {
              required peer,
              required clock,
              required bottomInset,
            }) =>
                HotlineCallClientPanel(
              peer: peer,
              clock: clock,
              bottomInset: bottomInset,
            ),
          ),
        );
    AppEvents.track(AppEventNames.hotlineConnected, screen: 'hotline');
    unawaited(
      ref.read(hotlineEnterCallProvider)(callId).then<void>(
            (_) {},
            onError: (Object _) => _enteredCall = null,
          ),
    );
  }

  // --- live events ---------------------------------------------------------

  void _onEvent(RealtimeEvent e) {
    final data = e.data;
    switch (e.name) {
      case RealtimeEvent.reconnected:
        if (state.active) unawaited(refresh());
      case 'hotline:request':
        if (data is! Map) return;
        final r = hotlineRequestFromJson(Map<String, Object?>.from(data));
        if (r == null || r.id != state.request?.id) return;
        _apply(r);
      case 'hotline:connected':
        if (data is! Map || data['requestId'] != state.request?.id) return;
        final callId = data['callId'];
        if (callId is String) _enter(callId);
        unawaited(refresh());
      case 'hotline:ended':
        if (data is! Map) return;
        final rid = data['requestId'];
        if (rid is! String) return;
        final r = state.request;
        final seconds = data['seconds'];
        final talked = seconds is num && seconds > 0;
        if (data['review'] == true && talked && rid == r?.id) {
          state = state.copyWith(
            review: HotlineReviewPrompt(
              requestId: rid,
              lawyer: r?.lawyer,
              conversationId: data['conversationId'] as String?,
            ),
          );
        }
        if (rid == r?.id) unawaited(refresh());
      case 'hotline:notify':
        if (data is! Map || data['requestId'] is! String) return;
        noticeArrived(
          HotlineNotice(
            requestId: data['requestId']! as String,
            token: data['token'] as String?,
            expiresAt: data['expiresAt'] is num
                ? DateTime.fromMillisecondsSinceEpoch(
                    (data['expiresAt']! as num).toInt(),
                  )
                : null,
          ),
        );
    }
  }

  /// The «Адвокат на линии» notice (socket, or a tapped push).
  void noticeArrived(HotlineNotice n) {
    if (n.expired(_now)) return;
    state = state.copyWith(notice: n);
    if (state.request?.id != n.requestId) unawaited(refresh(id: n.requestId));
  }
}

final hotlineControllerProvider =
    NotifierProvider<HotlineController, HotlineFlow>(HotlineController.new);

/// The server's view (socket payload) → the app model; null = not one.
HotlineRequest? hotlineRequestFromJson(Map<String, Object?> json) {
  try {
    final r = ApiHotlineRepository.requestOf(
      api.HotlineRequestViewDto.fromJson(json),
    );
    // A newer server also sends the attorney's @username and photo (plan
    // doc «API contract»); the generated model does not know them yet.
    final raw = json['lawyer'];
    final l = r.lawyer;
    if (l == null || raw is! Map) return r;
    String? s(String k) => raw[k] is String ? raw[k] as String : null;
    return r.withLawyer(
      HotlineLawyer(
        id: l.id,
        name: l.name,
        state: l.state,
        barNumber: l.barNumber,
        username: s('username'),
        avatarUrl: s('avatarUrl'),
      ),
    );
  } on Object {
    return null;
  }
}
