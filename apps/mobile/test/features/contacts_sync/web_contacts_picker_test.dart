import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/contacts_sync/application/contacts_picker.dart';
import 'package:lawbid/features/contacts_sync/application/contacts_sync_providers.dart';
import 'package:lawbid/features/contacts_sync/application/phone_contacts.dart';
import 'package:lawbid/features/contacts_sync/data/contacts_sync_repository.dart';
import 'package:lawbid/features/contacts_sync/data/phone_numbers.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fake_contacts_server.dart';

class _Picker implements ContactsPicker {
  _Picker(this.answer);

  final List<PhoneBookEntry>? answer;
  int opened = 0;

  @override
  bool get supported => true;

  @override
  Future<List<PhoneBookEntry>?> pick() async {
    opened++;
    return answer;
  }
}

/// B-c2 (c), 2026-11-09: the site's Contacts tab works from the browser's
/// Contact Picker (Chrome on Android): nothing is read or sent before the
/// person picks, and the picked people go through the phone's own sync.
void main() {
  final ann = ContactPerson(
    hash: hashE164('+14155550101'),
    userId: 'ann',
    displayName: 'Ann',
  );

  Future<ProviderContainer> make(FakeContactsServer server, _Picker p) async {
    SharedPreferences.setMockInitialValues({});
    final sp = await SharedPreferences.getInstance();
    final c = ProviderContainer(
      overrides: [
        sharedPreferencesProvider.overrideWithValue(sp),
        currentUserIdProvider.overrideWithValue('u1'),
        contactsSyncRepositoryProvider.overrideWithValue(server),
        contactsPickerProvider.overrideWithValue(p),
        // The phone's reader must never run in the browser.
        phoneBookEntriesReaderProvider.overrideWithValue(
          () async => throw StateError('the phone book was read'),
        ),
        contactsRetryDelaysProvider.overrideWithValue(const []),
      ],
    );
    addTearDown(c.dispose);
    c.listen(phoneContactsProvider, (_, __) {});
    return c;
  }

  test('before a pick: the consent view, nothing sent', () async {
    final server = FakeContactsServer(users: {ann.hash: ann});
    final c = await make(server, _Picker(null));
    final data = await c.read(phoneContactsProvider.future);
    expect(data.needsConsent, isTrue);
    expect(server.calls, isEmpty);
  });

  test('the picked people are matched like the phone book', () async {
    final server = FakeContactsServer(users: {ann.hash: ann});
    final p = _Picker([
      const PhoneBookEntry(name: 'Ann', numbers: ['+1 415 555 0101']),
      const PhoneBookEntry(name: 'Bob', numbers: ['+14155550199']),
    ]);
    final c = await make(server, p);
    final picked = await p.pick();
    c.read(contactsConsentProvider.notifier).grant();
    c.read(pickedContactsProvider.notifier).set(picked!);
    final data = await c.read(phoneContactsProvider.future);
    expect(data.needsConsent, isFalse);
    expect(server.uploadedHashes, hasLength(2));
    expect(data.onLawBid.single.userId, 'ann');
    expect(data.onLawBid.single.title, 'Ann');
    expect(data.invite.single.name, 'Bob');
  });

  test('the picker answer keeps names and numbers, drops empty contacts', () {
    final entries = entriesFromPicked([
      (names: [' ', 'Ann '], numbers: ['+14155550101', ' ']),
      (names: ['No number'], numbers: const []),
      (names: const [], numbers: ['+14155550102']),
    ]);
    expect(entries, hasLength(2));
    expect(entries[0].name, 'Ann');
    expect(entries[0].numbers, ['+14155550101']);
    expect(entries[1].name, '');
  });
}
