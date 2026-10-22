import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/contacts_sync/application/contacts_background_sync.dart';
import 'package:lawbid/features/contacts_sync/application/contacts_sync_providers.dart';
import 'package:lawbid/features/contacts_sync/application/phone_contacts.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fake_contacts_server.dart';

/// Owner 2026-10-20: the daily background pass; owner 2026-10-22: it is a
/// hash check (ContactsBookSync), "X joined" comes from the server and the
/// «notify me» switch is stored there.
void main() {
  Future<(ProviderContainer, FakeContactsServer, List<int>)> make(
    Map<String, Object> prefs, {
    String? user = 'u1',
    bool fail = false,
    FakeContactsServer? repo,
  }) async {
    SharedPreferences.setMockInitialValues(prefs);
    final sp = await SharedPreferences.getInstance();
    final server = repo ?? FakeContactsServer();
    final passes = <int>[];
    final c = ProviderContainer(
      overrides: [
        sharedPreferencesProvider.overrideWithValue(sp),
        currentUserIdProvider.overrideWithValue(user),
        translatorProvider.overrideWithValue(const StaticTranslatorEn()),
        contactsSyncRepositoryProvider.overrideWithValue(server),
        phoneContactsProvider.overrideWith((_) async {
          passes.add(passes.length);
          if (fail) throw StateError('no pass');
          return const PhoneContacts();
        }),
      ],
    );
    addTearDown(c.dispose);
    return (c, server, passes);
  }

  test('never runs before the user allowed contacts on this install', () async {
    final (c, _, passes) = await make({});
    await c.read(contactsBackgroundSyncProvider).run();
    expect(passes, isEmpty);
  });

  test('runs once a day', () async {
    final (c, _, passes) = await make({'contacts_sync_asked_v1': '1'});
    final sync = c.read(contactsBackgroundSyncProvider);
    await sync.run();
    await sync.run();
    expect(passes, hasLength(1));
    await c.read(localKvStoreProvider).setString(
          'contacts_auto_sync_at_v1.u1',
          DateTime.now().subtract(const Duration(days: 2)).toIso8601String(),
        );
    await sync.run();
    expect(passes, hasLength(2));
  });

  test('the switch is saved on the server (it sends the notice)', () async {
    final (c, server, _) = await make({});
    final sync = c.read(contactsBackgroundSyncProvider);
    expect(sync.notifyNew, isTrue);
    await sync.setNotifyNew(on: false);
    expect(sync.notifyNew, isFalse);
    expect(server.notifyJoined, isFalse);
    // Per account: another account on this phone has none of it.
    final kv = c.read(localKvStoreProvider);
    expect(kv.getString('contacts_notify_new_v1.u1'), '0');
    expect(kv.getString('contacts_notify_new_v1.u2'), isNull);
  });

  test('the server refuses the switch → the device copy goes back', () async {
    final (c, _, __) = await make({}, repo: _Refusing());
    final sync = c.read(contactsBackgroundSyncProvider);
    await expectLater(
      sync.setNotifyNew(on: false),
      throwsA(isA<ApiException>()),
    );
    expect(sync.notifyNew, isTrue);
  });

  test('a failed pass does not start the 24 h wait', () async {
    final (c, _, __) = await make({'contacts_sync_asked_v1': '1'}, fail: true);
    await c.read(contactsBackgroundSyncProvider).run();
    expect(
      c.read(localKvStoreProvider).getString('contacts_auto_sync_at_v1.u1'),
      isNull,
    );
  });

  test('without a signed-in account nothing runs', () async {
    final (c, _, passes) =
        await make({'contacts_sync_asked_v1': '1'}, user: null);
    await c.read(contactsBackgroundSyncProvider).run();
    expect(passes, isEmpty);
  });
}

class _Refusing extends FakeContactsServer {
  @override
  Future<void> setNotifyJoined({required bool enabled}) async =>
      throw const ApiException(code: 'NETWORK_ERROR', message: 'offline');
}
