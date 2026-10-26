import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/contacts_sync/application/contacts_book_sync.dart';
import 'package:lawbid/features/contacts_sync/application/contacts_sync_providers.dart';
import 'package:lawbid/features/contacts_sync/data/contacts_book.dart';
import 'package:lawbid/features/contacts_sync/data/contacts_sync_repository.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fake_contacts_server.dart';

/// Owner 2026-10-22 («нельзя ни в коем случае нагружать сервер», like
/// Telegram / WhatsApp): the book goes up whole once; afterwards an
/// unchanged book is a "changed?" check at most, a changed one sends only
/// the difference, and the device remembers it across restarts.

String _h(int i) => i.toRadixString(16).padLeft(64, '0');

Set<String> _book(int n, [int from = 0]) => {
      for (var i = from; i < from + n; i++) _h(i),
    };

void main() {
  late SharedPreferences prefs;
  final ann = ContactPerson(hash: _h(3), userId: 'ann', displayName: 'Ann');

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
  });

  /// A fresh app start: a new container over the same device storage.
  ProviderContainer start(FakeContactsServer server, {String user = 'u1'}) {
    final c = ProviderContainer(
      overrides: [
        sharedPreferencesProvider.overrideWithValue(prefs),
        currentUserIdProvider.overrideWithValue(user),
        contactsSyncRepositoryProvider.overrideWithValue(server),
      ],
    );
    addTearDown(c.dispose);
    return c;
  }

  test('book hash: order-free, the same as the server, empty = zeros', () {
    expect(bookHashOf([_h(1), _h(2)]), bookHashOf([_h(2), _h(1)]));
    expect(bookHashOf([_h(1), _h(2)]), _h(3)); // 1 XOR 2
    expect(bookHashOf(const []), '0' * 64);
  });

  test('first sync uploads the whole book once', () async {
    final server = FakeContactsServer(users: {_h(3): ann});
    final c = start(server);
    final res = await c.read(contactsBookSyncProvider).sync(_book(700));
    expect(server.calls, hasLength(1));
    expect(server.calls.single['full'], isTrue);
    expect(server.uploadedHashes, hasLength(700));
    expect(res.people.single.userId, 'ann');
  });

  test('hash unchanged → no upload; within the hour not even a request',
      () async {
    final server = FakeContactsServer(users: {_h(3): ann});
    var c = start(server);
    final t0 = DateTime(2026, 10, 22, 9);
    await c.read(contactsBookSyncProvider).sync(_book(700), now: t0);
    server.calls.clear();
    // Opened again 10 minutes later: nothing is sent.
    await c.read(contactsBookSyncProvider).sync(
          _book(700),
          now: t0.add(const Duration(minutes: 10)),
        );
    expect(server.calls, isEmpty);
    // The next day, after a restart: one "changed?" check, no hashes.
    c = start(server);
    final res = await c.read(contactsBookSyncProvider).sync(
          _book(700),
          now: t0.add(const Duration(days: 1)),
        );
    expect(server.calls, hasLength(1));
    expect(server.calls.single['bookHash'], bookHashOf(_book(700)));
    expect(server.calls.single['added'], isEmpty);
    expect(server.calls.single['removed'], isEmpty);
    // The list comes from the device.
    expect(res.people.single.userId, 'ann');
  });

  test('a changed book sends only what was added and removed', () async {
    final bob = ContactPerson(hash: _h(900), userId: 'bob', displayName: 'B');
    final server = FakeContactsServer(users: {_h(3): ann, _h(900): bob});
    await start(server).read(contactsBookSyncProvider).sync(_book(700));
    server.calls.clear();
    // Restart: contact 3 (Ann) deleted, 900 (Bob) added.
    final next = _book(700)
      ..remove(_h(3))
      ..add(_h(900));
    final res = await start(server).read(contactsBookSyncProvider).sync(next);
    final call = server.calls.single;
    expect(call['full'], isFalse);
    expect(call['added'], [_h(900)]);
    expect(call['removed'], [_h(3)]);
    expect(call['baseHash'], bookHashOf(_book(700)));
    expect(call['bookHash'], bookHashOf(next));
    // The deleted contact is gone from the list, the new one is there.
    expect(res.people.map((p) => p.userId), ['bob']);
  });

  test('the server lost the book (resync) → it goes whole once', () async {
    final server = FakeContactsServer();
    await start(server).read(contactsBookSyncProvider).sync(_book(10));
    await server.remove(); // e.g. another device turned the sync off
    server.calls.clear();
    await start(server).read(contactsBookSyncProvider).sync(_book(11));
    expect(server.calls.map((c) => c['full']), [false, true]);
    expect(server.stored, _book(11));
  });

  test('someone joined (newer list version) → the new list, no upload',
      () async {
    final server = FakeContactsServer();
    final t0 = DateTime(2026, 10, 22, 9);
    await start(server).read(contactsBookSyncProvider).sync(
          _book(10),
          now: t0,
        );
    // The server matched a new person and bumped the version.
    server.users[_h(5)] =
        const ContactPerson(hash: '', userId: 'new', displayName: 'N');
    server.version++;
    server.calls.clear();
    final res = await start(server).read(contactsBookSyncProvider).sync(
          _book(10),
          now: t0.add(const Duration(days: 1)),
        );
    expect(server.uploadedHashes, isEmpty);
    expect(res.people.single.userId, 'new');
  });

  test('a big book goes in parts, each on the previous answer', () async {
    final server = FakeContactsServer();
    await start(server)
        .read(contactsBookSyncProvider)
        .sync(_book(ContactsBookSync.maxPerRequest + 500));
    expect(server.calls, hasLength(2));
    expect(server.calls[0]['full'], isTrue);
    expect(server.calls[1]['full'], isFalse);
    expect(server.stored, hasLength(ContactsBookSync.maxPerRequest + 500));
  });

  test('the firewall refuses a big body → 100-hash parts', () async {
    final server = FakeContactsServer()..firewallMax = 100;
    await start(server).read(contactsBookSyncProvider).sync(_book(250));
    expect(server.stored, _book(250));
    expect(
      server.calls.skip(1).map((c) => (c['added']! as List).length),
      [100, 100, 50],
    );
  });

  test('a 429 part-way keeps what went up; the rest goes as a delta later',
      () async {
    // Call 1: refused by the firewall; calls 2-3: two 100-hash parts;
    // call 4: the limit.
    final server = FakeContactsServer()
      ..firewallMax = 100
      ..limitFrom = 4;
    final res =
        await start(server).read(contactsBookSyncProvider).sync(_book(250));
    expect(res.limited, isTrue);
    expect(server.stored, hasLength(200));
    // Next start: only the missing hashes go, as a delta.
    server
      ..limitFrom = null
      ..calls.clear();
    await start(server).read(contactsBookSyncProvider).sync(_book(250));
    expect(server.calls.first['full'], isFalse);
    expect(server.uploadedHashes, hasLength(50));
    expect(server.stored, _book(250));
  });

  test('an error other than 429 is thrown (the screen keeps the book)',
      () async {
    final server = FakeContactsServer()
      ..errors.add(
        const ApiException(code: 'NETWORK_ERROR', message: 'offline'),
      );
    await expectLater(
      start(server).read(contactsBookSyncProvider).sync(_book(5)),
      throwsA(isA<ApiException>()),
    );
  });

  test('the device copy belongs to the account', () async {
    final server = FakeContactsServer();
    await start(server).read(contactsBookSyncProvider).sync(_book(5));
    server.calls.clear();
    // Another account on this phone starts from nothing.
    await start(server, user: 'u2').read(contactsBookSyncProvider).sync(
          _book(5),
        );
    expect(server.calls.last['full'], isTrue);
  });

  test('a book over the cap sends the same first hashes every time', () {
    final big = _book(contactBookMax + 5);
    final capped = capBook(big);
    expect(capped, hasLength(contactBookMax));
    expect(capBook(big.toList().reversed.toSet()), capped);
  });
}
