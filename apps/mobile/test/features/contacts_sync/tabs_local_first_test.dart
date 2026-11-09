import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/cache/http_cache_interceptor.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/core/sync/sync_freshness.dart';
import 'package:lawbid/core/sync/synced_list_notifier.dart';
import 'package:lawbid/features/calls/application/call_history_providers.dart';
import 'package:lawbid/features/calls/data/call_history_repository.dart';
import 'package:lawbid/features/calls/domain/call_history_models.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/contacts_sync/application/contacts_sync_providers.dart';
import 'package:lawbid/features/contacts_sync/application/phone_contacts.dart';
import 'package:lawbid/features/contacts_sync/data/contacts_sync_repository.dart';
import 'package:lawbid/features/contacts_sync/presentation/calls_tab.dart';
import 'package:lawbid/features/contacts_sync/presentation/contacts_screen.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid/shared/people/my_people.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/fixed_chat_people.dart';
import '../../helpers/long_locale.dart';
import '../../helpers/ux_harness.dart';

/// Owner 2026-11-04 (R-383): «каждый раз при переходе в следующие
/// подразделы обновляется, идут запросы серверу — так нельзя». The three
/// sections of the contacts screen render from what the phone holds and a
/// tab switch asks the server nothing.

class _CountingCalls implements CallHistoryRepository {
  @override
  Future<SyncedPage<CallHistoryEntry>> changed(DateTime since) async =>
      const SyncedPage(items: []);

  int reads = 0;

  @override
  Future<CursorPage<CallHistoryEntry>> history({
    String? cursor,
    int? limit,
  }) async {
    // No HTTP copy on the phone in a test: a phone-only read is a miss.
    if (readingFromPhoneOnly) throw StateError(kNoPhoneCopy);
    reads++;
    return CursorPage(
      items: [
        CallHistoryEntry(
          id: 'c1',
          status: CallStatus.ended,
          outgoing: true,
          video: false,
          peer: const CallPeer(
            id: 'ann',
            isAttorney: false,
            displayName: 'Ann Caller',
          ),
          createdAt: DateTime.now(),
          conversationId: 'c-ann',
        ),
      ],
    );
  }

  @override
  Future<List<OngoingGroupCall>> ongoing() async => const [];

  @override
  Future<void> hide(List<String> ids) async {}

  @override
  Future<void> clear() async {}
}

/// Counts how many times the «Chats» list was built (each build of the old
/// provider was 3+ server requests: chats pages and both follow lists).
class _CountingPeople extends FixedChatPeople {
  _CountingPeople(this.builds) : super(_people);

  final List<int> builds;

  @override
  Future<List<MyPerson>> build() {
    builds.add(1);
    return super.build();
  }
}

const _people = [
  MyPerson(id: 'p1', group: MyPeopleGroup.chats, name: 'Pat Person'),
];

class _Clock {
  DateTime now = DateTime(2026, 11, 4, 5, 25);
}

void main() {
  late SharedPreferences prefs;
  setUpAll(() async {
    await initializeDateFormatting();
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
  });

  group('SyncFreshness', () {
    test('never synced in this run is stale', () {
      final f = SyncFreshness();
      expect(f.isStale('calls', SyncWindows.calls), isTrue);
    });

    test('fresh inside the window, stale at its end', () {
      final clock = _Clock();
      final f = SyncFreshness(clock: () => clock.now)..mark('k');
      for (final (window, inside) in [
        (SyncWindows.chats, const Duration(seconds: 59)),
        (SyncWindows.calls, const Duration(seconds: 119)),
      ]) {
        final start = clock.now;
        f.mark('k');
        clock.now = start.add(inside);
        expect(f.isStale('k', window), isFalse, reason: '$window');
        clock.now = start.add(window);
        expect(f.isStale('k', window), isTrue, reason: '$window');
      }
    });

    test('a socket event (forget) makes it stale at once', () {
      final f = SyncFreshness()
        ..mark('calls')
        ..forget('calls');
      expect(f.isStale('calls', SyncWindows.calls), isTrue);
    });

    test('the windows the owner agreed', () {
      expect(SyncWindows.chats, const Duration(seconds: 60));
      expect(SyncWindows.calls, const Duration(minutes: 2));
    });
  });

  group('my chat people on the phone', () {
    test('saved copy round-trips', () {
      final p = MyPerson(
        id: 'x',
        group: MyPeopleGroup.mutual,
        name: 'X',
        username: 'xx',
        avatarUrl: 'https://a/b.jpg',
        lastAt: DateTime.utc(2026, 11, 4).toLocal(),
        role: 'attorney',
      );
      final back = myPersonFromJson(myPersonToJson(p));
      expect(back.id, 'x');
      expect(back.group, MyPeopleGroup.mutual);
      expect(back.username, 'xx');
      expect(back.avatarUrl, 'https://a/b.jpg');
      expect(back.lastAt, p.lastAt);
      expect(back.role, 'attorney');
    });

    test('a new message moves its person up, no one leaves', () {
      final shown = [
        MyPerson(
          id: 'a',
          group: MyPeopleGroup.chats,
          name: 'A',
          lastAt: DateTime(2026, 11, 2),
        ),
        MyPerson(
          id: 'b',
          group: MyPeopleGroup.chats,
          name: 'B',
          lastAt: DateTime(2026, 11),
        ),
      ];
      final moved = mergeChatsInto(shown, [
        MyPerson(
          id: 'b',
          group: MyPeopleGroup.chats,
          name: 'B',
          lastAt: DateTime(2026, 11, 3),
        ),
      ]);
      expect(moved!.map((p) => p.id), ['b', 'a']);
      expect(mergeChatsInto(moved, const []), isNull);
    });
  });

  testWidgets('three switches: no server request, never a blank list', (
    tester,
  ) async {
    useNarrowPhone(tester);
    final calls = _CountingCalls();
    final peopleBuilds = <int>[];
    var contactsBuilds = 0;
    var statusReads = 0;
    await tester.pumpWidget(
      uxApp(
        const ContactsScreen(),
        theme: AppTheme.dark(),
        size: narrowPhone,
        disableAnimations: true,
        overrides: uxOverrides(
          extra: [
            sharedPreferencesProvider.overrideWithValue(prefs),
            // A server request («is sync on?»), kept for the app run now.
            contactsSyncStatusProvider.overrideWith((_) async {
              statusReads++;
              return const ContactsSyncStatus(enabled: true, matches: 0);
            }),
            // The real provider: each run reads the phone book once.
            phoneBookEntriesReaderProvider.overrideWithValue(() async {
              contactsBuilds++;
              return const [
                PhoneBookEntry(name: 'Book Friend', numbers: ['+15550001']),
              ];
            }),
            myChatPeopleProvider
                .overrideWith(() => _CountingPeople(peopleBuilds)),
            callHistoryRepositoryProvider.overrideWithValue(calls),
          ],
        ),
      ),
    );
    await tester.pump();
    await tester.pump();

    // The phone book is hashed off the main thread (compute): real time.
    Future<void> settle() async {
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 300)),
      );
      for (var i = 0; i < 10; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
    }

    void go(int section) => tester
        .widget<ContactsCallsSegment>(find.byType(ContactsCallsSegment))
        .onChanged(section);

    // Each section once: the first open of the run reads each list once.
    go(1);
    await settle();
    go(2);
    await settle();
    go(0);
    await settle();
    expect(find.text('Pat Person'), findsOneWidget);
    final before =
        (calls.reads, peopleBuilds.length, contactsBuilds, statusReads);
    expect((before.$1, before.$2, before.$3), (1, 1, 1));
    // Status once, and once more after the first upload changed the book.
    expect(before.$4, inInclusiveRange(1, 2));

    // Three more rounds of switching: nothing new is asked, and every
    // section shows its rows on the very first frame (no spinner).
    for (var round = 0; round < 3; round++) {
      go(2);
      await tester.pump();
      expect(find.byType(CircularProgressIndicator), findsNothing);
      expect(find.text('Ann Caller'), findsOneWidget);
      await settle();
      go(1);
      await tester.pump();
      expect(find.byType(CircularProgressIndicator), findsNothing);
      await settle();
      go(0);
      await tester.pump();
      expect(find.byType(CircularProgressIndicator), findsNothing);
      expect(find.text('Pat Person'), findsOneWidget);
      await settle();
    }
    expect(
      (calls.reads, peopleBuilds.length, contactsBuilds, statusReads),
      before,
    );
  });
}
