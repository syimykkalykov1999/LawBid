import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/calls/application/call_history_providers.dart';
import 'package:lawbid/features/calls/data/call_history_repository.dart';
import 'package:lawbid/features/calls/domain/call_history_models.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/contacts_sync/application/phone_contacts.dart';
import 'package:lawbid/features/contacts_sync/presentation/calls_tab.dart';
import 'package:lawbid/features/contacts_sync/presentation/chats_tab.dart';
import 'package:lawbid/features/contacts_sync/presentation/contacts_screen.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid/shared/people/my_people.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/long_locale.dart';
import '../../helpers/ux_harness.dart';

/// Owner 2026-10-21: «Contacts | Calls» — the history folds repeats into one
/// line, the next page loads at the end, a running group call offers «Join»,
/// and everything fits a 360 dp phone at text x1.1.
const _long = 'Maximilian-Alexander von Hohenzollern-Sigmaringen der Dritte';

CallHistoryEntry _e(
  String id,
  String peer,
  DateTime at, {
  bool outgoing = true,
  CallStatus status = CallStatus.ended,
  bool video = false,
  String? groupId,
  String? groupTitle,
  int? sec,
}) =>
    CallHistoryEntry(
      id: id,
      status: status,
      outgoing: outgoing,
      video: video,
      peer: CallPeer(id: peer, isAttorney: false, displayName: peer),
      createdAt: at,
      conversationId: 'c-$peer',
      groupId: groupId,
      groupTitle: groupTitle,
      durationSec: sec,
    );

class _Repo implements CallHistoryRepository {
  _Repo(this.pages, {this.running = const []});

  final List<List<CallHistoryEntry>> pages;
  final List<OngoingGroupCall> running;
  final cursors = <String?>[];

  @override
  Future<CursorPage<CallHistoryEntry>> history({
    String? cursor,
    int? limit,
  }) async {
    cursors.add(cursor);
    final i = cursor == null ? 0 : int.parse(cursor);
    return CursorPage(
      items: pages[i],
      nextCursor: i + 1 < pages.length ? '${i + 1}' : null,
    );
  }

  @override
  Future<List<OngoingGroupCall>> ongoing() async => running;

  final hidden = <List<String>>[];
  int clears = 0;

  @override
  Future<void> hide(List<String> ids) async => hidden.add(ids);

  @override
  Future<void> clear() async => clears++;
}

void main() {
  final now = DateTime.now();
  late SharedPreferences prefs;
  setUpAll(() async {
    await initializeDateFormatting();
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
  });

  group('groupCallHistory', () {
    test('folds neighbouring repeats of the same sort on one day', () {
      final at = DateTime(now.year, now.month, now.day, 12);
      final list = [
        _e('1', 'ann', at, outgoing: false, status: CallStatus.missed),
        _e(
          '2',
          'ann',
          at.subtract(const Duration(minutes: 5)),
          outgoing: false,
          status: CallStatus.missed,
        ),
        _e(
          '3',
          'ann',
          at.subtract(const Duration(minutes: 9)),
          outgoing: false,
          status: CallStatus.missed,
        ),
        // Another kind (a video call) is its own line.
        _e(
          '4',
          'ann',
          at.subtract(const Duration(minutes: 20)),
          outgoing: false,
          status: CallStatus.missed,
          video: true,
        ),
        // Somebody else in between breaks the run.
        _e('5', 'bob', at.subtract(const Duration(minutes: 30))),
        _e(
          '6',
          'ann',
          at.subtract(const Duration(minutes: 40)),
          outgoing: false,
          status: CallStatus.missed,
        ),
      ];
      final g = groupCallHistory(list);
      expect(g.map((x) => x.count), [3, 1, 1, 1]);
      expect(g.first.latest.id, '1');
    });

    test('another day is another line; a group is told by its id', () {
      final a = DateTime(2026, 10, 20, 23, 50);
      final b = DateTime(2026, 10, 21, 0, 10);
      expect(
        groupCallHistory([_e('1', 'ann', b), _e('2', 'ann', a)])
            .map((x) => x.count),
        [1, 1],
      );
      final g1 = _e('1', 'ann', a, groupId: 'g', groupTitle: 'Firm');
      final g2 = _e('2', 'bob', a, groupId: 'g', groupTitle: 'Firm');
      expect(groupCallHistory([g1, g2]).single.count, 2);
    });

    test('kind: declined by me is incoming, unanswered is missed', () {
      final at = DateTime(2026, 10, 20);
      expect(
        _e('1', 'a', at, outgoing: false, status: CallStatus.declined).kind,
        CallHistoryKind.incoming,
      );
      expect(
        _e('1', 'a', at, outgoing: false, status: CallStatus.canceled).kind,
        CallHistoryKind.missed,
      );
      expect(
        _e('1', 'a', at, status: CallStatus.missed).kind,
        CallHistoryKind.outgoing,
      );
    });
  });

  List<List<CallHistoryEntry>> pages() {
    final at = DateTime(now.year, now.month, now.day, 12);
    return [
      [
        _e('1', 'Ann Lee', at, sec: 125),
        _e(
          '2',
          _long,
          at.subtract(const Duration(hours: 1)),
          outgoing: false,
          status: CallStatus.missed,
          video: true,
        ),
        _e(
          '3',
          _long,
          at.subtract(const Duration(hours: 2)),
          outgoing: false,
          status: CallStatus.missed,
          video: true,
        ),
        _e(
          '4',
          'Bob',
          at.subtract(const Duration(days: 1)),
          outgoing: false,
          sec: 61,
        ),
        _e(
          '5',
          'x',
          at.subtract(const Duration(days: 1, hours: 1)),
          groupId: 'g1',
          groupTitle: _long,
        ),
        for (var i = 0; i < 12; i++)
          _e('f$i', 'P$i', at.subtract(Duration(days: 3 + i))),
      ],
      [_e('late', 'Late One', at.subtract(const Duration(days: 40)))],
    ];
  }

  const running = [
    OngoingGroupCall(
      id: 'k1',
      groupId: 'g1',
      groupTitle: _long,
      video: true,
      joined: 12,
      mine: false,
    ),
    OngoingGroupCall(
      id: 'k2',
      groupId: 'g2',
      groupTitle: 'Team',
      video: false,
      joined: 2,
      mine: true,
    ),
  ];

  Future<void> pump(
    WidgetTester tester,
    Widget child, {
    Translator? t,
    TextDirection dir = TextDirection.ltr,
    ThemeData? theme,
    double scale = 1.1,
    _Repo? repo,
    List<dynamic> extra = const [],
  }) async {
    useNarrowPhone(tester);
    final theRepo = repo ?? _Repo(pages(), running: running);
    await tester.pumpWidget(
      uxApp(
        Directionality(textDirection: dir, child: child),
        theme: theme ?? AppTheme.dark(),
        size: narrowPhone,
        textScale: scale,
        disableAnimations: true,
        overrides: uxOverrides(
          translator: t ?? const StaticTranslatorEn(),
          ongoingCalls: theRepo.running,
          extra: [
            sharedPreferencesProvider.overrideWithValue(prefs),
            phoneContactsProvider
                .overrideWith((_) async => const PhoneContacts()),
            myChatPeopleProvider.overrideWith((_) async => const []),
            callHistoryRepositoryProvider.overrideWithValue(theRepo),
            ...extra.cast(),
          ],
        ),
      ),
    );
    await tester.pump();
    await tester.pump();
  }

  testWidgets('shows the running calls, then the folded history', (
    tester,
  ) async {
    await pump(tester, const Scaffold(body: CallsTab()));
    expect(find.text('Ongoing call'), findsOneWidget);
    expect(find.byKey(const ValueKey('ongoing-join')), findsOneWidget);
    expect(find.byKey(const ValueKey('ongoing-return')), findsOneWidget);
    expect(find.text('Recent'), findsOneWidget);
    expect(find.text('Ann Lee'), findsOneWidget);
    // The two missed video calls with the same person are one line.
    expect(find.text('$_long (2)'), findsOneWidget);
    expect(find.text('Yesterday'), findsWidgets);
  });

  testWidgets('«Join» hands the call to the controller', (tester) async {
    final joined = <String>[];
    await pump(
      tester,
      const Scaffold(body: CallsTab()),
      extra: [
        joinOngoingGroupCallProvider.overrideWithValue((call) async {
          joined.add(call.id);
          return null;
        }),
      ],
    );
    await tester.tap(find.byKey(const ValueKey('ongoing-join')));
    await tester.pump();
    expect(joined, ['k1']);
  });

  testWidgets('the next page loads at the end of the list', (tester) async {
    final repo = _Repo(pages());
    await pump(tester, const Scaffold(body: CallsTab()), repo: repo);
    expect(repo.cursors, [null]);
    await tester.scrollUntilVisible(
      find.text('Late One'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    expect(repo.cursors, [null, '1']);
    expect(find.text('Late One'), findsOneWidget);
  });

  testWidgets('no calls: the empty state', (tester) async {
    await pump(
      tester,
      const Scaffold(body: CallsTab()),
      repo: _Repo([const []]),
    );
    expect(find.text('No calls yet'), findsOneWidget);
  });

  testWidgets('the segment switches Contacts and Calls', (tester) async {
    await pump(tester, const ContactsScreen());
    expect(find.byType(CallsTab), findsNothing);
    await tester.tap(find.text('Calls'));
    await tester.pumpAndSettle();
    expect(find.byType(CallsTab), findsOneWidget);
    await tester.tap(find.text('Contacts').last);
    await tester.pumpAndSettle();
    expect(find.byType(CallsTab), findsNothing);
    expect(find.byType(ChatsTab), findsNothing);
  });

  // Owner 2026-10-21: the segment is small, in the middle of the top bar,
  // and the two sections swipe.
  testWidgets('the segment sits in the top bar; a swipe changes the section',
      (tester) async {
    await pump(tester, const ContactsScreen());
    final seg = tester.getRect(
      find.byKey(const ValueKey('contacts-calls-segment')),
    );
    expect(seg.height, 32);
    expect(seg.center.dx, closeTo(narrowPhone.width / 2, 2));
    expect(seg.top, lessThan(56));
    for (var i = 0; i < 2; i++) {
      await tester.fling(find.byType(PageView), const Offset(-300, 0), 1000);
      await tester.pumpAndSettle();
    }
    expect(find.byType(CallsTab), findsOneWidget);
    for (var i = 0; i < 2; i++) {
      await tester.fling(find.byType(PageView), const Offset(300, 0), 1000);
      await tester.pumpAndSettle();
    }
    expect(find.byType(CallsTab), findsNothing);
    expect(find.byType(ChatsTab), findsOneWidget);
  });

  // Owner 2026-10-21 (WhatsApp): pick calls, all of them, delete them from
  // my list; «Clear» asks first.
  testWidgets('long press picks; all; delete hides the picked calls',
      (tester) async {
    final repo = _Repo(pages(), running: running);
    await pump(tester, const ContactsScreen(initialCalls: true), repo: repo);
    await tester.longPress(find.text('$_long (2)'));
    await tester.pump();
    expect(find.text('2 selected'), findsOneWidget);
    expect(find.byKey(const ValueKey('call-picked')), findsOneWidget);
    await tester.tap(find.text('Ann Lee'));
    await tester.pump();
    expect(find.text('3 selected'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('calls-select-delete')));
    await tester.pump();
    expect(repo.hidden.single.toSet(), {'1', '2', '3'});
    expect(find.text('Ann Lee'), findsNothing);
    expect(find.byKey(const ValueKey('calls-select-delete')), findsNothing);

    await tester.longPress(find.text('Bob'));
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('calls-select-all')));
    await tester.pump();
    expect(find.text('All'), findsNothing);
    await tester.tap(find.byKey(const ValueKey('calls-select-cancel')));
    await tester.pump();
    expect(find.byKey(const ValueKey('call-picked')), findsNothing);
  });

  testWidgets('«Clear call log» asks, then empties the list', (tester) async {
    final repo = _Repo(pages());
    await pump(tester, const ContactsScreen(initialCalls: true), repo: repo);
    await tester.tap(find.byKey(const ValueKey('calls-menu')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('calls-menu-clear')));
    await tester.pumpAndSettle();
    expect(find.text('Calls are removed only for you.'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('calls-clear-confirm')));
    await tester.pumpAndSettle();
    expect(repo.clears, 1);
    expect(find.text('No calls yet'), findsOneWidget);
  });

  // 360 dp, text x1.0 / x1.1, four themes with the longest text, the real
  // text of ne / ar / de / mr, left-to-right and right-to-left.
  final locales = <String, (Translator Function(), TextDirection)>{
    'longest': (LongestTranslator.new, TextDirection.ltr),
    'longest rtl': (LongestTranslator.new, TextDirection.rtl),
    'ne': (() => ShippedTranslator('ne'), TextDirection.ltr),
    'ar': (() => ShippedTranslator('ar'), TextDirection.rtl),
    'mr': (() => ShippedTranslator('mr'), TextDirection.ltr),
    'de': (() => ShippedTranslator('de'), TextDirection.ltr),
  };
  for (final MapEntry(key: name, value: (mk, dir)) in locales.entries) {
    final themes = name.startsWith('longest')
        ? AppThemeId.values
        : [AppThemeId.values.first];
    for (final theme in themes) {
      for (final scale in [1.0, 1.1]) {
        testWidgets('fits at 360 dp ($name, ${theme.name}, x$scale)', (
          tester,
        ) async {
          await pump(
            tester,
            const ContactsScreen(initialCalls: true),
            t: mk(),
            dir: dir,
            theme: AppTheme.of(theme),
            scale: scale,
          );
          expect(tester.takeException(), isNull);
          expect(find.byType(CallsTab), findsOneWidget);
        });
      }
    }
  }
}
