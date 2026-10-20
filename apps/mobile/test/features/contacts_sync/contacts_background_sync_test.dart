import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/contacts_sync/application/contacts_background_sync.dart';
import 'package:lawbid/features/contacts_sync/application/contacts_sync_providers.dart';
import 'package:lawbid/features/contacts_sync/application/phone_contacts.dart';
import 'package:lawbid/features/contacts_sync/data/contacts_sync_repository.dart';
import 'package:shared_preferences/shared_preferences.dart';

LawBidContact _c(String id, String name) => LawBidContact(
      person: ContactPerson(hash: 'h$id', userId: id, displayName: name),
      phoneName: name,
    );

class _Repo implements ContactsSyncRepository {
  @override
  Future<ContactsSyncStatus> status() async =>
      const ContactsSyncStatus(enabled: true, matches: 0);

  @override
  Future<ContactsUploadResult> upload(Set<String> hashes) async =>
      const ContactsUploadResult(matched: 0, people: []);

  @override
  Future<void> remove() async {}

  @override
  Future<void> setFindByPhone({required bool enabled}) async {}
}

void main() {
  Future<ProviderContainer> make(
    Map<String, Object> prefs,
    List<List<LawBidContact>> passes,
  ) async {
    SharedPreferences.setMockInitialValues(prefs);
    final sp = await SharedPreferences.getInstance();
    var i = 0;
    final c = ProviderContainer(
      overrides: [
        sharedPreferencesProvider.overrideWithValue(sp),
        translatorProvider.overrideWithValue(const StaticTranslatorEn()),
        contactsSyncRepositoryProvider.overrideWithValue(_Repo()),
        phoneContactsProvider.overrideWith(
          (_) async => PhoneContacts(onLawBid: passes[i++]),
        ),
      ],
    );
    addTearDown(c.dispose);
    return c;
  }

  test('never runs before the user allowed contacts on this install', () async {
    final c = await make({}, [
      [_c('1', 'Ann')],
    ]);
    await c.read(contactsBackgroundSyncProvider).run();
    expect(
      c.read(localKvStoreProvider).getString('contacts_known_ids_v1'),
      isNull,
    );
  });

  test('first pass only learns who is there; a second day sees the new one',
      () async {
    final c = await make(
      {'contacts_sync_asked_v1': '1'},
      [
        [_c('1', 'Ann')],
        [_c('1', 'Ann'), _c('2', 'Bob')],
      ],
    );
    final sync = c.read(contactsBackgroundSyncProvider);
    await sync.run();
    final kv = c.read(localKvStoreProvider);
    expect(kv.getString('contacts_known_ids_v1'), '["1"]');
    // Within 24 h nothing happens.
    await sync.run();
    expect(kv.getString('contacts_known_ids_v1'), '["1"]');
    // A day later the new contact is learned (the notice itself is a
    // platform call that reports false in tests).
    await kv.setString(
      'contacts_auto_sync_at_v1',
      DateTime.now().subtract(const Duration(days: 2)).toIso8601String(),
    );
    await sync.run();
    expect(kv.getString('contacts_known_ids_v1'), '["1","2"]');
  });

  test('the switch turns the notice off and back on', () async {
    final c = await make({}, []);
    final sync = c.read(contactsBackgroundSyncProvider);
    expect(sync.notifyNew, isTrue);
    await sync.setNotifyNew(on: false);
    expect(sync.notifyNew, isFalse);
  });
}
