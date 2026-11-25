import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/feature_flags/feature_flags_state.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/calls/application/call_screen_addon.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/hotline/application/hotline_controller.dart';
import 'package:lawbid/features/hotline/data/hotline_repository.dart';
import 'package:lawbid/features/hotline/domain/hotline_models.dart';
import 'package:lawbid/features/notifications/presentation/notifications_view.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/shared/domain/user_role.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Owner row 87 (hotline plan, «Scenarios — клиент»): every client row of
/// the scenario table, against a scripted server. Each test name carries
/// the row number of the table in docs/dev/HOTLINE_PLAN_2026-11-16.md.

class _Flags extends FeatureFlagsController {
  _Flags(this._on);
  final bool _on;

  @override
  FeatureFlagsState build() =>
      FeatureFlagsState(flags: {kHotlineFlag: _on}, appConfig: const {});

  void flip({required bool on}) =>
      state = FeatureFlagsState(flags: {kHotlineFlag: on}, appConfig: const {});
}

HotlineRequest _r(
  HotlineStatus status, {
  String id = 'req-1',
  String? callId,
  String? endReason,
  String? pos,
}) =>
    HotlineRequest(
      id: id,
      status: status,
      callId: callId,
      endReason: endReason,
      positionBand: pos,
      lawyer: callId == null
          ? null
          : const HotlineLawyer(id: 'lw-1', name: 'Daniel R.', state: 'NV'),
    );

class _Repo implements HotlineRepository {
  final calls = <String>[];
  HotlineRequest Function()? onCreate;
  HotlineRequest Function()? onGet;
  ApiException? createError;
  ApiException? newEndpointError;
  ApiException? configError;
  ApiException? claimTokenError;
  HotlineRequest current = _r(HotlineStatus.searching);

  @override
  Future<HotlineConfig> config() async {
    if (configError != null) throw configError!;
    return const HotlineConfig(enabled: true);
  }

  @override
  Future<HotlineRequest> create(HotlineDraft draft) async {
    calls.add('create:${draft.languages.join(',')}');
    if (createError != null) throw createError!;
    return current = onCreate?.call() ?? current;
  }

  @override
  Future<HotlineRequest> get(String id) async {
    calls.add('get:$id');
    return onGet?.call() ?? current;
  }

  @override
  Future<HotlineRequest> cancel(String id) async {
    calls.add('cancel:$id');
    return current =
        _r(HotlineStatus.cancelled, id: id, endReason: 'cancelled');
  }

  @override
  Future<HotlineRequest> changeLanguages(String id, List<String> l) async {
    calls.add('languages:${l.join(',')}');
    return current;
  }

  @override
  Future<HotlineRequest> notifyMe(String id, {String? timeZone}) async {
    calls.add('notify:$timeZone');
    return current = _r(HotlineStatus.offline, id: id);
  }

  @override
  Future<HotlineRequest> claim(String id, {String? token}) async {
    calls.add('claim:${token ?? '-'}');
    if (token != null && claimTokenError != null) throw claimTokenError!;
    return current = _r(HotlineStatus.connected, id: id, callId: 'call-1');
  }

  @override
  Future<List<HotlineCounter>> counters(List<String> keys) async => [
        for (final k in keys)
          HotlineCounter(key: k, lawyers: '0', clients: '1'),
      ];

  @override
  Future<void> ackDisclosure(int version) async => calls.add('ack:$version');

  @override
  Future<bool> review(String id, {required int stars, String? comment}) async {
    calls.add('review:$stars');
    if (newEndpointError != null) throw newEndpointError!;
    return true;
  }

  @override
  Future<String> offerCase(String id) async {
    calls.add('offer:$id');
    if (newEndpointError != null) throw newEndpointError!;
    return 'case-1';
  }
}

const _draft = HotlineDraft(
  topic: 'Развод, раздел квартиры',
  practice: 'family_law',
  state: 'NV',
  languages: ['ru', 'en'],
);

void main() {
  late _Repo repo;
  late StreamController<RealtimeEvent> events;
  late List<String> entered;
  late SharedPreferences prefs;

  Future<ProviderContainer> make({
    bool flag = true,
    String user = 'client-1',
    Map<String, Object> saved = const {},
  }) async {
    SharedPreferences.setMockInitialValues(saved);
    prefs = await SharedPreferences.getInstance();
    final c = ProviderContainer(
      overrides: [
        hotlineRepositoryProvider.overrideWithValue(repo),
        featureFlagsControllerProvider.overrideWith(() => _Flags(flag)),
        sharedPreferencesProvider.overrideWithValue(prefs),
        hotlineMeProvider.overrideWithValue(user),
        currentUserRoleProvider.overrideWithValue(UserRole.client),
        realtimeEventsProvider.overrideWithValue(events.stream),
        hotlineEnterCallProvider.overrideWithValue((id) async {
          entered.add(id);
        }),
        hotlineTimeZoneProvider.overrideWithValue(
          () async => 'America/Los_Angeles',
        ),
      ],
    );
    addTearDown(c.dispose);
    c.read(hotlineControllerProvider);
    return c;
  }

  HotlineController ctl(ProviderContainer c) =>
      c.read(hotlineControllerProvider.notifier);

  Future<void> emit(String name, Object? data) async {
    events.add(RealtimeEvent(name, data));
    await Future<void>.delayed(Duration.zero);
  }

  setUp(() {
    repo = _Repo();
    events = StreamController<RealtimeEvent>.broadcast();
    entered = [];
  });
  tearDown(() => events.close());

  test('C1 the button follows the hotline flag live', () async {
    final c = await make(flag: false);
    expect(c.read(hotlineClientVisibleProvider), isFalse);
    (c.read(featureFlagsControllerProvider.notifier) as _Flags).flip(on: true);
    expect(c.read(hotlineClientVisibleProvider), isTrue);
    (c.read(featureFlagsControllerProvider.notifier) as _Flags).flip(on: false);
    expect(c.read(hotlineClientVisibleProvider), isFalse);
  });

  test('C2 an invalid form never reaches the server', () async {
    final c = await make();
    for (final d in [
      const HotlineDraft(
        topic: '  ',
        practice: 'p',
        state: 'NV',
        languages: ['en'],
      ),
      const HotlineDraft(
        topic: 't',
        practice: '',
        state: 'NV',
        languages: ['en'],
      ),
      const HotlineDraft(
        topic: 't',
        practice: 'p',
        state: '',
        languages: ['en'],
      ),
      const HotlineDraft(topic: 't', practice: 'p', state: 'NV', languages: []),
    ]) {
      expect(await ctl(c).start(d), isFalse);
    }
    expect(repo.calls, isEmpty);
    // the server's own 400 (a topic over the admin limit) is shown
    repo.createError = const ApiException(
      code: ApiErrorCodes.validationError,
      message: 'topic',
    );
    expect(await ctl(c).start(_draft), isFalse);
    expect(
      c.read(hotlineControllerProvider).errorCode,
      ApiErrorCodes.validationError,
    );
  });

  test('C3 nobody free: the request waits in the queue', () async {
    final c = await make();
    repo.onCreate = () => _r(HotlineStatus.queued, pos: '2-5');
    expect(await ctl(c).start(_draft), isTrue);
    final f = c.read(hotlineControllerProvider);
    expect(f.request!.status, HotlineStatus.queued);
    expect(f.request!.positionBand, '2-5');
    expect(f.waitingSince, isNotNull);
    await ctl(c).refreshCounters();
    expect(
      c.read(hotlineControllerProvider).counters.map((x) => x.key),
      ['l:ru', 'l:en'],
    );
  });

  test('C4 «Поменять язык» in the queue keeps the place', () async {
    final c = await make();
    repo.onCreate = () => _r(HotlineStatus.queued);
    await ctl(c).start(_draft);
    await ctl(c).changeLanguages(['es']);
    expect(repo.calls, contains('languages:es'));
    final f = c.read(hotlineControllerProvider);
    expect(f.draft!.languages, ['es']);
    expect(f.request!.id, 'req-1');
  });

  test('C5 «Сообщите…» → push accepted → the call opens', () async {
    final c = await make();
    repo.onCreate = () => _r(HotlineStatus.queued);
    await ctl(c).start(_draft);
    await ctl(c).notifyMe();
    expect(repo.calls, contains('notify:America/Los_Angeles'));
    expect(
      c.read(hotlineControllerProvider).request!.status,
      HotlineStatus.offline,
    );
    ctl(c).noticeArrived(
      HotlineNotice(
        requestId: 'req-1',
        token: 'test-claim-token',
        expiresAt: DateTime.now().add(const Duration(minutes: 1)),
      ),
    );
    expect(c.read(hotlineControllerProvider).notice, isNotNull);
    await ctl(c).claim(token: 'test-claim-token');
    expect(repo.calls, contains('claim:test-claim-token'));
    expect(entered, ['call-1']);
    expect(c.read(hotlineClientCallIdProvider), 'call-1');
    // the call screen draws the attorney's card for exactly this call
    expect(c.read(callScreenAddonProvider)?.callId, 'call-1');
  });

  test('C5b a tapped notice opens «Позвонить сейчас?», no token in link', () {
    expect(
      notificationRoute(
        type: 'hotline_attorney_available',
        payload: const {'requestId': 'req-1', 'claimToken': 'test-claim-token'},
        attorney: false,
        myId: 'client-1',
      ),
      '/hotline/status?requestId=req-1',
    );
  });

  test('C6 push ignored / expired: nothing opens, the place stays', () async {
    final c = await make();
    repo.onCreate = () => _r(HotlineStatus.queued);
    await ctl(c).start(_draft);
    await ctl(c).notifyMe();
    ctl(c).noticeArrived(
      HotlineNotice(
        requestId: 'req-1',
        token: 'test-old-token',
        expiresAt: DateTime.now().subtract(const Duration(seconds: 1)),
      ),
    );
    expect(c.read(hotlineControllerProvider).notice, isNull);
    // «Не сейчас» on a live notice: it goes, the request stays
    ctl(c).noticeArrived(
      HotlineNotice(
        requestId: 'req-1',
        expiresAt: DateTime.now().add(const Duration(seconds: 50)),
      ),
    );
    ctl(c).dismissNotice();
    final f = c.read(hotlineControllerProvider);
    expect(f.notice, isNull);
    expect(f.request!.status, HotlineStatus.offline);
    expect(entered, isEmpty);
  });

  test('C7 an older notice is refused → claimed in the app without it',
      () async {
    final c = await make();
    repo.onCreate = () => _r(HotlineStatus.offline);
    await ctl(c).start(_draft);
    repo.claimTokenError = const ApiException(
      code: ApiErrorCodes.forbidden,
      message: 'claim_token',
    );
    await ctl(c).claim(token: 'test-stale-token');
    expect(
      repo.calls,
      containsAllInOrder(['claim:test-stale-token', 'claim:-']),
    );
    expect(entered, ['call-1']);
  });

  for (final status in [
    HotlineStatus.searching,
    HotlineStatus.queued,
    HotlineStatus.offline,
  ]) {
    test('C8 cancel while ${status.name}: gone here and on the server',
        () async {
      final c = await make();
      repo.onCreate = () => _r(status);
      await ctl(c).start(_draft);
      expect(prefs.getString('hotline.client.active.v1'), isNotNull);
      await ctl(c).cancel();
      expect(repo.calls.last, 'cancel:req-1');
      final f = c.read(hotlineControllerProvider);
      expect(f.active, isFalse);
      expect(prefs.getString('hotline.client.active.v1'), isNull);
    });
  }

  test('C9 attorney declines / times out: searching again, then connected once',
      () async {
    final c = await make();
    await ctl(c).start(_draft);
    final searching = {
      'id': 'req-1',
      'status': 'searching',
      'positionBand': null,
      'waitBand': null,
      'endReason': null,
      'lawyer': null,
      'notifyUntil': null,
      'callId': null,
      'conversationId': null,
      'disclosure': null,
    };
    await emit('hotline:request', searching);
    expect(entered, isEmpty);
    repo.onGet = () => _r(HotlineStatus.connected, callId: 'call-9');
    await emit('hotline:connected', {'requestId': 'req-1', 'callId': 'call-9'});
    await emit('hotline:connected', {'requestId': 'req-1', 'callId': 'call-9'});
    await Future<void>.delayed(Duration.zero);
    expect(entered, ['call-9']);
    // another request's event never moves this one
    await emit('hotline:connected', {'requestId': 'other', 'callId': 'x'});
    expect(entered, ['call-9']);
  });

  test('C10 the call drops after talking: review; no talk: no review',
      () async {
    final c = await make();
    repo.onCreate = () => _r(HotlineStatus.connected, callId: 'call-1');
    await ctl(c).start(_draft);
    repo.onGet = () => _r(HotlineStatus.ended, endReason: 'lost');
    await emit('hotline:ended', {
      'requestId': 'req-1',
      'seconds': 0,
      'review': true,
    });
    expect(c.read(hotlineControllerProvider).review, isNull);
    await emit('hotline:ended', {
      'requestId': 'req-1',
      'seconds': 42,
      'review': true,
      'conversationId': 'conv-1',
    });
    final p = c.read(hotlineControllerProvider).review!;
    expect(p.conversationId, 'conv-1');
    expect(await ctl(c).sendReview(5, 'ok'), isTrue);
    expect(repo.calls, contains('review:5'));
    // the closing call screen keeps the card of this call
    expect(c.read(hotlineClientCallIdProvider), 'call-1');
  });

  test('C11 app killed / restarted: the saved request comes back', () async {
    repo.current = _r(HotlineStatus.queued, pos: '1');
    final c = await make(
      saved: {
        'hotline.client.active.v1': jsonEncode({
          'user': 'client-1',
          'id': 'req-1',
          'draft': _draft.toJson(),
          'since': 1,
        }),
      },
    );
    await ctl(c).restore();
    final f = c.read(hotlineControllerProvider);
    expect(repo.calls, ['get:req-1']);
    expect(f.request!.status, HotlineStatus.queued);
    expect(f.draft!.topic, _draft.topic);
  });

  test('C11b another account on this phone never sees the request', () async {
    final c = await make(
      user: 'client-2',
      saved: {
        'hotline.client.active.v1': jsonEncode({
          'user': 'client-1',
          'id': 'req-1',
        }),
      },
    );
    await ctl(c).restore();
    expect(repo.calls, isEmpty);
    expect(c.read(hotlineControllerProvider).request, isNull);
  });

  test('C11c socket back after a lost network: the request is re-read',
      () async {
    final c = await make();
    repo.onCreate = () => _r(HotlineStatus.queued);
    await ctl(c).start(_draft);
    repo.calls.clear();
    await emit(RealtimeEvent.reconnected, null);
    expect(repo.calls, ['get:req-1']);
  });

  test('C12 flag off while queued: everything goes', () async {
    final c = await make();
    repo.onCreate = () => _r(HotlineStatus.queued);
    await ctl(c).start(_draft);
    (c.read(featureFlagsControllerProvider.notifier) as _Flags).flip(on: false);
    final f = c.read(hotlineControllerProvider);
    expect(f.request, isNull);
    expect(c.read(hotlineClientVisibleProvider), isFalse);
  });

  test('C13 flag off in a call: the card stays until the server ends it',
      () async {
    final c = await make();
    repo.onCreate = () => _r(HotlineStatus.connected, callId: 'call-1');
    await ctl(c).start(_draft);
    expect(entered, ['call-1']);
    (c.read(featureFlagsControllerProvider.notifier) as _Flags).flip(on: false);
    expect(c.read(hotlineClientCallIdProvider), 'call-1');
  });

  test('C14 an unconfirmed phone is told so; a blocked account is refused',
      () async {
    final c = await make();
    repo.createError = const ApiException(
      code: ApiErrorCodes.forbidden,
      message: 'phone',
      details: {'reason': 'phone_not_verified'},
    );
    expect(await ctl(c).start(_draft), isFalse);
    expect(
      c.read(hotlineControllerProvider).errorCode,
      kHotlinePhoneNotVerified,
    );
    repo.createError = const ApiException(
      code: ApiErrorCodes.featureDisabled,
      message: 'off',
    );
    expect(await ctl(c).start(_draft), isFalse);
    expect(c.read(hotlineControllerProvider).config, HotlineConfig.off);
  });

  test('C15 a repeat call after the first ended is a new request', () async {
    final c = await make();
    repo.onCreate = () => _r(HotlineStatus.connected, callId: 'call-1');
    await ctl(c).start(_draft);
    repo.onGet = () => _r(HotlineStatus.ended, endReason: 'ended');
    await ctl(c).refresh();
    expect(c.read(hotlineControllerProvider).active, isFalse);
    repo.onCreate = () => _r(HotlineStatus.searching, id: 'req-2');
    expect(await ctl(c).start(_draft), isTrue);
    expect(c.read(hotlineControllerProvider).request!.id, 'req-2');
    expect(repo.calls.where((x) => x.startsWith('create')).length, 2);
  });

  test('C16 «Предложить дело» returns the new case', () async {
    final c = await make();
    repo.onCreate = () => _r(HotlineStatus.connected, callId: 'call-1');
    await ctl(c).start(_draft);
    final res = await ctl(c).offerCase();
    expect(res.caseId, 'case-1');
    expect(repo.calls, contains('offer:req-1'));
  });

  test('C18 server without review / offer-case (404): nothing breaks',
      () async {
    final c = await make();
    repo.onCreate = () => _r(HotlineStatus.connected, callId: 'call-1');
    await ctl(c).start(_draft);
    repo.newEndpointError = const ApiException(
      code: ApiErrorCodes.notFound,
      message: 'Cannot POST',
      statusCode: 404,
    );
    // «Предложить дело»: the refusal comes back (the call card then opens
    // the ordinary «Предложить дело» sheet), no throw
    final res = await ctl(c).offerCase();
    expect(res.caseId, isNull);
    expect(res.code, ApiErrorCodes.notFound);
    // the review: quietly not sent, no throw
    await emit('hotline:ended', {
      'requestId': 'req-1',
      'seconds': 30,
      'review': true,
    });
    expect(await ctl(c).sendReview(4, null), isFalse);
    expect(c.read(hotlineControllerProvider).review, isNull);
  });

  test('C19 flag off: no button, no request, no server call', () async {
    final c = await make(flag: false);
    expect(c.read(hotlineClientVisibleProvider), isFalse);
    await ctl(c).restore();
    expect(repo.calls, isEmpty);
  });

  test('C20 hotline off on the server (FEATURE_DISABLED): the button goes',
      () async {
    final c = await make();
    repo.configError = const ApiException(
      code: ApiErrorCodes.featureDisabled,
      message: 'off',
    );
    await ctl(c).loadConfig();
    expect(c.read(hotlineControllerProvider).config, HotlineConfig.off);
    expect(c.read(hotlineClientVisibleProvider), isFalse);
  });
}
