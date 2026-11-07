import 'dart:io';

import 'package:drift/drift.dart' show Value, driftRuntimeOptions;
import 'package:drift/native.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/cache/cache_database.dart';
import 'package:lawbid/core/cache/cache_providers.dart';
import 'package:lawbid/core/persistence/local_kv_store.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/core/platform/chat_notifications_channel.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/core/session/session_state.dart';
import 'package:lawbid/core/uploads/upload_files.dart';
import 'package:lawbid/core/uploads/upload_queue.dart';
import 'package:lawbid/core/uploads/upload_queue_database.dart';
import 'package:lawbid/features/cases/application/cases_providers.dart';
import 'package:lawbid/features/cases/data/cases_local_database.dart';
import 'package:lawbid/features/chat/application/chat_text_drafts.dart';
import 'package:lawbid/features/notifications/application/push_service.dart';
import 'package:lawbid/features/settings/storage/application/storage_providers.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/data/social_local_database.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Owner 2026-11-05: on any way out of an account (sign-out, a forced one,
/// another person signing in) what belongs to the person leaves the phone and
/// the device's own settings stay.
class _Session extends SessionController {
  @override
  SessionState? build() => null;

  void to(String? sub) => state = sub == null
      ? null
      : SessionState(
          accessToken: 'test-access-token',
          sub: sub,
          role: 'client',
          sid: 's1',
          verified: true,
          subscriptionStatus: 'none',
          accessTokenExpiresAt: DateTime(2100),
        );
}

class _Files implements UploadFiles {
  final removed = <String>[];

  @override
  Future<void> remove(String name) async => removed.add(name);

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;

  group('which stored keys belong to a person', () {
    test('every key on the lists is still used by the app', () {
      final code = [
        for (final f in Directory('lib').listSync(recursive: true))
          if (f is File &&
              f.path.endsWith('.dart') &&
              !f.path.endsWith('cache_maintenance.dart'))
            f.readAsStringSync(),
      ].join();
      for (final key in [
        ...accountScopedKeyPrefixes,
        ...personalKeys,
        ...personalKeyPrefixes,
      ]) {
        expect(code, contains(key), reason: key);
      }
    });

    test('the device keeps its own settings', () {
      for (final key in [
        'l10n.language',
        'l10n.languages.active',
        'design_system.theme_mode',
        'design_system.window_bg',
        'cache.cap_mb',
        'cache.user_limit_mb.video',
        'network.device_id',
        'permissions.primer.v1',
        'chat.voice_speed',
        caseFilesOwnerKey,
      ]) {
        expect(isForeignAccountKey(key, null), isFalse, reason: key);
      }
    });

    test('the one signing in keeps what carries their name', () {
      const keys = ['chat.textDrafts.v1.', 'contacts_book_v1.', 'tz.sent.'];
      for (final prefix in keys) {
        expect(isForeignAccountKey('${prefix}user-a', null), isTrue);
        expect(isForeignAccountKey('${prefix}user-b', 'user-a'), isTrue);
        expect(isForeignAccountKey('${prefix}user-a', 'user-a'), isFalse);
      }
      expect(isOtherAccountKey('feed.topics.v1', 'user-a'), isFalse);
    });
  });

  group('what the operating system keeps', () {
    const channel = MethodChannel('lawbid/account-wipe-test');
    final messenger =
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    final calls = <MethodCall>[];

    setUp(() {
      calls.clear();
      debugDefaultTargetPlatformOverride = TargetPlatform.android;
      messenger.setMockMethodCallHandler(channel, (call) async {
        calls.add(call);
        return null;
      });
    });
    tearDown(() {
      debugDefaultTargetPlatformOverride = null;
      messenger.setMockMethodCallHandler(channel, null);
    });

    test('shade, buttons, names, calls, icon, alarms and token all go',
        () async {
      final steps = <String>[];
      await clearDeviceTracesWith(
        chat: ChatNotificationsChannel(channel: channel),
        endCalls: () async => steps.add('calls'),
        zeroBadge: () async => steps.add('badge'),
        cancelReminders: () async => steps.add('alarms'),
        deleteFirebaseToken: () async => steps.add('token'),
      );
      expect(calls.map((c) => c.method), [
        'setPushActions',
        'setContactNames',
        'clearAll',
      ]);
      expect(calls.first.arguments, {'url': '', 'token': ''});
      expect(calls[1].arguments, {'names': <String, String>{}});
      expect(steps, ['calls', 'badge', 'alarms', 'token']);
    });

    test('one failing step does not stop the others', () async {
      final steps = <String>[];
      await clearDeviceTracesWith(
        chat: ChatNotificationsChannel(channel: channel),
        endCalls: () => throw StateError('no plugin'),
        zeroBadge: () async => steps.add('badge'),
        deleteFirebaseToken: () async => steps.add('token'),
      );
      expect(steps, ['badge', 'token']);
    });
  });

  group('the whole way out', () {
    late ProviderContainer c;
    late SocialLocalDatabase social;
    late CasesLocalDatabase cases;
    late UploadQueueDatabase uploads;
    late CacheDatabase cache;
    late _Files files;
    late List<bool> traces;
    late SharedPreferences prefs;
    final at = DateTime(2026, 11, 5);

    Future<void> seed(String owner) async {
      await social.enqueue(
        clientMessageId: 'c-$owner',
        ownerId: owner,
        conversationId: 'chat-1',
        body: 'not sent yet',
      );
      await social.remember(owner, 'lawyers', 'divorce');
      await cases.saveDraft(owner, '{"title":"private"}');
      await uploads.into(uploads.uploadJobs).insert(
            UploadJobsCompanion.insert(
              id: 'job-$owner',
              ownerId: owner,
              kind: 'chat.voice',
              target: 'chat-1',
              payload: '{}',
              fileName: Value('file-$owner'),
              seq: 1,
              createdAt: at,
            ),
          );
      await cache.putMessages(owner, 'chat-1', [
        (id: 'm-$owner', createdAt: at, json: '{"body":"private"}'),
      ]);
      await prefs.setString('chat.textDrafts.v1.$owner', '{"chat-1":"hi"}');
      await prefs.setString('contacts_book_v1.$owner', '{}');
    }

    Future<void> settle() async {
      for (var i = 0; i < 40; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 5));
      }
    }

    setUp(() async {
      SharedPreferences.setMockInitialValues({
        'l10n.language': 'ky',
        'design_system.theme_mode': 'dark',
        'network.device_id': 'test-device',
        'feed.topics.v1': '["family"]',
      });
      prefs = await SharedPreferences.getInstance();
      social = SocialLocalDatabase(NativeDatabase.memory());
      cases = CasesLocalDatabase(NativeDatabase.memory());
      uploads = UploadQueueDatabase(NativeDatabase.memory());
      cache = CacheDatabase(NativeDatabase.memory());
      files = _Files();
      traces = [];
      c = ProviderContainer(
        overrides: [
          sessionControllerProvider.overrideWith(_Session.new),
          sharedPreferencesProvider.overrideWithValue(prefs),
          localKvStoreProvider.overrideWithValue(LocalKvStore(prefs)),
          socialLocalDatabaseProvider.overrideWithValue(social),
          casesLocalDatabaseProvider.overrideWithValue(cases),
          uploadQueueDatabaseProvider.overrideWithValue(uploads),
          uploadFilesProvider.overrideWithValue(files),
          deviceTracesCleanerProvider.overrideWithValue(
            ({required signedOut}) async => traces.add(signedOut),
          ),
          cacheMaintenanceProvider.overrideWithValue(
            CacheMaintenance(
              db: cache,
              pages: social,
              limits: () => const CacheLimits(),
            ),
          ),
        ],
      )..read(accountFilesGuardProvider);
    });
    tearDown(() async {
      c.dispose();
      await social.close();
      await cases.close();
      await uploads.close();
      await cache.close();
    });

    _Session session() =>
        c.read(sessionControllerProvider.notifier) as _Session;

    test('signing out or being thrown out: nothing of the person stays',
        () async {
      await prefs.setString(caseFilesOwnerKey, 'user-a');
      session().to('user-a');
      await settle();
      await seed('user-a');

      session().to(null);
      await settle();

      expect(await social.pending('user-a'), isEmpty);
      expect(await social.recent('user-a', 'lawyers'), isEmpty);
      expect(await cases.draftJson('user-a'), isNull);
      expect(await uploads.pending('user-a'), isEmpty);
      expect(files.removed, ['file-user-a']);
      expect(await cache.messagesOf('user-a', 'chat-1'), isEmpty);
      expect(prefs.getString('chat.textDrafts.v1.user-a'), isNull);
      expect(prefs.getString('contacts_book_v1.user-a'), isNull);
      expect(prefs.getString('feed.topics.v1'), isNull);
      expect(traces, [true]);
      // The device's own settings.
      expect(prefs.getString('l10n.language'), 'ky');
      expect(prefs.getString('design_system.theme_mode'), 'dark');
      expect(prefs.getString('network.device_id'), 'test-device');
    });

    test('another person signing in: the previous one goes, theirs stays',
        () async {
      await prefs.setString(caseFilesOwnerKey, 'user-a');
      await seed('user-a');
      await seed('user-b');

      session().to('user-b');
      await settle();

      expect(await social.pending('user-a'), isEmpty);
      expect(await cases.draftJson('user-a'), isNull);
      expect(await cache.messagesOf('user-a', 'chat-1'), isEmpty);
      expect(prefs.getString('chat.textDrafts.v1.user-a'), isNull);
      expect(await social.pending('user-b'), hasLength(1));
      expect(await cases.draftJson('user-b'), isNotNull);
      expect(await cache.messagesOf('user-b', 'chat-1'), hasLength(1));
      expect(prefs.getString('chat.textDrafts.v1.user-b'), isNotNull);
      // Firebase and the alarms stay for the one signed in.
      expect(traces, [false]);
    });

    test('text drafts in memory do not pass to the next account', () async {
      await prefs.setString('chat.textDrafts.v1.user-a', '{"chat-1":"hi"}');
      await prefs.setString(caseFilesOwnerKey, 'user-a');
      session().to('user-a');
      await settle();
      expect(c.read(chatTextDraftsProvider), {'chat-1': 'hi'});

      session().to('user-b');
      await settle();

      expect(c.read(chatTextDraftsProvider), isEmpty);
    });
  });
}
