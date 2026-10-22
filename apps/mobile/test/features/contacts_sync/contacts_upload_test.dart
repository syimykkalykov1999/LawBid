import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/contacts_sync/application/contacts_sync_providers.dart';
import 'package:lawbid/features/contacts_sync/application/phone_contacts.dart';
import 'package:lawbid/features/contacts_sync/data/contacts_sync_repository.dart';
import 'package:lawbid/features/contacts_sync/data/phone_numbers.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fake_contacts_server.dart';

/// Owner 2026-10-22: the whole phone book goes up in ONE request again;
/// small parts only when the firewall refuses the big body; the Contacts
/// tab is never left empty when the book was read.

String _h(int i) => i.toRadixString(16).padLeft(64, '0');

/// Answers POST /contacts/sync: [status] decides per request; a 200 says
/// every hash in [matches] matched.
class _Adapter implements HttpClientAdapter {
  _Adapter(this.status, {this.matches = const {}});

  final int Function(int index, List<String> hashes) status;
  final Set<String> matches;
  final sizes = <int>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    final hashes = [
      for (final h in (options.data as Map)['hashes'] as List) '$h',
    ];
    final code = status(sizes.length, hashes);
    sizes.add(hashes.length);
    if (code != 200) {
      return ResponseBody.fromString(
        code == 403 ? '<html>403 Forbidden</html>' : '{"error":{}}',
        code,
        headers: {
          Headers.contentTypeHeader: [
            if (code == 403) 'text/html' else 'application/json',
          ],
        },
      );
    }
    final people = [
      for (final h in hashes)
        if (matches.contains(h))
          {'hash': h, 'userId': 'u-$h', 'displayName': 'P', 'role': 'client'},
    ];
    return ResponseBody.fromString(
      jsonEncode({
        'data': {'matched': people.length, 'people': people},
      }),
      200,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

ApiContactsSyncRepository _repo(_Adapter a) => ApiContactsSyncRepository(
      Dio(BaseOptions(baseUrl: 'http://api.test'))..httpClientAdapter = a,
    );

final _book = {for (var i = 0; i < 700; i++) _h(i)};

void main() {
  group('ApiContactsSyncRepository.upload', () {
    test('a 700-number book goes up in one request', () async {
      final a = _Adapter((_, __) => 200, matches: {_h(3), _h(600)});
      final res = await _repo(a).upload(_book);
      expect(a.sizes, [700]);
      expect(res.matched, 2);
      expect(res.people.map((p) => p.hash), containsAll([_h(3), _h(600)]));
      expect(res.uploaded, hasLength(700));
      expect(res.limited, isFalse);
    });

    test('the firewall refuses the big body: falls back to 100-hash parts',
        () async {
      final a = _Adapter(
        (_, hashes) => hashes.length > 100 ? 403 : 200,
        matches: {_h(3), _h(650)},
      );
      final repo = _repo(a);
      final progress = <int>[];
      final res = await repo.upload(
        _book,
        onProgress: (soFar) => progress.add(soFar.people.length),
      );
      expect(a.sizes, [700, 100, 100, 100, 100, 100, 100, 100]);
      expect(res.matched, 2);
      expect(res.uploaded, hasLength(700));
      // Matches are shown as each part answers, not only at the end.
      expect(progress, [1, 1, 1, 1, 1, 1, 2]);
      // The rest of the session goes straight to small parts.
      a.sizes.clear();
      await repo.upload({_h(1), _h(2)});
      expect(a.sizes, [2]);
    });

    test('413 is a firewall answer too', () async {
      final a = _Adapter((_, hashes) => hashes.length > 100 ? 413 : 200);
      await _repo(a).upload(_book);
      expect(a.sizes.first, 700);
      expect(a.sizes.skip(1), everyElement(100));
    });

    test('a 429 part-way keeps what came back, does not throw', () async {
      final a = _Adapter(
        (i, hashes) => hashes.length > 100 ? 403 : (i >= 3 ? 429 : 200),
        matches: {_h(3), _h(650)},
      );
      final res = await _repo(a).upload(_book);
      expect(res.limited, isTrue);
      expect(res.people.single.hash, _h(3));
      expect(res.uploaded, hasLength(200));
    });

    test('a server error is thrown (the caller keeps the book on screen)',
        () async {
      final a = _Adapter((_, __) => 500);
      await expectLater(
        _repo(a).upload(_book),
        throwsA(isA<ApiException>()),
      );
      expect(a.sizes, [700]);
    });
  });

  group('phoneContactsProvider', () {
    final entries = [
      for (var i = 0; i < 5; i++)
        PhoneBookEntry(name: 'Person $i', numbers: ['+1415555010$i']),
    ];
    final ann = ContactPerson(
      hash: hashE164('+14155550101'),
      userId: 'ann',
      displayName: 'Ann',
    );

    Future<ProviderContainer> make(
      FakeContactsServer server, {
      List<Duration> retry = const [],
    }) async {
      SharedPreferences.setMockInitialValues({});
      final sp = await SharedPreferences.getInstance();
      final c = ProviderContainer(
        overrides: [
          sharedPreferencesProvider.overrideWithValue(sp),
          currentUserIdProvider.overrideWithValue('u1'),
          contactsSyncRepositoryProvider.overrideWithValue(server),
          phoneBookEntriesReaderProvider.overrideWithValue(() async => entries),
          contactsRetryDelaysProvider.overrideWithValue(retry),
        ],
      );
      addTearDown(c.dispose);
      c.listen(phoneContactsProvider, (_, __) {});
      return c;
    }

    test('first time: the whole book in one request; matches join the names',
        () async {
      final server = FakeContactsServer(users: {ann.hash: ann});
      final c = await make(server);
      final data = await c.read(phoneContactsProvider.future);
      expect(server.calls, hasLength(1));
      expect(server.calls.single['full'], isTrue);
      expect(server.uploadedHashes, hasLength(5));
      expect(data.onLawBid.single.title, 'Person 1');
      expect(data.invite, hasLength(4));
      expect(data.matchFailed, isFalse);
    });

    test('opened again: the same book is not sent again', () async {
      final server = FakeContactsServer(users: {ann.hash: ann});
      final c = await make(server);
      await c.read(phoneContactsProvider.future);
      c.invalidate(phoneContactsProvider);
      final data = await c.read(phoneContactsProvider.future);
      expect(server.calls, hasLength(1));
      expect(data.onLawBid.single.userId, 'ann');
    });

    test('the match request fails: the tab still lists the phone book',
        () async {
      final server = FakeContactsServer()
        ..errors.add(
          const ApiException(code: 'NETWORK_ERROR', message: 'offline'),
        );
      final c = await make(server);
      final data = await c.read(phoneContactsProvider.future);
      expect(data.matchFailed, isTrue);
      expect(data.invite, hasLength(5));
      expect(data.invite.first.name, 'Person 0');
    });

    test('a failed match request is retried quietly', () async {
      final server = FakeContactsServer(users: {ann.hash: ann})
        ..errors.add(
          const ApiException(code: 'NETWORK_ERROR', message: 'offline'),
        );
      final c = await make(server, retry: const [Duration.zero]);
      expect((await c.read(phoneContactsProvider.future)).matchFailed, isTrue);
      // The timer fires and the provider runs again by itself.
      await Future<void>.delayed(const Duration(milliseconds: 50));
      final data = await c.read(phoneContactsProvider.future);
      expect(server.calls, hasLength(2));
      expect(data.matchFailed, isFalse);
      expect(data.onLawBid.single.userId, 'ann');
      expect(data.invite, hasLength(4));
    });
  });
}
