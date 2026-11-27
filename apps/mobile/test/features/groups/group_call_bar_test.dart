import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/legacy.dart' show StateProvider;
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/features/groups/application/group_call_port.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_avatar.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_call_ui.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_chat_tile.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;
import 'package:material_ui/material_ui.dart';
import 'package:visibility_detector/visibility_detector.dart';

import 'fake_group_repository.dart';

const _t = StaticTranslatorRu();

/// Owner 2026-10-21 (inbox 20e/20f/20d, Telegram «Видеочат»): the running
/// call of a group — the bar with N and the first three faces, the people
/// list with the host and microphones, the row in the lists, nine at most.
List<RunningCallMember> _people(int n) => [
      for (var i = 0; i < n; i++)
        RunningCallMember(
          userId: 'p$i',
          name: 'Person $i',
          host: i == 0,
          muted: i.isOdd,
        ),
    ];

GroupRunningCall _running(int n, {List<String>? joined}) => GroupRunningCall(
      video: false,
      members: n,
      people: _people(n),
      join: (_, __) async {
        joined?.add('join');
        return null;
      },
    );

String _label(int n) =>
    '${_t.t('call.ongoing')} · ${_t.t('group.find.members', {'count': '$n'})}';

void main() {
  setUpAll(initializeDateFormatting);
  setUp(() {
    VisibilityDetectorController.instance.updateInterval = Duration.zero;
  });

  Future<void> pump(
    WidgetTester tester,
    Widget child, {
    List<Override> extra = const [],
    bool translator = true,
  }) async {
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = const Size(390, 1200);
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          if (translator) translatorProvider.overrideWithValue(_t),
          ...extra,
        ],
        child: MaterialApp(
          theme: AppTheme.light(),
          home: child is Scaffold ? child : Scaffold(body: child),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  group('the bar in a group', () {
    testWidgets('«Call in progress · People: N» with three faces; Join joins',
        (tester) async {
      final joined = <String>[];
      await pump(
        tester,
        GroupCallJoinBar(
          running: _running(5, joined: joined),
          onJoin: () => joined.add('bar'),
        ),
      );
      expect(find.text(_label(5)), findsOneWidget);
      expect(
        find.descendant(
          of: find.byType(CallFacesStack),
          matching: find.byType(GroupAvatar),
        ),
        findsNWidgets(3),
      );
      await tester.tap(find.byKey(const ValueKey('group-call-join')));
      expect(joined, ['bar']);
    });

    testWidgets('a tap opens the people: host, microphones, then Join',
        (tester) async {
      final joined = <String>[];
      await pump(
        tester,
        GroupCallJoinBar(
          running: _running(4),
          onJoin: () => joined.add('sheet'),
        ),
      );
      await tester.tap(find.byKey(const ValueKey('group-call-people')));
      await tester.pumpAndSettle();
      for (var i = 0; i < 4; i++) {
        expect(find.byKey(ValueKey('running-p$i')), findsOneWidget);
        expect(find.text('Person $i'), findsOneWidget);
      }
      expect(find.text(_t.t('call.host')), findsOneWidget);
      final mic = tester.widget<AppIcon>(
        find.byKey(const ValueKey('running-mic-p1')),
      );
      expect(mic.icon, AppIcons.micOffRounded);
      expect(
        tester
            .widget<AppIcon>(find.byKey(const ValueKey('running-mic-p0')))
            .icon,
        AppIcons.micRounded,
      );
      await tester.tap(find.byKey(const ValueKey('running-call-join')));
      await tester.pumpAndSettle();
      expect(joined, ['sheet']);
      expect(find.byKey(const ValueKey('running-p0')), findsNothing);
    });

    testWidgets('the list follows the live call', (tester) async {
      final live = StateProvider<GroupRunningCall?>((ref) => _running(2));
      final source = FutureProvider.autoDispose<GroupRunningCall?>(
        (ref) async => ref.watch(live),
      );
      await pump(
        tester,
        Consumer(
          builder: (context, ref, _) => GroupCallJoinBar(
            running: _running(2),
            live: source,
            onJoin: () {},
          ),
        ),
      );
      await tester.tap(find.byKey(const ValueKey('group-call-people')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('running-p2')), findsNothing);
      final container = ProviderScope.containerOf(
        tester.element(find.byType(GroupCallJoinBar)),
      );
      container.read(live.notifier).state = _running(3);
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('running-p2')), findsOneWidget);
      expect(find.text(_label(3)), findsWidgets);
    });

    test('a full call names the limit: nine, audio or video', () {
      expect(groupCallMax, 9);
      expect(groupCallRingMax(video: true), 8);
      expect(groupCallRingMax(video: false), 8);
      expect(
        groupCallError(_t, 'CALL_STATE_CONFLICT', max: '9'),
        _t.t('call.fullMax', {'count': '9'}),
      );
    });
  });

  group('the rows of the lists', () {
    testWidgets('a group row shows the running call instead of the message',
        (tester) async {
      final g = listGroup(
        'g1',
        ongoingCall: api.OngoingCallDto(
          id: 'c1',
          video: true,
          participantCount: 4,
          participants: [
            for (final n in ['Ann', 'Bob', 'Cy'])
              api.OngoingCallPersonDto(userId: n, displayName: n),
          ],
          startedAt: DateTime(2026, 10, 21),
        ),
      );
      await pump(tester, GroupChatTile(group: g));
      expect(find.byKey(const ValueKey('ongoing-call-c1')), findsOneWidget);
      expect(find.text(_label(4)), findsOneWidget);
      expect(
        find.descendant(
          of: find.byType(CallFacesStack),
          matching: find.byType(GroupAvatar),
        ),
        findsNWidgets(3),
      );
      expect(find.textContaining('Bartholomew'), findsNothing);
    });
  });
}
