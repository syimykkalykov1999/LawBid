import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/audio/app_sounds.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/hotline/application/hotline_attorney_providers.dart';
import 'package:lawbid/features/hotline/data/hotline_attorney_repository.dart';
import 'package:lawbid/features/hotline/domain/hotline_attorney_models.dart';

/// The attorney's choice for the line (mockup a2), kept on the phone so
/// the screen opens with it next time.
@immutable
class HotlineChoice {
  const HotlineChoice({
    this.practiceAreas = const [],
    this.states = const [],
    this.languages = const [],
  });

  factory HotlineChoice.decode(String? raw) {
    if (raw == null) return const HotlineChoice();
    try {
      final m = jsonDecode(raw);
      if (m is! Map) return const HotlineChoice();
      List<String> list(Object? x) =>
          x is List ? [for (final v in x) '$v'] : const [];
      return HotlineChoice(
        practiceAreas: list(m['p']),
        states: list(m['s']),
        languages: list(m['l']),
      );
    } on Object {
      return const HotlineChoice();
    }
  }

  final List<String> practiceAreas;
  final List<String> states;
  final List<String> languages;

  bool get complete =>
      practiceAreas.isNotEmpty && states.isNotEmpty && languages.isNotEmpty;

  HotlineChoice copyWith({
    List<String>? practiceAreas,
    List<String>? states,
    List<String>? languages,
  }) =>
      HotlineChoice(
        practiceAreas: practiceAreas ?? this.practiceAreas,
        states: states ?? this.states,
        languages: languages ?? this.languages,
      );

  /// Only what is still allowed (his practices, verified states, profile
  /// languages): a removed one never goes to the server.
  HotlineChoice within({
    required Set<String> practices,
    required Set<String> states,
    required Set<String> languages,
  }) =>
      HotlineChoice(
        practiceAreas: [
          for (final p in practiceAreas)
            if (practices.contains(p)) p,
        ],
        states: [
          for (final s in this.states)
            if (states.contains(s)) s,
        ],
        languages: [
          for (final l in this.languages)
            if (languages.contains(l)) l,
        ],
      );

  String encode() => jsonEncode({
        'p': practiceAreas,
        's': states,
        'l': languages,
      });
}

@immutable
class HotlineLineState {
  const HotlineLineState({
    this.online = false,
    this.starting = false,
    this.line,
    this.onlineSince,
    this.offReason,
    this.errorCode,
    this.counters = const {},
    this.waiting,
    this.call,
    this.caseOffered,
    this.openCallScreen = 0,
  });

  /// On the line (mockup a3) — only while the line screen is open.
  final bool online;

  /// «Ожидать звонки» was pressed, the server has not answered yet.
  final bool starting;
  final HotlineLine? line;
  final DateTime? onlineSince;

  /// Why the line went off on its own (server `hotline:line`): missed,
  /// access, language, licence, switched_off …
  final String? offReason;

  /// The server refused «Ожидать звонки» (code or `details.reason`).
  final String? errorCode;
  final Map<String, HotlineLineCounter> counters;

  /// «Клиент ждёт · язык» while he talks (mockup a7).
  final HotlineWaiting? waiting;

  /// The hotline call on the call screen (ringing or talking).
  final HotlineCallInfo? call;

  /// The client offered a case (mockup a8): the bid form opens once.
  final HotlineCaseOffered? caseOffered;

  /// Bumped when an offer rings: the host opens the call screen.
  final int openCallScreen;

  bool get accepting => line?.accepting ?? true;

  HotlineLineState copyWith({
    bool? online,
    bool? starting,
    HotlineLine? line,
    DateTime? onlineSince,
    String? offReason,
    bool clearOffReason = false,
    String? errorCode,
    bool clearError = false,
    Map<String, HotlineLineCounter>? counters,
    HotlineWaiting? waiting,
    bool clearWaiting = false,
    HotlineCallInfo? call,
    bool clearCall = false,
    HotlineCaseOffered? caseOffered,
    bool clearCaseOffered = false,
    int? openCallScreen,
  }) =>
      HotlineLineState(
        online: online ?? this.online,
        starting: starting ?? this.starting,
        line: line ?? this.line,
        onlineSince: onlineSince ?? this.onlineSince,
        offReason: clearOffReason ? null : offReason ?? this.offReason,
        errorCode: clearError ? null : errorCode ?? this.errorCode,
        counters: counters ?? this.counters,
        waiting: clearWaiting ? null : waiting ?? this.waiting,
        call: clearCall ? null : call ?? this.call,
        caseOffered: clearCaseOffered ? null : caseOffered ?? this.caseOffered,
        openCallScreen: openCallScreen ?? this.openCallScreen,
      );
}

/// Where the last choice is kept on the phone.
const kHotlineChoiceKey = 'hotline.attorney.choice';

/// Owner row 87 (hotline plan step 6, mockup a2–a8): the attorney's line.
///
/// - On the line only while the line screen is open: [goOnline] from
///   «Ожидать звонки», [goOffline] when he leaves the screen, presses
///   «Выключить линию» or the app goes to the background / the web tab is
///   hidden (the server also drops a line whose heartbeat stops).
/// - A heartbeat every `heartbeatSec` on the open socket (REST when the
///   socket is down); after a reconnect the kept choice comes back
///   (`POST /hotline/line/resume`).
/// - An offer rings on OUR call screen ([CallController.ringHotline]);
///   «Ответить» opens the 1:1 voice call the line made.
/// - In a hotline call the heartbeat names the client who waits longest:
///   the quiet «Клиент ждёт» banner (one soft sound, like WhatsApp call
///   waiting); «Ответить» ends this call and takes that client.
/// - `hotline:case_offered` → our bid form with «Дело из звонка».
class HotlineAttorneyController extends Notifier<HotlineLineState> {
  StreamSubscription<RealtimeEvent>? _events;
  Timer? _beat;
  Timer? _offerTimer;
  final _dismissed = <String>{};
  String? _autoTake;
  String? _beeped;

  HotlineAttorneyRepository get _repo =>
      ref.read(hotlineAttorneyRepositoryProvider);

  @override
  HotlineLineState build() {
    ref
      ..listen<Stream<RealtimeEvent>>(
        realtimeEventsProvider,
        (_, stream) {
          unawaited(_events?.cancel());
          _events = stream.listen(_onEvent);
        },
        fireImmediately: true,
      )
      ..listen<CallSession>(callControllerProvider, _onCall)
      // The admin switched the hotline off (flag or «Выкл для всех»):
      // off the line at once; a call already taken goes on (1:1 call).
      ..listen<bool>(hotlineFlagOnProvider, (_, on) {
        if (on || !(state.online || state.starting)) return;
        unawaited(goOffline());
        state = state.copyWith(offReason: 'switched_off');
      })
      ..onDispose(() {
        unawaited(_events?.cancel());
        _beat?.cancel();
        _offerTimer?.cancel();
      });
    return const HotlineLineState();
  }

  /// The choice saved last time.
  HotlineChoice savedChoice() => HotlineChoice.decode(
        ref.read(localKvStoreProvider).getString(kHotlineChoiceKey),
      );

  /// «Ожидать звонки».
  Future<void> goOnline(HotlineChoice choice) async {
    if (state.starting || !choice.complete) return;
    state = state.copyWith(
      starting: true,
      clearError: true,
      clearOffReason: true,
    );
    unawaited(
      ref.read(localKvStoreProvider).setString(
            kHotlineChoiceKey,
            choice.encode(),
          ),
    );
    try {
      final line = await _repo.lineOn(
        states: choice.states,
        practiceAreas: choice.practiceAreas,
        languages: choice.languages,
      );
      if (!ref.mounted) return;
      _online(line);
    } on ApiException catch (e) {
      if (!ref.mounted) return;
      final reason = e.details?['reason'];
      state = state.copyWith(
        starting: false,
        errorCode: reason is String ? reason : e.code,
      );
    } on Object {
      if (!ref.mounted) return;
      state = state.copyWith(starting: false, errorCode: 'network');
    }
  }

  void _online(HotlineLine line) {
    state = state.copyWith(
      online: line.online,
      starting: false,
      line: line,
      onlineSince: state.online ? state.onlineSince : DateTime.now(),
    );
    _beat?.cancel();
    if (!line.online) return;
    final every = Duration(seconds: line.heartbeatSec.clamp(5, 120));
    _beat = Timer.periodic(every, (_) => unawaited(heartbeat()));
    unawaited(heartbeat());
  }

  /// Off the line: the screen was left, the app went to the background
  /// ([away] — only this device, over the socket) or «Выключить линию».
  Future<void> goOffline({bool away = false}) async {
    _beat?.cancel();
    _beat = null;
    final was = state.online || state.starting;
    state = state.copyWith(online: false, starting: false, counters: const {});
    if (!was) return;
    try {
      if (away) {
        final r = await ref.read(realtimeClientProvider)?.emitAck(
              'hotline:away',
            );
        if (r != null) return;
      }
      await _repo.lineOff();
    } on Object {
      // The heartbeat stops: the server drops the line by itself.
    }
  }

  /// One sign of life; also brings «Клиент ждёт» while he talks.
  @visibleForTesting
  Future<void> heartbeat() async {
    if (!state.online) return;
    Object? line;
    Object? waiting;
    var resumable = false;
    final socket = ref.read(realtimeClientProvider);
    final r = await socket?.emitAck('hotline:heartbeat');
    if (r != null) {
      line = r['line'];
      waiting = r['waiting'];
      resumable = r['resumable'] == true;
    } else {
      try {
        final (ok, w) = await _repo.heartbeat();
        line = ok;
        waiting = w;
      } on Object {
        return;
      }
    }
    if (!ref.mounted || !state.online) return;
    if (line == false) {
      if (resumable) {
        await _resume();
      } else {
        _beat?.cancel();
        state = state.copyWith(online: false);
      }
      return;
    }
    _setWaiting(HotlineWaiting.fromJson(waiting));
    unawaited(_watchCounters());
  }

  Future<void> _resume() async {
    try {
      final line = await _repo.resume();
      if (ref.mounted) _online(line);
    } on Object {
      if (!ref.mounted) return;
      _beat?.cancel();
      state = state.copyWith(online: false);
    }
  }

  /// «Сейчас по вашим темам»: one row per language of his line (`l:<lang>`).
  Future<void> _watchCounters() async {
    final langs = state.line?.languages ?? const <String>[];
    if (langs.isEmpty) return;
    final keys = [for (final l in langs) 'l:$l'];
    final r = await ref
        .read(realtimeClientProvider)
        ?.emitAck('hotline:watch', {'keys': keys});
    final map = r?['counters'];
    if (map is Map && ref.mounted) {
      final next = Map<String, HotlineLineCounter>.of(state.counters);
      map.forEach((k, v) {
        if (v is Map) {
          next['$k'] = HotlineLineCounter(
            key: '$k',
            lawyers: '${v['lawyers'] ?? ''}',
            clients: '${v['clients'] ?? ''}',
          );
        }
      });
      state = state.copyWith(counters: next);
      return;
    }
    try {
      final rows = await _repo.counters(keys);
      if (!ref.mounted) return;
      state = state.copyWith(counters: {for (final c in rows) c.key: c});
    } on Object {
      // The table keeps its last numbers.
    }
  }

  void _setWaiting(HotlineWaiting? w) {
    final current = state.call;
    final talking = current?.callId != null &&
        ref.read(callControllerProvider).busy &&
        state.accepting;
    if (w == null || !talking || _dismissed.contains(w.requestId)) {
      if (state.waiting != null) state = state.copyWith(clearWaiting: true);
      return;
    }
    if (_beeped != w.requestId) {
      _beeped = w.requestId;
      // One soft sound — WhatsApp's call waiting, not a ring.
      unawaited(ref.read(appSoundsProvider).videoRequest());
    }
    state = state.copyWith(waiting: w);
  }

  /// «Отклонить» on the banner: this client is not shown again.
  void dismissWaiting() {
    final w = state.waiting;
    if (w == null) return;
    _dismissed.add(w.requestId);
    state = state.copyWith(clearWaiting: true);
  }

  /// «Ответить» on the banner (like WhatsApp «Завершить и ответить»): this
  /// call ends, and the line's next offer — that client, the longest
  /// waiting one — is taken at once.
  Future<void> answerWaiting() async {
    final w = state.waiting;
    final current = state.call;
    if (w == null) return;
    _autoTake = w.requestId;
    state = state.copyWith(clearWaiting: true);
    if (current == null) return;
    try {
      await _repo.endCall(current.requestId);
    } on Object {
      await ref.read(callControllerProvider.notifier).hangUp();
    }
  }

  /// «Заблокировать и пожаловаться» in the call: the call ends at once
  /// (WhatsApp); the server never offers this client to him again
  /// (HotlineConflictService reads the block live).
  Future<void> endBlocked(HotlineCallInfo info) async {
    state = state.copyWith(clearWaiting: true);
    try {
      await _repo.endCall(info.requestId);
    } on Object {
      // the line's sweeper closes it with the call
    }
    await ref.read(callControllerProvider.notifier).hangUp();
  }

  /// «Принимать звонки» (the «⋯» menu): off = this call goes on, no new
  /// calls come.
  Future<void> setAccepting({required bool on}) async {
    try {
      final line = await _repo.setAccepting(on: on);
      if (!ref.mounted) return;
      state = state.copyWith(line: line);
      if (!on) state = state.copyWith(clearWaiting: true);
    } on Object {
      // The switch stays as it was.
    }
  }

  /// The bid form opened for the offered case.
  void caseOfferedShown() => state = state.copyWith(clearCaseOffered: true);

  /// «Понятно» under the one-time disclosure.
  Future<void> ackDisclosure(int version) async {
    try {
      await _repo.ackDisclosure(version);
    } on Object {
      // Shown again next time.
    }
    ref.invalidate(hotlineAttorneyConfigProvider);
  }

  // --- the socket ---------------------------------------------------------

  void _onEvent(RealtimeEvent e) {
    final data = e.data;
    switch (e.name) {
      case 'hotline:offer':
        final offer = HotlineOffer.fromEvent(data);
        if (offer != null) _ring(offer);
      case 'hotline:offer_ended':
        if (data is! Map) return;
        final id = '${data['requestId']}';
        final current = state.call;
        if (current?.requestId == id && current?.callId == null) {
          _offerTimer?.cancel();
          ref
              .read(callControllerProvider.notifier)
              .dropHotlineRing(current!.ringId);
          state = state.copyWith(clearCall: true);
        }
      case 'hotline:connected':
        if (data is! Map) return;
        final current = state.call;
        final callId = data['callId'];
        if (current != null &&
            current.requestId == '${data['requestId']}' &&
            callId is String) {
          final client = data['client'];
          state = state.copyWith(
            call: current.withCall(
              callId,
              clientId: client is Map ? '${client['id']}' : null,
            ),
          );
        }
      case 'hotline:ended':
        if (data is! Map) return;
        if (state.call?.requestId == '${data['requestId']}') {
          state = state.copyWith(clearCall: true, clearWaiting: true);
        }
      case 'hotline:line':
        if (data is! Map || data['online'] != false) return;
        _beat?.cancel();
        final detail = data['detail'];
        state = state.copyWith(
          online: false,
          offReason: detail is String ? detail : '${data['reason'] ?? ''}',
        );
      case 'hotline:case_offered':
        final c = HotlineCaseOffered.fromEvent(data);
        if (c != null) state = state.copyWith(caseOffered: c);
      case 'hotline:counters':
        if (data is! Map) return;
        final key = '${data['key']}';
        final next = Map<String, HotlineLineCounter>.of(state.counters);
        next[key] = HotlineLineCounter(
          key: key,
          lawyers: '${data['lawyers'] ?? ''}',
          clients: '${data['clients'] ?? ''}',
        );
        state = state.copyWith(counters: next);
      case RealtimeEvent.reconnected:
        if (state.online) unawaited(_resume());
    }
  }

  void _ring(HotlineOffer offer) {
    final calls = ref.read(callControllerProvider.notifier);
    final info = HotlineCallInfo.ofOffer(offer);
    final ring = HotlineRing(
      requestId: offer.requestId,
      take: () => _repo.accept(offer.requestId),
      skip: () => _repo.decline(offer.requestId),
    );
    final rang = calls.ringHotline(
      ring,
      CallPeer(
        id: '',
        isAttorney: false,
        displayName: offer.clientName,
        username: offer.clientUsername,
        avatarUrl: offer.clientAvatarUrl,
      ),
    );
    if (!rang) {
      // Another call is on (a 1:1 call started meanwhile): «Отклонить»,
      // so the client goes to the next attorney at once.
      unawaited(_repo.decline(offer.requestId).catchError((Object _) {}));
      return;
    }
    state = state.copyWith(
      call: info,
      clearWaiting: true,
      openCallScreen: state.openCallScreen + 1,
    );
    _offerTimer?.cancel();
    final left = offer.expiresAt.difference(DateTime.now());
    _offerTimer = Timer(
      (left.isNegative ? Duration.zero : left) + const Duration(seconds: 1),
      () {
        if (state.call?.requestId == offer.requestId &&
            state.call?.callId == null) {
          calls.dropHotlineRing(info.ringId);
          state = state.copyWith(clearCall: true);
        }
      },
    );
    if (_autoTake == offer.requestId) {
      _autoTake = null;
      unawaited(calls.accept());
    }
  }

  void _onCall(CallSession? prev, CallSession next) {
    final current = state.call;
    if (current == null) return;
    // «Ответить»: the call screen now runs the line's call.
    final id = next.call?.id;
    if (id != null && id != current.ringId && current.callId == null) {
      if (next.phase == CallPhase.connecting ||
          next.phase == CallPhase.active) {
        state = state.copyWith(call: current.withCall(id));
        _offerTimer?.cancel();
      }
      return;
    }
    // The call is over (red button, the client hung up, lost): the line
    // closes it at once — the attorney is free for the next client.
    final over = next.phase == CallPhase.ended || next.phase == CallPhase.idle;
    final wasOurs = current.covers(prev?.call?.id) && (prev?.busy ?? false);
    if (over && wasOurs) {
      if (current.callId != null) {
        unawaited(_repo.endCall(current.requestId).catchError((Object _) {}));
      }
      state = state.copyWith(clearCall: true, clearWaiting: true);
    }
  }
}

final hotlineAttorneyControllerProvider =
    NotifierProvider<HotlineAttorneyController, HotlineLineState>(
  HotlineAttorneyController.new,
);
